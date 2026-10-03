export type OuterFleetBlueprint = "yard" | "explorer" | "scout" | "fighter";

export interface OuterFleetCycleInput {
  readonly initialized: boolean;
  /**
   * A window the player owns is on screen. Building and sending a ship are one pass, so a pass that
   * could not finish its own send must not start: the game reaches outside the window it was given
   * to do both, and a ship built here cannot be dispatched later.
   */
  readonly playerModalOpen?: boolean;
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
  /** Both native navigation and Syndicate participation; null means unavailable. */
  readonly unlocked: boolean | null;
  readonly weighting: number;
  /**
   * The running game's own Syndicate defense ratio for this region, or `null` when its mechanics
   * could not be reached. There is no defensible substitute: the automation has no arithmetic left
   * for this question, and an unanswered ratio would read as a defended region.
   */
  readonly syndicateRatio: number | null;
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
  /** Matching ships assigned to Tau, including inbound ships; null means an unreadable assignment. */
  readonly explorerCount: number | null;
  readonly erisTechnology: number;
  readonly erisWeighting: number;
  readonly erisRegionEnabled: boolean;
  /**
   * The game's own effective Syndicate sensor reading at Eris, or `null` when it could not be
   * reached. Only consulted when the Eris gate is otherwise live.
   */
  readonly erisSensor: number | null;
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
  /** Matching ships assigned to the target; null means an unreadable assignment. */
  readonly scoutCount: number | null;
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
  /**
   * How many crew this design takes out of the garrison, or `null` when the game's own crew
   * requirement for the hull could not be answered. The build readiness check below compares that
   * number against the garrison, so an unanswered one is not a ship with unknown cost — it is a
   * design that cannot be checked, and stands down.
   */
  readonly shipCrew: number | null;
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
  /**
   * Whether the shipyard was able to price the candidate at all. False means the yard's own cost row
   * could not be read or could not be reached, and construction then stands down: an unanswered price
   * is not an affordable one.
   */
  readonly costKnown: boolean;
  /** The first resource the game's own cost row marks as not currently payable, when it marks one. */
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

/**
 * The stand-down when the running game's own Syndicate mechanics cannot be reached. One message for
 * both places that need it, because the two have the same cause and the same consequence: a pass
 * that cannot see how defended a region is cannot decide whether to send a ship there.
 */
const SYNDICATE_UNAVAILABLE =
  "Syndicate defense data unavailable; ship construction paused";
const OUTER_FLEET_ASSIGNMENT_UNAVAILABLE =
  "Ship assignment data unavailable; ship construction paused";

export function planOuterFleetCycle(
  input: Readonly<OuterFleetCycleInput>,
): Readonly<OuterFleetAutomaticPlan | OuterFleetStatusDecision> {
  if (!input.initialized) {
    return status(null, "No ships needed yet", null);
  }
  if (input.playerModalOpen === true) {
    return status(null, null, "Outer fleet action deferred");
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
    input.explorerAvailable
  ) {
    if (input.explorerCount === null) {
      return status(null, null, OUTER_FLEET_ASSIGNMENT_UNAVAILABLE);
    }
    if (input.explorerCount < 1)
      return Object.freeze({
        kind: "select-blueprint",
        mode: cycle.mode,
        targetRegion: "tauceti",
        minimumCrew: 0,
        forcedBlueprint: "explorer",
      });
  }

  if (
    input.regions.some(
      (region) => region.weighting > 0 && region.unlocked === null,
    )
  ) {
    return status(null, null, "Space region mechanics unavailable");
  }

  if (
    input.erisTechnology === 1 &&
    input.erisWeighting > 0 &&
    input.erisRegionEnabled
  ) {
    // The gate cannot be decided without the game's own sensor reading, and deciding it wrongly
    // either way is the failure this feature exists to avoid: sending a ship elsewhere while Eris is
    // undefended, or holding one back from a region that needs it. So an unread reading stands the
    // pass down rather than picking a side.
    if (input.erisSensor === null) {
      return status(null, null, SYNDICATE_UNAVAILABLE);
    }
    if (input.erisSensor < 50) {
      return Object.freeze({
        kind: "select-blueprint",
        mode: cycle.mode,
        targetRegion: "spc_eris",
        minimumCrew: 0,
        forcedBlueprint: null,
      });
    }
  }

  // Every weighted, unlocked region is a target this pass would ship to, so an unread ratio on any of
  // them is a question that has to be answered before the best one can be named. Refused before the
  // filter, because a filter that dropped it would quietly ship to whichever region happened to
  // answer, and a ratio that reads as fully defended ships nowhere at all.
  if (
    input.regions.some(
      (region) =>
        region.unlocked &&
        region.weighting > 0 &&
        region.syndicateRatio === null,
    )
  ) {
    return status(null, null, SYNDICATE_UNAVAILABLE);
  }

  const regionsToProtect = input.regions
    .filter(
      (region) =>
        region.unlocked &&
        region.weighting > 0 &&
        region.syndicateRatio !== null &&
        region.syndicateRatio < calculateOuterFleetDefenseTarget(region),
    )
    .sort(
      (left, right) =>
        (1 - (right.syndicateRatio ?? 1)) * right.weighting -
        (1 - (left.syndicateRatio ?? 1)) * left.weighting,
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
    if (input.scoutAvailable && input.maximumScouts > 0) {
      if (input.scoutCount === null) {
        return status(null, null, OUTER_FLEET_ASSIGNMENT_UNAVAILABLE);
      }
      if (input.scoutCount < input.maximumScouts) blueprint = "scout";
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
  if (input.shipCrew === null) {
    return status(
      input.candidate.blueprint,
      null,
      "Ship crew requirement unavailable; ship construction paused",
      nextShipName,
    );
  }
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
  if (input.costKnown === false) {
    return status(
      input.plan.blueprint,
      null,
      `Next ship(${input.plan.nextShipName}) cost unavailable; ship construction paused`,
      input.plan.nextShipName,
    );
  }
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
