import type {
  EvolutionResultInput,
  EvolutionTraitView,
} from "../../../../domain/progression/evolution/evolution-result.ts";

type EvolutionReadReason =
  | "inaccessible-data"
  | "invalid-game-state"
  | "invalid-race-model"
  | "invalid-settings"
  | "invalid-trait";

type Unavailable = {
  readonly status: "unavailable";
  readonly reason: EvolutionReadReason;
  readonly field?: string;
};

export type EvolutionResultReadResult =
  | { readonly status: "ready"; readonly input: Readonly<EvolutionResultInput> }
  | Unavailable;

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function unavailable(reason: EvolutionReadReason, field?: string): Unavailable {
  return Object.freeze(
    field === undefined
      ? { status: "unavailable", reason }
      : { status: "unavailable", reason, field },
  );
}

function callWeighting(
  race: Record<PropertyKey, unknown>,
  returnGoals: boolean,
): unknown {
  const getWeighting = race["getWeighting"];
  if (typeof getWeighting !== "function") return undefined;
  return returnGoals ? getWeighting.call(race, true) : getWeighting.call(race);
}

export function readEvolutionResultInput(
  rawSettings: unknown,
  rawGame: unknown,
  rawRaces: unknown,
  rawTraitManager: unknown,
): EvolutionResultReadResult {
  try {
    if (!isRecord(rawSettings)) return unavailable("invalid-settings");
    const userEvolutionTarget = rawSettings["userEvolutionTarget"];
    if (typeof userEvolutionTarget !== "string") {
      return unavailable("invalid-settings", "userEvolutionTarget");
    }

    const global = isRecord(rawGame) ? rawGame["global"] : undefined;
    const race = isRecord(global) ? global["race"] : undefined;
    if (!isRecord(race)) return unavailable("invalid-game-state", "race");
    const species = race["species"];
    if (typeof species !== "string") {
      return unavailable("invalid-game-state", "race.species");
    }

    if (!isRecord(rawRaces)) return unavailable("invalid-race-model");
    const speciesRace = rawRaces[species];
    if (!isRecord(speciesRace)) {
      return unavailable("invalid-race-model", species);
    }
    const speciesName = speciesRace["name"];
    if (typeof speciesName !== "string") {
      return unavailable("invalid-race-model", `${species}.name`);
    }
    const speciesWeighting = callWeighting(speciesRace, false);
    if (!isFinite(speciesWeighting)) {
      return unavailable("invalid-race-model", `${species}.weighting`);
    }
    const rawGoals = callWeighting(speciesRace, true);
    if (
      !Array.isArray(rawGoals) ||
      !rawGoals.every((goal) => typeof goal === "string")
    ) {
      return unavailable("invalid-race-model", `${species}.goals`);
    }

    let bestWeighting = Number.NEGATIVE_INFINITY;
    for (const [id, candidate] of Object.entries(rawRaces)) {
      if (!isRecord(candidate)) {
        return unavailable("invalid-race-model", id);
      }
      const weighting = callWeighting(candidate, false);
      if (!isFinite(weighting)) {
        return unavailable("invalid-race-model", `${id}.weighting`);
      }
      bestWeighting = Math.max(bestWeighting, weighting);
    }

    let targetHabitability: number | undefined;
    if (userEvolutionTarget !== "auto" && userEvolutionTarget !== species) {
      const targetRace = rawRaces[userEvolutionTarget];
      const getHabitability = isRecord(targetRace)
        ? targetRace["getHabitability"]
        : undefined;
      if (typeof getHabitability !== "function") {
        return unavailable(
          "invalid-race-model",
          `${userEvolutionTarget}.getHabitability`,
        );
      }
      const habitability = getHabitability.call(targetRace);
      if (!isFinite(habitability)) {
        return unavailable(
          "invalid-race-model",
          `${userEvolutionTarget}.habitability`,
        );
      }
      targetHabitability = habitability;
    }

    const traits: EvolutionTraitView[] = [];
    const autoMutateTraits = Boolean(rawSettings["autoMutateTraits"]);
    if (autoMutateTraits) {
      const gameRaces = isRecord(rawGame) ? rawGame["races"] : undefined;
      const baseRace = isRecord(gameRaces) ? gameRaces[species] : undefined;
      const baseTraits = isRecord(baseRace) ? baseRace["traits"] : undefined;
      if (!isRecord(baseTraits)) {
        return unavailable("invalid-game-state", "races.traits");
      }
      const priorityList = isRecord(rawTraitManager)
        ? rawTraitManager["priorityList"]
        : undefined;
      if (!Array.isArray(priorityList)) {
        return unavailable("invalid-trait", "priorityList");
      }
      for (const rawTrait of priorityList) {
        if (!isRecord(rawTrait)) return unavailable("invalid-trait");
        const traitName = rawTrait["traitName"];
        const name = rawTrait["name"];
        if (typeof traitName !== "string" || typeof name !== "string") {
          return unavailable("invalid-trait");
        }
        traits.push({
          name,
          resetEnabled: Boolean(rawTrait["resetEnabled"]),
          gained: Boolean(race[traitName]),
          inheritedFromBase: Boolean(baseTraits[traitName]),
        });
      }
    }

    return Object.freeze({
      status: "ready",
      input: Object.freeze({
        autoEvolution: Boolean(rawSettings["autoEvolution"]),
        evolutionBackup: Boolean(rawSettings["evolutionBackup"]),
        autoMutateTraits,
        userEvolutionTarget,
        species,
        speciesRace: Object.freeze({
          name: speciesName,
          weighting: speciesWeighting,
          goals: Object.freeze([...rawGoals] as string[]),
        }),
        bestWeighting,
        ...(targetHabitability === undefined ? {} : { targetHabitability }),
        traits: Object.freeze(traits),
      }),
    });
  } catch {
    return unavailable("inaccessible-data");
  }
}
