import type {
  ForcedTaskState,
  OverrideConditionEvaluator,
  OverrideConditionFailure,
} from "../domain/override-resolution.ts";

/** Everything the game contributes to one override pass, sampled once per pass. */
export interface OverrideEvaluationSource {
  /** The pass's sample: an operand named by the same argument twice reads the game once. */
  sampleEvaluator(): OverrideConditionEvaluator;
  readForcedTasks(): ForcedTaskState;
}

/** Tells the player which conditions could not be evaluated. */
export interface OverrideFailureReporter {
  report(failures: readonly OverrideConditionFailure[]): void;
}

/** Republishes the effective override value the editor shows while it is open. */
export interface OverrideEffectiveValueDisplay {
  publish(): void;
}
