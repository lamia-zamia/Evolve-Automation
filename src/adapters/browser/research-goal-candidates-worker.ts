import type {
  PlanningIdentity,
  PlanningResponse,
} from "../../ports/planning-worker.ts";
import {
  evaluateResearchGoalCandidates,
  type ResearchGoalCandidateEvaluation,
  type ResearchGoalCandidateInput,
} from "../../domain/progression/research-goal-candidates.ts";

export const RESEARCH_GOAL_CANDIDATES_TASK = "research-goal-candidates";

export function researchGoalOfferIdentity(
  input: Pick<ResearchGoalCandidateInput, "offers">,
): string {
  return input.offers
    .map((offer) => `${offer.actionId}@${offer.generation}`)
    .join("|");
}

interface WorkerEndpoint {
  addEventListener(
    type: "message",
    listener: (event: { readonly data: unknown }) => void,
  ): void;
  postMessage(message: unknown): void;
}

function isResearchCandidateRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readIdentity(value: unknown): PlanningIdentity | undefined {
  if (!isResearchCandidateRecord(value)) return undefined;
  const {
    task,
    rootGeneration,
    progressionEpoch,
    offerIdentity,
    snapshotVersion,
  } = value;
  if (
    task !== RESEARCH_GOAL_CANDIDATES_TASK ||
    typeof rootGeneration !== "number" ||
    !Number.isInteger(rootGeneration) ||
    typeof progressionEpoch !== "string" ||
    typeof offerIdentity !== "string" ||
    typeof snapshotVersion !== "number" ||
    !Number.isInteger(snapshotVersion)
  )
    return undefined;
  return {
    task,
    rootGeneration,
    progressionEpoch,
    offerIdentity,
    snapshotVersion,
  };
}

function isCandidateInput(value: unknown): value is ResearchGoalCandidateInput {
  if (!isResearchCandidateRecord(value)) return false;
  const graph = value.graph;
  return (
    typeof value.goalId === "string" &&
    typeof value.targetActionId === "string" &&
    typeof value.goalSatisfied === "boolean" &&
    isResearchCandidateRecord(graph) &&
    Array.isArray(graph.actions) &&
    Array.isArray(graph.requirements) &&
    Array.isArray(graph.actionableFrontier) &&
    typeof value.cycle === "number" &&
    typeof value.progressionEpoch === "string" &&
    (typeof value.rootGeneration === "number" ||
      value.rootGeneration === undefined) &&
    Array.isArray(value.offers) &&
    (typeof value.baselineSelectedActionId === "string" ||
      value.baselineSelectedActionId === undefined)
  );
}

export function decodeResearchGoalCandidateResponse(
  value: unknown,
): PlanningResponse<Record<string, unknown>> | undefined {
  if (
    !isResearchCandidateRecord(value) ||
    !isResearchCandidateRecord(value.outcome)
  )
    return undefined;
  const identity = readIdentity(value.identity);
  const outcome = value.outcome;
  if (
    typeof value.requestId !== "number" ||
    !Number.isSafeInteger(value.requestId) ||
    identity === undefined
  )
    return undefined;
  if (outcome.kind === "diagnostic") {
    if (typeof outcome.code !== "string" || typeof outcome.message !== "string")
      return undefined;
    return {
      requestId: value.requestId,
      identity,
      outcome: {
        kind: "diagnostic",
        code: outcome.code,
        message: outcome.message,
      },
    };
  }
  if (
    outcome.kind !== "decision" ||
    !isResearchCandidateRecord(outcome.value) ||
    typeof outcome.value.goalId !== "string" ||
    typeof outcome.value.targetActionId !== "string" ||
    !Array.isArray(outcome.value.candidates)
  )
    return undefined;
  return {
    requestId: value.requestId,
    identity,
    outcome: {
      kind: "decision",
      value: outcome.value,
    },
    ...(typeof value.workerComputeMs === "number" &&
    Number.isFinite(value.workerComputeMs)
      ? { workerComputeMs: value.workerComputeMs }
      : {}),
    ...(typeof value.workerValidationMs === "number" &&
    Number.isFinite(value.workerValidationMs)
      ? { workerValidationMs: value.workerValidationMs }
      : {}),
  };
}

/** Installs the proposal-only task in a dedicated worker global. */
export function installResearchGoalCandidatesWorker(
  endpoint: WorkerEndpoint,
): void {
  endpoint.postMessage({ kind: "worker-ready" });
  endpoint.addEventListener("message", ({ data }) => {
    const workerStartedAtMs = performance.now();
    if (
      !isResearchCandidateRecord(data) ||
      typeof data.requestId !== "number" ||
      !Number.isSafeInteger(data.requestId)
    )
      return;
    const identity = readIdentity(data.identity);
    if (identity === undefined) return;

    let outcome: PlanningResponse<ResearchGoalCandidateEvaluation>["outcome"];
    let workerComputeMs: number | undefined;
    let workerValidationMs: number | undefined;
    if (!isCandidateInput(data.input)) {
      outcome = {
        kind: "diagnostic",
        code: "invalid-planning-input",
        message: "Research candidate snapshot did not match its contract",
      };
    } else if (
      identity.rootGeneration !== data.input.rootGeneration ||
      identity.progressionEpoch !== data.input.progressionEpoch ||
      identity.offerIdentity !== researchGoalOfferIdentity(data.input)
    ) {
      outcome = {
        kind: "diagnostic",
        code: "stale-request-identity",
        message: "Request identity did not describe its Research snapshot",
      };
    } else {
      workerValidationMs = Math.max(0, performance.now() - workerStartedAtMs);
      const workerComputeStartedAtMs = performance.now();
      try {
        const decision = evaluateResearchGoalCandidates(data.input);
        outcome = { kind: "decision", value: decision };
      } catch (error) {
        outcome = {
          kind: "diagnostic",
          code: "planner-threw",
          message: String(error),
        };
      }
      workerComputeMs = Math.max(
        0,
        performance.now() - workerComputeStartedAtMs,
      );
    }
    workerValidationMs ??= Math.max(0, performance.now() - workerStartedAtMs);

    const response: PlanningResponse<ResearchGoalCandidateEvaluation> = {
      requestId: data.requestId,
      identity,
      outcome,
      ...(workerComputeMs === undefined ? {} : { workerComputeMs }),
      workerValidationMs,
    };
    // This result is evidence only; no native control or execution method crosses the boundary.
    endpoint.postMessage(response);
  });
}
