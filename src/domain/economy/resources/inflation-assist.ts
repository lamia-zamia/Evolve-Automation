export interface InflationAssistActiveInput {
  /** Whether the user enabled Inflation-challenge assistance. */
  readonly assistEnabled: boolean;
  /** Whether the current run is an Inflation challenge. */
  readonly inflationRun: boolean;
  /** Current earned star level of the "wheelbarrow" achievement. */
  readonly wheelbarrowStar: number;
  /** Current achievement (a-level) requirement for the run. */
  readonly achievementLevel: number;
}

export interface InflationMoneyInput {
  /** Money total that finishes the Inflation challenge. */
  readonly targetMoney: number;
  /** Current stored Money. */
  readonly currentMoney: number;
  /** Maximum Money the current storage can hold. */
  readonly maxMoney: number;
  /** Money rate of change per second; may be negative during a deficit. */
  readonly moneyRate: number;
}

export interface InflationSaveInput {
  /** Result of {@link isInflationAssistActive} for the current sample. */
  readonly active: boolean;
  /** Configured lead time, in minutes, before completion to begin saving. */
  readonly saveMinutes: number;
  readonly money: Readonly<InflationMoneyInput>;
}

/** The run still benefits from Inflation-challenge assistance. */
export function isInflationAssistActive(
  input: Readonly<InflationAssistActiveInput>,
): boolean {
  return (
    input.assistEnabled &&
    input.inflationRun &&
    input.wheelbarrowStar < input.achievementLevel
  );
}

/** Storage is large enough to hold the challenge's target Money. */
export function isInflationMoneyReachable(
  input: Readonly<InflationMoneyInput>,
): boolean {
  return input.maxMoney >= input.targetMoney;
}

/** Seconds until the target Money is reached, or Infinity if unreachable. */
export function inflationSecondsToFinish(
  input: Readonly<InflationMoneyInput>,
): number {
  if (!isInflationMoneyReachable(input)) {
    return Number.POSITIVE_INFINITY;
  }
  const remaining = input.targetMoney - input.currentMoney;
  if (remaining <= 0) {
    return 0;
  }
  return input.moneyRate > 0
    ? remaining / input.moneyRate
    : Number.POSITIVE_INFINITY;
}

/** Automation should stop spending Money to finish the Inflation challenge. */
export function shouldSaveInflationMoney(
  input: Readonly<InflationSaveInput>,
): boolean {
  return (
    input.active &&
    input.saveMinutes >= 0 &&
    inflationSecondsToFinish(input.money) <= input.saveMinutes * 60
  );
}
