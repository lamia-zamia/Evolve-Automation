export type PsychicPower =
  "murder" | "mind_break" | "stun" | "profit" | "boost" | "assault";

export interface PsychicRoomView {
  readonly current: number;
  readonly income: number;
  readonly maximum: number;
}

export interface PsychicBoostCandidate extends PsychicRoomView {
  readonly id: string;
}

export interface PsychicInput {
  readonly available: boolean;
  readonly mode: string;
  readonly technologyLevel: number;
  readonly killCount: number;
  readonly energyCurrent: number;
  readonly energyStorageRatio: number;
  readonly populationCurrent: number;
  readonly thrallAvailable: boolean;
  readonly thrallTechnologyLevel: number;
  readonly thrallRate: number;
  readonly thrallStorageRatio: number;
  readonly cashActive: boolean;
  readonly boostActive: boolean;
  readonly assaultActive: boolean;
  readonly money: PsychicRoomView | null;
  readonly boostResourceMode: string;
  readonly boostCandidates: readonly Readonly<PsychicBoostCandidate>[];
}

export interface PsychicDecision {
  readonly kind: "use-psychic-power";
  readonly power: PsychicPower;
  readonly energyCost: number;
  readonly expectedEnergy: number;
  readonly expectedTechnologyLevel: number;
  readonly boostedResourceId: string | null;
}

const POWER_COSTS: Readonly<Record<PsychicPower, readonly [number, number]>> =
  Object.freeze({
    murder: [10, 8] as const,
    boost: [75, 60] as const,
    assault: [45, 36] as const,
    profit: [65, 52] as const,
    mind_break: [80, 64] as const,
    stun: [100, 80] as const,
  });

export function psychicPowerCost(
  power: PsychicPower,
  technologyLevel: number,
): number {
  return POWER_COSTS[power][technologyLevel >= 5 ? 1 : 0];
}

function hasRoom(resource: Readonly<PsychicRoomView>): boolean {
  return resource.current + resource.income * 1.5 * 300 < resource.maximum;
}

function decision(
  input: Readonly<PsychicInput>,
  power: PsychicPower,
  boostedResourceId: string | null = null,
): Readonly<PsychicDecision> {
  return Object.freeze({
    kind: "use-psychic-power",
    power,
    energyCost: psychicPowerCost(power, input.technologyLevel),
    expectedEnergy: input.energyCurrent,
    expectedTechnologyLevel: input.technologyLevel,
    boostedResourceId,
  });
}

function canAfford(
  input: Readonly<PsychicInput>,
  power: PsychicPower,
): boolean {
  return input.energyCurrent >= psychicPowerCost(power, input.technologyLevel);
}

export function planPsychic(
  input: Readonly<PsychicInput>,
): readonly Readonly<PsychicDecision>[] {
  if (!input.available) return Object.freeze([]);
  const decisions: Readonly<PsychicDecision>[] = [];

  if (
    (input.mode === "murder" ||
      (input.mode !== "boost" && input.killCount < 10)) &&
    input.populationCurrent > 0 &&
    canAfford(input, "murder")
  ) {
    decisions.push(decision(input, "murder"));
  }

  if (input.thrallAvailable) {
    if (
      (input.mode === "auto" || input.mode === "mind_break") &&
      (input.thrallRate > 1 ||
        (input.thrallRate === 1 && input.thrallStorageRatio === 1)) &&
      canAfford(input, "mind_break")
    ) {
      decisions.push(decision(input, "mind_break"));
    }
    if (
      (input.mode === "auto" || input.mode === "stun") &&
      input.thrallTechnologyLevel >= 2 &&
      input.thrallStorageRatio < 1 &&
      canAfford(input, "stun")
    ) {
      decisions.push(decision(input, "stun"));
    }
  }

  if (
    (input.mode === "auto" || input.mode === "profit") &&
    input.technologyLevel >= 3 &&
    input.money !== null &&
    hasRoom(input.money) &&
    !input.cashActive &&
    canAfford(input, "profit")
  ) {
    decisions.push(decision(input, "profit"));
  }

  if (
    (input.mode === "auto" || input.mode === "boost") &&
    !input.boostActive &&
    canAfford(input, "boost")
  ) {
    let boostedResourceId: string | null = null;
    if (input.boostResourceMode === "auto") {
      const boostable = input.boostCandidates
        .filter(hasRoom)
        .slice()
        .sort((left, right) => right.income - left.income);
      boostedResourceId = boostable[0]?.id ?? null;
    } else if (input.boostResourceMode) {
      boostedResourceId = input.boostResourceMode;
    }
    if (boostedResourceId !== null) {
      decisions.push(decision(input, "boost", boostedResourceId));
    }
  }

  if (
    (input.mode === "auto" || input.mode === "assault") &&
    input.technologyLevel >= 2 &&
    !input.assaultActive &&
    canAfford(input, "assault")
  ) {
    decisions.push(decision(input, "assault"));
  }

  return Object.freeze(decisions);
}
