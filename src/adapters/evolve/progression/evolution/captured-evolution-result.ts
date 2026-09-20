import type { EvolutionResultInput } from "../../../../domain/progression/evolution/evolution-result.ts";
import type { EvolutionResultSample } from "../../../../ports/evolution.ts";
import { isNonArrayRecord, readProperty } from "../../../validation.ts";
import { sampleCapturedEvolutionRaceCatalog } from "./captured-evolution-race-catalog.ts";

function capturedEvolutionRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return isNonArrayRecord(value) ? value : undefined;
}

/**
 * Captures the result-check input from the same race catalog as target selection. The captured
 * runtime has no compatibility trait manager, so enabling Auto Mutate Traits is deliberately
 * unavailable here rather than silently pretending the priority list was observed.
 */
export function readCapturedEvolutionResult(
  rootValue: unknown,
  settingsValue: unknown,
): EvolutionResultSample {
  const root = capturedEvolutionRecord(rootValue);
  const settings = capturedEvolutionRecord(settingsValue);
  const race = capturedEvolutionRecord(readProperty(root, "race"));
  const userEvolutionTarget = settings?.["userEvolutionTarget"];
  const species = race?.["species"];
  if (typeof userEvolutionTarget !== "string") {
    return Object.freeze({
      status: "unavailable",
      reason: "userEvolutionTarget unavailable",
    });
  }
  if (typeof species !== "string") {
    return Object.freeze({
      status: "unavailable",
      reason: "race.species unavailable",
    });
  }
  if (settings?.["autoMutateTraits"] === true) {
    return Object.freeze({
      status: "unavailable",
      reason: "captured mutation priority unavailable",
    });
  }

  const catalog = sampleCapturedEvolutionRaceCatalog(rootValue, settingsValue);
  if (catalog.status !== "ready") {
    return Object.freeze({ status: "unavailable", reason: catalog.reason });
  }
  const speciesRace = catalog.races.find(
    (candidate) => candidate.id === species,
  );
  if (speciesRace === undefined) {
    return Object.freeze({
      status: "unavailable",
      reason: `species ${species} unavailable`,
    });
  }
  const targetRace =
    userEvolutionTarget !== "auto" && userEvolutionTarget !== species
      ? catalog.races.find((candidate) => candidate.id === userEvolutionTarget)
      : undefined;
  if (
    userEvolutionTarget !== "auto" &&
    userEvolutionTarget !== species &&
    targetRace === undefined
  ) {
    return Object.freeze({
      status: "unavailable",
      reason: `target ${userEvolutionTarget} unavailable`,
    });
  }

  const input: EvolutionResultInput = Object.freeze({
    autoEvolution: settings?.["autoEvolution"] === true,
    evolutionBackup: settings?.["evolutionBackup"] === true,
    autoMutateTraits: false,
    userEvolutionTarget,
    species,
    speciesRace: Object.freeze({
      name: speciesRace.name,
      weighting: speciesRace.weighting,
      goals: Object.freeze([...(speciesRace.goals ?? [])]),
    }),
    bestWeighting: catalog.races.reduce(
      (best, candidate) => Math.max(best, candidate.weighting),
      Number.NEGATIVE_INFINITY,
    ),
    ...(targetRace === undefined
      ? {}
      : { targetHabitability: targetRace.habitability }),
    traits: Object.freeze([]),
  });
  return Object.freeze({ status: "ready", input });
}
