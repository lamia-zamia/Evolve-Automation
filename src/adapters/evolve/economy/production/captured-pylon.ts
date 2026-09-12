/** Captured DeadSpace pylon controls and the root-owned ritual snapshot. */

import {
  planPylon,
  type PylonDecision,
  type PylonInput,
} from "../../../../domain/economy/production/pylon.ts";
import type { CommandExecutionOutcome } from "../../../../domain/commands.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { rejected, stale, SUCCEEDED } from "../../../command-outcomes.ts";
import { finite, isRecord, readProperty } from "../../../validation.ts";

export const PYLON_CONTROL = "iPylon";
const SPELL_IDS = [
  "farmer",
  "miner",
  "lumberjack",
  "science",
  "factory",
  "army",
  "hunting",
  "crafting",
] as const;

const DEFAULT_SPELL_WEIGHTING = 100;
const DEFAULT_HUNTING_WEIGHTING = 10;
const DEFAULT_FARMER_WEIGHTING = 1;

export interface CapturedPylonDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly readSettings: () => unknown;
}

export interface CapturedPylonAutomation {
  run(): CommandExecutionOutcome;
}

function settingNumber(
  settings: Record<PropertyKey, unknown>,
  key: string,
  fallback: number,
): number | undefined {
  const value = settings[key];
  if (value === undefined) return fallback;
  return finite(value);
}

