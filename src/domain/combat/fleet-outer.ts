export type OuterFleetBlueprint = "yard" | "explorer" | "scout" | "fighter";

export interface OuterFleetCycleInput {
  readonly initialized: boolean;
  readonly mode: string;
  readonly manualBlueprintAvailable: boolean;
  readonly configuredMinimumCrew: number;
}

export interface OuterFleetAutomaticPlan {
  readonly kind: "select-target";
  readonly mode: string;
  readonly configuredMinimumCrew: number;
}

export interface OuterFleetStatusDecision {
  readonly kind: "outer-fleet-status";
  readonly blueprint: OuterFleetBlueprint | null;
  readonly nextShipName: string | null;
  readonly messageBeforeUpdate: string | null;
  readonly messageAfterUpdate: string | null;
}

export interface OuterFleetRegionInput {
  readonly id: string;
  readonly unlocked: boolean;
  readonly weighting: number;
  readonly syndicateRatio: number;
  readonly maximumDefense: number;
  readonly digsiteIncomplete: boolean;
  readonly requestedTroopers: number;
  readonly requestedTanks: number;
  readonly reportedSupport: number | null;
}

export interface OuterFleetTargetInput {
  readonly exploreTau: boolean;
  readonly tauTechnology: number;
  readonly explorerAvailable: boolean;
  readonly explorerCount: number;
  readonly erisTechnology: number;
  readonly erisWeighting: number;
  readonly erisSensor: number;
  readonly regions: readonly OuterFleetRegionInput[];
}

export interface OuterFleetTargetPlan {
  readonly kind: "select-blueprint";
  readonly mode: string;
  readonly targetRegion: string;
  readonly minimumCrew: number;
  readonly forcedBlueprint: "explorer" | null;
}

export interface OuterFleetBlueprintInput {
  readonly target: Readonly<OuterFleetTargetPlan>;
  readonly targetLocationName: string;
  readonly yardAvailable: boolean;
  readonly scoutAvailable: boolean;
  readonly scoutCount: number;
  readonly maximumScouts: number;
  readonly fighterAvailable: boolean;
}

export interface OuterFleetCandidatePlan {
  readonly kind: "check-candidate";
  readonly blueprint: OuterFleetBlueprint;
  readonly targetRegion: string;
  readonly targetLocationName: string;
  readonly minimumCrew: number;
}

export type OuterFleetAuthorityAssessment =
  | { readonly status: "not-required" | "unmanaged" }
  | { readonly status: "unavailable" }
  | {
      readonly status: "ready";
      readonly target: number;
      readonly predicted: number;
      readonly blocksRemoval: boolean;
    };

export interface OuterFleetCandidateInput {
  readonly candidate: Readonly<OuterFleetCandidatePlan>;
  readonly shipName: string;
  readonly shipCrew: number;
  readonly authority: Readonly<OuterFleetAuthorityAssessment>;
}

export interface OuterFleetReadinessPlan {
  readonly kind: "check-build-readiness";
  readonly blueprint: OuterFleetBlueprint;
  readonly targetRegion: string;
  readonly targetLocationName: string;
  readonly minimumCrew: number;
  readonly shipName: string;
  readonly shipCrew: number;
  readonly nextShipName: string;
}

export interface OuterFleetBuildReadinessInput {
  readonly plan: Readonly<OuterFleetReadinessPlan>;
  readonly missingResourceName: string | null;
  readonly currentCityGarrison: number;
}

export interface OuterFleetBuildDecision {
  readonly kind: "build-outer-fleet";
  readonly blueprint: OuterFleetBlueprint;
  readonly targetRegion: string;
  readonly targetLocationName: string;
  readonly shipName: string;
  readonly shipCrew: number;
  readonly nextShipName: string;
}

export type OuterFleetDecision =
  OuterFleetStatusDecision | OuterFleetBuildDecision;

function status(
  blueprint: OuterFleetBlueprint | null,
  messageBeforeUpdate: string | null,
  messageAfterUpdate: string | null,
  nextShipName: string | null = null,
): Readonly<OuterFleetStatusDecision> {
  return Object.freeze({
    kind: "outer-fleet-status",
    blueprint,
    nextShipName,
    messageBeforeUpdate,
    messageAfterUpdate,
  });
}

export function planOuterFleetCycle(
  input: Readonly<OuterFleetCycleInput>,
): Readonly<OuterFleetAutomaticPlan | OuterFleetStatusDecision> {
  if (!input.initialized) {
    return status(null, "No ships needed yet", null);
  }
  if (input.mode === "none") {
    return status(null, null, "Ship construction is disabled");
  }
  if (input.mode === "manual") {
    return status(
      input.manualBlueprintAvailable ? "yard" : null,
      null,
      "Ships managed manually",
    );
  }
  return Object.freeze({
    kind: "select-target",
    mode: input.mode,
    configuredMinimumCrew: input.configuredMinimumCrew,
  });
}

