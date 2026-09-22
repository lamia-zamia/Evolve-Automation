/** Pure policy for the captured current-design mech-build slice. */

import { canSpendWithDistantReservation } from "../economy/resources/reservation.ts";
import {
  resolveMechScrapMode,
  shouldReadMechScrapCandidates,
  shouldSaveMechSupply,
  type MechDesign,
  type MechPlanningInput,
  type MechResourceInput,
  type MechScrapCandidate,
} from "./mech.ts";
import {
  chooseAutoDesign,
  rateMechDesign,
  type ScoredMechDesign,
} from "./mech-design.ts";
import {
  CLASSIC_MECH_SIZES,
  mechFrameCost,
  mechFrameRefund,
  mechFrameSpace,
} from "./mech-costs.ts";
import type { CapturedMechDesign, CapturedMechState } from "./mech-state.ts";
import { combatRanking, designAutoChoice } from "./mech-auto-choice.ts";

export interface CapturedMechBuildInput {
  readonly available: boolean;
  readonly enabled: boolean;
  readonly buildMode: string;
  /** The page's mapped queue key is currently held, changing `build()` into queue admission. */
  readonly queueKeyHeld: boolean;
  /** The governor runs its Mech Builder task and assembles titans itself. */
  readonly governorTask: boolean;
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
    input.governorTask ||
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

/**
 * Supply held back for the next floor: only while the build is unforced, the
 * ratio is positive, held-back building is enabled, and every purifier is
 * switched on. Shared by the build and the scrap planners.
 */
function savingSupplyHold(
  state: CapturedMechState,
  force: boolean,
  teamPower: number | null,
  space: number,
): boolean {
  const { settings, bay, funds } = state;
  if (force || settings.saveSupplyRatio <= 0) return false;
  // Mirrors the compatibility gate: supply is only held back while every
  // purifier is switched on and held-back building is enabled.
  if (!settings.baysFirst || !funds.purifierFullyOn) return false;
  if (teamPower === null) return false;
  const refund = mechFrameRefund("titan", state.prepared);
  if (refund === undefined) return false;
  const headroom = bay.maximum - bay.occupied;
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
}

/**
 * One automatic build: preferred size, deterministic semantic design, fresh
 * affordability against bay headroom and current funds, with a smaller-frame
 * fallback when `fillBay` is set and supply held back for the next floor.
 * Anything the capture cannot answer — warlord frames, unknown floor facts,
 * an infernal blueprint the setters cannot clear — reads as no plan, never a
 * guessed design. A full bay stands down for the scrap planner.
 */
export function planCapturedMechAuto(
  state: CapturedMechState,
  pickIndex: (count: number) => number,
): CapturedMechAutoPlan | null {
  const choice = designAutoChoice(state, pickIndex);
  if (choice === null) return null;
  const { settings, bay, funds } = state;
  const { floor, figures, preferred, teamPower } = choice;
  const combat = (
    key: "efficiency" | "gemsEff" | "supplyEff",
  ): readonly string[] => combatRanking(figures, key);
  // The bay maximum is the desired count: every tick plans at most one
  // verified build against current headroom, so filling stops at the maximum
  // and a full bay stands down for the scrap planner. Bay expansion has no
  // captured expandability read on this path, so the planner never waits for
  // it: with `fillBay` it steps down to smaller frames instead.
  const headroom = bay.maximum - bay.occupied;
  const savingForNextFloor = (space: number): boolean =>
    savingSupplyHold(state, preferred.force, teamPower, space);
  const buildPlanFor = (size: string): CapturedMechAutoPlan | null => {
    const preset = size === preferred.size ? choice : null;
    const design: ScoredMechDesign | null =
      preset?.design ?? chooseAutoDesign(size, floor, pickIndex);
    const cost =
      preset?.cost ??
      (design === null
        ? undefined
        : mechFrameCost(design.size, state.prepared));
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

export interface CapturedMechScrapPlan {
  readonly kind: "scrap-captured-mech";
  /** Bay position at plan time; the executor revalidates identity by content. */
  readonly index: number;
  readonly design: CapturedMechDesign;
  readonly space: number;
  readonly supplyRefund: number;
  readonly gemsRefund: number;
  readonly expectedLength: number;
  readonly expectedOccupied: number;
}

function mechSupplyInput(state: CapturedMechState): MechResourceInput {
  const { funds } = state;
  return {
    current: funds.purifierSupply,
    maximum: funds.purifierMax,
    spare: funds.purifierSupply,
    spareMaximum: funds.purifierMax,
    rate: funds.supplyRate,
    storageRatio:
      funds.purifierMax > 0 ? funds.purifierSupply / funds.purifierMax : 1,
  };
}

function mechGemsInput(state: CapturedMechState): MechResourceInput {
  const gems = state.funds.soulGems;
  return {
    current: gems,
    maximum: gems,
    spare: gems,
    spareMaximum: gems,
    rate: state.funds.gemsRate,
    storageRatio: 1,
  };
}

/**
 * One scrapped mech: the worst-efficiency bay entry the replacement economics
 * justify, verified alone. The mode resolution, read gates, and efficiency
 * threshold reuse the historical pure policy (`resolveMechScrapMode`,
 * `shouldReadMechScrapCandidates`); the batch loop does not carry over —
 * replacement is always a fresh plan on the next tick, after the disappearance
 * postcondition. An unratable team resolves `mixed` to `single`, mirroring the
 * powerless history rather than guessing.
 */
export function planCapturedMechScrap(
  state: CapturedMechState,
  pickIndex: (count: number) => number,
): CapturedMechScrapPlan | null {
  if (
    !state.available ||
    state.queueKeyHeld ||
    state.warlord ||
    state.settings.buildMode !== "random" ||
    state.settings.scrapMode === "none" ||
    state.spire === null
  ) {
    return null;
  }
  const choice = designAutoChoice(state, pickIndex);
  if (choice === null) return null;
  const { settings, bay, funds } = state;
  const { floor, figures, preferred, design, cost, teamPower } = choice;
  const headroom = bay.maximum - bay.occupied;
  const supply = mechSupplyInput(state);
  const gems = mechGemsInput(state);
  const designPolicy: MechDesign = {
    token: "scrap-replacement",
    size: design.size,
    power: design.power,
    efficiency: design.efficiency,
  };
  const costPolicy = {
    gems: cost.gems,
    supply: cost.supply,
    space: cost.space,
  };
  const actives = state.inventory.slice(0, bay.active);
  const rated: MechScrapCandidate[] = [];
  for (const mech of actives) {
    const best = figures[mech.size]?.power;
    const refund =
      best === undefined
        ? undefined
        : mechFrameRefund(mech.size, state.prepared);
    const space =
      best === undefined
        ? undefined
        : mechFrameSpace(mech.size, state.prepared);
    const power =
      best === undefined || refund === undefined || space === undefined
        ? undefined
        : rateMechDesign(mech, floor)?.power;
    if (
      best === undefined ||
      refund === undefined ||
      space === undefined ||
      space <= 0 ||
      power === undefined
    ) {
      return null;
    }
    rated.push({
      id: mech.index,
      size: mech.size,
      infernal: mech.infernal,
      power,
      efficiency: power / space,
      bestPower: best,
      gemRefund: refund.gems,
      supplyRefund: refund.supply,
      space,
    });
  }
  const saving = savingSupplyHold(
    state,
    preferred.force,
    teamPower,
    cost.space,
  );
  const planning: MechPlanningInput = {
    design: designPolicy,
    cost: costPolicy,
    forceBuild: preferred.force,
    prolongActive: false,
    savingSupply: saving,
    fillBay: settings.fillBay,
    baySpace: headroom,
    bayMaximum: bay.maximum,
    scouts: bay.scouts,
    sizeOrder: Object.freeze([...CLASSIC_MECH_SIZES]),
    supply,
    gems,
    lastFloor: false,
    canExpandBay: false,
    configuredScrapMode: settings.scrapMode,
    waygateActiveCount: state.waygateActive ? 1 : 0,
    minimumSupplyRate: settings.minimumSupplyRate,
    saveSupplyRatio: settings.saveSupplyRatio,
    scrapEfficiency: settings.scrapEfficiency,
    scoutsRatio: settings.scoutsRatio,
    rebuildScouts: settings.rebuildScouts,
    mechsPower: teamPower ?? 0,
    timeToClear:
      teamPower !== null && teamPower > 0
        ? (100 - state.spire.progress) / teamPower
        : Number.MAX_SAFE_INTEGER,
    activeMechs: Object.freeze(rated),
  };
  const mode =
    settings.scrapMode === "mixed" && !state.waygateActive && teamPower === null
      ? "single"
      : resolveMechScrapMode(planning);
  if (mode === "none" || !shouldReadMechScrapCandidates(planning)) {
    return null;
  }
  const threshold =
    (settings.fillBay ? headroom === 0 : headroom < cost.space) &&
    supply.storageRatio > 0.9 &&
    !saving
      ? 0
      : settings.scrapEfficiency;
  const candidates = rated
    .filter((mech) => {
      if (
        (mech.infernal && mech.size !== "collector") ||
        mech.power >= mech.bestPower
      ) {
        return false;
      }
      if (preferred.force) return true;
      // A gemless refund still counts half a gem, exactly as history did:
      // otherwise frames cheaper than one gem could never be replaced.
      const costRatio = Math.min(
        (mech.gemRefund || 0.5) / cost.gems,
        mech.supplyRefund / cost.supply,
      );
      return costRatio / (mech.power / design.power) > threshold;
    })
    .sort((left, right) => left.efficiency - right.efficiency);
  let extraScouts = settings.rebuildScouts
    ? Number.MAX_SAFE_INTEGER
    : bay.scouts - (bay.maximum * settings.scoutsRatio) / 2;
  for (const mech of candidates) {
    if (mech.size === "small") {
      if (extraScouts < 1) continue;
      extraScouts -= 1;
    }
    const supplyOk = canSpendWithDistantReservation(
      {
        current: funds.purifierSupply + mech.supplyRefund,
        spare: funds.purifierSupply + mech.supplyRefund,
        rate: funds.supplyRate,
      },
      cost.supply,
    );
    const gemsOk = canSpendWithDistantReservation(
      {
        current: funds.soulGems + mech.gemRefund,
        spare: funds.soulGems + mech.gemRefund,
        rate: funds.gemsRate,
      },
      cost.gems,
    );
    if (
      headroom + mech.space >= cost.space &&
      supplyOk &&
      gemsOk &&
      (preferred.force || mech.power / mech.space < design.efficiency)
    ) {
      const identity = state.inventory[mech.id];
      if (identity === undefined) return null;
      return Object.freeze({
        kind: "scrap-captured-mech" as const,
        index: mech.id,
        design: Object.freeze({
          size: identity.size,
          chassis: identity.chassis,
          hardpoint: identity.hardpoint,
          equip: identity.equip,
          infernal: identity.infernal,
        }),
        space: mech.space,
        supplyRefund: mech.supplyRefund,
        gemsRefund: mech.gemRefund,
        expectedLength: state.inventory.length,
        expectedOccupied: bay.occupied,
      });
    }
  }
  return null;
}
