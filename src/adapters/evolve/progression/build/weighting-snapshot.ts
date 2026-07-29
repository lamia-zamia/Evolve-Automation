import type { ForeignAchievementGoal } from "../../../../domain/combat/foreign-achievements.ts";
import type {
  BuildingWeightingSnapshot,
  MechSupplySavingReason,
} from "../../../../ports/building-weighting.ts";
import {
  requireArray,
  requireBoolean,
  requireNumber,
  requireRecord,
} from "../../../validation.ts";

export interface WeightingSnapshotDependencies {
  readonly getState: () => unknown;
  readonly isGalaxyAssaultPending: () => unknown;
  readonly isStargatePiracySupressed: () => unknown;
  readonly isGalaxyPiracyCoveredByFleet: () => unknown;
  readonly isLumberRace: () => unknown;
  readonly isBananaRepublicObjectiveComplete: (objective: string) => unknown;
  readonly isInflationAssistActive: () => unknown;
  readonly isInflationMoneyReachable: () => unknown;
  readonly isRetirementAssistActive: () => unknown;
  readonly getRetirementPreparationMissing: () => unknown;
  readonly isAchievementGuardActive: (guard: string) => unknown;
  readonly getForeignAchievementGoal: () => unknown;
  readonly isHellSupressUseful: () => unknown;
  readonly isGateTowerSupressionTooLow: () => unknown;
  readonly isGateDemonsSupressed: () => unknown;
  readonly isGuardPostPrebuildIncomplete: () => unknown;
  readonly getSpirePrebuildShortfall: () => unknown;
  readonly getNextCitadelPowerDraw: () => unknown;
  readonly isGECKNeeded: () => unknown;
  readonly isPrestigeAllowed: (prestige: string) => unknown;
  readonly isPillarFinished: () => unknown;
  readonly isMadPrestigeAwaited: () => unknown;
  readonly getMechSupplySavingReason: () => unknown;
  readonly isWomlingStatEarned: (stat: string) => unknown;
}

const FOREIGN_ACHIEVEMENT_GOALS: ReadonlySet<string> = new Set([
  "world-domination",
  "syndicate",
]);

function requireForeignAchievementGoal(
  value: unknown,
  path: string,
): ForeignAchievementGoal | null {
  if (value === null) {
    return null;
  }
  if (typeof value === "string" && FOREIGN_ACHIEVEMENT_GOALS.has(value)) {
    return value as ForeignAchievementGoal;
  }
  throw new TypeError(
    `${path} must be null, "world-domination", or "syndicate"`,
  );
}

const MECH_SUPPLY_SAVING_REASONS: ReadonlySet<string> = new Set([
  "building",
  "saving",
]);

function requireMechSupplySavingReason(
  value: unknown,
  path: string,
): MechSupplySavingReason | null {
  if (value === null) {
    return null;
  }
  if (typeof value === "string" && MECH_SUPPLY_SAVING_REASONS.has(value)) {
    return value as MechSupplySavingReason;
  }
  throw new TypeError(`${path} must be null, "building", or "saving"`);
}

/**
 * Samples the script state and phase-constant gates that the building-weighting
 * rules read.
 *
 * Called once per weighting phase so every rule observes the same values. The
 * target lists are converted to identity sets here: the rules only ask whether
 * a candidate is a queued or trigger target, and rescanning both arrays for
 * every candidate is the shape this replaced.
 *
 * The gates are sampled eagerly rather than behind the rule that reads them.
 * Each one is a small pure read of already-loaded game and settings state, and
 * several were previously re-evaluated for every build candidate.
 */
