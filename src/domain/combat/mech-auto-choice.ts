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
import { mechFrameCost, type MechCostFigures } from "./mech-costs.ts";
import { readCapturedMechState, type CapturedMechState } from "./mech-state.ts";

export interface AutoDesignChoice {
  readonly floor: MechFloor;
  readonly figures: NonNullable<ReturnType<typeof bestDesignFigures>>;
  readonly preferred: Readonly<{ size: string; force: boolean }>;
  readonly design: ScoredMechDesign;
  readonly cost: MechCostFigures;
  readonly teamPower: number | null;
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
  // nothing sits inactive, and stands the whole automation down while it does.
  const inactives = Math.max(0, state.inventory.length - state.bay.active);
  if (state.governorMechTask && inactives === 0) return null;
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
 * Shared Mech demand: the pursued automatic build's Supply and Soul Gem cost.
 * Both the demand requests and the cost reservations derive from this one
 * answer, so market, storage, crafting, and the build loop respect the same
 * target. Null when no automatic build is being pursued. The queue key reads
 * as unheld: a queued build carries its own queue reservation, and holding
 * the key is a transient tick-local fact the demand sample cannot observe.
 */
export function planMechDemandCosts(
  input: Readonly<{ root: unknown; settings: unknown }>,
): Readonly<{ supply: number; gems: number }> | null {
  const state = readCapturedMechState({
    root: input.root,
    settings: input.settings,
    queueKeyHeld: false,
  });
  if (!state.available) return null;
  if (state.governorMechTask) {
    // A governor titan costs the same at any prepared level, standard frame.
    return Object.freeze({ supply: 750_000, gems: 75 });
  }
  if (state.settings.buildMode !== "random") return null;
  const choice = designAutoChoice(state, () => 0);
  if (choice === null) return null;
  return Object.freeze({ supply: choice.cost.supply, gems: choice.cost.gems });
}
