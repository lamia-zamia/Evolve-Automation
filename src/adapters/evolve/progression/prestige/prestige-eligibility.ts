import type {
  AscensionEligibilityView,
  GeckEligibilityView,
  PillarEligibilityView,
  PrestigeEligibilityView,
  PrestigePermissionView,
  WitchAscensionEligibilityView,
} from "../../../../domain/progression/prestige/prestige-eligibility.ts";

type PrestigeEligibilityUnavailableReason =
  | "inaccessible-data"
  | "invalid-building"
  | "invalid-external-result"
  | "invalid-game-state"
  | "invalid-mech-state"
  | "invalid-resource"
  | "invalid-settings"
  | "invalid-tech";

export type PrestigeEligibilityReadResult =
  | {
      readonly status: "ready";
      readonly view: Readonly<PrestigeEligibilityView>;
    }
  | {
      readonly status: "unavailable";
      readonly reason: PrestigeEligibilityUnavailableReason;
      readonly field?: string;
    };

type PrestigeUnavailable = Extract<
  PrestigeEligibilityReadResult,
  { readonly status: "unavailable" }
>;

export type PrestigePermissionReadResult =
  | {
      readonly status: "ready";
      readonly view: Readonly<PrestigePermissionView>;
    }
  | PrestigeUnavailable;

export type PillarEligibilityReadResult =
  | { readonly status: "ready"; readonly view: Readonly<PillarEligibilityView> }
  | PrestigeUnavailable;

export type AscensionEligibilityReadResult =
  | {
      readonly status: "ready";
      readonly view: Readonly<AscensionEligibilityView>;
    }
  | PrestigeUnavailable;

export type WitchAscensionEligibilityReadResult =
  | {
      readonly status: "ready";
      readonly view: Readonly<WitchAscensionEligibilityView>;
    }
  | PrestigeUnavailable;

export type GeckEligibilityReadResult =
  | { readonly status: "ready"; readonly view: Readonly<GeckEligibilityView> }
  | PrestigeUnavailable;

type ExternalQuery = (...args: unknown[]) => unknown;

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function unavailable(
  reason: PrestigeEligibilityUnavailableReason,
  field?: string,
): PrestigeEligibilityReadResult {
  return Object.freeze(
    field === undefined
      ? { status: "unavailable", reason }
      : { status: "unavailable", reason, field },
  );
}

