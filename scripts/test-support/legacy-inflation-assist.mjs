// Exact copy of the pre-migration run-guards inflation arithmetic, expressed
// over the same immutable inputs the domain policy consumes. Used only to prove
// old-versus-new equivalence for valid data.

export function legacyInflationAssistActive(input) {
  return Boolean(
    input.assistEnabled &&
    input.inflationRun &&
    input.wheelbarrowStar < input.achievementLevel,
  );
}

export function legacyInflationMoneyReachable(input) {
  return input.maxMoney >= input.targetMoney;
}

export function legacyInflationSecondsToFinish(input) {
  if (!legacyInflationMoneyReachable(input)) {
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

export function legacyShouldSaveInflationMoney(input) {
  return Boolean(
    input.active &&
    input.saveMinutes >= 0 &&
    legacyInflationSecondsToFinish(input.money) <= input.saveMinutes * 60,
  );
}
