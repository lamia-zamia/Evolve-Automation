/** Captured read/write adapter for the Government settings surface. */

import {
  createGovernmentSettingsReadModel,
  type GovernmentSettingsOption,
  type GovernmentSettingsReadModel,
} from "../../../domain/civic/government-settings.ts";
import {
  readCapturedGovernmentOptions,
  readCapturedGovernorOptions,
} from "./captured-government-settings-catalog.ts";

export interface CapturedGovernmentSettingsAdapter {
  readGovernmentSettingsReadModel(): GovernmentSettingsReadModel;
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

export function createCapturedGovernmentSettingsAdapter(): CapturedGovernmentSettingsAdapter {
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
  });
}