export function createWeightingSnapshotReader({
  getState,
  isGalaxyAssaultPending,
  isStargatePiracySupressed,
  isGalaxyPiracyCoveredByFleet,
  isLumberRace,
  isBananaRepublicObjectiveComplete,
  isInflationAssistActive,
  isInflationMoneyReachable,
  isRetirementAssistActive,
  getRetirementPreparationMissing,
  isAchievementGuardActive,
  getForeignAchievementGoal,
  isHellSupressUseful,
  isGateTowerSupressionTooLow,
  isGateDemonsSupressed,
  isGuardPostPrebuildIncomplete,
  getSpirePrebuildShortfall,
  getNextCitadelPowerDraw,
  isGECKNeeded,
  isPrestigeAllowed,
  isPillarFinished,
  isMadPrestigeAwaited,
  getMechSupplySavingReason,
  isWomlingStatEarned,
}: WeightingSnapshotDependencies): () => BuildingWeightingSnapshot {
  return () => {
    const state = requireRecord(getState(), "state");
    const retirementAssistActive = requireBoolean(
      isRetirementAssistActive(),
      "isRetirementAssistActive()",
    );
    const spirePrebuild = requireRecord(
      getSpirePrebuildShortfall(),
      "getSpirePrebuildShortfall()",
    );
    return Object.freeze({
      queuedTargets: new Set(
        requireArray(state["queuedTargets"], "state.queuedTargets"),
      ),
      triggerTargets: new Set(
        requireArray(state["triggerTargets"], "state.triggerTargets"),
      ),
      knowledgeRequiredByTechs: requireNumber(
        state["knowledgeRequiredByTechs"],
        "state.knowledgeRequiredByTechs",
      ),
      knowledgeRequiredByBuildTargets: requireNumber(
        state["knowledgeRequiredByBuildTargets"],
        "state.knowledgeRequiredByBuildTargets",
      ),
      cheapestTechKnowledge: requireNumber(
        state["cheapestTechKnowledge"],
        "state.cheapestTechKnowledge",
      ),
      galaxyAssaultPending: requireBoolean(
        isGalaxyAssaultPending(),
        "isGalaxyAssaultPending()",
      ),
      stargatePiracySupressed: requireBoolean(
        isStargatePiracySupressed(),
        "isStargatePiracySupressed()",
      ),
      galaxyPiracyCoveredByFleet: requireBoolean(
        isGalaxyPiracyCoveredByFleet(),
        "isGalaxyPiracyCoveredByFleet()",
      ),
      lumberRace: requireBoolean(isLumberRace(), "isLumberRace()"),
      bananaColliderObjectiveComplete: requireBoolean(
        isBananaRepublicObjectiveComplete("b2"),
        'isBananaRepublicObjectiveComplete("b2")',
      ),
      inflationAssistActive: requireBoolean(
        isInflationAssistActive(),
        "isInflationAssistActive()",
      ),
      inflationMoneyReachable: requireBoolean(
        isInflationMoneyReachable(),
        "isInflationMoneyReachable()",
      ),
      // The preparation read is skipped when the assist is off, which is the
      // short circuit the rule's own `enabled` used to provide.
      retirementPreparationIncomplete:
        retirementAssistActive &&
        requireArray(
          getRetirementPreparationMissing(),
          "getRetirementPreparationMissing()",
        ).length > 0,
      guardDreadedActive: requireBoolean(
        isAchievementGuardActive("guardDreaded"),
        'isAchievementGuardActive("guardDreaded")',
      ),
      guardEnergeticActive: requireBoolean(
        isAchievementGuardActive("guardEnergetic"),
        'isAchievementGuardActive("guardEnergetic")',
      ),
      guardRedDeadActive: requireBoolean(
        isAchievementGuardActive("guardRedDead"),
        'isAchievementGuardActive("guardRedDead")',
      ),
      guardPacifistActive: requireBoolean(
        isAchievementGuardActive("guardPacifist"),
        'isAchievementGuardActive("guardPacifist")',
      ),
      foreignAchievementGoal: requireForeignAchievementGoal(
        getForeignAchievementGoal(),
        "getForeignAchievementGoal()",
      ),
      hellSupressUseful: requireBoolean(
        isHellSupressUseful(),
        "isHellSupressUseful()",
      ),
      gateTowerSupressionTooLow: requireBoolean(
        isGateTowerSupressionTooLow(),
        "isGateTowerSupressionTooLow()",
      ),
      gateDemonsSupressed: requireBoolean(
        isGateDemonsSupressed(),
        "isGateDemonsSupressed()",
      ),
      hellGuardPostPrebuildIncomplete: requireBoolean(
        isGuardPostPrebuildIncomplete(),
        "isGuardPostPrebuildIncomplete()",
      ),
      spirePortPrebuildIncomplete: requireBoolean(
        spirePrebuild["ports"],
        "getSpirePrebuildShortfall().ports",
      ),
      spireBaseCampPrebuildIncomplete: requireBoolean(
        spirePrebuild["baseCamps"],
        "getSpirePrebuildShortfall().baseCamps",
      ),
      nextCitadelPowerDraw: requireNumber(
        getNextCitadelPowerDraw(),
        "getNextCitadelPowerDraw()",
      ),
      geckNeeded: requireBoolean(isGECKNeeded(), "isGECKNeeded()"),
      prestigeEdenAllowed: requireBoolean(
        isPrestigeAllowed("eden"),
        'isPrestigeAllowed("eden")',
      ),
      prestigeRetireAllowed: requireBoolean(
        isPrestigeAllowed("retire"),
        'isPrestigeAllowed("retire")',
      ),
      pillarFinished: requireBoolean(isPillarFinished(), "isPillarFinished()"),
      madPrestigeAwaited: requireBoolean(
        isMadPrestigeAwaited(),
        "isMadPrestigeAwaited()",
      ),
      mechSupplySaving: requireMechSupplySavingReason(
        getMechSupplySavingReason(),
        "getMechSupplySavingReason()",
      ),
      womlingFriendEarned: requireBoolean(
        isWomlingStatEarned("friend"),
        'isWomlingStatEarned("friend")',
      ),
      womlingGodEarned: requireBoolean(
        isWomlingStatEarned("god"),
        'isWomlingStatEarned("god")',
      ),
      womlingLordEarned: requireBoolean(
        isWomlingStatEarned("lord"),
        'isWomlingStatEarned("lord")',
      ),
    });
  };
}
