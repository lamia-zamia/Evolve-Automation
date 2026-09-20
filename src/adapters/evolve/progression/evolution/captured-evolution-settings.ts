/**
 * Captured read/write adapter for the Evolution settings surface.
 *
 * Every control here was traced to a captured consumer before it was exposed:
 *
 * - `userUniverseTargetName` → `captured-evolution.ts` universe selection;
 * - `userPlanetTargetName` → `captured-planet-selection.ts`;
 * - `userEvolutionTarget` → `captured-evolution.ts` target planner;
 * - `evolutionAutoUnbound` → captured race catalog weighting;
 * - `evolutionBackup` → captured result-check lifecycle;
 * - `challenge_<id>` → `captured-evolution.ts` challenge activation;
 * - `evolutionQueue`, `evolutionQueueEnabled`, `evolutionQueueRepeat` →
 *   `captured-queued-settings.ts` and the captured target sample.
 *
 * One compatibility-only control remains absent because the captured runtime has no consumer for
 * it, and offering it would be a control that silently does nothing:
 *
 * - `userEvolutionGenus` — read only by the compatibility evolution adapter, which picks a genus
 *   at the gene lab for the variable-genus challenge races. The captured runtime does not sample
 *   or click that menu.
 *
 * Race descriptions and the habitability warning are not restated: see the catalog module.
 */

import {
  createEvolutionSettingsReadModel,
  type EvolutionQueueItem,
  type EvolutionSettingsControl,
  type EvolutionSettingsOption,
  type EvolutionSettingsReadModel,
} from "../../../../domain/progression/evolution/evolution-settings.ts";
import { PRESTIGE_TYPES } from "../../../../domain/progression/prestige/prestige-types.ts";
import { calculateAchievementStarLevel } from "../../../../domain/progression/prestige/achievement-guards.ts";
import { readAchievementStarLevelContext } from "../../progression/prestige/achievement-guards.ts";
import { universes } from "../../../../config.ts";
import {
  evolutionSettingsToStore,
  challenges as evolutionChallengeCatalog,
} from "../../runtime-catalogs.ts";
import { isRecord } from "../../../validation.ts";
import {
  CAPTURED_EVOLUTION_CHALLENGE_LABELS,
  CAPTURED_EVOLUTION_RACES,
  CAPTURED_EVOLUTION_UNIVERSE_LABELS,
} from "./captured-evolution-catalog.ts";

export interface CapturedEvolutionSettingsDependencies {
  readonly getSettingsRaw: () => unknown;
  /**
   * Drops the captured evolution runtime's committed target. Changing the Target Race while a
   * target is already stored would otherwise keep evolving toward the old one.
   */
  readonly clearStoredTarget?: () => void;
}

export interface CapturedEvolutionSettingsAdapter {
  readEvolutionSettingsReadModel(): EvolutionSettingsReadModel;
  setTarget(value: string): void;
  addCurrent(prestigeType: string): void;
  remove(index: number): void;
  edit(index: number, json: string): void;
  reorder(indexes: readonly number[]): void;
}

const AUTO_TARGET_ID = "auto";

const universeOptions: readonly EvolutionSettingsOption[] = Object.freeze([
  Object.freeze({
    val: "none",
    label: "None",
    hint: "Wait for user selection",
  }),
  ...universes.map((id) => {
    const entry = CAPTURED_EVOLUTION_UNIVERSE_LABELS[id];
    return Object.freeze({
      val: id,
      label: entry?.label ?? id,
      hint: entry?.hint ?? "",
    });
  }),
]);

const planetOptions: readonly EvolutionSettingsOption[] = Object.freeze([
  Object.freeze({
    val: "none",
    label: "None",
    hint: "Wait for user selection",
  }),
  Object.freeze({
    val: "habitable",
    label: "Most habitable",
    hint: "Picks most habitable planet, based on biome and trait",
  }),
  Object.freeze({
    val: "achieve",
    label: "Most achievements",
    hint: "Picks planet with most unearned achievements.",
  }),
  Object.freeze({
    val: "weighting",
    label: "Highest weighting",
    hint: "Picks planet with highest weighting.",
  }),
]);

const raceOptions: readonly EvolutionSettingsOption[] = Object.freeze([
  Object.freeze({
    val: AUTO_TARGET_ID,
    label: "Auto Achievements",
    hint: "Picks the reachable race/genus with the strongest current Auto Achievement weighting.",
  }),
  ...CAPTURED_EVOLUTION_RACES.map((race) =>
    Object.freeze({
      val: race.id,
      label: race.label,
      hint:
        race.genus === "variable"
          ? "Genus is chosen at the gene lab"
          : `Genus: ${race.genus}`,
    }),
  ),
]);

const prestigeOptions: readonly EvolutionSettingsOption[] = Object.freeze(
  PRESTIGE_TYPES.map((type) =>
    Object.freeze({ val: type.val, label: type.label, hint: type.hint }),
  ),
);

// The group list stays owned by `runtime-catalogs.ts` — the same table `computeEvolutionDefaults`
// turns into `challenge_<id>` keys — so a challenge cannot be defaulted without being drawn.
const challengeControls: readonly EvolutionSettingsControl[] = Object.freeze(
  evolutionChallengeCatalog.flatMap((group) => {
    const id = group[0]?.id;
    if (id === undefined) return [];
    const labels = CAPTURED_EVOLUTION_CHALLENGE_LABELS[id];
    return [
      Object.freeze({
        kind: "toggle" as const,
        settingName: `challenge_${id}`,
        label: labels?.label ?? id,
        hint: labels?.hint ?? "",
      }),
    ];
  }),
);

