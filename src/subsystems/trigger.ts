import type { SubsystemDependencies } from "./types.ts";

type Dependencies = SubsystemDependencies<
  | "getState"
  | "inflationChallengeShouldSaveMoney"
>;
export function createAutoTrigger({ getState, inflationChallengeShouldSaveMoney }: Dependencies) {
  return function autoTrigger() {
    const state = getState();
    let triggerActive = false;
    for (let trigger of state.triggerTargets) {
      if (
        inflationChallengeShouldSaveMoney() &&
        (trigger.cost?.Money ?? 0) > 0
      ) {
        continue;
      }
      if (trigger.click()) {
        triggerActive = true;
      }
    }
    return triggerActive;
  }
}
