/** Captured read/write adapter for the Government settings surface. */

import {
  createGovernmentSettingsReadModel,
  type GovernmentSettingsOption,
  type GovernmentSettingsReadModel,
} from "../../../domain/civic/government-settings.ts";
import { computeGovernmentDefaults } from "../../../domain/settings-defaults.ts";
import { readGovernmentResetContext } from "../captured-settings-defaults.ts";
import { isRecord } from "../../validation.ts";
import {
  readCapturedGovernmentOptions,
  readCapturedGovernorOptions,
} from "./captured-government-settings-catalog.ts";

export interface CapturedGovernmentSettingsDependencies {
  readonly getSettingsRaw: () => unknown;
}

export interface CapturedGovernmentSettingsAdapter {
  readGovernmentSettingsReadModel(): GovernmentSettingsReadModel;
  resetToDefaults(): void;
}

function withNoneOption(
  options: readonly GovernmentSettingsOption[],
  hint: string,
): readonly GovernmentSettingsOption[] {
  return Object.freeze([
    Object.freeze({ val: "none", label: "None", hint }),
    ...options,
  ]);
}

export function createCapturedGovernmentSettingsAdapter({
  getSettingsRaw,
}: CapturedGovernmentSettingsDependencies): CapturedGovernmentSettingsAdapter {
  return Object.freeze({
    readGovernmentSettingsReadModel(): GovernmentSettingsReadModel {
      return createGovernmentSettingsReadModel({
        governmentOptions: withNoneOption(
          readCapturedGovernmentOptions(),
          "Do not select government",
        ),
        governorOptions: withNoneOption(
          readCapturedGovernorOptions(),
          "Do not select governor",
        ),
      });
    },
    resetToDefaults() {
      const raw = getSettingsRaw();
      if (!isRecord(raw)) return;
      Object.assign(
        raw,
        computeGovernmentDefaults(readGovernmentResetContext()).def,
      );
    },
  });
}