const evolutionControls: readonly EvolutionSettingsControl[] = Object.freeze([
  Object.freeze({
    kind: "select" as const,
    settingName: "userUniverseTargetName",
    label: "Target Universe",
    hint: "Chosen universe will be automatically selected after appropriate reset",
    options: universeOptions,
  }),
  Object.freeze({
    kind: "select" as const,
    settingName: "userPlanetTargetName",
    label: "Target Planet",
    hint: "Chosen planet will be automatically selected after appropriate reset. Warning! Script ignores changes made by G.E.C.K., you need to select planet manually after using it.",
    options: planetOptions,
  }),
  Object.freeze({
    kind: "select" as const,
    settingName: "userEvolutionTarget",
    label: "Target Race",
    hint: "Chosen race will be automatically selected during next evolution",
    options: raceOptions,
  }),
  Object.freeze({
    kind: "toggle" as const,
    settingName: "evolutionAutoUnbound",
    label: "Auto Unbound",
    hint: "Allow Auto Achievements to select races reachable through the current Unbound habitability threshold.",
  }),
  Object.freeze({
    kind: "toggle" as const,
    settingName: "evolutionBackup",
    label: "Soft Reset",
    hint: "Perform one soft reset when the captured result check rejects the evolved race.",
  }),
  ...challengeControls,
  Object.freeze({ kind: "header" as const, label: "Evolution Queue" }),
  Object.freeze({
    kind: "toggle" as const,
    settingName: "evolutionQueueEnabled",
    label: "Queue Enabled",
    hint: "When enabled script will evolve with queued settings, from top to bottom.",
  }),
  Object.freeze({
    kind: "toggle" as const,
    settingName: "evolutionQueueRepeat",
    label: "Repeat Queue",
    hint: "When enabled applied evolution targets will be moved to the end of queue, instead of being removed",
  }),
]);

const raceLabelById = new Map(
  CAPTURED_EVOLUTION_RACES.map((race) => [race.id, race.label] as const),
);

/**
 * A queued row's race name and colour. Habitability is a game computation over the current
 * planet, which no capture reaches, so a known race reads neutral rather than being coloured by
 * a suitability the adapter would have to invent.
 */
function capturedQueueRaceName(target: unknown): {
  label: string;
  className: string;
} {
  if (target === AUTO_TARGET_ID)
    return { label: "Auto Achievements", className: "has-text-advanced" };
  if (typeof target !== "string" || !raceLabelById.has(target))
    return { label: "Unrecognized race!", className: "has-text-danger" };
  return { label: raceLabelById.get(target)!, className: "has-text-info" };
}

function capturedQueueStarLevel(merged: Record<string, unknown>): number {
  const result = readAchievementStarLevelContext(merged);
  return result.status === "ready"
    ? calculateAchievementStarLevel(result.context)
    : 1;
}

export function createCapturedEvolutionSettingsAdapter({
  getSettingsRaw,
  clearStoredTarget,
}: CapturedEvolutionSettingsDependencies): CapturedEvolutionSettingsAdapter {
  const raw = (): Record<string, unknown> => {
    const value = getSettingsRaw();
    return isRecord(value) ? value : {};
  };
  const queueOf = (): unknown[] => {
    const record = raw();
    const queue = record["evolutionQueue"];
    if (Array.isArray(queue)) return queue;
    const created: unknown[] = [];
    record["evolutionQueue"] = created;
    return created;
  };

  return Object.freeze({
    readEvolutionSettingsReadModel(): EvolutionSettingsReadModel {
      const settings = raw();
      const queue: EvolutionQueueItem[] = queueOf().map((entry, index) => {
        const item = isRecord(entry) ? entry : {};
        const merged: Record<string, unknown> = { ...item };
        for (const name of evolutionSettingsToStore)
          merged[name] = merged[name] ?? settings[name];
        const race = capturedQueueRaceName(merged["userEvolutionTarget"]);
        const prestige = prestigeOptions.find(
          (option) => option.val === merged["prestigeType"],
        );
        return {
          index,
          raceLabel: race.label,
          raceClass: race.className,
          prestigeLabel:
            merged["prestigeType"] === "none"
              ? ""
              : (prestige?.label ?? "Unrecognized prestige!"),
          prestigeClass:
            prestige === undefined && merged["prestigeType"] !== "none"
              ? "has-text-danger"
              : "has-text-info",
          starLevel: capturedQueueStarLevel(merged),
          json: JSON.stringify(merged, null, 4),
        };
      });
      return createEvolutionSettingsReadModel({
        controls: evolutionControls,
        prestigeOptions,
        queue,
      });
    },

    setTarget(value: string) {
      raw()["userEvolutionTarget"] = value;
      clearStoredTarget?.();
    },

    addCurrent(prestigeType: string) {
      const settings = raw();
      const queued: Record<string, unknown> = {};
      for (const name of evolutionSettingsToStore)
        queued[name] = settings[name];
      if (prestigeType !== AUTO_TARGET_ID)
        queued["prestigeType"] = prestigeType;
      queueOf().push(queued);
    },

    remove(index: number) {
      queueOf().splice(index, 1);
    },

    edit(index: number, json: string) {
      let value: unknown;
      try {
        value = JSON.parse(json);
      } catch {
        // A half-typed row is the normal state of a textarea; leave the stored entry alone.
        return;
      }
      if (!isRecord(value)) return;
      queueOf()[index] = value;
    },

    reorder(indexes: readonly number[]) {
      const queue = queueOf();
      raw()["evolutionQueue"] = indexes.map((index) => queue[index]);
    },
  });
}
