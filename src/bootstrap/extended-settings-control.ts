import {
  createAchievementGuardSettingsControl,
  createAuthoritySettingsControl,
  createChallengeHelperSettingsControl,
  createGeneralSettingsControl,
} from "./settings/core-settings-controls.ts";
import { createGovernmentSettingsControl } from "./settings/government-planet-settings-controls.ts";
import { createPrestigeSettingsControl } from "./settings/prestige-settings-control.ts";

type GeneralDependencies = Parameters<typeof createGeneralSettingsControl>[0];
type AchievementGuardDependencies = Parameters<
  typeof createAchievementGuardSettingsControl
>[0];
type ChallengeHelperDependencies = Parameters<
  typeof createChallengeHelperSettingsControl
>[0];
type PrestigeDependencies = Parameters<typeof createPrestigeSettingsControl>[0];
type GovernmentDependencies = Parameters<
  typeof createGovernmentSettingsControl
>[0];
type AuthorityDependencies = Parameters<
  typeof createAuthoritySettingsControl
>[0];

export interface ExtendedSettingsControlDependencies {
  general: GeneralDependencies;
  achievementGuard: AchievementGuardDependencies;
  challengeHelper: ChallengeHelperDependencies;
  prestige: PrestigeDependencies;
  government: GovernmentDependencies;
  authority: AuthorityDependencies;
}

export function createExtendedSettingsControl({
  general,
  achievementGuard,
  challengeHelper,
  prestige,
  government,
  authority,
}: ExtendedSettingsControlDependencies) {
  return {
    generalSettingsBrowserAdapter: createGeneralSettingsControl(general),
    achievementGuardSettingsBrowserAdapter:
      createAchievementGuardSettingsControl(achievementGuard),
    challengeHelperSettingsBrowserAdapter:
      createChallengeHelperSettingsControl(challengeHelper),
    prestigeSettingsBrowserAdapter: createPrestigeSettingsControl(prestige),
    governmentSettingsBrowserAdapter:
      createGovernmentSettingsControl(government),
    authoritySettingsBrowserAdapter: createAuthoritySettingsControl(authority),
  };
}
