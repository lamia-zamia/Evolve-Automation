export interface MercenaryCycleInput {
  readonly available: boolean;
  readonly saveInflationMoney: boolean;
  readonly goal: string;
  readonly maxSoldiers: number;
  readonly deadSoldierReserve: number;
  readonly moneyMedian: number;
  readonly costIncomeMultiplier: number;
  readonly moneyStoragePercent: number;
  readonly storageAssignExtra: boolean;
  readonly moneyMaximum: number;
  readonly moneyStorageRequired: number;
}

export interface MercenaryCyclePlan {
  readonly soldierLimit: number;
  readonly minimumMoney: number;
  readonly maximumCheapCost: number;
}

export interface MercenaryState {
  readonly currentSoldiers: number;
  readonly mercenaryCost: number;
  readonly moneyCurrent: number;
  readonly moneySpare: number;
}

export interface HireMercenaryDecision {
  readonly kind: "hire-mercenary";
  readonly expectedSoldiers: number;
  readonly expectedCost: number;
  readonly expectedMoneyCurrent: number;
  readonly expectedMoneySpare: number;
}

export interface MercenaryLogEvent {
  readonly id: "mercenary";
  readonly message: string;
  readonly categories: readonly ["combat"];
}

export function planMercenaryCycle(
  input: Readonly<MercenaryCycleInput>,
): Readonly<MercenaryCyclePlan> | null {
  if (
    !input.available ||
    (input.saveInflationMoney && input.goal !== "Reset")
  ) {
    return null;
  }

  if (input.goal === "Reset") {
    return Object.freeze({
      soldierLimit: input.maxSoldiers,
      minimumMoney: 0,
      maximumCheapCost: Number.MAX_SAFE_INTEGER,
    });
  }

  const maximumCheapCost = input.moneyMedian * input.costIncomeMultiplier;
  const minimumMoney = Math.max(
    (input.moneyMaximum * input.moneyStoragePercent) / 100,
    Math.min(
      input.moneyMaximum - maximumCheapCost,
      input.storageAssignExtra
        ? input.moneyStorageRequired / 1.03
        : input.moneyStorageRequired,
    ),
  );
  return Object.freeze({
    soldierLimit: input.maxSoldiers - input.deadSoldierReserve,
    minimumMoney,
    maximumCheapCost,
  });
}

export function planMercenaryHire(
  cycle: Readonly<MercenaryCyclePlan>,
  state: Readonly<MercenaryState>,
): Readonly<HireMercenaryDecision> | null {
  if (
    state.currentSoldiers >= cycle.soldierLimit ||
    state.moneyCurrent < state.mercenaryCost ||
    !(
      state.moneySpare - state.mercenaryCost > cycle.minimumMoney ||
      state.mercenaryCost < cycle.maximumCheapCost
    )
  ) {
    return null;
  }
  return Object.freeze({
    kind: "hire-mercenary",
    expectedSoldiers: state.currentSoldiers,
    expectedCost: state.mercenaryCost,
    expectedMoneyCurrent: state.moneyCurrent,
    expectedMoneySpare: state.moneySpare,
  });
}

export function planMercenaryLog(
  count: number,
): Readonly<MercenaryLogEvent> | null {
  if (count <= 0) return null;
  return Object.freeze({
    id: "mercenary",
    message:
      count === 1
        ? "Hired a mercenary to join the garrison."
        : `Hired ${count} mercenaries to join the garrison.`,
    categories: Object.freeze(["combat"] as const),
  });
}
