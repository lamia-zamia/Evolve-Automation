/** Captured read/write adapter for the Research settings surface. */

import {
  createResearchSettingsReadModel,
  type ResearchSettingsReadModel,
} from "../../../../domain/progression/research/research-settings.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import {
  createCapturedResearchLocalize,
  readCapturedResearchTechnologies,
} from "./captured-research-settings-catalog.ts";

export interface CapturedResearchSettingsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
}

export interface CapturedResearchSettingsAdapter {
  readResearchSettingsReadModel(): ResearchSettingsReadModel;
}

export function createCapturedResearchSettingsAdapter({
  rootState,
  controls,
}: CapturedResearchSettingsDependencies): CapturedResearchSettingsAdapter {
  return Object.freeze({
    readResearchSettingsReadModel(): ResearchSettingsReadModel {
      return createResearchSettingsReadModel({
        localize: createCapturedResearchLocalize(controls),
        technologies: readCapturedResearchTechnologies(rootState, controls),
      });
    },
  });
}