function readBoolean(
  record: Record<PropertyKey, unknown>,
  field: string,
): boolean | undefined {
  const value = record[field];
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(
  record: Record<PropertyKey, unknown>,
  field: string,
): number | undefined {
  const value = record[field];
  return finiteNonNegative(value) ? value : undefined;
}

function callBoolean(
  owner: Record<PropertyKey, unknown>,
  methodName: string,
  ...args: unknown[]
): boolean | undefined {
  const method = owner[methodName];
  if (typeof method !== "function") return undefined;
  const value = method.call(owner, ...args);
  return typeof value === "boolean" ? value : undefined;
}

function readBuilding(
  buildings: Record<PropertyKey, unknown>,
  id: string,
): Record<PropertyKey, unknown> | undefined {
  const building = buildings[id];
  return isRecord(building) ? building : undefined;
}

function readTechState(
  techIds: Record<PropertyKey, unknown>,
  id: string,
  includeAffordable: boolean,
): { readonly unlocked: boolean; readonly affordable: boolean } | undefined {
  const rawTech = techIds[id];
  if (!isRecord(rawTech)) return undefined;
  const unlocked = callBoolean(rawTech, "isUnlocked");
  const affordable = includeAffordable
    ? callBoolean(rawTech, "isAffordable")
    : false;
  return unlocked === undefined || affordable === undefined
    ? undefined
    : Object.freeze({ unlocked, affordable });
}

export function readPrestigePermissionView(
  rawSettings: unknown,
  rawGame: unknown,
): PrestigePermissionReadResult {
  try {
    if (!isRecord(rawSettings)) return unavailable("invalid-settings");
    const autoPrestige = readBoolean(rawSettings, "autoPrestige");
    const waitForArpa = readBoolean(rawSettings, "prestigeWaitAT");
    const selectedType = rawSettings["prestigeType"];
    if (
      autoPrestige === undefined ||
      waitForArpa === undefined ||
      typeof selectedType !== "string"
    ) {
      return unavailable("invalid-settings");
    }
    if (!isRecord(rawGame)) return unavailable("invalid-game-state");
    const global = rawGame["global"];
    const gameSettings = isRecord(global) ? global["settings"] : undefined;
    if (!isRecord(gameSettings) || !finiteNonNegative(gameSettings["at"])) {
      return unavailable("invalid-game-state", "settings.at");
    }
    return Object.freeze({
      status: "ready",
      view: Object.freeze({
        settings: Object.freeze({ autoPrestige, waitForArpa, selectedType }),
        game: Object.freeze({ activeArpaProjects: gameSettings["at"] }),
      }),
    });
  } catch {
    return unavailable("inaccessible-data");
  }
}

export function readPillarEligibilityView(
  rawSettings: unknown,
  rawGame: unknown,
  rawResources: unknown,
): PillarEligibilityReadResult {
  try {
    if (!isRecord(rawSettings)) return unavailable("invalid-settings");
    const requirePillar = readBoolean(rawSettings, "prestigeAscensionPillar");
    if (requirePillar === undefined) return unavailable("invalid-settings");
    if (!isRecord(rawGame)) return unavailable("invalid-game-state");
    const global = rawGame["global"];
    const alevel = rawGame["alevel"];
    if (!isRecord(global) || typeof alevel !== "function") {
      return unavailable("invalid-game-state");
    }
    const race = global["race"];
    const pillars = global["pillars"];
    if (
      !isRecord(race) ||
      !isRecord(pillars) ||
      typeof race["species"] !== "string" ||
      typeof race["universe"] !== "string"
    ) {
      return unavailable("invalid-game-state");
    }
    const ascensionLevel = alevel.call(rawGame);
    const rawPillarLevel = pillars[race["species"]];
    if (
      !finiteNonNegative(ascensionLevel) ||
      (rawPillarLevel !== undefined && !finiteNonNegative(rawPillarLevel))
    ) {
      return unavailable("invalid-game-state");
    }
    if (!isRecord(rawResources)) return unavailable("invalid-resource");
    const harmony = rawResources["Harmony"];
    if (!isRecord(harmony) || !finiteNonNegative(harmony["currentQuantity"])) {
      return unavailable("invalid-resource", "Harmony");
    }
    const pillarLevel = rawPillarLevel as number | undefined;
    return Object.freeze({
      status: "ready",
      view: Object.freeze({
        settings: Object.freeze({ requirePillar }),
        game: Object.freeze({
          universe: race["universe"],
          ascensionLevel,
          ...(pillarLevel === undefined
            ? {}
            : { speciesPillarLevel: pillarLevel }),
        }),
        resources: Object.freeze({ harmony: harmony["currentQuantity"] }),
      }),
    });
  } catch {
    return unavailable("inaccessible-data");
  }
}

export function readAscensionEligibilityView(
  rawSettings: unknown,
  rawGame: unknown,
  rawResources: unknown,
  rawBuildings: unknown,
): AscensionEligibilityReadResult {
  try {
    const pillar = readPillarEligibilityView(
      rawSettings,
      rawGame,
      rawResources,
    );
    if (pillar.status === "unavailable") return pillar;
    if (!isRecord(rawBuildings)) return unavailable("invalid-building");
    const siriusAscend = readBuilding(rawBuildings, "SiriusAscend");
    if (siriusAscend === undefined) {
      return unavailable("invalid-building", "SiriusAscend");
    }
    const siriusAscendUnlocked = callBoolean(siriusAscend, "isUnlocked");
    if (siriusAscendUnlocked === undefined) {
      return unavailable("invalid-building", "SiriusAscend.isUnlocked");
    }
    return Object.freeze({
      status: "ready",
      view: Object.freeze({
        ...pillar.view,
        buildings: Object.freeze({ siriusAscendUnlocked }),
      }),
    });
  } catch {
    return unavailable("inaccessible-data");
  }
}

export function readWitchAscensionEligibilityView(
  rawSettings: unknown,
  rawGame: unknown,
  rawResources: unknown,
  rawBuildings: unknown,
  demonic: boolean,
  haveTech: ExternalQuery,
): WitchAscensionEligibilityReadResult {
  try {
    const pillar = readPillarEligibilityView(
      rawSettings,
      rawGame,
      rawResources,
    );
    if (pillar.status === "unavailable") return pillar;
    if (!isRecord(rawGame)) return unavailable("invalid-game-state");
    const global = rawGame["global"];
    const race = isRecord(global) ? global["race"] : undefined;
    if (!isRecord(race)) return unavailable("invalid-game-state", "race");

    if (!isRecord(rawBuildings)) return unavailable("invalid-building");
    const absorptionChamber = readBuilding(
      rawBuildings,
      "PitAbsorptionChamber",
    );
    const soulCapacitor = readBuilding(rawBuildings, "PitSoulCapacitor");
    const capacitorInstance = soulCapacitor?.["instance"];
    if (
      absorptionChamber === undefined ||
      !finiteNonNegative(absorptionChamber["count"])
    ) {
      return unavailable("invalid-building", "PitAbsorptionChamber.count");
    }
    if (
      !isRecord(capacitorInstance) ||
      !finiteNonNegative(capacitorInstance["energy"])
    ) {
      return unavailable(
        "invalid-building",
        "PitSoulCapacitor.instance.energy",
      );
    }

    let forbiddenLevelFive = false;
    let dishLevelTwo = false;
    if (demonic) {
      // Legacy consumed these truthily; haveTech returns a falsy non-boolean
      // (undefined) when the tech tree is absent. Coerce rather than reject.
      forbiddenLevelFive = Boolean(haveTech("forbidden", 5));
      dishLevelTwo = Boolean(haveTech("dish", 2));
    }

    return Object.freeze({
      status: "ready",
      view: Object.freeze({
        ...pillar.view,
        game: Object.freeze({
          ...pillar.view.game,
          fasting: Boolean(race["fasting"]),
        }),
        buildings: Object.freeze({
          absorptionChambers: absorptionChamber["count"],
          soulCapacitorEnergy: capacitorInstance["energy"],
        }),
        tech: Object.freeze({ forbiddenLevelFive, dishLevelTwo }),
      }),
    });
  } catch {
    return unavailable("inaccessible-data");
  }
}

export function readGeckEligibilityView(
  rawSettings: unknown,
  rawBuildings: unknown,
  isAchievementUnlocked: ExternalQuery,
): GeckEligibilityReadResult {
  try {
    if (!isRecord(rawSettings)) return unavailable("invalid-settings");
    const requiredGecks = readNumber(rawSettings, "prestigeGECK");
    if (requiredGecks === undefined) return unavailable("invalid-settings");
    if (!isRecord(rawBuildings)) return unavailable("invalid-building");
    const geck = readBuilding(rawBuildings, "GasSpaceDockGECK");
    if (geck === undefined || !finiteNonNegative(geck["count"])) {
      return unavailable("invalid-building", "GasSpaceDockGECK.count");
    }
    // Legacy used this achievement result truthily (`ach && ...`); coerce a
    // falsy non-boolean rather than reject.
    const lamentisStandardFive = Boolean(
      isAchievementUnlocked("lamentis", 5, "standard"),
    );
    return Object.freeze({
      status: "ready",
      view: Object.freeze({
        settings: Object.freeze({ requiredGecks }),
        buildings: Object.freeze({ gecks: geck["count"] }),
        achievement: Object.freeze({ lamentisStandardFive }),
      }),
    });
  } catch {
    return unavailable("inaccessible-data");
  }
}

/** Samples the complete prestige decision surface once and freezes it. */
export function readPrestigeEligibilityView(
  rawSettings: unknown,
  rawGame: unknown,
  rawResources: unknown,
  rawBuildings: unknown,
  rawTechIds: unknown,
  rawMechManager: unknown,
  haveTech: ExternalQuery,
  isAchievementUnlocked: ExternalQuery,
): PrestigeEligibilityReadResult {
  try {
    if (!isRecord(rawSettings)) return unavailable("invalid-settings");
    const settings = {
      autoPrestige: readBoolean(rawSettings, "autoPrestige"),
      waitForArpa: readBoolean(rawSettings, "prestigeWaitAT"),
      selectedType:
        typeof rawSettings["prestigeType"] === "string"
          ? rawSettings["prestigeType"]
          : undefined,
      requiredBioseedProbes: readNumber(rawSettings, "prestigeBioseedProbes"),
      requiredGecks: readNumber(rawSettings, "prestigeGECK"),
      minimumBlackholeMass: readNumber(rawSettings, "prestigeWhiteholeMinMass"),
      requirePillar: readBoolean(rawSettings, "prestigeAscensionPillar"),
      autoMech: readBoolean(rawSettings, "autoMech"),
      maximumMechPotential: readNumber(rawSettings, "prestigeDemonicPotential"),
      minimumSpireFloor: readNumber(rawSettings, "prestigeDemonicFloor"),
    };
    for (const [field, value] of Object.entries(settings)) {
      if (value === undefined) return unavailable("invalid-settings", field);
    }

    if (!isRecord(rawGame)) return unavailable("invalid-game-state");
    const global = rawGame["global"];
    if (!isRecord(global)) return unavailable("invalid-game-state", "global");
    const gameSettings = global["settings"];
    const race = global["race"];
    const pillars = global["pillars"];
    const interstellar = global["interstellar"];
    if (
      !isRecord(gameSettings) ||
      !isRecord(race) ||
      !isRecord(pillars) ||
      !isRecord(interstellar) ||
      typeof race["species"] !== "string" ||
      typeof race["universe"] !== "string" ||
      !finiteNonNegative(gameSettings["at"])
    ) {
      return unavailable("invalid-game-state");
    }
    const alevel = rawGame["alevel"];
    if (typeof alevel !== "function") {
      return unavailable("invalid-game-state", "alevel");
    }
    const ascensionLevel = alevel.call(rawGame);
    if (!finiteNonNegative(ascensionLevel)) {
      return unavailable("invalid-game-state", "alevel");
    }
    const rawPillarLevel = pillars[race["species"]];
    if (rawPillarLevel !== undefined && !finiteNonNegative(rawPillarLevel)) {
      return unavailable("invalid-game-state", "pillarLevel");
    }
    const pillarLevel = rawPillarLevel as number | undefined;
    const rawEngine = interstellar["stellar_engine"];
    let blackholeMass = 0;
    let blackholeExotic = 0;
    if (rawEngine !== null && rawEngine !== undefined) {
      if (
        !isRecord(rawEngine) ||
        !finiteNonNegative(rawEngine["mass"]) ||
        !finiteNonNegative(rawEngine["exotic"])
      ) {
        return unavailable("invalid-game-state", "stellar_engine");
      }
      blackholeMass = rawEngine["mass"];
      blackholeExotic = rawEngine["exotic"];
    }

    if (!isRecord(rawResources)) return unavailable("invalid-resource");
    const harmony = rawResources["Harmony"];
    if (!isRecord(harmony) || !finiteNonNegative(harmony["currentQuantity"])) {
      return unavailable("invalid-resource", "Harmony");
    }

    if (!isRecord(rawBuildings)) return unavailable("invalid-building");
    const buildingIds = [
      "GasSpaceDock",
      "GasSpaceDockShipSegment",
      "GasSpaceDockProbe",
      "GasSpaceDockGECK",
      "SiriusAscend",
      "PitAbsorptionChamber",
      "PitSoulCapacitor",
      "SpireTower",
    ] as const;
    const buildingRecords: Record<string, Record<PropertyKey, unknown>> = {};
    for (const id of buildingIds) {
      const building = readBuilding(rawBuildings, id);
      if (building === undefined) return unavailable("invalid-building", id);
      buildingRecords[id] = building;
    }
    for (const id of [
      "GasSpaceDock",
      "GasSpaceDockShipSegment",
      "GasSpaceDockProbe",
      "GasSpaceDockGECK",
      "PitAbsorptionChamber",
      "SpireTower",
    ]) {
      const building = buildingRecords[id];
      if (building === undefined || !finiteNonNegative(building["count"])) {
        return unavailable("invalid-building", `${id}.count`);
      }
    }
    const siriusAscendUnlocked = callBoolean(
      buildingRecords["SiriusAscend"]!,
      "isUnlocked",
    );
    if (siriusAscendUnlocked === undefined) {
      return unavailable("invalid-building");
    }
    // TRANSITIONAL: This aggregate reader feeds cataclysm/bioseed/whitehole/
    // apocalypse/demonic eligibility, none of which consume soulCapacitorEnergy
    // — only witch-ascension does, via its own narrow
    // readWitchAscensionEligibilityView. The Soul Capacitor (game tech reqs
    // `forbidden:2`, witch-hunter only) never exists on a demonic-infusion,
    // bioseed, or whitehole run, so hard-requiring its live instance here
    // silently failed the whole read for every non-witch prestige. Coerce the
    // absent lazily-initialized building to 0, the way legacy per-type
    // eligibility did (it never read it). Remove when this monolith is split
    // into narrow per-type readers.
    const capacitorInstance = buildingRecords["PitSoulCapacitor"]!["instance"];
    const soulCapacitorEnergy =
      isRecord(capacitorInstance) &&
      finiteNonNegative(capacitorInstance["energy"])
        ? capacitorInstance["energy"]
        : 0;

    if (!isRecord(rawTechIds)) return unavailable("invalid-tech");
    const techIds = [
      "tech-dial_it_to_11",
      "tech-exotic_infusion",
      "tech-infusion_check",
      "tech-infusion_confirm",
      "tech-protocol66",
      "tech-protocol66a",
      "tech-demonic_infusion",
      "tech-final_ingredient",
    ] as const;
    const techStates: Record<
      string,
      { readonly unlocked: boolean; readonly affordable: boolean }
    > = {};
    for (const id of techIds) {
      const state = readTechState(
        rawTechIds,
        id,
        id === "tech-demonic_infusion" || id === "tech-final_ingredient",
      );
      if (state === undefined) return unavailable("invalid-tech", id);
      techStates[id] = state;
    }

    if (!isRecord(rawMechManager)) return unavailable("invalid-mech-state");
    const mechActive = rawMechManager["isActive"];
    const mechPotential = rawMechManager["mechsPotential"];
    if (typeof mechActive !== "boolean" || !finiteNonNegative(mechPotential)) {
      return unavailable("invalid-mech-state");
    }

    // TRANSITIONAL: Legacy `haveTech`/achievement queries return a falsy
    // non-boolean (e.g. `undefined` when a tech tree was never touched — a
    // demonic-infusion run has no `forbidden`/`dish` techs) and legacy consumed
    // them truthily (`if (haveTech(...))`, `!haveTech(...)`, `ach && ...`).
    // Coerce to match rather than rejecting the whole aggregate read; the
    // demonic/whitehole/apocalypse/cataclysm consumers do not even read
    // forbidden/dish. Remove when this monolith is split into narrow readers.
    const forbiddenLevelFive = Boolean(haveTech("forbidden", 5));
    const dishLevelTwo = Boolean(haveTech("dish", 2));
    const lamentisStandardFive = Boolean(
      isAchievementUnlocked("lamentis", 5, "standard"),
    );

    const view: PrestigeEligibilityView = {
      settings: Object.freeze(settings as PrestigeEligibilityView["settings"]),
      game: Object.freeze({
        activeArpaProjects: gameSettings["at"],
        species: race["species"],
        universe: race["universe"],
        fasting: Boolean(race["fasting"]),
        ascensionLevel,
        ...(pillarLevel === undefined
          ? {}
          : { speciesPillarLevel: pillarLevel }),
        blackholeMass,
        blackholeExotic,
      }),
      resources: Object.freeze({ harmony: harmony["currentQuantity"] }),
      buildings: Object.freeze({
        spaceDock: buildingRecords["GasSpaceDock"]!["count"] as number,
        shipSegments: buildingRecords["GasSpaceDockShipSegment"]![
          "count"
        ] as number,
        probes: buildingRecords["GasSpaceDockProbe"]!["count"] as number,
        gecks: buildingRecords["GasSpaceDockGECK"]!["count"] as number,
        siriusAscendUnlocked,
        absorptionChambers: buildingRecords["PitAbsorptionChamber"]![
          "count"
        ] as number,
        soulCapacitorEnergy,
        spireFloor: buildingRecords["SpireTower"]!["count"] as number,
      }),
      tech: Object.freeze({
        cataclysmUnlocked: techStates["tech-dial_it_to_11"]!.unlocked,
        exoticInfusionUnlocked: techStates["tech-exotic_infusion"]!.unlocked,
        infusionCheckUnlocked: techStates["tech-infusion_check"]!.unlocked,
        infusionConfirmUnlocked: techStates["tech-infusion_confirm"]!.unlocked,
        protocol66Unlocked: techStates["tech-protocol66"]!.unlocked,
        protocol66aUnlocked: techStates["tech-protocol66a"]!.unlocked,
        demonicInfusionUnlocked: techStates["tech-demonic_infusion"]!.unlocked,
        demonicInfusionAffordable:
          techStates["tech-demonic_infusion"]!.affordable,
        finalIngredientUnlocked: techStates["tech-final_ingredient"]!.unlocked,
        finalIngredientAffordable:
          techStates["tech-final_ingredient"]!.affordable,
        forbiddenLevelFive,
        dishLevelTwo,
      }),
      achievement: Object.freeze({ lamentisStandardFive }),
      mech: Object.freeze({ active: mechActive, potential: mechPotential }),
    };

    return Object.freeze({ status: "ready", view: Object.freeze(view) });
  } catch {
    return unavailable("inaccessible-data");
  }
}
