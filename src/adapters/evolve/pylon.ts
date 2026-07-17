import type {
  PylonDecision,
  PylonInput,
  PylonRitualAdjustment,
  PylonSpellView,
} from "../../domain/pylon.ts";
import type { DecisionExecutor } from "../../ports/decision-executor.ts";
import { rejected, stale, SUCCEEDED } from "../command-outcomes.ts";
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

interface UnlockedSpell {
  readonly id: string;
  readonly weighting: number;
  readonly isFactory: boolean;
  readonly spell: UnknownRecord;
}

function readUnlockedSpells(manager: UnknownRecord): UnlockedSpell[] {
  const productions = requireRecord(
    manager["Productions"],
    "RitualManager.Productions",
  );
  const factory = productions["Factory"];
  const spells: UnlockedSpell[] = [];
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
        spell,
      }),
    );
  });
  return spells;
}

function readCurrentSpells(
  manager: UnknownRecord,
  unlocked: readonly UnlockedSpell[],
): PylonSpellView[] {
  const currentSpells = requireFunction(
    manager["currentSpells"],
    "RitualManager.currentSpells",
  );
  return unlocked.map(({ spell, ...view }) =>
    Object.freeze({
      ...view,
      currentSpells: requireNumber(
        Reflect.apply(currentSpells, manager, [spell]),
        `RitualManager.currentSpells(${view.id})`,
      ),
    }),
  );
}

export function readPylonInput(
  dependencies: PylonReaderDependencies,
): PylonInput {
  const resourcesValue = dependencies.getResources();
  const settingsValue = dependencies.getSettings();
  const gameValue = dependencies.getGame();
  const jobsValue = dependencies.getJobs();
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

  const unlockedSpells = readUnlockedSpells(manager);
  const resources = requireRecord(resourcesValue, "resources");
  const mana = requireRecord(resources["Mana"], "resources.Mana");
  const settings = requireRecord(settingsValue, "settings");
  const ritualSafe = Boolean(settings["productionRitualSafe"]);
  let witchHunter = false;
  if (ritualSafe) {
    const game = requireRecord(gameValue, "game");
    const race = requireRecord(
      requireRecord(game["global"], "game.global")["race"],
      "game.global.race",
    );
    witchHunter = Boolean(race["witch_hunter"]);
  }

  let priestCount = 0;
  let haveRoguemagic4 = false;
  if (ritualSafe && witchHunter) {
    const jobs = requireRecord(jobsValue, "jobs");
    priestCount = jobCount(jobs, "Priest");
    haveRoguemagic4 = dependencies.haveTech("roguemagic", 4);
  }

  let cementWorkerCount = 0;
  if (unlockedSpells.some((spell) => spell.isFactory && spell.weighting > 0)) {
    cementWorkerCount = jobCount(
      requireRecord(jobsValue, "jobs"),
      "CementWorker",
    );
  }

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
    ritualSafe,
    witchHunter,
    priestCount,
    haveRoguemagic4,
    cementWorkerCount,
    spells: Object.freeze(readCurrentSpells(manager, unlockedSpells)),
  });
}

export function createPylonCommandExecutor(
  getRitualManager: () => unknown,
): DecisionExecutor<PylonDecision> {
  function execute(decision: Readonly<PylonDecision>) {
    if (decision.decrease.length === 0 && decision.increase.length === 0) {
      return SUCCEEDED;
    }
    const manager = requireRecord(getRitualManager(), "RitualManager");
    const productions = requireRecord(
      manager["Productions"],
      "RitualManager.Productions",
    );
    const currentSpells = requireFunction(
      manager["currentSpells"],
      "RitualManager.currentSpells",
    );
    const decreaseRitual = requireFunction(
      manager["decreaseRitual"],
      "RitualManager.decreaseRitual",
    );
    const increaseRitual = requireFunction(
      manager["increaseRitual"],
      "RitualManager.increaseRitual",
    );
    const spellsById = new Map<string, UnknownRecord>();
    for (const [key, value] of Object.entries(productions)) {
      const spell = requireRecord(value, `RitualManager.Productions.${key}`);
      const id = spell["id"];
      if (typeof id !== "string") {
        throw new TypeError(
          `RitualManager.Productions.${key}.id must be a string`,
        );
      }
      spellsById.set(id, spell);
    }

    const resolved: {
      readonly adjustment: Readonly<PylonRitualAdjustment>;
      readonly spell: UnknownRecord;
    }[] = [];
    for (const adjustment of [...decision.decrease, ...decision.increase]) {
      if (!Number.isSafeInteger(adjustment.count) || adjustment.count < 0) {
        return rejected(
          "invalid-pylon-adjustment",
          "ritual adjustment count must be a non-negative safe integer",
        );
      }
      const spell = spellsById.get(adjustment.id);
      if (spell === undefined) {
        return stale(
          "missing-pylon-spell",
          "ritual spell is no longer available",
          {
            spellId: adjustment.id,
          },
        );
      }
      const actual = requireNumber(
        Reflect.apply(currentSpells, manager, [spell]),
        `RitualManager.currentSpells(${adjustment.id})`,
      );
      if (actual !== adjustment.expectedCurrentSpells) {
        return stale("stale-pylon-spell", "ritual spell count changed", {
          spellId: adjustment.id,
          expected: adjustment.expectedCurrentSpells,
          actual,
        });
      }
      resolved.push({ adjustment, spell });
    }

    const decreases = new Set(decision.decrease);
    for (const { adjustment, spell } of resolved) {
      if (decreases.has(adjustment)) {
        Reflect.apply(decreaseRitual, manager, [spell, adjustment.count]);
      }
    }
    for (const { adjustment, spell } of resolved) {
      if (!decreases.has(adjustment)) {
        Reflect.apply(increaseRitual, manager, [spell, adjustment.count]);
      }
    }
    return SUCCEEDED;
  }

  return Object.freeze({ execute });
}
