import type { GovernmentInput } from "../../domain/government.ts";
import { requireFunction, requireRecord } from "../validation.ts";

export interface GovernmentReaderDependencies {
  readonly getGovernmentManager: () => unknown;
  readonly getSettings: () => unknown;
  readonly getGame: () => unknown;
  readonly guardActive: (setting: string) => boolean;
  readonly haveTech: (tech: string) => boolean;
  readonly getGovernor: () => string;
}

/** `GovernmentManager.Types[type].isUnlocked()`, sampled only for a configured type. */
function governmentUnlocked(
  types: unknown,
  type: string,
  path: string,
): boolean {
  if (type === "none") {
    return false;
  }
  const typesRecord = requireRecord(types, `${path}.Types`);
  const entry = requireRecord(typesRecord[type], `${path}.Types.${type}`);
  const isUnlocked = requireFunction(
    entry["isUnlocked"],
    `${path}.Types.${type}.isUnlocked`,
  );
  return Boolean(Reflect.apply(isUnlocked, entry, []));
}

function readString(record: Record<PropertyKey, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new TypeError(`settings.${key} must be a string`);
  }
  return value;
}

function readCandidateBackgrounds(
  game: Record<PropertyKey, unknown>,
): string[] {
  const global = requireRecord(game["global"], "game.global");
  const race = requireRecord(global["race"], "game.global.race");
  const governor = race["governor"];
  if (typeof governor !== "object" || governor === null) {
    return [];
  }
  const candidates = (governor as Record<PropertyKey, unknown>)["candidates"];
  if (!Array.isArray(candidates)) {
    return [];
  }
  return candidates.map((candidate, index) => {
    const record = requireRecord(
      candidate,
      `game.global.race.governor.candidates[${index}]`,
    );
    const bg = record["bg"];
    return typeof bg === "string" ? bg : "";
  });
}

export function readGovernmentInput(
  dependencies: GovernmentReaderDependencies,
): GovernmentInput {
  const manager = requireRecord(
    dependencies.getGovernmentManager(),
    "GovernmentManager",
  );
  const settings = requireRecord(dependencies.getSettings(), "settings");
  const game = requireRecord(dependencies.getGame(), "game");

  const isEnabled = requireFunction(
    manager["isEnabled"],
    "GovernmentManager.isEnabled",
  );

  const govSpace = readString(settings, "govSpace");
  const govFinal = readString(settings, "govFinal");
  const govInterim = readString(settings, "govInterim");

  return Object.freeze({
    isEnabled: Boolean(Reflect.apply(isEnabled, manager, [])),
    guardAnarchist: dependencies.guardActive("guardAnarchist"),
    haveQFactory: dependencies.haveTech("q_factory"),
    haveGovernorTech: dependencies.haveTech("governor"),
    currentGovernor: dependencies.getGovernor(),
    govSpace,
    govFinal,
    govInterim,
    govGovernor: readString(settings, "govGovernor"),
    govSpaceUnlocked: governmentUnlocked(
      manager["Types"],
      govSpace,
      "GovernmentManager",
    ),
    govFinalUnlocked: governmentUnlocked(
      manager["Types"],
      govFinal,
      "GovernmentManager",
    ),
    govInterimUnlocked: governmentUnlocked(
      manager["Types"],
      govInterim,
      "GovernmentManager",
    ),
    candidateBackgrounds: Object.freeze(readCandidateBackgrounds(game)),
  });
}
