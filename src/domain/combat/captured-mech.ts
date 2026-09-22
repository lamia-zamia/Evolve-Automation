/** Pure policy for the captured current-design mech-build slice. */

import { shouldSaveMechSupply } from "./mech.ts";
import {
  bestDesignFigures,
  chooseAutoDesign,
  choosePreferredSize,
  rateMechDesign,
  type MechFloor,
  type ScoredMechDesign,
} from "./mech-design.ts";
import { mechFrameCost, mechFrameRefund } from "./mech-costs.ts";
import type { CapturedMechDesign, CapturedMechState } from "./mech-state.ts";

export interface CapturedMechBuildInput {
  readonly available: boolean;
  readonly enabled: boolean;
  readonly buildMode: string;
  /** The page's mapped queue key is currently held, changing `build()` into queue admission. */
  readonly queueKeyHeld: boolean;
  readonly infernal: boolean;
  readonly designSize: string;
  /** Values returned by the game's captured `bay`, `price`, and `soul` methods. */
  readonly designSpace: number;
  readonly designSupply: number;
  readonly designSoul: number;
  readonly baySpace: number;
  readonly purifierSupply: number;
  readonly soulGems: number;
}

export interface CapturedMechBuildDecision {
  readonly kind: "build-captured-mech";
  readonly designSize: string;
  readonly expectedBaySpace: number;
  readonly expectedPurifierSupply: number;
  readonly expectedSoulGems: number;
}

export function planCapturedMechBuild(
  input: Readonly<CapturedMechBuildInput>,
): Readonly<CapturedMechBuildDecision> | null {
  if (
    !input.available ||
    !input.enabled ||
    input.buildMode !== "user" ||
    input.queueKeyHeld ||
    input.infernal ||
    input.designSize.length === 0 ||
    !Number.isFinite(input.designSpace) ||
    input.designSpace <= 0 ||
    !Number.isFinite(input.designSupply) ||
    input.designSupply < 0 ||
    !Number.isFinite(input.designSoul) ||
    input.designSoul < 0 ||
    !Number.isFinite(input.baySpace) ||
    input.baySpace < input.designSpace ||
    !Number.isFinite(input.purifierSupply) ||
    input.purifierSupply < input.designSupply ||
    !Number.isFinite(input.soulGems) ||
    input.soulGems < input.designSoul
  ) {
    return null;
  }
  return Object.freeze({
    kind: "build-captured-mech" as const,
    designSize: input.designSize,
    expectedBaySpace: input.baySpace,
    expectedPurifierSupply: input.purifierSupply,
    expectedSoulGems: input.soulGems,
  });
}

export interface CapturedMechAutoPlan {
  readonly kind: "build-captured-mech-auto";
  readonly design: CapturedMechDesign;
  readonly supply: number;
  readonly gems: number;
  readonly space: number;
  readonly force: boolean;
  readonly expectedMechsLength: number;
  readonly expectedOccupied: number;
  readonly expectedPurifierSupply: number;
  readonly expectedSoulGems: number;
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

/**
 * One automatic build: preferred size, deterministic semantic design, fresh
 * affordability against bay headroom and current funds, with a smaller-frame
 * fallback when `fillBay` is set and supply held back for the next floor.
 * Anything the capture cannot answer — warlord frames, unknown floor facts,
 * an infernal blueprint the setters cannot clear — reads as no plan, never a
 * guessed design. Scrap freeing arrives with the scrap slice; until then a
 * full bay stands down.
 */
export function planCapturedMechAuto(
  state: CapturedMechState,
  pickIndex: (count: number) => number,
): CapturedMechAutoPlan | null {
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
  const floor = autoFloor(state);
  if (floor === null || floor.collectorValue <= 0) return null;
  const figures = bestDesignFigures(floor, pickIndex);
  if (figures === null) return null;
  const combat = (key: "efficiency" | "gemsEff" | "supplyEff"): string[] =>
    Object.keys(figures)
      .filter((size) => size !== "collector")
      .sort((left, right) => figures[right]![key] - figures[left]![key]);
  const { settings, bay, funds } = state;
  const preferred = choosePreferredSize({
    bayMaximum: bay.maximum,
    bayOccupied: bay.occupied,
    bayScouts: bay.scouts,
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
    rankByEff: combat("efficiency"),
    rankByGems: combat("gemsEff"),
    rankBySupply: combat("supplyEff"),
  });
  // The bay maximum is the desired count: every tick plans at most one
  // verified build against current headroom, so filling stops at the maximum
  // and a full bay stands down for the scrap slice. Bay expansion has no
  // captured expandability read on this path, so the planner never waits for
  // it: with `fillBay` it steps down to smaller frames instead.
  const headroom = bay.maximum - bay.occupied;
  const savingForNextFloor = (space: number): boolean => {
    if (preferred.force || settings.saveSupplyRatio <= 0) return false;
    // Mirrors the compatibility gate: supply is only held back while every
    // purifier is switched on and held-back building is enabled.
    if (!settings.baysFirst || !funds.purifierFullyOn) return false;
    const teamPower = activeMechsPower(state, floor);
    const refund = mechFrameRefund("titan", state.prepared);
    if (teamPower === null || refund === undefined) return false;
    return shouldSaveMechSupply({
      saveSupplyRatio: settings.saveSupplyRatio,
      lastFloor: false,
      forceBuild: false,
      supplyMaximum: funds.purifierMax,
      supplyCurrent: funds.purifierSupply,
      supplyRate: funds.supplyRate,
      baySpace: headroom,
      designSpace: space,
      titanSupplyRefund: headroom < space ? refund.supply : 0,
      timeToClear:
        teamPower > 0
          ? (100 - state.spire!.progress) / teamPower
          : Number.POSITIVE_INFINITY,
    });
  };
  const buildPlanFor = (size: string): CapturedMechAutoPlan | null => {
    const design: ScoredMechDesign | null = chooseAutoDesign(
      size,
      floor,
      pickIndex,
    );
    const cost =
      design === null ? undefined : mechFrameCost(design.size, state.prepared);
    if (design === null || cost === undefined) return null;
    if (
      headroom < cost.space ||
      funds.purifierMax < cost.supply ||
      funds.purifierSupply < cost.supply ||
      funds.soulGems < cost.gems ||
      savingForNextFloor(cost.space)
    ) {
      return null;
    }
    return Object.freeze({
      kind: "build-captured-mech-auto" as const,
      design: Object.freeze({
        size: design.size,
        chassis: design.chassis,
        hardpoint: design.hardpoint,
        equip: design.equip,
        infernal: false,
      }),
      supply: cost.supply,
      gems: cost.gems,
      space: cost.space,
      force: preferred.force,
      expectedMechsLength: state.inventory.length,
      expectedOccupied: bay.occupied,
      expectedPurifierSupply: funds.purifierSupply,
      expectedSoulGems: funds.soulGems,
    });
  };
  const preferredPlan = buildPlanFor(preferred.size);
  if (preferredPlan !== null || !settings.fillBay) return preferredPlan;
  const preferredSpace = mechFrameCost(preferred.size, state.prepared)?.space;
  for (const size of [...combat("efficiency")]
    .map((candidate) => ({
      candidate,
      space: mechFrameCost(candidate, state.prepared)?.space ?? Infinity,
    }))
    .filter(
      (entry) =>
        preferredSpace !== undefined &&
        entry.space < preferredSpace &&
        entry.space <= headroom,
    )
    .sort((left, right) => right.space - left.space)
    .map((entry) => entry.candidate)) {
    const fallback = buildPlanFor(size);
    if (fallback !== null) return fallback;
  }
  return null;
}
