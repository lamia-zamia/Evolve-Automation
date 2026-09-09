/**
 * Job assignment through the controls captured while the upstream Civics panel was mounted.
 *
 * The Vue 3 game owns the worker movement: `add` and `sub` apply its current click multiplier and
 * update the live civic state. This adapter only paces the requested delta and refuses a control
 * that disappeared or was rebound between calls.
 */

import type {
  GameDefaultJobRequest,
  GameJobAssignmentRequest,
  GameJobControlsPort,
} from "../../../ports/game-job-controls.ts";
import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { JobsDecision } from "../../../domain/civic/jobs.ts";
import type { CommandExecutionOutcome } from "../../../domain/commands.ts";
import { rejected, SUCCEEDED } from "../../command-outcomes.ts";

export interface CapturedJobControlsDependencies {
  readonly controls: GameControlRegistry;
}

export interface CapturedJobCommandJob {
  readonly token: number;
  readonly id: string;
  readonly workers: number;
  readonly servants: number;
  readonly serves: boolean;
}

export interface CapturedJobCommandState {
  readonly jobs: readonly Readonly<CapturedJobCommandJob>[];
  readonly manageServants: boolean;
}

function callCount(
  controls: GameControlRegistry,
  elementId: string,
  method: "add" | "sub",
  count: number,
  craftedResourceId: string | undefined,
): boolean {
  const handle = controls.resolve(elementId);
  if (handle === undefined) return false;
  if (!Number.isFinite(count)) return false;
  const calls = Math.ceil(Math.max(count, 0));
  const args =
    craftedResourceId === undefined ? undefined : [craftedResourceId];
  for (let index = 0; index < calls; index++) {
    const result = controls.invoke(handle, method, args);
    if (!result.ok) return false;
  }
  return true;
}

export function createCapturedJobControls({
  controls,
}: CapturedJobControlsDependencies): GameJobControlsPort {
  return Object.freeze({
    assign({ elementId, count, craftedResourceId }: GameJobAssignmentRequest) {
      return callCount(controls, elementId, "add", count, craftedResourceId);
    },

    unassign({
      elementId,
      count,
      craftedResourceId,
    }: GameJobAssignmentRequest) {
      return callCount(controls, elementId, "sub", count, craftedResourceId);
    },

    setDefault({ elementId, jobId }: GameDefaultJobRequest) {
      const handle = controls.resolve(elementId);
      if (handle === undefined) return false;
      return controls.invoke(handle, "setDefault", [jobId]).ok;
    },
  });
}

/** Executes one already-validated ordinary-job decision in game-safe order. */
export function executeCapturedJobDecision(
  controls: GameJobControlsPort,
  state: Readonly<CapturedJobCommandState>,
  decision: Readonly<JobsDecision>,
): CommandExecutionOutcome {
  const byToken = new Map(state.jobs.map((job) => [job.token, job]));
  const workerRemovals: Array<readonly [CapturedJobCommandJob, number]> = [];
  const workerAdditions: Array<readonly [CapturedJobCommandJob, number]> = [];
  const servantRemovals: Array<readonly [CapturedJobCommandJob, number]> = [];
  const servantAdditions: Array<readonly [CapturedJobCommandJob, number]> = [];

  for (const assignment of decision.assignments) {
    const job = byToken.get(assignment.jobToken);
    if (job === undefined) {
      return rejected(
        "unknown-job-token",
        "Jobs decision contains an unknown job token",
      );
    }
    if (
      !Number.isFinite(assignment.workers) ||
      assignment.workers < 0 ||
      !Number.isFinite(assignment.servants) ||
      assignment.servants < 0
    ) {
      return rejected(
        "invalid-job-assignment",
        "Jobs decision contains a non-finite or negative assignment",
      );
    }
    const workerDelta = assignment.workers - job.workers;
    if (workerDelta < 0) {
      workerRemovals.push([job, -workerDelta]);
    } else if (workerDelta > 0) {
      workerAdditions.push([job, workerDelta]);
    }
    if (!state.manageServants) continue;
    if (!job.serves && assignment.servants !== job.servants) {
      return rejected(
        "unsupported-servant-assignment",
        `Job ${job.id} has no captured servant control`,
      );
    }
    const servantDelta = assignment.servants - job.servants;
    if (servantDelta < 0) {
      servantRemovals.push([job, -servantDelta]);
    } else if (servantDelta > 0) {
      servantAdditions.push([job, servantDelta]);
    }
  }

  const selectedDefault =
    decision.selectedDefaultToken === null
      ? undefined
      : byToken.get(decision.selectedDefaultToken);
  if (decision.selectedDefaultToken !== null && selectedDefault === undefined) {
    return rejected(
      "unknown-default-job-token",
      "Jobs decision selects an unknown default job token",
    );
  }

  for (const [job, count] of workerRemovals) {
    if (!controls.unassign({ elementId: `civ-${job.id}`, count })) {
      return rejected(
        "job-control-failed",
        `could not unassign workers from ${job.id}`,
      );
    }
  }
  for (const [job, count] of workerAdditions) {
    if (!controls.assign({ elementId: `civ-${job.id}`, count })) {
      return rejected(
        "job-control-failed",
        `could not assign workers to ${job.id}`,
      );
    }
  }
  for (const [job, count] of servantRemovals) {
    if (!controls.unassign({ elementId: `servant-${job.id}`, count })) {
      return rejected(
        "servant-control-failed",
        `could not unassign servants from ${job.id}`,
      );
    }
  }
  for (const [job, count] of servantAdditions) {
    if (!controls.assign({ elementId: `servant-${job.id}`, count })) {
      return rejected(
        "servant-control-failed",
        `could not assign servants to ${job.id}`,
      );
    }
  }
  if (
    selectedDefault !== undefined &&
    !controls.setDefault({
      elementId: `civ-${selectedDefault.id}`,
      jobId: selectedDefault.id,
    })
  ) {
    return rejected(
      "default-job-control-failed",
      `could not select ${selectedDefault.id} as the default job`,
    );
  }
  return SUCCEEDED;
}
