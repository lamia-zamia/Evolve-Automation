import type { ForeignAchievementGoal } from "../../../../domain/combat/foreign-achievements.ts";
import { planTruepathAiApocalypse } from "../../../../domain/progression/truepath/ai-apocalypse.ts";
import type {
  BuildingChoice,
  BuildingWeightingSnapshot,
  BuildingWeightName,
  BuildingWeights,
  MechSupplySavingReason,
  PrestigeRoute,
  SacrificeBlockedReason,
  WomlingOverlordAction,
} from "../../../../domain/progression/build/building-weighting.ts";
import {
  requireArray,
  requireBoolean,
  requireNumber,
  requireRecord,
  requireString,
} from "../../../validation.ts";

export interface WeightingSnapshotDependencies {
  readonly getState: () => unknown;
  readonly getWeightingMultiplier: (setting: BuildingWeightName) => unknown;
  readonly isBestFreighterOnly: () => unknown;
  readonly isAutoBuildEnabled: () => unknown;
  readonly isAutoFleetEnabled: () => unknown;
  readonly isMinerJobsDisabled: () => unknown;
  readonly isTransportComparedBySoulGems: () => unknown;
  readonly getPrestigeType: () => unknown;
  readonly isPrestigeConstructionLimited: () => unknown;
  readonly isSavingSoulGemsForPrestige: () => unknown;
  readonly isAuthorityManaged: () => unknown;
  readonly getMinimumAuthority: () => unknown;
  readonly getEmbassyKnowledgeTarget: () => unknown;
  readonly getSlaveIncomeTarget: () => unknown;
  readonly getResourceQuantity: (resource: string) => unknown;
  readonly getResourceCapacity: (resource: string) => unknown;
  readonly getResourceIncome: (resource: string) => unknown;
  readonly getResourceStorageRatio: (resource: string) => unknown;
  readonly isResourceUnlocked: (resource: string) => unknown;
  readonly getSpareResourceQuantity: (resource: string) => unknown;
  readonly getRequiredResourceStorage: (resource: string) => unknown;
  readonly getMissionMaxResourceCost: (resource: string) => unknown;
  readonly getResourceTitle: (resource: string) => unknown;
  readonly getBuildingCount: (building: string) => unknown;
  readonly getBuildingOnCount: (building: string) => unknown;
  readonly getBuildingName: (building: string) => unknown;
  readonly getBuildingTitle: (building: string) => unknown;
  readonly getBuildingSoulGemCost: (building: string) => unknown;
  readonly isBuildingUnlocked: (building: string) => unknown;
  readonly isBuildingAutoBuildable: (building: string) => unknown;
  readonly isBuildingAffordable: (building: string) => unknown;
  readonly isAchievementGuardsEnabled: () => unknown;
  readonly isBananaRepublicGuardEnabled: () => unknown;
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
 * Samples the script state, phase-constant gates, and resource questions that
 * the building-weighting rules read.
 *
 * Called once per weighting phase so every rule observes the same values. The
 * target lists are converted to catalog-key sets here: the rules only ask
 * whether a candidate is a queued or trigger target, and rescanning both arrays
 * for every candidate is the shape this replaced.
 *
 * The gates are sampled eagerly rather than behind the rule that reads them.
 * Each one is a small pure read of already-loaded game and settings state, and
 * several were previously re-evaluated for every build candidate.
 */
export function createWeightingSnapshotReader({
  getState,
  getWeightingMultiplier,
  isBestFreighterOnly,
  isAutoBuildEnabled,
  isAutoFleetEnabled,
  isMinerJobsDisabled,
  isTransportComparedBySoulGems,
  getPrestigeType,
  isPrestigeConstructionLimited,
  isSavingSoulGemsForPrestige,
  isAuthorityManaged,
  getMinimumAuthority,
  getEmbassyKnowledgeTarget,
  getSlaveIncomeTarget,
  getResourceQuantity,
  getResourceCapacity,
  getResourceIncome,
  getResourceStorageRatio,
  isResourceUnlocked,
  getSpareResourceQuantity,
  getRequiredResourceStorage,
  getMissionMaxResourceCost,
  getResourceTitle,
  getBuildingCount,
  getBuildingOnCount,
  getBuildingName,
  getBuildingTitle,
  getBuildingSoulGemCost,
  isBuildingUnlocked,
  isBuildingAutoBuildable,
  isBuildingAffordable,
  isAchievementGuardsEnabled,
  isBananaRepublicGuardEnabled,
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

  // Routes the weighting rules distinguish. Everything else, including "none"
  // and any route added upstream, weighs the same as no route at all.
  const DISTINGUISHED_ROUTES: ReadonlySet<string> = new Set([
    "bioseed",
    "whitehole",
    "vacuum",
    "ascension",
    "terraform",
  ]);

  const readPrestigeRoute = (route: string): PrestigeRoute => {
    return DISTINGUISHED_ROUTES.has(route) ? (route as PrestigeRoute) : "other";
  };

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

  // Nothing can be assigned before the first Mass Ejector exists.
  const readAssignedEjectorCapacity = (): number => {
    const assigned = getAssignedEjectorCapacity();
    return assigned === undefined
      ? 0
      : requireNumber(assigned, "getAssignedEjectorCapacity()");
  };

  // Resource wrappers keep every numeric field at its constructor default until
  // the game unlocks the resource, so these reads are exact even before then.
  const quantity = (resource: string): number =>
    requireNumber(
      getResourceQuantity(resource),
      `resources.${resource}.currentQuantity`,
    );

  const capacity = (resource: string): number =>
    requireNumber(
      getResourceCapacity(resource),
      `resources.${resource}.maxQuantity`,
    );

  const income = (resource: string): number =>
    requireNumber(
      getResourceIncome(resource),
      `resources.${resource}.rateOfChange`,
    );

  const storageRatio = (resource: string): number =>
    requireNumber(
      getResourceStorageRatio(resource),
      `resources.${resource}.storageRatio`,
    );

  // `Power.isUnlocked()` forwards `global.city.powered`, which is absent until
  // the city has any power at all, so the unlock tests keep the game's
  // truthiness coercion. Every other resource returns an exact boolean.
  const unlocked = (resource: string): boolean =>
    Boolean(isResourceUnlocked(resource));

  const storageBelowMissionCost = (resource: string): boolean =>
    capacity(resource) <
    requireNumber(
      getMissionMaxResourceCost(resource),
      `resources.${resource}.techMissionMaxCost`,
    );

  const buildingCount = (building: string): number =>
    requireNumber(getBuildingCount(building), `buildings.${building}.count`);

  // A cost entry only exists while it is above zero, and the game rebuilds
  // `cost` for unlocked buildings only. An absent Soul Gem cost divides to
  // `NaN`, which the pair comparison reads as no choice.
  const soulGemCost = (building: string): number =>
    Number(getBuildingSoulGemCost(building));

  // `Action.isUnlocked()` is an exact boolean: it either fails one of the tab
  // tests or answers whether the building has a Vue view.
  const buildingUnlocked = (building: string): boolean =>
    requireBoolean(
      isBuildingUnlocked(building),
      `buildings.${building}.isUnlocked()`,
    );

  // `isAutoBuildable()` chains on `settings["bat" + binding]`, which is absent
  // until that building's AutoBuild setting is first written, and
  // `isAffordable()` forwards the game's own `checkAffordable`. Both keep the
  // game's truthiness test.
  const buildableNow = (building: string): boolean =>
    Boolean(isBuildingAutoBuildable(building)) &&
    Boolean(isBuildingAffordable(building));

  const buildingTitle = (building: string): string =>
    requireString(getBuildingTitle(building), `buildings.${building}.title`);

  /**
   * Which side of a two-building pair is worth less, once each side's value has
   * been scored on the same scale. `null` when neither is ahead, which is also
   * where a non-finite score lands: a missing Soul Gem cost divides to `NaN`,
   * and the script then prefers neither side over the other.
   */
  const worseSide = (
    first: readonly [string, number],
    second: readonly [string, number],
  ): BuildingChoice => {
    if (first[1] < second[1]) {
      return { worseId: first[0], betterTitle: buildingTitle(second[0]) };
    }
    if (second[1] < first[1]) {
      return { worseId: second[0], betterTitle: buildingTitle(first[0]) };
    }
    return null;
  };

  /**
   * A pair is only a choice while the script could build either side. While one
   * is locked, switched off, or unaffordable, the other is simply what gets
   * built.
   */
  const openChoice = (
    first: string,
    second: string,
    score: () => BuildingChoice,
  ): BuildingChoice =>
    buildableNow(first) && buildableNow(second) ? score() : null;

  // Money storage each freighter adds over the one before it, per crew member
  // it costs: 3% per regular freighter against 8% per super freighter.
  const readFreighterChoice = (): BuildingChoice =>
    openChoice("GorddonFreighter", "Alien1SuperFreighter", () => {
      const regularCount = buildingCount("GorddonFreighter");
      const superCount = buildingCount("Alien1SuperFreighter");
      return worseSide(
        [
          "GorddonFreighter",
          ((1 + (regularCount + 1) * 0.03) / (1 + regularCount * 0.03) - 1) / 3,
        ],
        [
          "Alien1SuperFreighter",
          ((1 + (superCount + 1) * 0.08) / (1 + superCount * 0.08) - 1) / 5,
        ],
      );
    });

  // Supplies the Lake fleet produces: each Transport carries 5, and Biremes
  // escort them with a diminishing per-ship factor. With the Soul Gem
  // comparison on, each ship is scored by the supplies it adds per Soul Gem.
  const readLakeShipChoice = (): BuildingChoice =>
    openChoice("LakeBireme", "LakeTransport", () => {
      const biremeCount = buildingCount("LakeBireme");
      const transportCount = buildingCount("LakeTransport");
      const rating = readLakeBiremeSupplyRate();
      let bireme = (1 - rating ** (biremeCount + 1)) * (transportCount * 5);
      let transport = (1 - rating ** biremeCount) * ((transportCount + 1) * 5);
      if (
        requireBoolean(
          isTransportComparedBySoulGems(),
          "settings.buildingsTransportGem",
        )
      ) {
        const current = (1 - rating ** biremeCount) * (transportCount * 5);
        bireme = (bireme - current) / soulGemCost("LakeBireme");
        transport = (transport - current) / soulGemCost("LakeTransport");
      }
      return worseSide(["LakeBireme", bireme], ["LakeTransport", transport]);
    });

  // Max Supplies the Spire produces: Ports carry the supplies and Base Camps
  // multiply them by 40% each.
  const readSpireSupplyChoice = (): BuildingChoice =>
    openChoice("SpirePort", "SpireBaseCamp", () => {
      const portCount = buildingCount("SpirePort");
      const campCount = buildingCount("SpireBaseCamp");
      return worseSide(
        ["SpirePort", (portCount + 1) * (1 + campCount * 0.4)],
        ["SpireBaseCamp", portCount * (1 + (campCount + 1) * 0.4)],
      );
    });

  // The Overlord achievement wants all three contacts, in this order.
  const WOMLING_OVERLORD_ACTIONS: readonly (readonly [string, string])[] = [
    ["TauRedContact", "friend"],
    ["TauRedIntroduce", "god"],
    ["TauRedSubjugate", "lord"],
  ];

  const readWomlingOverlordActions = (): readonly WomlingOverlordAction[] =>
    WOMLING_OVERLORD_ACTIONS.map(([building, stat]) =>
      Object.freeze({
        id: building,
        name: requireString(
          getBuildingName(building),
          `buildings.${building}.name`,
        ),
        statEarned: requireBoolean(
          isWomlingStatEarned(stat),
          `isWomlingStatEarned("${stat}")`,
        ),
        autoBuildable: Boolean(isBuildingAutoBuildable(building)),
      }),
    );

  // Only buildings carry a catalog key, so a queued or triggered ARPA project
  // is skipped rather than mistaken for a build candidate.
  const readTargetIds = (
    targets: unknown,
    path: string,
  ): ReadonlySet<string> => {
    const ids = new Set<string>();
    for (const [index, target] of requireArray(targets, path).entries()) {
      const key = requireRecord(target, `${path}[${index}]`)["catalogKey"];
      if (typeof key === "string") {
        ids.add(key);
      }
    }
    return ids;
  };

  // `global.interstellar.mass_ejector` is absent until the first Mass Ejector
  // is built, and each one handles 1000 units per second.
  const readUnusedEjectorCapacity = (): number =>
    buildingCount("BlackholeMassEjector") * 1000 -
    readAssignedEjectorCapacity();

  // Money that is about to cap is spare regardless of income, which is why the
  // storage test comes first.
  const readSlaveIncomeInsufficient = (): boolean => {
    const moneyIncome = income("Money");
    return (
      quantity("Money") + moneyIncome < capacity("Money") &&
      moneyIncome <
        requireNumber(getSlaveIncomeTarget(), "settings.slaveIncome")
    );
  };

  // No building raises the cap toward a target the script is not managing, and
  // the configured minimum is not read at all while management is off.
  const readAuthorityCapBelowTarget = (): boolean => {
    if (!requireBoolean(isAuthorityManaged(), "settings.authorityManage")) {
      return false;
    }
    const target = requireNumber(
      getMinimumAuthority(),
      "settings.generalMinimumAuthority",
    );
    return (
      target > 0 && unlocked("Authority") && capacity("Authority") < target
    );
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
    const prestigeType = requireString(
      getPrestigeType(),
      "settings.prestigeType",
    );
    const truepathAiApocalypse = truepathRace;
    const readTechLevelOrZero = (research: string): number => {
      const value = getTechLevel(research);
      return typeof value === "number" && Number.isFinite(value) && value >= 0
        ? value
        : 0;
    };
    const truepathAiPlan = planTruepathAiApocalypse(
      truepathAiApocalypse
        ? {
            enabled: true,
            aiCoreLevel: readTechLevelOrZero("titan_ai_core"),
            decoderCount: requireNumber(
              getBuildingCount("TitanDecoder"),
              "buildings.TitanDecoder.count",
            ),
            decoderOnCount: requireNumber(
              getBuildingOnCount("TitanDecoder"),
              "buildings.TitanDecoder.stateOnCount",
            ),
            colonistCount: requireNumber(
              getBuildingCount("TitanAIColonist"),
              "buildings.TitanAIColonist.count",
            ),
            colonistOnCount: requireNumber(
              getBuildingOnCount("TitanAIColonist"),
              "buildings.TitanAIColonist.stateOnCount",
            ),
            trooperOnCount: requireNumber(
              getBuildingOnCount("ErisTrooper"),
              "buildings.ErisTrooper.stateOnCount",
            ),
            tankOnCount: requireNumber(
              getBuildingOnCount("ErisTank"),
              "buildings.ErisTank.stateOnCount",
            ),
          }
        : {
            enabled: false,
            aiCoreLevel: 0,
            decoderCount: 0,
            decoderOnCount: 0,
            colonistCount: 0,
            colonistOnCount: 0,
            trooperOnCount: 0,
            tankOnCount: 0,
          },
    );
    const cannibalizeRace = trait("cannibalize");
    const lumberRace = requireBoolean(isLumberRace(), "isLumberRace()");
    return Object.freeze({
      weights: readWeights(),
      buildBestFreighterOnly: requireBoolean(
        isBestFreighterOnly(),
        "settings.buildingsBestFreighter",
      ),
      autoBuildEnabled: requireBoolean(
        isAutoBuildEnabled(),
        "settings.autoBuild",
      ),
      autoFleetEnabled: requireBoolean(
        isAutoFleetEnabled(),
        "settings.autoFleet",
      ),
      minerJobsDisabled: requireBoolean(
        isMinerJobsDisabled(),
        "settings.jobDisableMiners",
      ),
      prestigeRoute: readPrestigeRoute(prestigeType),
      limitPrestigeConstruction: requireBoolean(
        isPrestigeConstructionLimited(),
        "settings.prestigeBioseedConstruct",
      ),
      saveSoulGemsForPrestige: requireBoolean(
        isSavingSoulGemsForPrestige(),
        "settings.prestigeWhiteholeSaveGems",
      ),
      authorityCapBelowTarget: readAuthorityCapBelowTarget(),
      embassyKnowledgeTarget: requireNumber(
        getEmbassyKnowledgeTarget(),
        "settings.fleetEmbassyKnowledge",
      ),
      slavePensFull: quantity("Slave") >= capacity("Slave"),
      slaveIncomeInsufficient: readSlaveIncomeInsufficient(),
      bananaRepublicGuardActive:
        requireBoolean(
          isAchievementGuardsEnabled(),
          "settings.achievementGuards",
        ) &&
        requireBoolean(
          isBananaRepublicGuardEnabled(),
          "settings.guardBananaRepublic",
        ),
      queuedTargets: readTargetIds(
        state["queuedTargets"],
        "state.queuedTargets",
      ),
      triggerTargets: readTargetIds(
        state["triggerTargets"],
        "state.triggerTargets",
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
      knowledgeCapacity: capacity("Knowledge"),
      soulGemQuantity: quantity("Soul_Gem"),
      lakeSupportSpare: income("Lake_Support"),
      tauBeltSupportAvailable: capacity("Tau_Belt_Support"),
      tauBeltSupportUsed: quantity("Tau_Belt_Support"),
      powerUnlocked: unlocked("Power"),
      powerSurplus: quantity("Power"),
      unpoweredPowerDemand: capacity("Power"),
      populationAtCap: storageRatio("Population") === 1,
      populationEmpty: quantity("Population") < 1,
      housingUnderused:
        capacity("Population") > 50 && storageRatio("Population") < 0.9,
      unusedStorageParts:
        storageRatio("Crates") < 1 || storageRatio("Containers") < 1,
      storagePartsAllAssigned:
        (unlocked("Containers") || unlocked("Crates")) &&
        storageRatio("Containers") === 1 &&
        storageRatio("Crates") === 1,
      oilStorageBelowMissionCost: storageBelowMissionCost("Oil"),
      heliumStorageBelowMissionCost:
        unlocked("Helium_3") && storageBelowMissionCost("Helium_3"),
      horseshoesSufficient:
        requireNumber(
          getSpareResourceQuantity("Horseshoe"),
          "resources.Horseshoe.spareQuantity",
        ) >=
        requireNumber(
          getRequiredResourceStorage("Horseshoe"),
          "resources.Horseshoe.storageRequired",
        ),
      horseshoeTitle: requireString(
        getResourceTitle("Horseshoe"),
        "resources.Horseshoe.title",
      ),
      zenBelowCap: quantity("Zen") < capacity("Zen"),
      testLaunchUnlocked: buildingUnlocked("SpaceTestLaunch"),
      erisDigsiteUnsecured:
        buildingUnlocked("ErisDigsite") && buildingCount("ErisDigsite") < 100,
      andromedaReached: buildingCount("GatewayStarbase") > 0,
      freighterChoice: readFreighterChoice(),
      lakeShipChoice: readLakeShipChoice(),
      spireSupplyChoice: readSpireSupplyChoice(),
      asphodelWarehouseCount: buildingCount("AsphodelWarehouse"),
      embassyMissing: buildingCount("GorddonEmbassy") === 0,
      matrioshkaBrainIncomplete: buildingCount("TauGas2MatrioshkaBrain") < 1000,
      unusedEjectorCapacity: readUnusedEjectorCapacity(),
      noOilProduction:
        buildingCount("OilWell") <= 0 &&
        buildingCount("GasMoonOilExtractor") <= 0,
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
      truepathAiApocalypse,
      truepathAiProgress: truepathAiPlan.progress,
      truepathAiBuildingTarget: truepathAiPlan.target,
      truepathAiTargetColonists: truepathAiPlan.targetColonistCount,
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
      nextCitadelPowerDraw: requireNumber(
        getNextCitadelPowerDraw(),
        "getNextCitadelPowerDraw()",
      ),
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
      // Only True Path has Womlings to contact.
      womlingOverlordActions: truepathRace ? readWomlingOverlordActions() : [],
    });
  };
}
