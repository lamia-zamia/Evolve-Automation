import {
  createResearchSettingsReadModel,
  type ResearchSettingsReadModel,
  type ResearchSettingsTechnology,
} from "../../domain/research-settings.ts";
import { requireFunction, requireRecord } from "../validation.ts";

interface ResearchSettingsEvolveDependencies {
  readonly getGame: () => unknown;
  readonly getTechIds: () => unknown;
}

export interface ResearchSettingsEvolveAdapter {
  readResearchSettingsReadModel(): ResearchSettingsReadModel;
}

function requireObjectRecord(value: unknown, path: string) {
  if (Array.isArray(value)) {
    throw new TypeError(`${path} must be an object`);
  }
  return requireRecord(value, path);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new TypeError(`${path} must be a string`);
  }
  return value;
}

/** Maps the volatile Evolve localization and technology catalog to a UI read model. */
export function createResearchSettingsEvolveAdapter({
  getGame,
  getTechIds,
}: ResearchSettingsEvolveDependencies): ResearchSettingsEvolveAdapter {
  function readResearchSettingsReadModel(): ResearchSettingsReadModel {
    const game = requireObjectRecord(getGame(), "game");
    const localize = requireFunction(game["loc"], "game.loc");
    const rawTechIds = requireObjectRecord(getTechIds(), "techIds");
    const technologies: Record<string, ResearchSettingsTechnology> = {};

    for (const [key, rawTechnology] of Object.entries(rawTechIds)) {
      const technology = requireObjectRecord(rawTechnology, `techIds.${key}`);
      const binding = requireString(
        technology["_vueBinding"],
        `techIds.${key}._vueBinding`,
      );
      if (binding !== key) {
        throw new TypeError(`techIds.${key}._vueBinding must match its key`);
      }
      technologies[key] = Object.freeze({
        _vueBinding: binding,
        name: requireString(technology["name"], `techIds.${key}.name`),
      });
    }

    return createResearchSettingsReadModel({
      localize: (key) =>
        requireString(
          Reflect.apply(localize, game, [key]),
          `game.loc(${key}) result`,
        ),
      technologies,
    });
  }

  return Object.freeze({ readResearchSettingsReadModel });
}
