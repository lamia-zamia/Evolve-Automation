/** Pure policy for the captured current-design mech-build slice. */

import {
  planMechContinuation,
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
import {
  capturedMechSupplyHold,
  combatRanking,
  designAutoChoice,
} from "./mech-auto-choice.ts";

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
  /** Raw holdings less resources committed to other automation targets. */
  readonly spendablePurifierSupply: number;
  readonly spendableSoulGems: number;
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
    !Number.isFinite(input.spendablePurifierSupply) ||
    input.spendablePurifierSupply < input.designSupply ||
    !Number.isFinite(input.soulGems) ||
    !Number.isFinite(input.spendableSoulGems) ||
    input.spendableSoulGems < input.designSoul
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
    capturedMechSupplyHold(state, preferred.force, teamPower, space);
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
      state.spendable.purifierSupply < cost.supply ||
      state.spendable.soulGems < cost.gems ||
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
    spare: state.spendable.purifierSupply,
    spareMaximum: state.spendable.purifierMaximum,
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
    spare: state.spendable.soulGems,
    spareMaximum: state.spendable.soulGems,
    rate: state.funds.gemsRate,
    storageRatio: 1,
  };
}

/**
 * One scrapped mech from the viable cumulative replacement set. The shared
 * policy plans the full set; this pass executes its first index and replans
 * only after the game confirms the removal.
 */
export function planCapturedMechScrap(
  state: CapturedMechState,
  pickIndex: (count: number) => number,
  canExpandBay: boolean | undefined,
): CapturedMechScrapPlan | null {
  if (
    !state.available ||
    state.queueKeyHeld ||
    state.warlord ||
    state.settings.buildMode !== "random" ||
    state.settings.scrapMode === "none" ||
    state.spire === null ||
    canExpandBay === undefined
  ) {
    return null;
  }
  const choice = designAutoChoice(state, pickIndex);
  if (choice === null) return null;
  const { settings, bay } = state;
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
  const saving = capturedMechSupplyHold(
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
    lastFloor: state.lastFloor,
    canExpandBay,
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
  const continuation = planMechContinuation(planning);
  const index = continuation.scrap?.ids[0];
  if (index === undefined) return null;
  const candidate = rated.find((mech) => mech.id === index);
  const identity = state.inventory[index];
  if (candidate === undefined || identity === undefined) return null;
  return Object.freeze({
    kind: "scrap-captured-mech" as const,
    index,
    design: Object.freeze({
      size: identity.size,
      chassis: identity.chassis,
      hardpoint: identity.hardpoint,
      equip: identity.equip,
      infernal: identity.infernal,
    }),
    space: candidate.space,
    supplyRefund: candidate.supplyRefund,
    gemsRefund: candidate.gemRefund,
    expectedLength: state.inventory.length,
    expectedOccupied: bay.occupied,
  });
}
