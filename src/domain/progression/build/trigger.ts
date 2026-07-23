export interface TriggerTargetView {
  readonly index: number;
  readonly id: string;
  readonly shouldSaveMoney: boolean;
  readonly hasPositiveMoneyCost: boolean;
}

export interface TriggerInput {
  readonly target: Readonly<TriggerTargetView> | null;
}

interface TriggerDecisionBase {
  readonly index: number;
  readonly targetId: string;
}

export interface TriggerSkipDecision extends TriggerDecisionBase {
  readonly kind: "skip";
}

export interface TriggerClickDecision extends TriggerDecisionBase {
  readonly kind: "click";
}

export type TriggerDecision = TriggerSkipDecision | TriggerClickDecision;

/** Decide whether the current ordered trigger target may be clicked. */
export function planTrigger(
  input: Readonly<TriggerInput>,
): TriggerDecision | null {
  if (input.target === null) {
    return null;
  }
  return Object.freeze({
    kind:
      input.target.shouldSaveMoney && input.target.hasPositiveMoneyCost
        ? "skip"
        : "click",
    index: input.target.index,
    targetId: input.target.id,
  });
}