export function calculateOuterFleetDefenseTarget(
  region: Readonly<OuterFleetRegionInput>,
): number {
  if (!region.digsiteIncomplete) return region.maximumDefense;
  const requestedUnits = region.requestedTroopers + region.requestedTanks;
  const supportedUnits =
    region.reportedSupport === null
      ? requestedUnits
      : Math.min(requestedUnits, region.reportedSupport);
  const activeTroopers = Math.min(region.requestedTroopers, supportedUnits);
  const activeTanks = Math.min(
    region.requestedTanks,
    Math.max(0, supportedUnits - activeTroopers),
  );
  const conservativeGroundPower = activeTroopers + activeTanks * 100;
  const digsiteDefense =
    conservativeGroundPower > 0
      ? Math.min(0.9, 350 / conservativeGroundPower)
      : 0.5;
  return Math.max(region.maximumDefense, digsiteDefense);
}

export function planOuterFleetTarget(
  cycle: Readonly<OuterFleetAutomaticPlan>,
  input: Readonly<OuterFleetTargetInput>,
): Readonly<OuterFleetTargetPlan | OuterFleetStatusDecision> {
  if (
    input.exploreTau &&
    input.tauTechnology === 1 &&
    input.explorerAvailable &&
    input.explorerCount < 1
  ) {
    return Object.freeze({
      kind: "select-blueprint",
      mode: cycle.mode,
      targetRegion: "tauceti",
      minimumCrew: 0,
      forcedBlueprint: "explorer",
    });
  }

  if (
    input.erisTechnology === 1 &&
    input.erisWeighting > 0 &&
    input.erisSensor < 50
  ) {
    return Object.freeze({
      kind: "select-blueprint",
      mode: cycle.mode,
      targetRegion: "spc_eris",
      minimumCrew: 0,
      forcedBlueprint: null,
    });
  }

  const regionsToProtect = input.regions
    .filter(
      (region) =>
        region.unlocked &&
        region.weighting > 0 &&
        region.syndicateRatio < calculateOuterFleetDefenseTarget(region),
    )
    .sort(
      (left, right) =>
        (1 - right.syndicateRatio) * right.weighting -
        (1 - left.syndicateRatio) * left.weighting,
    );
  const target = regionsToProtect[0];
  if (target === undefined) {
    return status(null, null, "No more ships currently needed");
  }
  return Object.freeze({
    kind: "select-blueprint",
    mode: cycle.mode,
    targetRegion: target.id,
    minimumCrew: cycle.configuredMinimumCrew,
    forcedBlueprint: null,
  });
}

export function planOuterFleetBlueprint(
  input: Readonly<OuterFleetBlueprintInput>,
): Readonly<OuterFleetCandidatePlan | OuterFleetStatusDecision> {
  let blueprint: OuterFleetBlueprint | null = input.target.forcedBlueprint;
  if (blueprint === null && input.target.mode === "user") {
    blueprint = input.yardAvailable ? "yard" : null;
  } else if (blueprint === null) {
    if (input.scoutAvailable && input.scoutCount < input.maximumScouts) {
      blueprint = "scout";
    }
    if (blueprint === null && input.fighterAvailable) {
      blueprint = "fighter";
    }
  }
  if (blueprint === null) {
    return status(
      null,
      null,
      `No suitable blueprint for ship to ${input.targetLocationName}`,
    );
  }
  return Object.freeze({
    kind: "check-candidate",
    blueprint,
    targetRegion: input.target.targetRegion,
    targetLocationName: input.targetLocationName,
    minimumCrew: input.target.minimumCrew,
  });
}

export function planOuterFleetCandidate(
  input: Readonly<OuterFleetCandidateInput>,
): Readonly<OuterFleetReadinessPlan | OuterFleetStatusDecision> {
  const nextShipName = `${input.shipName} to ${input.candidate.targetLocationName}`;
  if (input.authority.status === "unavailable") {
    return status(
      input.candidate.blueprint,
      null,
      "Authority data unavailable; ship construction paused",
      nextShipName,
    );
  }
  if (input.authority.status === "ready" && input.authority.blocksRemoval) {
    return status(
      input.candidate.blueprint,
      null,
      `Next ship(${nextShipName}) would lower Authority to ${input.authority.predicted}, below the ${input.authority.target} target`,
      nextShipName,
    );
  }
  return Object.freeze({
    kind: "check-build-readiness",
    blueprint: input.candidate.blueprint,
    targetRegion: input.candidate.targetRegion,
    targetLocationName: input.candidate.targetLocationName,
    minimumCrew: input.candidate.minimumCrew,
    shipName: input.shipName,
    shipCrew: input.shipCrew,
    nextShipName,
  });
}

export function planOuterFleetBuild(
  input: Readonly<OuterFleetBuildReadinessInput>,
): Readonly<OuterFleetDecision> {
  if (input.missingResourceName !== null) {
    return status(
      input.plan.blueprint,
      null,
      `Next ship(${input.plan.nextShipName}) is missing ${input.missingResourceName}`,
      input.plan.nextShipName,
    );
  }
  if (
    input.currentCityGarrison - input.plan.shipCrew <
    input.plan.minimumCrew
  ) {
    return status(
      input.plan.blueprint,
      null,
      `Next ship(${input.plan.nextShipName}) is missing crew`,
      input.plan.nextShipName,
    );
  }
  return Object.freeze({
    kind: "build-outer-fleet",
    blueprint: input.plan.blueprint,
    targetRegion: input.plan.targetRegion,
    targetLocationName: input.plan.targetLocationName,
    shipName: input.plan.shipName,
    shipCrew: input.plan.shipCrew,
    nextShipName: input.plan.nextShipName,
  });
}
