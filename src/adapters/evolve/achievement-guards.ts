import type {
  AchievementGuardInput,
  AchievementGuardName,
  AchievementStarLevelContext,
} from "../../domain/progression/prestige/achievement-guards.ts";
import {
  isAchievementGuardActive,
  isAchievementGuardName,
} from "../../domain/progression/prestige/achievement-guards.ts";

type AchievementReadReason =
  | "inaccessible-data"
  | "invalid-achievement"
  | "invalid-building"
  | "invalid-game-state"
  | "invalid-settings"
  | "invalid-universe";

export type AchievementStarReadResult =
  | { readonly status: "ready"; readonly star: number }
  | {
      readonly status: "unavailable";
      readonly reason: AchievementReadReason;
      readonly field?: string;
    };

export type AchievementStarLevelReadResult =
  | {
      readonly status: "ready";
      readonly context: Readonly<AchievementStarLevelContext>;
    }
  | {
      readonly status: "unavailable";
      readonly reason: AchievementReadReason;
      readonly field?: string;
    };

export type AchievementGuardReadResult =
  | {
      readonly status: "ready";
      readonly input: Readonly<AchievementGuardInput>;
    }
  | { readonly status: "inactive" }
  | {
      readonly status: "unavailable";
      readonly reason: AchievementReadReason;
      readonly field?: string;
      readonly fallbackActive: boolean;
    };

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function starUnavailable(
  reason: AchievementReadReason,
  field?: string,
): AchievementStarReadResult {
  return Object.freeze(
    field === undefined
      ? { status: "unavailable", reason }
      : { status: "unavailable", reason, field },
  );
}

function levelUnavailable(
  reason: AchievementReadReason,
  field?: string,
): AchievementStarLevelReadResult {
  return Object.freeze(
    field === undefined
      ? { status: "unavailable", reason }
      : { status: "unavailable", reason, field },
  );
}

function guardUnavailable(
  reason: AchievementReadReason,
  fallbackActive: boolean,
  field?: string,
): AchievementGuardReadResult {
  return Object.freeze(
    field === undefined
      ? { status: "unavailable", reason, fallbackActive }
      : { status: "unavailable", reason, field, fallbackActive },
  );
}

function readGameParts(rawGame: unknown):
  | {
      readonly game: Record<PropertyKey, unknown>;
      readonly global: Record<PropertyKey, unknown>;
      readonly stats: Record<PropertyKey, unknown>;
    }
  | undefined {
  if (!isRecord(rawGame)) return undefined;
  const global = rawGame["global"];
  if (!isRecord(global)) return undefined;
  const stats = global["stats"];
  if (!isRecord(stats)) return undefined;
  return { game: rawGame, global, stats };
}

function readCurrentLevel(rawGame: unknown): number | undefined {
  if (!isRecord(rawGame)) return undefined;
  const alevel = rawGame["alevel"];
  if (typeof alevel !== "function") return undefined;
  const value = alevel.call(rawGame);
  return finiteNonNegative(value) ? value : undefined;
}

function readFeatStar(rawGame: unknown, id: string): AchievementStarReadResult {
  try {
    const parts = readGameParts(rawGame);
    if (!parts) return starUnavailable("invalid-game-state");
    const rawFeats = parts.stats["feat"];
    if (rawFeats === undefined)
      return Object.freeze({ status: "ready", star: 0 });
    if (!isRecord(rawFeats))
      return starUnavailable("invalid-achievement", "feat");
    const value = rawFeats[id];
    if (value === undefined || value === null) {
      return Object.freeze({ status: "ready", star: 0 });
    }
    return finiteNonNegative(value)
      ? Object.freeze({ status: "ready", star: value })
      : starUnavailable("invalid-achievement", `feat.${id}`);
  } catch {
    return starUnavailable("inaccessible-data");
  }
}

export function readAchievementStarLevelContext(
  rawContext: unknown,
): AchievementStarLevelReadResult {
  if (!isRecord(rawContext)) return levelUnavailable("invalid-settings");
  const mapping = {
    challengePlasmid: "challenge_plasmid",
    challengeTrade: "challenge_trade",
    challengeCraft: "challenge_craft",
    challengeCrispr: "challenge_crispr",
  } as const;
  const context: Record<keyof AchievementStarLevelContext, boolean> = {
    challengePlasmid: false,
    challengeTrade: false,
    challengeCraft: false,
    challengeCrispr: false,
  };
  for (const [target, source] of Object.entries(mapping) as [
    keyof AchievementStarLevelContext,
    string,
  ][]) {
    const value = rawContext[source];
    if (value !== undefined && typeof value !== "boolean") {
      return levelUnavailable("invalid-settings", source);
    }
    context[target] = value === true;
  }
  return Object.freeze({ status: "ready", context: Object.freeze(context) });
}

