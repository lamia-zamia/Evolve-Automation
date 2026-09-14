import { runPrestige } from "../application/prestige.ts";
import {
  createCapturedMadPrestige,
  type CapturedMadPrestigeDependencies,
} from "../adapters/evolve/progression/prestige/captured-mad.ts";

/** The captured runtime's currently supported prestige branch. */
export interface CapturedPrestigeControl {
  readonly run: () => void;
}

export function createCapturedPrestigeControl(
  dependencies: CapturedMadPrestigeDependencies,
): CapturedPrestigeControl {
  const { reader, executor } = createCapturedMadPrestige(dependencies);
  return Object.freeze({
    run: () => runPrestige({ reader, executor }),
  });
}
