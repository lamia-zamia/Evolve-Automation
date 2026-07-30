import type { ForeignAchievementGoal } from "../../../../domain/combat/foreign-achievements.ts";
import type {
  BuildingWeightingSnapshot,
  BuildingWeightName,
  BuildingWeights,
  MechSupplySavingReason,
  SacrificeBlockedReason,
} from "../../../../ports/building-weighting.ts";
import {
  requireArray,
  requireBoolean,
  requireNumber,
  requireRecord,
} from "../../../validation.ts";

export interface WeightingSnapshotDependencies {
  readonly getState: () => unknown;
  readonly getWeightingMultiplier: (setting: BuildingWeightName) => unknown;
  readonly isBestFreighterOnly: () => unknown;
  readonly isGalaxyAssaultPending: () => unknown;
  readonly isStargatePiracySupressed: () => unknown;
  readonly isGalaxyPiracyCoveredByFleet: () => unknown;
  readonly isLumberRace: () => unknown;
  readonly hasRaceTrait: (trait: string) => unknown;
  readonly getForeignGovernment: (index: number) => unknown;
  readonly getWindSpeed: () => unknown;
  readonly getDefaultJobWorkers: () => unknown;
  readonly getSacrificeBonus: (bonus: string) => unknown;
  readonly getSpireBloodstoneRank: () => unknown;
  readonly getAssignedEjectorCapacity: () => unknown;
  readonly getTechLevel: (research: string) => unknown;
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
  readonly isTechResearched: (research: string, level: number) => unknown;
  readonly isShrineBonusUnwanted: () => unknown;
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

/** Sacrifice bonuses past an hour of effect are not worth extending further. */
const SACRIFICE_BONUS_CAP = 3600;

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
  getWeightingMultiplier,
  isBestFreighterOnly,
  isGalaxyAssaultPending,
  isStargatePiracySupressed,
  isGalaxyPiracyCoveredByFleet,
  isLumberRace,
  hasRaceTrait,
  getForeignGovernment,
  getWindSpeed,
  getDefaultJobWorkers,
  getSacrificeBonus,
  getSpireBloodstoneRank,
  getAssignedEjectorCapacity,
  getTechLevel,
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
  isTechResearched,
  isShrineBonusUnwanted,
  isGECKNeeded,
  isPrestigeAllowed,
  isPillarFinished,
  isMadPrestigeAwaited,
  getMechSupplySavingReason,
  isWomlingStatEarned,
}: WeightingSnapshotDependencies): () => BuildingWeightingSnapshot {
  // Every foreign government the player does not control can sabotage the Test
  // Launch. `occ`, `anx`, and `buy` are absent until that government is
  // occupied, annexed, or bought, so they keep the game's truthiness test.
  const readTestLaunchSuccessChance = (): number => {
    let saboteurs = 1;
    for (let index = 0; index < 3; index++) {
      const government = requireRecord(
        getForeignGovernment(index),
        `getForeignGovernment(${index})`,
      );
      if (!government["occ"] && !government["anx"] && !government["buy"]) {
        saboteurs++;
      }
    }
    return 1 / (saboteurs + 1);
  };

  // `global.city.s_alter[bonus]` is absent until that bonus is first raised, so
  // the cap test keeps the game's lenient coercion.
  const sacrificeBonusCapped = (bonus: string): boolean =>
    Number(getSacrificeBonus(bonus)) >= SACRIFICE_BONUS_CAP;

  const readSacrificeBlocked = (
    parasiteRace: boolean,
    lumberRace: boolean,
  ): SacrificeBlockedReason | null => {
    if (parasiteRace && requireNumber(getWindSpeed(), "getWindSpeed()") === 0) {
      return "windless";
    }
    if (requireNumber(getDefaultJobWorkers(), "getDefaultJobWorkers()") < 1) {
      return "no-default-workers";
    }
    if (
      sacrificeBonusCapped("rage") &&
      sacrificeBonusCapped("regen") &&
      sacrificeBonusCapped("mind") &&
      sacrificeBonusCapped("mine") &&
      (!lumberRace || sacrificeBonusCapped("harvest"))
    ) {
      return "bonus-capped";
    }
    return null;
  };

  // Bloodstone ranks are absent until the first one is earned, so the rank test
  // keeps the game's lenient coercion.
  const readLakeBiremeSupplyRate = (): number =>
    Number(getSpireBloodstoneRank()) >= 2 ? 0.8 : 0.85;

  // Every weighting multiplier is written by the settings defaults on load, so
  // a missing or non-numeric one is a corrupt setting rather than a run that
  // has not reached the feature yet.
  const weight = (setting: BuildingWeightName): number =>
    requireNumber(getWeightingMultiplier(setting), `settings.${setting}`);

  const readWeights = (): BuildingWeights =>
    Object.freeze({
      buildingWeightingNew: weight("buildingWeightingNew"),
      buildingWeightingUnderpowered: weight("buildingWeightingUnderpowered"),
      buildingWeightingNeedfulPowerPlant: weight(
        "buildingWeightingNeedfulPowerPlant",
      ),
      buildingWeightingUselessPowerPlant: weight(
        "buildingWeightingUselessPowerPlant",
      ),
      buildingWeightingNeedfulKnowledge: weight(
        "buildingWeightingNeedfulKnowledge",
      ),
      buildingWeightingUselessKnowledge: weight(
        "buildingWeightingUselessKnowledge",
      ),
      buildingWeightingNonOperatingCity: weight(
        "buildingWeightingNonOperatingCity",
      ),
      buildingWeightingNonOperating: weight("buildingWeightingNonOperating"),
      buildingWeightingMissingSupply: weight("buildingWeightingMissingSupply"),
      buildingWeightingMissingSupport: weight(
        "buildingWeightingMissingSupport",
      ),
      buildingWeightingUselessSupport: weight(
        "buildingWeightingUselessSupport",
      ),
      buildingWeightingMissingFuel: weight("buildingWeightingMissingFuel"),
      buildingWeightingMADUseless: weight("buildingWeightingMADUseless"),
      buildingWeightingUnusedEjectors: weight(
        "buildingWeightingUnusedEjectors",
      ),
      buildingWeightingCrateUseless: weight("buildingWeightingCrateUseless"),
      buildingWeightingHorseshoeUseless: weight(
        "buildingWeightingHorseshoeUseless",
      ),
      buildingWeightingZenUseless: weight("buildingWeightingZenUseless"),
      buildingWeightingGateTurret: weight("buildingWeightingGateTurret"),
      buildingWeightingNeedStorage: weight("buildingWeightingNeedStorage"),
      buildingWeightingUselessHousing: weight(
        "buildingWeightingUselessHousing",
      ),
      buildingWeightingTemporal: weight("buildingWeightingTemporal"),
      buildingWeightingSolar: weight("buildingWeightingSolar"),
      buildingWeightingVacuumCollapse: weight(
        "buildingWeightingVacuumCollapse",
      ),
      buildingWeightingTruepathDigsite: weight(
        "buildingWeightingTruepathDigsite",
      ),
      buildingWeightingOverlord: weight("buildingWeightingOverlord"),
      buildingWeightingAuthority: weight("buildingWeightingAuthority"),
      buildingWeightingBananaObjective: weight(
        "buildingWeightingBananaObjective",
      ),
      buildingWeightingInflationMoney: weight(
        "buildingWeightingInflationMoney",
      ),
      buildingWeightingRetirementPrep: weight(
        "buildingWeightingRetirementPrep",
      ),
    });

  // `global.interstellar.mass_ejector` is absent until the first Mass Ejector
  // is built, and nothing can be assigned before then.
  const readAssignedEjectorCapacity = (): number => {
    const assigned = getAssignedEjectorCapacity();
    return assigned === undefined
      ? 0
      : requireNumber(assigned, "getAssignedEjectorCapacity()");
  };

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
    // `global.tech[research]` is absent until a run starts that research and is
    // `0` while it sits at level 0, so the game's own `haveTech` answers
    // `undefined` or `0` rather than `false`. The tech gates keep that lenient
    // coercion; every other gate in this snapshot is an exact boolean contract.
    const researched = (research: string, level: number): boolean =>
      Boolean(isTechResearched(research, level));
    // `global.race[trait]` is absent unless the race has the trait, and a trait
    // it does have carries a numeric rank rather than `true`. The game's own
    // checks are truthiness tests, so the race gates keep that coercion.
    const trait = (name: string): boolean => Boolean(hasRaceTrait(name));
    const truepathRace = trait("truepath");
    const cannibalizeRace = trait("cannibalize");
    const lumberRace = requireBoolean(isLumberRace(), "isLumberRace()");
    return Object.freeze({
      weights: readWeights(),
      buildBestFreighterOnly: requireBoolean(
        isBestFreighterOnly(),
        "settings.buildingsBestFreighter",
      ),
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
      truepathRace,
      // The game spells the Entish no-quarry-worker trait "sappy".
      mineIsOnlyChrysotileSource: trait("smoldering") && trait("sappy"),
      witchHunterRace: trait("witch_hunter"),
      warlordRace: trait("warlord"),
      // The game spells the artificial-population trait "artifical".
      artificialRace: trait("artifical"),
      slaverRace: trait("slaver"),
      cannibalizeRace,
      // A race that cannot sacrifice never has the altar reads taken.
      sacrificeBlocked: cannibalizeRace
        ? readSacrificeBlocked(trait("parasite"), lumberRace)
        : null,
      bananaRace: trait("banana"),
      loneSurvivorRace: trait("lone_survivor"),
      hoovedRace: trait("hooved"),
      calmRace: trait("calm"),
      orbitalDecayImpactPending:
        trait("orbit_decay") && !trait("orbit_decayed"),
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
      lakeBiremeSupplyRate: readLakeBiremeSupplyRate(),
      nextCitadelPowerDraw: requireNumber(
        getNextCitadelPowerDraw(),
        "getNextCitadelPowerDraw()",
      ),
      assignedEjectorCapacity: readAssignedEjectorCapacity(),
      worldUnified: researched("world_control", 1),
      // Only True Path has a Test Launch, and only its foreign governments can
      // sabotage one.
      testLaunchSuccessChance: truepathRace ? readTestLaunchSuccessChance() : 0,
      spireWaygateComplete: researched("waygate", 2),
      spireEdenicGateComplete: researched("edenic", 3),
      elysiumFireSupportUnlocked: researched("elysium", 8),
      elysiumGarrisonDestroyed: researched("isle", 2),
      eleriumCannonResearched: researched("elysium", 10),
      asphodelStabilizerUnlocked: researched("asphodel", 8),
      spireSphinxSolved: researched("hell_spire", 8),
      assemblyCureComplete: researched("focus_cure", 7),
      tauCetiReached: researched("tauceti", 2),
      // An exact level test rather than the `haveTech` `>=` the other tech
      // gates use: the contest closes when the tech advances past level 1.
      gasGiantNameContestActive: getTechLevel("tau_gas") === 1,
      shrineBonusUnwanted: requireBoolean(
        isShrineBonusUnwanted(),
        "isShrineBonusUnwanted()",
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
