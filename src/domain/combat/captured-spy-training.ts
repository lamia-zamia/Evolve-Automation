/** Pure policy for the captured foreign-panel spy-training slice. */

export interface CapturedSpyTrainingInput {
  readonly enabled: boolean;
  /** A finite non-negative cap; negative/unbounded settings stay outside this slice. */
  readonly maximum: number;
  readonly governmentIndex: number;
  readonly visible: boolean;
  /** The game-owned disabled answer includes its live cost and training state. */
  readonly disabled: boolean;
  readonly spyCount: number;
  readonly training: number;
  readonly occupied: boolean;
  readonly annexed: boolean;
  readonly purchased: boolean;
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
    !Number.isFinite(input.maximum) ||
    input.maximum < 1 ||
    !Number.isSafeInteger(input.governmentIndex) ||
    !input.visible ||
    input.disabled ||
    input.training > 0 ||
    input.occupied ||
    input.annexed ||
    input.purchased ||
    input.spyCount >= input.maximum
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