export function readAchievementStar(
  rawGame: unknown,
  rawPoly: unknown,
  id: string,
  universe?: string,
): AchievementStarReadResult {
  try {
    const parts = readGameParts(rawGame);
    if (!parts) return starUnavailable("invalid-game-state");
    if (!isRecord(rawPoly)) return starUnavailable("invalid-universe");
    const universeAffix = rawPoly["universeAffix"];
    if (typeof universeAffix !== "function") {
      return starUnavailable("invalid-universe");
    }
    const affix = universeAffix.call(rawPoly, universe);
    if (typeof affix !== "string") return starUnavailable("invalid-universe");

    const rawAchievements = parts.stats["achieve"];
    if (!isRecord(rawAchievements)) {
      return starUnavailable("invalid-achievement", "achieve");
    }
    const rawAchievement = rawAchievements[id];
    if (rawAchievement === undefined || rawAchievement === null) {
      return Object.freeze({ status: "ready", star: 0 });
    }
    if (!isRecord(rawAchievement)) {
      return starUnavailable("invalid-achievement", `achieve.${id}`);
    }
    const value = rawAchievement[affix];
    if (value === undefined || value === null) {
      return Object.freeze({ status: "ready", star: 0 });
    }
    return finiteNonNegative(value)
      ? Object.freeze({ status: "ready", star: value })
      : starUnavailable("invalid-achievement", `achieve.${id}.${affix}`);
  } catch {
    return starUnavailable("inaccessible-data");
  }
}

function readBuildingCount(
  rawBuildings: unknown,
  id: string,
): number | undefined {
  if (!isRecord(rawBuildings)) return undefined;
  const building = rawBuildings[id];
  if (!isRecord(building)) return undefined;
  const count = building["count"];
  return finiteNonNegative(count) ? count : undefined;
}

function guardStarId(guard: AchievementGuardName): string {
  switch (guard) {
    case "guardPacifist":
      return "pacifist";
    case "guardDreaded":
      return "dreaded";
    case "guardCultOfPersonality":
      return "cult_of_personality";
    case "guardAnarchist":
      return "anarchist";
    case "guardEnergetic":
      return "energetic";
    case "guardRedDead":
      return "red_dead";
    case "guardSecondEvolution":
      return "second_evolution";
  }
}

function configuredFallback(rawSettings: unknown, guard: string): boolean {
  if (!isRecord(rawSettings)) return true;
  return (
    rawSettings["achievementGuards"] !== false && rawSettings[guard] !== false
  );
}

