/** Captured read/write adapter for the Research settings surface. */

import {
  createResearchSettingsReadModel,
  type ResearchSettingsReadModel,
} from "../../../../domain/progression/research/research-settings.ts";
import { computeResearchDefaults } from "../../../../domain/settings-defaults.ts";
import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { isRecord } from "../../../validation.ts";
import {
  createCapturedResearchLocalize,
  readCapturedResearchTechnologies,
} from "./captured-research-settings-catalog.ts";

export interface CapturedResearchSettingsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly getSettingsRaw: () => unknown;
}

export interface CapturedResearchSettingsAdapter {
  readResearchSettingsReadModel(): ResearchSettingsReadModel;
  resetToDefaults(): void;
}

export function createCapturedResearchSettingsAdapter({
  rootState,
  controls,
  getSettingsRaw,
}: CapturedResearchSettingsDependencies): CapturedResearchSettingsAdapter {
  void getSettingsRaw;
  return Object.freeze({
    readResearchSettingsReadModel(): ResearchSettingsReadModel {
      return createResearchSettingsReadModel({
        localize: createCapturedResearchLocalize(controls),
        technologies: readCapturedResearchTechnologies(rootState, controls),
      });
    },
    resetToDefaults() {
      const raw = getSettingsRaw();
      if (!isRecord(raw)) return;
      Object.assign(raw, computeResearchDefaults().def);
    },
  });
}
