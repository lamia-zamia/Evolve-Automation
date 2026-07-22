import { runTick, type TickDependencies } from "./tick.ts";

/** The application-owned cycle entry point. */
export interface ApplicationRunner {
  runCycle(): boolean;
}

export interface ApplicationRunnerDependencies extends Omit<
  TickDependencies,
  "updateState"
> {
  /** Runs the state-update phase before automation decisions are sampled. */
  readonly updateState: () => void;
}

/**
 * Owns the boundary between the game's state refresh and the ordered automation tick.
 * The state-update callback is injected here so bootstrap does not call either runner directly.
 */
export function createApplicationRunner({
  reader,
  controls,
  updateState,
}: ApplicationRunnerDependencies): ApplicationRunner {
  return Object.freeze({
    runCycle: () =>
      runTick({
        reader,
        controls,
        updateState,
      }),
  });
}
