import type { PlanningWorkerPort } from "../../ports/planning-worker.ts";

interface BrowserWorkerMessageEvent {
  readonly data: unknown;
}

interface BrowserWorkerErrorEvent {
  readonly message: string;
}

interface BrowserPlanningWorker {
  addEventListener(
    type: "message",
    listener: (event: BrowserWorkerMessageEvent) => void,
  ): void;
  addEventListener(
    type: "error",
    listener: (event: BrowserWorkerErrorEvent) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: BrowserWorkerMessageEvent) => void,
  ): void;
  removeEventListener(
    type: "error",
    listener: (event: BrowserWorkerErrorEvent) => void,
  ): void;
  postMessage(message: unknown): void;
  terminate(): void;
}

export interface EmbeddedPlanningWorkerHost {
  readonly Worker?: new (url: string) => BrowserPlanningWorker;
  readonly Blob?: new (
    parts: readonly string[],
    options: { readonly type: string },
  ) => object;
  readonly URL?: {
    createObjectURL(blob: object): string;
    revokeObjectURL(url: string): void;
  };
  readonly setTimeout?: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimeout?: (handle: unknown) => void;
}

export type EmbeddedPlanningWorkerResult =
  | { readonly status: "ready"; readonly worker: PlanningWorkerPort }
  | {
      readonly status: "unavailable";
      readonly code: string;
      readonly detail: string;
    };

/** Starts an embedded classic worker without requiring a network-hosted script. */
export function createEmbeddedPlanningWorker(
  source: string,
  host: EmbeddedPlanningWorkerHost,
  startupTimeoutMs = 2_000,
): Promise<EmbeddedPlanningWorkerResult> {
  const WorkerConstructor = host.Worker;
  const BlobConstructor = host.Blob;
  const urlApi = host.URL;
  if (
    WorkerConstructor === undefined ||
    BlobConstructor === undefined ||
    urlApi === undefined ||
    host.setTimeout === undefined
  )
    return Promise.resolve({
      status: "unavailable",
      code: "worker-unsupported",
      detail: "Worker, Blob, or object URL is unavailable",
    });

  let objectUrl: string | undefined;
  let worker: BrowserPlanningWorker | undefined;
  try {
    objectUrl = urlApi.createObjectURL(
      new BlobConstructor([source], { type: "text/javascript" }),
    );
    worker = new WorkerConstructor(objectUrl);
  } catch (error) {
    if (objectUrl !== undefined) urlApi.revokeObjectURL(objectUrl);
    return Promise.resolve({
      status: "unavailable",
      code: "worker-startup-failed",
      detail: String(error),
    });
  }

  return new Promise((resolve) => {
    let settled = false;
    let timeout: unknown;
    const finish = (result: EmbeddedPlanningWorkerResult) => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) host.clearTimeout?.(timeout);
      if (worker !== undefined) {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
      }
      if (objectUrl !== undefined) urlApi.revokeObjectURL(objectUrl);
      if (result.status === "ready") resolve(result);
      else {
        worker?.terminate();
        resolve(result);
      }
    };
    const onMessage = (event: BrowserWorkerMessageEvent) => {
      if (
        typeof event.data === "object" &&
        event.data !== null &&
        "kind" in event.data &&
        event.data.kind === "worker-ready"
      ) {
        const readyWorker = worker;
        finish({
          status: "ready",
          worker: Object.freeze({
            postMessage(message: unknown) {
              readyWorker?.postMessage(message);
            },
            subscribe(
              onMessageValue: (message: unknown) => void,
              onErrorValue: (error: unknown) => void,
            ) {
              const messageListener = (
                messageEvent: BrowserWorkerMessageEvent,
              ) => onMessageValue(messageEvent.data);
              const errorListener = (errorEvent: BrowserWorkerErrorEvent) =>
                onErrorValue(errorEvent.message);
              readyWorker?.addEventListener("message", messageListener);
              readyWorker?.addEventListener("error", errorListener);
              return () => {
                readyWorker?.removeEventListener("message", messageListener);
                readyWorker?.removeEventListener("error", errorListener);
              };
            },
            terminate() {
              readyWorker?.terminate();
            },
          }),
        });
        return;
      }
    };
    const onError = (event: BrowserWorkerErrorEvent) =>
      finish({
        status: "unavailable",
        code: "worker-startup-failed",
        detail: event.message,
      });

    worker?.addEventListener("message", onMessage);
    worker?.addEventListener("error", onError);
    if (host.setTimeout !== undefined)
      timeout = host.setTimeout(
        () =>
          finish({
            status: "unavailable",
            code: "worker-startup-timeout",
            detail: `Worker did not become ready within ${startupTimeoutMs} ms`,
          }),
        startupTimeoutMs,
      );
  });
}
