/**
 * Shared automatic-design choice for the captured Mech runtime.
 *
 * The build planner, the scrap planner, the demand requests, and the cost
 * reservations all start from this one answer, so a replacement is always
 * planned, priced, and reserved against the same design. The module depends
 * only on leaf Mech modules (state, design scoring, costs) precisely so
 * early-visited consumers like demand and construction can read it without
 * pulling the larger captured-Mech policy (and its compatibility imports)
 * earlier in the bundle.
 */

import {
  bestDesignFigures,
  chooseAutoDesign,
  choosePreferredSize,
  rateMechDesign,
  type MechFloor,
  type ScoredMechDesign,
} from "./mech-design.ts";
import {
  mechFrameCost,
  mechFrameRefund,
  mechFrameSpace,
  type MechCostFigures,
} from "./mech-costs.ts";
import { shouldSaveMechSupply } from "./mech-supply-saving.ts";
import type { CapturedMechState } from "./mech-state.ts";

export interface AutoDesignChoice {
  readonly floor: MechFloor;
  readonly figures: NonNullable<ReturnType<typeof bestDesignFigures>>;
  readonly preferred: Readonly<{ size: string; force: boolean }>;
  readonly design: ScoredMechDesign;
  readonly cost: MechCostFigures;
  readonly teamPower: number | null;
}

export type MechDemandCostPlan =
  | Readonly<{ status: "none" }>
  | Readonly<{ status: "unavailable" }>
  | Readonly<{
      status: "ready";
      cost: Readonly<Pick<MechCostFigures, "supply" | "gems" | "space">>;
    }>;

const NO_MECH_DEMAND: MechDemandCostPlan = Object.freeze({ status: "none" });
const UNKNOWN_MECH_DEMAND: MechDemandCostPlan = Object.freeze({
  status: "unavailable",
});

function readyMechDemandCost(
  cost: Readonly<Pick<MechCostFigures, "supply" | "gems" | "space">>,
): MechDemandCostPlan {
  return Object.freeze({
    status: "ready",
    cost: Object.freeze({
      supply: cost.supply,
      gems: cost.gems,
      space: cost.space,
    }),
  });
}

export function combatRanking(
  figures: AutoDesignChoice["figures"],
  key: "efficiency" | "gemsEff" | "supplyEff",
): readonly string[] {
  return Object.freeze(
    Object.keys(figures)
      .filter((size) => size !== "collector")
      .sort((left, right) => figures[right]![key] - figures[left]![key]),
  );
}

function autoFloor(state: CapturedMechState): MechFloor | null {
  if (state.spire === null) return null;
  return {
    terrain: state.spire.type,
    statuses: state.spire.statuses,
    boss: state.spire.boss,
    spireCount: state.spire.count,
    scouts: state.bay.scouts,
    prepared: state.prepared,
    wrath: state.wrath,
    gladiatorLevel: state.gladiatorLevel,
    collectorValue: state.settings.collectorValue,
  };
}

/** Combat power over the first `active` bay entries; null if any is unratable. */
function activeMechsPower(
  state: CapturedMechState,
  floor: MechFloor,
): number | null {
  let power = 0;
  const active = state.inventory.slice(0, state.bay.active);
  for (const mech of active) {
    if (mech.size === "collector") continue;
    const rated = rateMechDesign(mech, floor);
    if (rated === null) return null;
    power += rated.power;
  }
  return power;
}

/** Shared supply hold used by both the build/scrap planners and resource demand. */
export function capturedMechSupplyHold(
  state: CapturedMechState,
  force: boolean,
  teamPower: number | null,
  space: number,
): boolean {
  const { settings, bay, funds, spire } = state;
  if (force || settings.saveSupplyRatio <= 0) return false;
  if (!settings.baysFirst || !funds.purifierFullyOn) return false;
  if (teamPower === null || spire === null) return false;
  const refund = mechFrameRefund("titan", state.prepared);
  if (refund === undefined) return false;
  const headroom = bay.maximum - bay.occupied;
  return shouldSaveMechSupply({
    saveSupplyRatio: settings.saveSupplyRatio,
    lastFloor: state.lastFloor,
    forceBuild: false,
    supplyMaximum: funds.purifierMax,
    supplyCurrent: funds.purifierSupply,
    supplyRate: funds.supplyRate,
    baySpace: headroom,
    designSpace: space,
    titanSupplyRefund: headroom < space ? refund.supply : 0,
    timeToClear:
      teamPower > 0
        ? (100 - spire.progress) / teamPower
        : Number.POSITIVE_INFINITY,
  });
}

/**
 * Mirrors legacy `MechManager.initLab`'s `mechsPotential` normalization: team power divided by a
 * full bay at the best current design's power per space.
 */
export function readCapturedMechPotential(
  state: CapturedMechState,
): number | null {
  if (!state.available || state.spire === null) return null;
  // Warlord frames and a zero-capacity bay keep the historical Mech manager inactive.
  if (state.warlord || state.bay.maximum === 0) return 0;
  const floor = autoFloor(state);
  if (floor === null) return null;
  // The collector setting affects only collector rating; use a positive value so this sample can
  // still produce the combat designs the potential denominator needs.
  const figures = bestDesignFigures({ ...floor, collectorValue: 1 }, () => 0);
  if (figures === null) return null;
  const bestSize = combatRanking(figures, "efficiency")[0];
  const bestEfficiency =
    bestSize === undefined ? undefined : figures[bestSize]?.efficiency;
  const teamPower = activeMechsPower(state, floor);
  if (
    bestEfficiency === undefined ||
    !Number.isFinite(bestEfficiency) ||
    bestEfficiency <= 0 ||
    teamPower === null
  ) {
    return null;
  }
  const potential = teamPower / (state.bay.maximum * bestEfficiency);
  return Number.isFinite(potential) && potential >= 0 ? potential : null;
}

