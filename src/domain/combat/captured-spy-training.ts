/** Pure policy for the captured foreign-panel spy-training slice. */

import { shouldTrainSpyUnderPolicy, type SpyTrainingInput } from "./spy.ts";

export interface CapturedSpyTrainingInput extends Pick<
  SpyTrainingInput,
  | "disabled"
  | "occupied"
  | "annexed"
  | "purchased"
  | "policy"
  | "spyCount"
  | "spyMaximumSetting"
  | "purchaseMoney"
  | "moneyMaximum"
  | "purchasePrice"
> {
  readonly enabled: boolean;
  readonly governmentIndex: number;
  readonly visible: boolean;
  /** The game-owned disabled answer includes its live cost and training state. */
  readonly training: number;
}

export interface CapturedSpyTrainingDecision {
  readonly kind: "train-spy";
  readonly governmentIndex: number;
  readonly expectedSpyCount: number;
  readonly expectedTraining: number;
}

export function planCapturedSpyTraining(
  input: Readonly<CapturedSpyTrainingInput>,
): Readonly<CapturedSpyTrainingDecision> | null {
  if (
    !input.enabled ||
    !Number.isFinite(input.spyMaximumSetting) ||
    !Number.isSafeInteger(input.governmentIndex) ||
    !input.visible ||
    input.training > 0 ||
    !shouldTrainSpyUnderPolicy(input)
  ) {
    return null;
  }
  return Object.freeze({
    kind: "train-spy" as const,
    governmentIndex: input.governmentIndex,
    expectedSpyCount: input.spyCount,
    expectedTraining: input.training,
  });
}
