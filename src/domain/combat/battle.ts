export type BattleTactic = 0 | 1 | 2 | 3 | 4;

export type BattleTacticValues = readonly [
  number,
  number,
  number,
  number,
  number,
];

export interface BattleCycleInput {
  readonly available: boolean;
  readonly wounded: number;
  readonly deadSoldiers: number;
  readonly currentCityGarrison: number;
  readonly maxCityGarrison: number;
  readonly availableGarrison: number;
  readonly healthySoldiersPercent: number;
  readonly livingSoldiersPercent: number;
  readonly protectMode: string;
  readonly minimumAdvantage: number;
  readonly maximumAdvantage: number;
  readonly maximumSiegeBattalion: number;
  readonly recruitmentProgress: number;
  readonly recruitmentRate: number;
  readonly healingRate: number;
  readonly scalesArmor: number;
  readonly armorTechnology: number;
  readonly armoredDivisor: number;
  readonly frailPenalty: number;
  readonly highPopulationMultiplier: number;
  readonly ragePlanet: boolean;
  readonly autoHell: boolean;
  readonly hellAvailable: boolean;
  readonly maximumSoldiers: number;
  readonly hellReservedSoldiers: number;
  readonly hellSoldiers: number;
  readonly hellGarrison: number;
  readonly hellPatrolSize: number;
  readonly occupationCost: number;
  readonly portalVisible: boolean;
  readonly unificationEnabled: boolean;
  readonly occupyLast: boolean;
}

export interface BattleParameters {
  readonly minimumAdvantage: number;
  readonly maximumAdvantage: number;
  readonly maximumBattalion: BattleTacticValues;
  readonly initialRequiredBattalion: number;
  readonly currentCityGarrison: number;
  readonly maxCityGarrison: number;
  readonly availableGarrison: number;
  readonly autoHell: boolean;
  readonly hellAvailable: boolean;
  readonly maximumSoldiers: number;
  readonly hellReservedSoldiers: number;
  readonly hellSoldiers: number;
  readonly hellGarrison: number;
  readonly hellPatrolSize: number;
  readonly occupationCost: number;
  readonly portalVisible: boolean;
  readonly unificationEnabled: boolean;
  readonly occupyLast: boolean;
}

export interface BattleTargetInput {
  readonly governmentId: number;
  readonly policy: string;
  readonly released: boolean;
  readonly occupied: boolean;
  readonly annexed: boolean;
  readonly purchased: boolean;
  readonly spyCount: number;
}

export interface BattlePlunderTargetInput extends BattleTargetInput {
  readonly minimumSoldiers: BattleTacticValues;
  readonly maximumSoldiers: BattleTacticValues;
}

export interface BattleOccupationTargetInput extends BattleTargetInput {
  readonly minimumSiegeSoldiers: number;
  readonly maximumSiegeSoldiers: number;
}

export interface BattlefieldInput {
  readonly currentTarget: BattlePlunderTargetInput | null;
  readonly occupationTargets: readonly BattleOccupationTargetInput[];
}

export interface LaunchBattleDecision {
  readonly kind: "launch-battle";
  readonly governmentId: number;
  readonly expectedReleased: boolean;
  readonly expectedOccupied: boolean;
  readonly expectedAnnexed: boolean;
  readonly expectedPurchased: boolean;
  readonly spyCount: number;
  readonly tactic: BattleTactic;
  readonly battalionSize: number;
  readonly releaseControl: boolean;
  readonly hellPatrolsToRemove: number;
  readonly hellGarrisonToRemove: number;
}

export type OccupationCandidateDisposition = "skip" | "wait" | "select";

export function classifyOccupationCandidate(
  parameters: Readonly<BattleParameters>,
  foreign: Readonly<BattleOccupationTargetInput>,
): OccupationCandidateDisposition {
  if (foreign.policy !== "Occupy" || foreign.occupied) return "skip";
  const capacity =
    parameters.autoHell && parameters.hellAvailable
      ? parameters.maximumSoldiers - parameters.hellReservedSoldiers
      : parameters.maxCityGarrison;
  if (foreign.minimumSiegeSoldiers > capacity) return "skip";
  const requiredBattalion = Math.max(
    foreign.minimumSiegeSoldiers,
    Math.min(parameters.availableGarrison, foreign.maximumSiegeSoldiers - 1),
  );
  return parameters.availableGarrison <
    requiredBattalion / 2 + parameters.occupationCost &&
    parameters.availableGarrison < parameters.maxCityGarrison
    ? "wait"
    : "select";
}

export function canUsePlunderTactic(
  parameters: Readonly<BattleParameters>,
  tactic: BattleTactic,
  minimumSoldiers: number,
): boolean {
  return minimumSoldiers <= parameters.maximumBattalion[tactic];
}

const TACTICS: readonly BattleTactic[] = Object.freeze([0, 1, 2, 3, 4]);

function unavailableParameters(): null {
  return null;
}

