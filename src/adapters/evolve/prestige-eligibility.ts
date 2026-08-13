import {
  getBlackholeMass as getBlackholeMassPolicy,
  isApocalypsePrestigeAvailable as isApocalypsePrestigeAvailablePolicy,
  isAscensionPrestigeAvailable as isAscensionPrestigeAvailablePolicy,
  isBioseedPrestigeAvailable as isBioseedPrestigeAvailablePolicy,
  isCataclysmPrestigeAvailable as isCataclysmPrestigeAvailablePolicy,
  isDemonicPrestigeAvailable as isDemonicPrestigeAvailablePolicy,
  isGeckNeeded as isGeckNeededPolicy,
  isPillarFinished as isPillarFinishedPolicy,
  isPrestigeAllowed as isPrestigeAllowedPolicy,
  isWhiteholePrestigeAvailable as isWhiteholePrestigeAvailablePolicy,
  isWitchAscensionPrestigeAvailable as isWitchAscensionPrestigeAvailablePolicy,
} from "../../domain/progression/prestige/prestige-eligibility.ts";
import {
  readAscensionEligibilityView,
  readGeckEligibilityView,
  readPillarEligibilityView,
  readPrestigeEligibilityView,
  readPrestigePermissionView,
  readWitchAscensionEligibilityView,
} from "./progression/prestige/prestige-eligibility.ts";

type ExternalQuery = (...args: unknown[]) => unknown;

interface PrestigeEligibilityDependencies {
  readonly getSettings: () => unknown;
  readonly getGame: () => unknown;
  readonly getResources: () => unknown;
  readonly getBuildings: () => unknown;
  readonly getTechIds: () => unknown;
  readonly getMechManager: () => unknown;
  readonly haveTech: ExternalQuery;
  readonly isAchievementUnlocked: ExternalQuery;
}

export interface PrestigeEligibility {
  isPrestigeAllowed(type: string): boolean;
  isCataclysmPrestigeAvailable(): boolean;
  isBioseederPrestigeAvailable(): boolean;
  isWhiteholePrestigeAvailable(): boolean;
  isApocalypsePrestigeAvailable(): boolean;
  isAscensionPrestigeAvailable(): boolean;
  isWitchAscensionPrestigeAvailable(demonic: unknown): boolean;
  isDemonicPrestigeAvailable(): boolean;
  isPillarFinished(): boolean;
  isGECKNeeded(): boolean;
  getBlackholeMass(): number;
}

export function createPrestigeEligibility({
  getSettings,
  getGame,
  getResources,
  getBuildings,
  getTechIds,
  getMechManager,
  haveTech,
  isAchievementUnlocked,
}: PrestigeEligibilityDependencies): PrestigeEligibility {
  const readPrestigeView = () =>
    readPrestigeEligibilityView(
      getSettings(),
      getGame(),
      getResources(),
      getBuildings(),
      getTechIds(),
      getMechManager(),
      haveTech,
      isAchievementUnlocked,
    );

  function isPrestigeAllowed(type: string): boolean {
    const result = readPrestigePermissionView(getSettings(), getGame());
    return result.status === "ready"
      ? isPrestigeAllowedPolicy(result.view, type)
      : false;
  }

  function isCataclysmPrestigeAvailable(): boolean {
    const result = readPrestigeView();
    return result.status === "ready"
      ? isCataclysmPrestigeAvailablePolicy(result.view)
      : false;
  }

  function isBioseederPrestigeAvailable(): boolean {
    const result = readPrestigeView();
    return result.status === "ready"
      ? isBioseedPrestigeAvailablePolicy(result.view)
      : false;
  }

  function isWhiteholePrestigeAvailable(): boolean {
    const result = readPrestigeView();
    return result.status === "ready"
      ? isWhiteholePrestigeAvailablePolicy(result.view)
      : false;
  }

  function isApocalypsePrestigeAvailable(): boolean {
    const result = readPrestigeView();
    return result.status === "ready"
      ? isApocalypsePrestigeAvailablePolicy(result.view)
      : false;
  }

  function isAscensionPrestigeAvailable(): boolean {
    const result = readAscensionEligibilityView(
      getSettings(),
      getGame(),
      getResources(),
      getBuildings(),
    );
    return result.status === "ready"
      ? isAscensionPrestigeAvailablePolicy(result.view)
      : false;
  }

  function isWitchAscensionPrestigeAvailable(demonic: unknown): boolean {
    const isDemonic = Boolean(demonic);
    const result = readWitchAscensionEligibilityView(
      getSettings(),
      getGame(),
      getResources(),
      getBuildings(),
      isDemonic,
      haveTech,
    );
    return result.status === "ready"
      ? isWitchAscensionPrestigeAvailablePolicy(result.view, isDemonic)
      : false;
  }

  function isDemonicPrestigeAvailable(): boolean {
    const result = readPrestigeView();
    return result.status === "ready"
      ? isDemonicPrestigeAvailablePolicy(result.view)
      : false;
  }

  function isPillarFinished(): boolean {
    const result = readPillarEligibilityView(
      getSettings(),
      getGame(),
      getResources(),
    );
    return result.status === "ready"
      ? isPillarFinishedPolicy(result.view)
      : false;
  }

  function isGECKNeeded(): boolean {
    const result = readGeckEligibilityView(
      getSettings(),
      getBuildings(),
      isAchievementUnlocked,
    );
    return result.status === "ready" ? isGeckNeededPolicy(result.view) : true;
  }

  function getBlackholeMass(): number {
    const result = readPrestigeView();
    return result.status === "ready" ? getBlackholeMassPolicy(result.view) : 0;
  }

  return {
    isPrestigeAllowed,
    isCataclysmPrestigeAvailable,
    isBioseederPrestigeAvailable,
    isWhiteholePrestigeAvailable,
    isApocalypsePrestigeAvailable,
    isAscensionPrestigeAvailable,
    isWitchAscensionPrestigeAvailable,
    isDemonicPrestigeAvailable,
    isPillarFinished,
    isGECKNeeded,
    getBlackholeMass,
  };
}