export function designAutoChoice(
  state: CapturedMechState,
  pickIndex: (count: number) => number,
): AutoDesignChoice | null {
  if (
    !state.available ||
    state.queueKeyHeld ||
    state.warlord ||
    state.settings.buildMode !== "random" ||
    state.blueprint === null ||
    state.blueprint.infernal
  ) {
    return null;
  }
  // The governor assembles titans itself; history samples the task only while
  // nothing sits inactive. Captured automation stands down while any Mech is
  // inactive so neither planning path acts on a partial active team.
  const inactives = Math.max(0, state.inventory.length - state.bay.active);
  if (inactives > 0 || state.governorMechTask) return null;
  const floor = autoFloor(state);
  if (floor === null || floor.collectorValue <= 0) return null;
  const figures = bestDesignFigures(floor, pickIndex);
  if (figures === null) return null;
  const { settings, bay, funds } = state;
  const activeCollectors = state.inventory
    .slice(0, bay.active)
    .filter((mech) => mech.size === "collector").length;
  const preferred = choosePreferredSize({
    bayMaximum: bay.maximum,
    bayOccupied: bay.occupied,
    bayScouts: bay.scouts,
    activeCollectors,
    supplyRate: funds.supplyRate,
    supplyMaximum: funds.purifierMax,
    supplyRatio:
      funds.purifierMax > 0 ? funds.purifierSupply / funds.purifierMax : 1,
    gemsSpare: funds.soulGems,
    prepared: state.prepared,
    gravityFloor: state.spire!.statuses.includes("gravity"),
    preferredSize: settings.preferredSize,
    gravitySize: settings.gravitySize,
    fillBay: settings.fillBay,
    minimumSupplyRate: settings.minimumSupplyRate,
    maximumCollectorShare: settings.maximumCollectorShare,
    scoutsRatio: settings.scoutsRatio,
    rankByEff: combatRanking(figures, "efficiency"),
    rankByGems: combatRanking(figures, "gemsEff"),
    rankBySupply: combatRanking(figures, "supplyEff"),
  });
  const design = chooseAutoDesign(preferred.size, floor, pickIndex);
  const cost =
    design === null ? undefined : mechFrameCost(design.size, state.prepared);
  if (design === null || cost === undefined) return null;
  const teamPower = activeMechsPower(state, floor);
  if (teamPower === null) return null;
  return Object.freeze({
    floor,
    figures,
    preferred,
    design,
    cost,
    teamPower,
  });
}

/**
 * Shared Mech demand: the next build's Supply and Soul Gem cost. Resource
 * demand and construction reservations derive from this one target. Missing
 * costs stay distinguishable from a deliberate stand-down; affordability is
 * intentionally left to the resource accumulators and build executor.
 */
export function planMechDemandCosts(
  input: Readonly<{
    state: CapturedMechState;
    /** Game-owned `bay`, `price`, and `soul` results for the current user blueprint. */
    userBuildCost?: Readonly<MechCostFigures>;
  }>,
): MechDemandCostPlan {
  const { state } = input;
  if (!state.settings.autoMech || state.settings.buildMode === "none") {
    return NO_MECH_DEMAND;
  }
  if (!state.available) return UNKNOWN_MECH_DEMAND;
  if (state.warlord) return NO_MECH_DEMAND;
  if (state.governorMechTask) {
    // A governor titan costs the same at any prepared level, standard frame.
    return readyMechDemandCost({
      supply: 750_000,
      gems: 75,
      space: mechFrameSpace("titan", state.prepared) ?? Number.MAX_SAFE_INTEGER,
    });
  }

  if (state.settings.buildMode === "user") {
    if (state.blueprint === null) return UNKNOWN_MECH_DEMAND;
    if (state.blueprint.infernal) return NO_MECH_DEMAND;
    const cost = input.userBuildCost;
    if (cost === undefined) return UNKNOWN_MECH_DEMAND;
    if (state.bay.maximum - state.bay.occupied < cost.space) {
      return NO_MECH_DEMAND;
    }
    return readyMechDemandCost(cost);
  }

  // These are deliberate stand-down gates in `designAutoChoice`, not missing captures.
  if (
    state.blueprint === null ||
    state.blueprint.infernal ||
    state.spire === null ||
    state.settings.collectorValue <= 0 ||
    state.inventory.length > state.bay.active
  ) {
    return NO_MECH_DEMAND;
  }
  const choice = designAutoChoice(state, () => 0);
  if (choice === null) return UNKNOWN_MECH_DEMAND;
  if (
    capturedMechSupplyHold(
      state,
      choice.preferred.force,
      choice.teamPower,
      choice.cost.space,
    )
  ) {
    return NO_MECH_DEMAND;
  }
  const headroom = state.bay.maximum - state.bay.occupied;
  if (
    headroom < choice.cost.space &&
    (state.settings.scrapMode === "none" ||
      state.inventory.length === 0 ||
      state.bay.active === 0)
  ) {
    return NO_MECH_DEMAND;
  }
  // Funds are intentionally not a gate: demand must be able to accumulate an affordable build.
  return readyMechDemandCost(choice.cost);
}
