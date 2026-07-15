import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface AuthoritySettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createAuthoritySettings({
  getDependency,
  getOverride,
}: AuthoritySettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const addSettingsNumber = liveFunction(() =>
    getDependency("addSettingsNumber"),
  );
  const addSettingsToggle = liveFunction(() =>
    getDependency("addSettingsToggle"),
  );
  const buildSettingsSection = liveFunction(() =>
    getDependency("buildSettingsSection"),
  );
  const document = liveObject(() => getDependency("document"));
  const resetAuthoritySettings = liveFunction(() =>
    getDependency("resetAuthoritySettings"),
  );
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildAuthoritySettingsImpl() {
    const resetFunction = function () {
      resetAuthoritySettings(true);
      updateSettingsFromState();
      updateAuthoritySettingsContent();
    };

    buildSettingsSection(
      "authority",
      "Authority",
      resetFunction,
      updateAuthoritySettingsContent,
    );
  }

  function updateAuthoritySettingsContentImpl() {
    const currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;
    const currentNode = $("#script_authorityContent");
    currentNode.empty().off("*");

    addSettingsToggle(
      currentNode,
      "authorityManage",
      "Manage Authority",
      "Global switch for Authority automation. Controls morale capping, home and Hell soldier reserves, outer-fleet crew protection, and Authority-cap building weighting.",
    );
    addSettingsNumber(
      currentNode,
      "generalMinimumAuthority",
      "Target Authority",
      "Evil universe only. Authority below 100 causes a global production penalty of 0.35% per point. Set to -1 to target the current Authority maximum, or 0 to disable target-based management while leaving the global switch on.",
    );
    addSettingsNumber(
      currentNode,
      "generalAuthorityMinPatrolPercent",
      "Minimum Hell patrol percentage",
      "Only applies when Target Authority is -1. Reserves at least this percentage of available Hell soldiers for patrols and Soul Gem income before stationing the rest for Authority.",
    );
    addSettingsNumber(
      currentNode,
      "buildingWeightingAuthority",
      "Authority-cap building multiplier",
      "AutoBuild weighting multiplier for buildings that raise the Authority cap while it is below the configured target.",
    );

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildAuthoritySettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildAuthoritySettings") ?? buildAuthoritySettingsImpl;
    return implementation.apply(this, args);
  }

  function updateAuthoritySettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateAuthoritySettingsContent") ??
      updateAuthoritySettingsContentImpl;
    return implementation.apply(this, args);
  }

  return { buildAuthoritySettings, updateAuthoritySettingsContent };
}
