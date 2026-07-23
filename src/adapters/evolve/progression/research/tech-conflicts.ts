import type { TechConflictInput } from "../../../../domain/progression/research/tech-conflicts.ts";
import type { Clock } from "../../../../ports/clock.ts";

type TechConflictUnavailableReason =
  | "inaccessible-data"
  | "invalid-clock"
  | "invalid-external-result"
  | "invalid-game-state"
  | "invalid-resource"
  | "invalid-settings"
  | "invalid-state"
  | "invalid-target";

export type TechConflictInputReadResult =
  | {
      readonly status: "ready";
      readonly input: Readonly<TechConflictInput>;
    }
  | {
      readonly status: "unavailable";
      readonly reason: TechConflictUnavailableReason;
      readonly field?: string;
    };

interface TechConflictAdapterDependencies {
  readonly clock: Clock;
  readonly guardActive: (setting: string) => unknown;
  readonly guardBananaRepublicActive: () => unknown;
  readonly retirementChallengeAssistActive: () => unknown;
  readonly retirementPreparationMissing: () => unknown;
  readonly isAchievementUnlocked: (
    achievement: string,
    level: number,
  ) => unknown;
  readonly fanatAchievements: unknown;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function unavailable(
  reason: TechConflictUnavailableReason,
  field?: string,
): TechConflictInputReadResult {
  return Object.freeze(
    field === undefined
      ? { status: "unavailable", reason }
      : { status: "unavailable", reason, field },
  );
}

function booleanSetting(
  settings: Record<PropertyKey, unknown>,
  field: string,
): boolean | undefined {
  const value = settings[field];
  return typeof value === "boolean" ? value : undefined;
}

function stringSetting(
  settings: Record<PropertyKey, unknown>,
  field: string,
): string | undefined {
  const value = settings[field];
  return typeof value === "string" ? value : undefined;
}

function numberSetting(
  settings: Record<PropertyKey, unknown>,
  field: string,
): number | undefined {
  const value = settings[field];
  return finiteNonNegative(value) ? value : undefined;
}

function readBooleanResult(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** Maps one complete research-conflict decision, including a deterministic time sample. */
export function readTechConflictInput(
  rawTech: unknown,
  rawSettings: unknown,
  rawResources: unknown,
  rawState: unknown,
  rawGame: unknown,
  dependencies: TechConflictAdapterDependencies,
): TechConflictInputReadResult {
  try {
    if (
      !isRecord(rawTech) ||
      typeof rawTech["_vueBinding"] !== "string" ||
      !isRecord(rawTech["cost"])
    ) {
      return unavailable("invalid-target");
    }
    const itemId = rawTech["_vueBinding"];
    const rawSoulGemCost = rawTech["cost"]["Soul_Gem"];
    if (rawSoulGemCost !== undefined && !finiteNonNegative(rawSoulGemCost)) {
      return unavailable("invalid-target", "cost.Soul_Gem");
    }

    if (!isRecord(rawSettings)) return unavailable("invalid-settings");
    const rawIgnoredResearch = rawSettings["researchIgnore"];
    if (
      !Array.isArray(rawIgnoredResearch) ||
      !rawIgnoredResearch.every((value) => typeof value === "string")
    ) {
      return unavailable("invalid-settings", "researchIgnore");
    }
    const settings = {
      ignoredResearch: Object.freeze([...rawIgnoredResearch] as string[]),
      prestigeType: stringSetting(rawSettings, "prestigeType"),
      saveWhiteholeSoulGems: booleanSetting(
        rawSettings,
        "prestigeWhiteholeSaveGems",
      ),
      vaccinationStrategy: stringSetting(rawSettings, "prestigeVaxStrat"),
      useDemonicBomb: booleanSetting(rawSettings, "prestigeDemonicBomb"),
      allowForeignUnification: booleanSetting(
        rawSettings,
        "foreignUnification",
      ),
      stabilizeBlackhole: booleanSetting(
        rawSettings,
        "prestigeWhiteholeStabiliseMass",
      ),
      stabilizationCooldownSeconds: numberSetting(
        rawSettings,
        "prestigeWhiteholeStabiliseCooldown",
      ),
      theologyChoiceOne: stringSetting(rawSettings, "userResearchTheology_1"),
      theologyChoiceTwo: stringSetting(rawSettings, "userResearchTheology_2"),
      alienGiftKnowledge: numberSetting(rawSettings, "fleetAlienGiftKnowledge"),
    };
    for (const [field, value] of Object.entries(settings)) {
      if (value === undefined) return unavailable("invalid-settings", field);
    }

    if (!isRecord(rawResources)) return unavailable("invalid-resource");
    const soulGems = rawResources["Soul_Gem"];
    const knowledge = rawResources["Knowledge"];
    if (
      !isRecord(soulGems) ||
      !finiteNonNegative(soulGems["currentQuantity"])
    ) {
      return unavailable("invalid-resource", "Soul_Gem.currentQuantity");
    }
    if (!isRecord(knowledge) || !finiteNonNegative(knowledge["maxQuantity"])) {
      return unavailable("invalid-resource", "Knowledge.maxQuantity");
    }

    if (!isRecord(rawState)) return unavailable("invalid-state");
    const rawLastAtMs = rawState["whiteholeLastStabilise"];
    if (
      rawLastAtMs !== undefined &&
      rawLastAtMs !== 0 &&
      !finiteNonNegative(rawLastAtMs)
    ) {
      return unavailable("invalid-state", "whiteholeLastStabilise");
    }
    const lastAtMs =
      rawLastAtMs === undefined || rawLastAtMs === 0
        ? null
        : (rawLastAtMs as number);

    if (!isRecord(rawGame)) return unavailable("invalid-game-state");
    const global = rawGame["global"];
    const alevel = rawGame["alevel"];
    const race = isRecord(global) ? global["race"] : undefined;
    if (
      !isRecord(race) ||
      typeof race["species"] !== "string" ||
      typeof race["gods"] !== "string" ||
      typeof alevel !== "function"
    ) {
      return unavailable("invalid-game-state");
    }
    const achievementLevel = alevel.call(rawGame);
    if (!finiteNonNegative(achievementLevel)) {
      return unavailable("invalid-game-state", "alevel");
    }
    const nowMs =
      itemId === "tech-stabilize_blackhole" ? dependencies.clock.nowMs() : 0;
    if (!finiteNonNegative(nowMs)) return unavailable("invalid-clock");

    let bananaRepublic = false;
    let cultOfPersonality = false;
    let pacifist = false;
    if (itemId === "tech-unification2" || itemId === "tech-unite") {
      bananaRepublic = readBooleanResult(
        dependencies.guardBananaRepublicActive(),
      ) as boolean;
      cultOfPersonality = readBooleanResult(
        dependencies.guardActive("guardCultOfPersonality"),
      ) as boolean;
      pacifist = readBooleanResult(
        dependencies.guardActive("guardPacifist"),
      ) as boolean;
      if (
        bananaRepublic === undefined ||
        cultOfPersonality === undefined ||
        pacifist === undefined
      ) {
        return unavailable("invalid-external-result", "guard");
      }
    }

    let retirementAssist = false;
    let retirementMissing: readonly string[] = Object.freeze([]);
    if (itemId === "tech-isolation_protocol") {
      const active = readBooleanResult(
        dependencies.retirementChallengeAssistActive(),
      );
      if (active === undefined) {
        return unavailable("invalid-external-result", "retirementAssist");
      }
      retirementAssist = active;
      if (active) {
        const missing = dependencies.retirementPreparationMissing();
        if (
          !Array.isArray(missing) ||
          !missing.every((value) => typeof value === "string")
        ) {
          return unavailable(
            "invalid-external-result",
            "retirementPreparation",
          );
        }
        retirementMissing = Object.freeze([...missing]);
      }
    }

    let secondEvolution = false;
    const fanaticismAchievements: TechConflictInput["fanaticismAchievements"][number][] =
      [];
    if (itemId === "tech-anthropology" || itemId === "tech-fanaticism") {
      const active = readBooleanResult(
        dependencies.guardActive("guardSecondEvolution"),
      );
      if (active === undefined) {
        return unavailable("invalid-external-result", "secondEvolution");
      }
      secondEvolution = active;
      if (!active) {
        if (!Array.isArray(dependencies.fanatAchievements)) {
          return unavailable("invalid-external-result", "fanatAchievements");
        }
        for (const rawCombination of dependencies.fanatAchievements) {
          if (
            !isRecord(rawCombination) ||
            typeof rawCombination["race"] !== "string" ||
            typeof rawCombination["god"] !== "string" ||
            typeof rawCombination["achieve"] !== "string"
          ) {
            return unavailable("invalid-external-result", "fanatAchievements");
          }
          const unlocked = dependencies.isAchievementUnlocked(
            rawCombination["achieve"],
            achievementLevel,
          );
          if (typeof unlocked !== "boolean") {
            return unavailable("invalid-external-result", "achievement");
          }
          fanaticismAchievements.push(
            Object.freeze({
              race: rawCombination["race"],
              god: rawCombination["god"],
              unlocked,
            }),
          );
        }
      }
    }

    const input: TechConflictInput = {
      itemId,
      soulGemCost:
        rawSoulGemCost === undefined ? null : (rawSoulGemCost as number),
      settings: Object.freeze(
        settings as unknown as TechConflictInput["settings"],
      ),
      resources: Object.freeze({
        soulGems: soulGems["currentQuantity"],
        maximumKnowledge: knowledge["maxQuantity"],
      }),
      stabilization: Object.freeze({ lastAtMs, nowMs }),
      race: Object.freeze({
        species: race["species"],
        gods: race["gods"],
        achievementLevel,
      }),
      guards: Object.freeze({
        bananaRepublic,
        cultOfPersonality,
        pacifist,
        secondEvolution,
        retirementAssist,
        retirementMissing,
      }),
      fanaticismAchievements: Object.freeze(fanaticismAchievements),
    };
    return Object.freeze({ status: "ready", input: Object.freeze(input) });
  } catch {
    return unavailable("inaccessible-data");
  }
}
