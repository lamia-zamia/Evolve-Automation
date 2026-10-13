import type {
  PlanningCloneValue,
  PlanningIdentity,
  PlanningRequest,
  PlanningResponse,
  PlanningWorkerPort,
} from "../ports/planning-worker.ts";

export interface PlanningScheduler<TInput> {
  submit(identity: PlanningIdentity, input: TInput): number | undefined;
  invalidate(): void;
  close(): void;
  readPendingCount(): 0 | 1;
  readDiscardedCount(): number;
}

export interface PlanningSchedulerOptions<TInput, TDecision> {
  readonly worker: PlanningWorkerPort;
  readonly decodeResponse: (
    message: unknown,
  ) => PlanningResponse<TDecision> | undefined;
  readonly onResponse: (response: PlanningResponse<TDecision>) => void;
  readonly onDiagnostic: (code: string, detail: string) => void;
  readonly nowMs?: () => number;
  readonly recordTiming?: (phase: string, durationMs: number) => void;
  readonly prepareRequest?: (
    request: PlanningRequest<TInput>,
  ) => PlanningRequest<PlanningCloneValue>;
}

interface PendingPlanningRequest {
  readonly request: PlanningRequest<PlanningCloneValue>;
  readonly revision: number;
  readonly submittedAtMs: number;
}

function samePlanningIdentity(
  left: PlanningIdentity,
  right: PlanningIdentity,
): boolean {
  return (
    left.task === right.task &&
    left.rootGeneration === right.rootGeneration &&
    left.progressionEpoch === right.progressionEpoch &&
    left.offerIdentity === right.offerIdentity &&
    left.snapshotVersion === right.snapshotVersion
  );
}

/**
 * Serializes bounded planning proposals through one worker and keeps the newest waiting snapshot.
 * Active JavaScript cannot be interrupted with a message; long tasks need chunked planners.
 */
export function createPlanningScheduler<TInput, TDecision>(
  options: PlanningSchedulerOptions<TInput, TDecision>,
): PlanningScheduler<TInput> {
  let nextRequestId = 1;
  let revision = 0;
  let active: PendingPlanningRequest | undefined;
  let pending: PendingPlanningRequest | undefined;
  let closed = false;
  let discardedCount = 0;
  let unsubscribe = () => {};

  const nowMs = options.nowMs ?? (() => 0);

  const reportError = (code: string, error: unknown) => {
    options.onDiagnostic(code, String(error));
    closed = true;
    active = undefined;
    pending = undefined;
    unsubscribe();
    options.worker.terminate();
  };

  unsubscribe = options.worker.subscribe(
    (message) => {
      if (closed) return;
      const request = active;
      if (request === undefined) {
        discardedCount += 1;
        options.onDiagnostic("unexpected-response", "no request is active");
        return;
      }
      let response: PlanningResponse<TDecision> | undefined;
      try {
        const decodeStartedAtMs = nowMs();
        response = options.decodeResponse(message);
        options.recordTiming?.(
          "planning.response.decode",
          Math.max(0, nowMs() - decodeStartedAtMs),
        );
      } catch (error) {
        reportError("response-decode-failed", error);
        return;
      }
      if (
        response === undefined ||
        response.requestId !== request.request.requestId ||
        !samePlanningIdentity(response.identity, request.request.identity)
      ) {
        discardedCount += 1;
        options.onDiagnostic(
          "stale-response",
          "response identity did not match",
        );
        return;
      }

      active = undefined;
      if (request.revision === revision && pending === undefined) {
        if (options.recordTiming !== undefined) {
          options.recordTiming(
            "planning.response.latency",
            Math.max(0, nowMs() - request.submittedAtMs),
          );
          if (response.workerComputeMs !== undefined)
            options.recordTiming(
              "planning.worker.compute",
              response.workerComputeMs,
            );
          if (response.workerValidationMs !== undefined)
            options.recordTiming(
              "planning.worker.validate",
              response.workerValidationMs,
            );
        }
        options.onResponse(response);
      } else {
        discardedCount += 1;
      }
      pump();
    },
    (error) => reportError("worker-error", error),
  );

  function pump(): void {
    if (closed || active !== undefined || pending === undefined) return;
    const request = pending;
    pending = undefined;
    active = request;
    try {
      const startedAtMs = nowMs();
      options.worker.postMessage(request.request);
      options.recordTiming?.(
        "planning.post-message",
        Math.max(0, nowMs() - startedAtMs),
      );
    } catch (error) {
      reportError("request-serialization-failed", error);
    }
  }

  return Object.freeze({
    submit(identity: PlanningIdentity, input: TInput) {
      if (closed) return undefined;
      if (
        active !== undefined &&
        active.revision === revision &&
        samePlanningIdentity(active.request.identity, identity)
      )
        return active.request.requestId;
      if (
        pending !== undefined &&
        samePlanningIdentity(pending.request.identity, identity)
      )
        return pending.request.requestId;

      const typedRequest: PlanningRequest<TInput> = {
        requestId: nextRequestId++,
        identity: Object.freeze({ ...identity }),
        input,
      };
      const submittedAtMs = nowMs();
      const preparationStartedAtMs = nowMs();
      const request =
        options.prepareRequest?.(typedRequest) ??
        (typedRequest as PlanningRequest<PlanningCloneValue>);
      options.recordTiming?.(
        "planning.snapshot.prepare",
        Math.max(0, nowMs() - preparationStartedAtMs),
      );
      revision += 1;
      if (active === undefined) {
        pending = { request, revision, submittedAtMs };
        pump();
      } else {
        if (pending !== undefined) discardedCount += 1;
        pending = { request, revision, submittedAtMs };
      }
      return request.requestId;
    },
    invalidate() {
      if (closed) return;
      revision += 1;
      if (pending !== undefined) discardedCount += 1;
      pending = undefined;
    },
    close() {
      if (closed) return;
      closed = true;
      unsubscribe();
      active = undefined;
      pending = undefined;
      options.worker.terminate();
    },
    readPendingCount: () => (pending === undefined ? 0 : 1),
    readDiscardedCount: () => discardedCount,
  });
}
