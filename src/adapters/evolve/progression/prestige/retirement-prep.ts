import type {
  RetirementAssistInput,
  RetirementPreparationInput,
  RetirementThresholds,
} from "../../../../domain/progression/prestige/retirement-prep.ts";

type RetirementReadReason =
  | "inaccessible-data"
  | "invalid-building"
  | "invalid-game-state"
  | "invalid-resource"
  | "invalid-settings"
  | "invalid-thresholds";

type Unavailable = {
  readonly status: "unavailable";
  readonly reason: RetirementReadReason;
  readonly field?: string;
};

export type RetirementAssistReadResult =
  | {
      readonly status: "ready";
      readonly input: Readonly<RetirementAssistInput>;
    }
  | Unavailable;

export type RetirementPreparationReadResult =
  | {
      readonly status: "ready";
      readonly input: Readonly<RetirementPreparationInput>;
    }
  | Unavailable;

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function unavailable(
  reason: RetirementReadReason,
  field?: string,
): Unavailable {
  return Object.freeze(
    field === undefined
      ? { status: "unavailable", reason }
      : { status: "unavailable", reason, field },
  );
}

export function readRetirementAssistInput(
  rawSettings: unknown,
  rawGame: unknown,
  isolationResearched: boolean,
): RetirementAssistReadResult {
  try {
    if (!isRecord(rawSettings)) return unavailable("invalid-settings");
    const assist = rawSettings["retirementChallengeAssist"];
    if (assist !== undefined && typeof assist !== "boolean") {
      return unavailable("invalid-settings", "retirementChallengeAssist");
    }

    if (!isRecord(rawGame)) return unavailable("invalid-game-state");
    const global = rawGame["global"];
    if (!isRecord(global)) return unavailable("invalid-game-state");
    const race = global["race"];
    if (!isRecord(race)) return unavailable("invalid-game-state", "race");

    return Object.freeze({
      status: "ready",
      input: Object.freeze({
        assistEnabled: assist === true,
        truepath: Boolean(race["truepath"]),
        retirePrestige: rawSettings["prestigeType"] === "retire",
        isolationResearched,
      }),
    });
  } catch {
    return unavailable("inaccessible-data");
  }
}

function readBuilding(
  rawBuildings: Record<PropertyKey, unknown>,
  id: string,
): { name: string; count: number } | undefined {
  const building = rawBuildings[id];
  if (!isRecord(building)) return undefined;
  const name = building["name"];
  const count = building["count"];
  if (typeof name !== "string" || !finiteNonNegative(count)) return undefined;
  return { name, count };
}

export function readRetirementPreparationInput(
  rawBuildings: unknown,
  rawResources: unknown,
  rawThresholds: Readonly<RetirementThresholds>,
): RetirementPreparationReadResult {
  try {
    for (const key of [
      "fusionGenerators",
      "factories",
      "scienceLabs",
      "graphene",
    ] as const) {
      if (!finiteNonNegative(rawThresholds[key])) {
        return unavailable("invalid-thresholds", key);
      }
    }

    if (!isRecord(rawBuildings)) return unavailable("invalid-building");
    const fusionGenerators = readBuilding(rawBuildings, "TauFusionGenerator");
    if (!fusionGenerators) {
      return unavailable("invalid-building", "TauFusionGenerator");
    }
    const factories = readBuilding(rawBuildings, "TauFactory");
    if (!factories) return unavailable("invalid-building", "TauFactory");
    const scienceLabs = readBuilding(rawBuildings, "TauDiseaseLab");
    if (!scienceLabs) return unavailable("invalid-building", "TauDiseaseLab");

    if (!isRecord(rawResources)) return unavailable("invalid-resource");
    const rawGraphene = rawResources["Graphene"];
    if (!isRecord(rawGraphene)) {
      return unavailable("invalid-resource", "Graphene");
    }
    const grapheneName = rawGraphene["name"];
    const currentQuantity = rawGraphene["currentQuantity"];
    const maxQuantity = rawGraphene["maxQuantity"];
    if (typeof grapheneName !== "string") {
      return unavailable("invalid-resource", "Graphene.name");
    }
    if (!finiteNonNegative(currentQuantity)) {
      return unavailable("invalid-resource", "Graphene.currentQuantity");
    }
    if (!finiteNonNegative(maxQuantity)) {
      return unavailable("invalid-resource", "Graphene.maxQuantity");
    }

    return Object.freeze({
      status: "ready",
      input: Object.freeze({
        fusionGenerators: Object.freeze(fusionGenerators),
        factories: Object.freeze(factories),
        scienceLabs: Object.freeze(scienceLabs),
        graphene: Object.freeze({
          name: grapheneName,
          currentQuantity,
          maxQuantity,
        }),
        thresholds: Object.freeze({ ...rawThresholds }),
      }),
    });
  } catch {
    return unavailable("inaccessible-data");
  }
}