function emptyInput(): PylonInput {
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

function readNonNegative(value: unknown): number {
  const result = finite(value);
  return result !== undefined && result >= 0 ? result : 0;
}

function hasTrait(race: unknown, key: string): boolean {
  return Boolean(readProperty(race, key));
}

function spellAvailable(id: string, race: unknown, magic: number): boolean {
  switch (id) {
    case "farmer":
      return ![
        "detritivore",
        "carnivore",
        "soul_eater",
        "artifical",
        "unfathomable",
        "cataclysm",
        "orbit_decayed",
      ].some((trait) => hasTrait(race, trait));
    case "miner":
      return !hasTrait(race, "cataclysm");
    case "lumberjack":
      return ![
        "kindling_kindred",
        "smoldering",
        "evil",
        "cataclysm",
        "orbit_decayed",
      ].some((trait) => hasTrait(race, trait));
    case "factory":
      return !hasTrait(race, "flier");
    case "crafting":
      return magic >= 4;
    default:
      return true;
  }
}

function readPylonInput(dependencies: CapturedPylonDependencies): {
  readonly root: unknown;
  readonly input: PylonInput;
} {
  const root = dependencies.rootState.readRoot();
  if (root === undefined) {
    return Object.freeze({ root, input: emptyInput() });
  }

  const race = readProperty(root, "race");
  const tech = readProperty(root, "tech");
  const casting = readProperty(race, "casting");
  const resources = readProperty(root, "resource");
  const mana = readProperty(resources, "Mana");
  const settingsValue = dependencies.readSettings();
  const settings = isRecord(settingsValue) ? settingsValue : {};
  const magic = finite(readProperty(tech, "magic"));
  const manaAmount = finite(readProperty(mana, "amount"));
  const manaMaximum = finite(readProperty(mana, "max"));
  const manaRateOfChange = finite(readProperty(mana, "diff"));

  // DeadSpace creates race.casting only after rituals are unlocked. The pylon panel is also
  // the game's own availability boundary: without its captured component there is no safe
  // command path, even though a stale save may still retain casting fields.
  if (
    !isRecord(casting) ||
    magic === undefined ||
    magic < 3 ||
    manaAmount === undefined ||
    manaMaximum === undefined ||
    manaRateOfChange === undefined ||
    dependencies.controls.resolve(PYLON_CONTROL) === undefined
  ) {
    return Object.freeze({ root, input: emptyInput() });
  }

  const ritualManaUse = settingNumber(settings, "productionRitualManaUse", 0.5);
  if (ritualManaUse === undefined) {
    return Object.freeze({ root, input: emptyInput() });
  }

  const spells = [];
  for (const id of SPELL_IDS) {
    if (!spellAvailable(id, race, magic)) continue;
    const currentSpells = finite(readProperty(casting, id));
    if (currentSpells === undefined || currentSpells < 0) continue;
    const fallback =
      id === "hunting"
        ? DEFAULT_HUNTING_WEIGHTING
        : id === "farmer"
          ? DEFAULT_FARMER_WEIGHTING
          : DEFAULT_SPELL_WEIGHTING;
    const weighting = settingNumber(settings, `spell_w_${id}`, fallback);
    if (weighting === undefined) {
      return Object.freeze({ root, input: emptyInput() });
    }
    spells.push(
      Object.freeze({
        id,
        weighting,
        isFactory: id === "factory",
        currentSpells,
      }),
    );
  }

  const civic = readProperty(root, "civic");
  const priest = readProperty(civic, "priest");
  const cementWorker = readProperty(civic, "cement_worker");
  const techRoguemagic = finite(readProperty(tech, "roguemagic"));
  const ritualSafe =
    typeof settings["productionRitualSafe"] === "boolean"
      ? settings["productionRitualSafe"]
      : true;
  const witchHunter = Boolean(readProperty(race, "witch_hunter"));

  return Object.freeze({
    root,
    input: Object.freeze({
      initialised: true,
      manaRateOfChange,
      manaStorageRatio: manaMaximum > 0 ? manaAmount / manaMaximum : 0,
      ritualManaUse,
      ritualSafe,
      witchHunter,
      priestCount: readNonNegative(readProperty(priest, "workers")),
      haveRoguemagic4: (techRoguemagic ?? 0) >= 4,
      cementWorkerCount: readNonNegative(readProperty(cementWorker, "workers")),
      spells: Object.freeze(spells),
    }),
  });
}

function currentSpells(root: unknown, id: string): number | undefined {
  const value = finite(
    readProperty(readProperty(readProperty(root, "race"), "casting"), id),
  );
  return value !== undefined && value >= 0 ? value : undefined;
}

function manaRate(root: unknown): number | undefined {
  const mana = readProperty(readProperty(root, "resource"), "Mana");
  return finite(readProperty(mana, "diff"));
}

function decisionMatches(
  input: Readonly<PylonInput>,
  decision: Readonly<PylonDecision>,
): boolean {
  return JSON.stringify(planPylon(input)) === JSON.stringify(decision);
}

function executeAdjustment(
  controls: GameControlRegistry,
  rootState: GameRootStateSource,
  root: unknown,
  id: string,
  expected: number,
  count: number,
  method: "addSpell" | "subSpell",
): CommandExecutionOutcome {
  const handle = controls.resolve(PYLON_CONTROL);
  if (handle === undefined) {
    return stale(
      "pylon-control-missing",
      "captured pylon control is unavailable",
    );
  }
  for (let index = 0; index < count; index++) {
    if (rootState.readRoot() !== root) {
      return stale("pylon-root-changed", "captured game root changed");
    }
    const actual = currentSpells(root, id);
    if (actual !== expected + (method === "addSpell" ? index : -index)) {
      return stale("pylon-spell-changed", "ritual spell count changed");
    }
    const result = controls.invoke(handle, method, [id]);
    if (!result.ok) {
      return rejected("pylon-control-failed", result.detail ?? result.reason);
    }
  }
  return SUCCEEDED;
}

export function createCapturedPylonAutomation(
  dependencies: CapturedPylonDependencies,
): CapturedPylonAutomation {
  return Object.freeze({
    run(): CommandExecutionOutcome {
      const session = readPylonInput(dependencies);
      const decision = planPylon(session.input);
      if (!session.input.initialised) return SUCCEEDED;
      if (!decisionMatches(session.input, decision)) {
        return rejected(
          "invalid-pylon-decision",
          "pylon decision changed during planning",
        );
      }
      if (
        decision.manaRateAdjustment !== null &&
        manaRate(session.root) !== decision.manaRateAdjustment.expected
      ) {
        return stale("pylon-mana-changed", "Mana rate-of-change changed");
      }

      for (const adjustment of decision.decrease) {
        const outcome = executeAdjustment(
          dependencies.controls,
          dependencies.rootState,
          session.root,
          adjustment.id,
          adjustment.expectedCurrentSpells,
          adjustment.count,
          "subSpell",
        );
        if (outcome.status !== "succeeded") return outcome;
      }
      for (const adjustment of decision.increase) {
        const outcome = executeAdjustment(
          dependencies.controls,
          dependencies.rootState,
          session.root,
          adjustment.id,
          adjustment.expectedCurrentSpells,
          adjustment.count,
          "addSpell",
        );
        if (outcome.status !== "succeeded") return outcome;
      }
      return SUCCEEDED;
    },
  });
}