export function readAchievementGuardInput(
  rawSettings: unknown,
  rawGame: unknown,
  rawPoly: unknown,
  rawBuildings: unknown,
  requestedGuard: string,
): AchievementGuardReadResult {
  if (!isAchievementGuardName(requestedGuard)) {
    return Object.freeze({ status: "inactive" });
  }
  const fallback = configuredFallback(rawSettings, requestedGuard);

  try {
    if (!isRecord(rawSettings)) {
      return guardUnavailable("invalid-settings", fallback);
    }
    const master = rawSettings["achievementGuards"];
    const selected = rawSettings[requestedGuard];
    if (master === false || selected === false) {
      return Object.freeze({ status: "inactive" });
    }
    if (typeof master !== "boolean" || typeof selected !== "boolean") {
      return guardUnavailable("invalid-settings", fallback, requestedGuard);
    }

    let pacifist: Readonly<AchievementGuardInput> | undefined;
    let pacifistActive = false;
    if (requestedGuard === "guardCultOfPersonality") {
      const result = readAchievementGuardInput(
        rawSettings,
        rawGame,
        rawPoly,
        rawBuildings,
        "guardPacifist",
      );
      if (result.status === "ready") {
        pacifist = result.input;
        pacifistActive = isAchievementGuardActive(result.input);
      } else if (result.status === "inactive") {
        pacifist = Object.freeze({
          guard: "guardPacifist",
          enabled: false,
          earnedStar: 0,
          targetStar: 0,
          attacks: 0,
        });
      } else if (result.status === "unavailable") {
        pacifistActive = result.fallbackActive;
      }
    }

    const targetStar = readCurrentLevel(rawGame);
    if (targetStar === undefined) {
      return guardUnavailable(
        "invalid-game-state",
        requestedGuard === "guardCultOfPersonality"
          ? !pacifistActive
          : fallback,
        "alevel",
      );
    }
    const star =
      requestedGuard === "guardEnergetic"
        ? readFeatStar(rawGame, guardStarId(requestedGuard))
        : readAchievementStar(rawGame, rawPoly, guardStarId(requestedGuard));
    if (star.status !== "ready") {
      return guardUnavailable(
        star.reason,
        requestedGuard === "guardCultOfPersonality"
          ? !pacifistActive
          : fallback,
        star.field,
      );
    }

    const common = {
      enabled: true,
      earnedStar: star.star,
      targetStar,
    } as const;
    const parts = readGameParts(rawGame);
    if (!parts) return guardUnavailable("invalid-game-state", fallback);
    let input: AchievementGuardInput;
    switch (requestedGuard) {
      case "guardPacifist": {
        const attacks = parts.stats["attacks"];
        if (!finiteNonNegative(attacks)) {
          return guardUnavailable(
            "invalid-game-state",
            fallback,
            "stats.attacks",
          );
        }
        input = { ...common, guard: requestedGuard, attacks };
        break;
      }
      case "guardDreaded": {
        const prestigeType = rawSettings["prestigeType"];
        const dreadnoughts = readBuildingCount(rawBuildings, "Dreadnought");
        if (typeof prestigeType !== "string") {
          return guardUnavailable("invalid-settings", fallback, "prestigeType");
        }
        if (dreadnoughts === undefined) {
          return guardUnavailable("invalid-building", fallback, "Dreadnought");
        }
        input = {
          ...common,
          guard: requestedGuard,
          prestigeType,
          dreadnoughts,
        };
        break;
      }
      case "guardCultOfPersonality":
        if (!pacifist) {
          return guardUnavailable(
            "invalid-game-state",
            !pacifistActive,
            "pacifist",
          );
        }
        input = { ...common, guard: requestedGuard, pacifist };
        break;
      case "guardAnarchist": {
        const prestigeType = rawSettings["prestigeType"];
        const civic = parts.global["civic"];
        const govern = isRecord(civic) ? civic["govern"] : undefined;
        const government = isRecord(govern) ? govern["type"] : undefined;
        if (typeof prestigeType !== "string") {
          return guardUnavailable("invalid-settings", fallback, "prestigeType");
        }
        if (typeof government !== "string") {
          return guardUnavailable("invalid-game-state", fallback, "government");
        }
        input = { ...common, guard: requestedGuard, prestigeType, government };
        break;
      }
      case "guardEnergetic": {
        const prestigeType = rawSettings["prestigeType"];
        const thermalCollectors = readBuildingCount(
          rawBuildings,
          "SiriusThermalCollector",
        );
        if (typeof prestigeType !== "string") {
          return guardUnavailable("invalid-settings", fallback, "prestigeType");
        }
        if (thermalCollectors === undefined) {
          return guardUnavailable(
            "invalid-building",
            fallback,
            "SiriusThermalCollector",
          );
        }
        input = {
          ...common,
          guard: requestedGuard,
          prestigeType,
          thermalCollectors,
        };
        break;
      }
      case "guardRedDead": {
        const prestigeType = rawSettings["prestigeType"];
        const redSpaceports = readBuildingCount(rawBuildings, "RedSpaceport");
        if (typeof prestigeType !== "string") {
          return guardUnavailable("invalid-settings", fallback, "prestigeType");
        }
        if (redSpaceports === undefined) {
          return guardUnavailable("invalid-building", fallback, "RedSpaceport");
        }
        input = {
          ...common,
          guard: requestedGuard,
          prestigeType,
          redSpaceports,
        };
        break;
      }
      case "guardSecondEvolution": {
        const race = parts.global["race"];
        const species = isRecord(race) ? race["species"] : undefined;
        const gods = isRecord(race) ? race["gods"] : undefined;
        if (typeof species !== "string" || typeof gods !== "string") {
          return guardUnavailable("invalid-game-state", fallback, "race");
        }
        input = { ...common, guard: requestedGuard, species, gods };
        break;
      }
    }
    return Object.freeze({ status: "ready", input: Object.freeze(input) });
  } catch {
    return guardUnavailable("inaccessible-data", fallback);
  }
}
