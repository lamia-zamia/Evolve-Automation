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
 * affordability against bay headroom and current funds. Anything the capture
 * cannot answer — warlord frames, unknown floor facts, an infernal blueprint
 * the setters cannot clear — reads as no plan, never a guessed design.
 * Scrap freeing, smaller-frame fallback, and bay-expansion awareness arrive
 * with the bay/scrap slices; a full bay simply stands down here.
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
  const design: ScoredMechDesign | null = chooseAutoDesign(
    preferred.size,
    floor,
    pickIndex,
  );
  const cost =
    design === null ? undefined : mechFrameCost(design.size, state.prepared);
  if (design === null || cost === undefined) return null;
  if (
    bay.maximum - bay.occupied < cost.space ||
    funds.purifierSupply < cost.supply ||
    funds.soulGems < cost.gems
  ) {
    return null;
  }
  if (!preferred.force && settings.saveSupplyRatio > 0) {
    const teamPower = activeMechsPower(state, floor);
    const refund = mechFrameRefund("titan", state.prepared);
    if (
      teamPower !== null &&
      refund !== undefined &&
      shouldSaveMechSupply({
        saveSupplyRatio: settings.saveSupplyRatio,
        lastFloor: false,
        forceBuild: false,
        supplyMaximum: funds.purifierMax,
        supplyCurrent: funds.purifierSupply,
        supplyRate: funds.supplyRate,
        baySpace: bay.maximum - bay.occupied,
        designSpace: cost.space,
        titanSupplyRefund:
          bay.maximum - bay.occupied < cost.space ? refund.supply : 0,
        timeToClear:
          teamPower > 0
            ? (100 - state.spire!.progress) / teamPower
            : Number.POSITIVE_INFINITY,
      })
    ) {
      return null;
    }
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
}
