import type { PylonInput, PylonSpellView } from "../../domain/pylon.ts";
import {
  requireFunction,
  requireNumber,
  requireRecord,
  type UnknownRecord,
} from "../validation.ts";

export interface PylonReaderDependencies {
  readonly getRitualManager: () => unknown;
  readonly getResources: () => unknown;
  readonly getSettings: () => unknown;
  readonly getGame: () => unknown;
  readonly getJobs: () => unknown;
  readonly haveTech: (tech: string, level?: number) => boolean;
}

function callBoolean(
  record: UnknownRecord,
  name: string,
  path: string,
): boolean {
  const method = requireFunction(record[name], `${path}.${name}`);
  return Boolean(Reflect.apply(method, record, []));
}

function jobCount(jobs: UnknownRecord, id: string): number {
  const job = requireRecord(jobs[id], `jobs.${id}`);
  return requireNumber(job["count"], `jobs.${id}.count`);
}

function readSpells(manager: UnknownRecord): PylonSpellView[] {
  const productions = requireRecord(
    manager["Productions"],
    "RitualManager.Productions",
  );
  const factory = productions["Factory"];
  const currentSpells = requireFunction(
    manager["currentSpells"],
    "RitualManager.currentSpells",
  );
  const spells: PylonSpellView[] = [];
  Object.values(productions).forEach((entry, index) => {
    const path = `RitualManager.Productions[${index}]`;
    const spell = requireRecord(entry, path);
    if (!callBoolean(spell, "isUnlocked", path)) {
      return;
    }
    const id = spell["id"];
    if (typeof id !== "string") {
      throw new TypeError(`${path}.id must be a string`);
    }
    spells.push(
      Object.freeze({
        id,
        weighting: requireNumber(spell["weighting"], `${path}.weighting`),
        isFactory: entry === factory,
        currentSpells: requireNumber(
          Reflect.apply(currentSpells, manager, [spell]),
          `RitualManager.currentSpells(${id})`,
        ),
      }),
    );
  });
  return spells;
}

export function readPylonInput(
  dependencies: PylonReaderDependencies,
): PylonInput {
  const manager = requireRecord(
    dependencies.getRitualManager(),
    "RitualManager",
  );
  // Legacy returns immediately when the industry is not initialised.
  if (!callBoolean(manager, "initIndustry", "RitualManager")) {
    return Object.freeze({
      initialised: false,
      manaRateOfChange: 0,
      manaStorageRatio: 0,
      ritualManaUse: 0,
      ritualSafe: false,
      witchHunter: false,
      priestCount: 0,
      haveRoguemagic4: false,
      cementWorkerCount: 0,
      spells: Object.freeze([]),
    });
  }

  const resources = requireRecord(dependencies.getResources(), "resources");
  const mana = requireRecord(resources["Mana"], "resources.Mana");
  const settings = requireRecord(dependencies.getSettings(), "settings");
  const game = requireRecord(dependencies.getGame(), "game");
  const race = requireRecord(
    requireRecord(game["global"], "game.global")["race"],
    "game.global.race",
  );
  const jobs = requireRecord(dependencies.getJobs(), "jobs");

  return Object.freeze({
    initialised: true,
    manaRateOfChange: requireNumber(
      mana["rateOfChange"],
      "resources.Mana.rateOfChange",
    ),
    manaStorageRatio: requireNumber(
      mana["storageRatio"],
      "resources.Mana.storageRatio",
    ),
    ritualManaUse: requireNumber(
      settings["productionRitualManaUse"],
      "settings.productionRitualManaUse",
    ),
    ritualSafe: Boolean(settings["productionRitualSafe"]),
    witchHunter: Boolean(race["witch_hunter"]),
    priestCount: jobCount(jobs, "Priest"),
    haveRoguemagic4: dependencies.haveTech("roguemagic", 4),
    cementWorkerCount: jobCount(jobs, "CementWorker"),
    spells: Object.freeze(readSpells(manager)),
  });
}