export function prepareBattle(
  input: Readonly<BattleCycleInput>,
): Readonly<BattleParameters> | null {
  if (!input.available) return unavailableParameters();

  const healthyMinimum = input.healthySoldiersPercent / 100;
  const livingMinimum =
    input.protectMode === "auto" && input.wounded <= 0
      ? 0
      : input.livingSoldiersPercent / 100;
  if (
    input.wounded > (1 - healthyMinimum) * input.maxCityGarrison ||
    input.currentCityGarrison < livingMinimum * input.maxCityGarrison
  ) {
    return null;
  }

  let protectSoldiers = input.protectMode === "always";
  if (input.protectMode === "auto") {
    const timeToRecruit =
      (input.deadSoldiers * 100 - input.recruitmentProgress) /
      (input.recruitmentRate * 4);
    const timeToHeal = (input.wounded / input.healingRate) * 5;
    protectSoldiers = timeToRecruit > timeToHeal;
  }

  const minimumAdvantage = protectSoldiers
    ? Math.max(input.minimumAdvantage, 80)
    : input.minimumAdvantage;
  const maximumAdvantage = protectSoldiers
    ? Math.max(input.maximumAdvantage, minimumAdvantage)
    : input.maximumAdvantage;

  let maximumBattalion: number[] = TACTICS.map(() => input.availableGarrison);
  let initialRequiredBattalion = input.maxCityGarrison;
  if (protectSoldiers) {
    const armor =
      (input.scalesArmor + input.armorTechnology) / input.armoredDivisor -
      input.frailPenalty;
    const extraProtection = input.ragePlanet ? 1 : 2;
    maximumBattalion = [5, 10, 25, 50, 999].map((cap, tactic) => {
      const protectedBattalion =
        armor >= cap * input.highPopulationMultiplier
          ? Number.MAX_SAFE_INTEGER
          : (5 - tactic) * (armor + extraProtection) - 1;
      return Math.min(protectedBattalion, input.availableGarrison);
    });
    initialRequiredBattalion = 0;
  }
  maximumBattalion[4] = Math.min(
    maximumBattalion[4] ?? input.availableGarrison,
    input.maximumSiegeBattalion,
  );

  return Object.freeze({
    minimumAdvantage,
    maximumAdvantage,
    maximumBattalion: Object.freeze(maximumBattalion) as BattleTacticValues,
    initialRequiredBattalion,
    currentCityGarrison: input.currentCityGarrison,
    maxCityGarrison: input.maxCityGarrison,
    availableGarrison: input.availableGarrison,
    autoHell: input.autoHell,
    hellAvailable: input.hellAvailable,
    maximumSoldiers: input.maximumSoldiers,
    hellReservedSoldiers: input.hellReservedSoldiers,
    hellSoldiers: input.hellSoldiers,
    hellGarrison: input.hellGarrison,
    hellPatrolSize: input.hellPatrolSize,
    occupationCost: input.occupationCost,
    portalVisible: input.portalVisible,
    unificationEnabled: input.unificationEnabled,
    occupyLast: input.occupyLast,
  });
}

export function planBattle(
  parameters: Readonly<BattleParameters>,
  battlefield: Readonly<BattlefieldInput>,
): Readonly<LaunchBattleDecision> | null {
  let currentTarget: BattleTargetInput | null = battlefield.currentTarget;
  let requiredBattalion = parameters.initialRequiredBattalion;
  let requiredTactic: BattleTactic = 0;

  for (const foreign of battlefield.occupationTargets) {
    const disposition = classifyOccupationCandidate(parameters, foreign);
    if (disposition === "skip") continue;

    currentTarget = foreign;
    requiredBattalion = Math.max(
      foreign.minimumSiegeSoldiers,
      Math.min(parameters.availableGarrison, foreign.maximumSiegeSoldiers - 1),
    );
    requiredTactic = 4;
    if (disposition === "wait") return null;
    break;
  }

  if (currentTarget === null) return null;

  if (requiredTactic !== 4) {
    const plunderTarget = battlefield.currentTarget;
    if (plunderTarget === null) return null;
    const startingTactic =
      !parameters.unificationEnabled || parameters.occupyLast ? 4 : 3;
    for (let rawTactic = startingTactic; rawTactic >= 0; rawTactic--) {
      const tactic = rawTactic as BattleTactic;
      const soldiersMinimum = plunderTarget.minimumSoldiers[tactic];
      if (!canUsePlunderTactic(parameters, tactic, soldiersMinimum)) continue;
      requiredBattalion = Math.max(
        soldiersMinimum,
        Math.min(
          parameters.maximumBattalion[tactic],
          parameters.availableGarrison,
          plunderTarget.maximumSoldiers[tactic] - 1,
        ),
      );
      requiredTactic = tactic;
      break;
    }
    if (
      !requiredBattalion ||
      requiredBattalion > parameters.availableGarrison
    ) {
      return null;
    }
  }

  const releaseControl =
    !currentTarget.released &&
    (currentTarget.annexed ||
      currentTarget.purchased ||
      currentTarget.occupied);
  let hellPatrolsToRemove = 0;
  let hellGarrisonToRemove = 0;
  if (!releaseControl && requiredTactic === 4 && parameters.portalVisible) {
    const missingSoldiers =
      parameters.occupationCost -
      (parameters.currentCityGarrison - requiredBattalion);
    if (missingSoldiers > 0) {
      if (
        !parameters.autoHell ||
        !parameters.hellAvailable ||
        parameters.hellSoldiers - parameters.hellReservedSoldiers <
          missingSoldiers
      ) {
        return null;
      }
      hellPatrolsToRemove = Math.ceil(
        (missingSoldiers - parameters.hellGarrison) / parameters.hellPatrolSize,
      );
      hellGarrisonToRemove = missingSoldiers;
    }
  }

  return Object.freeze({
    kind: "launch-battle",
    governmentId: currentTarget.governmentId,
    expectedReleased: currentTarget.released,
    expectedOccupied: currentTarget.occupied,
    expectedAnnexed: currentTarget.annexed,
    expectedPurchased: currentTarget.purchased,
    spyCount: currentTarget.spyCount,
    tactic: requiredTactic,
    battalionSize: requiredBattalion,
    releaseControl,
    hellPatrolsToRemove: Math.max(0, hellPatrolsToRemove),
    hellGarrisonToRemove,
  });
}
