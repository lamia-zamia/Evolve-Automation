import {
  createEvolutionSettingsReadModel,
  type EvolutionQueueItem,
  type EvolutionSettingsControl,
  type EvolutionSettingsOption,
  type EvolutionSettingsReadModel,
} from "../../../../domain/progression/evolution/evolution-settings.ts";
import { requireRecord } from "../../../validation.ts";
interface EvolutionSettingsEvolveDependencies {
  readonly getGame: () => unknown;
  readonly getRaces: () => unknown;
  readonly getChallenges: () => unknown;
  readonly getUniverses: () => unknown;
  readonly getSettingsRaw: () => unknown;
  readonly getSettings: () => unknown;
  readonly getSettingsToStore: () => unknown;
  readonly getPrestigeTypes: () => unknown;
  readonly getStarLevel: (queueItem: unknown) => unknown;
}
export interface EvolutionSettingsEvolveAdapter {
  read(): EvolutionSettingsReadModel;
}
function string(value: unknown, path: string): string {
  if (typeof value !== "string")
    throw new TypeError(`${path} must be a string`);
  return value;
}
function array(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array`);
  return value;
}
function loc(game: Record<PropertyKey, unknown>, key: string): string {
  const fn = game["loc"];
  if (typeof fn !== "function")
    throw new TypeError("game.loc must be a function");
  return string(Reflect.apply(fn, game, [key]), `game.loc(${key})`);
}
function options(
  value: unknown,
  path: string,
): readonly EvolutionSettingsOption[] {
  return Object.freeze(
    array(value, path).map((raw, index) => {
      const item = requireRecord(raw, `${path}[${index}]`);
      return Object.freeze({
        val: string(item["val"], `${path}[${index}].val`),
        label: string(item["label"], `${path}[${index}].label`),
        hint: string(item["hint"], `${path}[${index}].hint`),
      });
    }),
  );
}
function raceColor(race: Record<PropertyKey, unknown>): string {
  const fn = race["getHabitability"];
  const value = typeof fn === "function" ? Reflect.apply(fn, race, []) : 0;
  return value === 1
    ? "has-text-info"
    : value === 0
      ? "has-text-danger"
      : "has-text-warning";
}
function queueName(
  race: Record<PropertyKey, unknown>,
  game: Record<PropertyKey, unknown>,
  item: Record<PropertyKey, unknown>,
): { label: string; className: string } {
  const target = item["userEvolutionTarget"];
  if (target === "auto")
    return { label: "Auto Achievements", className: "has-text-advanced" };
  if (typeof target !== "string")
    return { label: "Unrecognized race!", className: "has-text-danger" };
  const name = string(race["name"], "race.name");
  const genus = item["userEvolutionGenus"];
  const genusText =
    typeof genus === "string" ? `, ${loc(game, `genelab_genus_${genus}`)}` : "";
  return { label: `${name}${genusText}`, className: raceColor(race) };
}
export function createEvolutionSettingsEvolveAdapter(
  deps: EvolutionSettingsEvolveDependencies,
): EvolutionSettingsEvolveAdapter {
  return Object.freeze({
    read(): EvolutionSettingsReadModel {
      const game = requireRecord(deps.getGame(), "game");
      const settingsRaw = requireRecord(deps.getSettingsRaw(), "settingsRaw");
      const settings = requireRecord(deps.getSettings(), "settings");
      const racesRecord = requireRecord(deps.getRaces(), "races");
      const races = Object.values(racesRecord).map((raw) =>
        requireRecord(raw, "races entry"),
      );
      const universeOptions: EvolutionSettingsOption[] = [
        { val: "none", label: "None", hint: "Wait for user selection" },
        ...array(deps.getUniverses(), "universes").map((raw, index) => {
          const id = string(raw, `universes[${index}]`);
          return {
            val: id,
            label: loc(game, `universe_${id}`),
            hint: loc(game, `universe_${id}_desc`),
          };
        }),
      ];
      const raceOptions: EvolutionSettingsOption[] = [
        {
          val: "auto",
          label: "Auto Achievements",
          hint: "Picks race giving most achievements upon completing run. Tracks all achievements limited to specific races and resets. Races unique to current planet biome are prioritized, when available.",
        },
        ...races.map((race) => ({
          val: string(race["id"], "race.id"),
          label: string(race["name"], "race.name"),
          hint: string(race["desc"], "race.desc"),
        })),
      ];
      const gameRaces = requireRecord(game["races"], "game.races");
      const genusIds = [
        ...new Set(
          Object.values(gameRaces)
            .map((raw) => {
              const item = requireRecord(raw, "game.races entry");
              return item["type"];
            })
            .filter(
              (value): value is string =>
                typeof value === "string" && value !== "organism",
            ),
        ),
      ];
      const genusOptions = genusIds.map((id) => ({
        val: id,
        label: loc(game, `genelab_genus_${id}`),
        hint: "",
      }));
      const challengeSets = array(deps.getChallenges(), "challenges");
      const challengeControls: EvolutionSettingsControl[] = challengeSets.map(
        (raw, index) => {
          const set = array(raw, `challenges[${index}]`);
          const first = requireRecord(set[0], `challenges[${index}][0]`);
          const id = string(first["id"], `challenges[${index}][0].id`);
          return {
            kind: "toggle",
            settingName: `challenge_${id}`,
            label: set
              .map((item, itemIndex) =>
                loc(
                  game,
                  `evo_challenge_${string(requireRecord(item, `challenges[${index}][${itemIndex}]`)["id"], "challenge.id")}`,
                ),
              )
              .join(" | "),
            hint: set
              .map((item, itemIndex) =>
                loc(
                  game,
                  `evo_challenge_${string(requireRecord(item, `challenges[${index}][${itemIndex}]`)["id"], "challenge.id")}_effect`,
                ),
              )
              .join("&#xA;"),
          };
        },
      );
      const controls: EvolutionSettingsControl[] = [
        {
          kind: "select",
          settingName: "userUniverseTargetName",
          label: "Target Universe",
          hint: "Chosen universe will be automatically selected after appropriate reset",
          options: universeOptions,
        },
        {
          kind: "select",
          settingName: "userPlanetTargetName",
          label: "Target Planet",
          hint: "Chosen planet will be automatically selected after appropriate reset. Warning! Script ignores changes made by G.E.C.K., you need to select planet manually after using it.",
          options: [
            { val: "none", label: "None", hint: "Wait for user selection" },
            {
              val: "habitable",
              label: "Most habitable",
              hint: "Picks most habitable planet, based on biome and trait",
            },
            {
              val: "achieve",
              label: "Most achievements",
              hint: "Picks planet with most unearned achievements.",
            },
            {
              val: "weighting",
              label: "Highest weighting",
              hint: "Picks planet with highest weighting.",
            },
          ],
        },
        {
          kind: "select",
          settingName: "userEvolutionTarget",
          label: "Target Race",
          hint: "Chosen race will be automatically selected during next evolution",
          options: raceOptions,
        },
        {
          kind: "select",
          settingName: "userEvolutionGenus",
          label: "Preferred genus",
          hint: "Chosen genus will be picked if target race have such option. Works only with challenge races, and hybrids.",
          options: genusOptions,
        },
        {
          kind: "toggle",
          settingName: "evolutionAutoUnbound",
          label: "Allow unbound races",
          hint: "Allow Auto Achievement to pick biome restricted races on unsuited biomes, after getting unbound.",
        },
        {
          kind: "toggle",
          settingName: "evolutionBackup",
          label: "Soft Reset",
          hint: "Perform soft resets until you'll get chosen race. Has no effect after getting mass extinction perk.",
        },
        ...challengeControls,
        { kind: "header", label: "Evolution Queue" },
        {
          kind: "toggle",
          settingName: "evolutionQueueEnabled",
          label: "Queue Enabled",
          hint: "When enabled script will evolve with queued settings, from top to bottom.",
        },
        {
          kind: "toggle",
          settingName: "evolutionQueueRepeat",
          label: "Repeat Queue",
          hint: "When enabled applied evolution targets will be moved to the end of queue, instead of being removed",
        },
      ];
      const prestigeOptions = options(deps.getPrestigeTypes(), "prestigeTypes");
      const storeNames = array(
        deps.getSettingsToStore(),
        "evolutionSettingsToStore",
      ).map((raw, index) => string(raw, `evolutionSettingsToStore[${index}]`));
      const rawQueue = array(
        settingsRaw["evolutionQueue"],
        "settingsRaw.evolutionQueue",
      );
      const queue: EvolutionQueueItem[] = rawQueue.map((raw, index) => {
        const item = requireRecord(raw, `evolutionQueue[${index}]`);
        const merged: Record<string, unknown> = { ...item };
        for (const name of storeNames)
          merged[name] = merged[name] ?? settings[name];
        const target = merged["userEvolutionTarget"];
        const race = races.find((candidate) => candidate["id"] === target);
        const name = queueName(race ?? {}, game, merged);
        const prestige = prestigeOptions.find(
          (option) => option.val === merged["prestigeType"],
        );
        const starRaw = deps.getStarLevel(merged);
        const starLevel = typeof starRaw === "number" ? starRaw : 1;
        return {
          index,
          raceLabel: name.label,
          raceClass: name.className,
          prestigeLabel:
            merged["prestigeType"] === "none"
              ? ""
              : (prestige?.label ?? "Unrecognized prestige!"),
          prestigeClass:
            prestige === undefined && merged["prestigeType"] !== "none"
              ? "has-text-danger"
              : "has-text-info",
          starLevel,
          json: JSON.stringify(merged, null, 4),
        };
      });
      const target = settingsRaw["userEvolutionTarget"];
      const selectedRace = races.find((race) => race["id"] === target);
      let raceWarning: { className: string; text: string } | undefined;
      if (selectedRace) {
        const condition = selectedRace["getCondition"];
        const habitability = selectedRace["getHabitability"];
        if (
          typeof condition === "function" &&
          typeof habitability === "function"
        ) {
          const text = string(
            Reflect.apply(condition, selectedRace, []),
            "race condition",
          );
          const suited = Reflect.apply(habitability, selectedRace, []);
          if (text !== "")
            raceWarning =
              suited === 1
                ? {
                    className: "has-text-success",
                    text: `This race have special requirements: ${text} This condition is met.`,
                  }
                : suited === 0
                  ? {
                      className: "has-text-danger",
                      text: `Warning! This race have special requirements: ${text} This condition is not met.`,
                    }
                  : {
                      className: "has-text-warning",
                      text: `Warning! This race have special requirements: ${text} This condition is bypassed. Race will have ${100 - Number(suited) * 100}% penalty.`,
                    };
        }
      }
      return createEvolutionSettingsReadModel({
        controls,
        prestigeOptions,
        queue,
        raceWarning,
      });
    },
  });
}
