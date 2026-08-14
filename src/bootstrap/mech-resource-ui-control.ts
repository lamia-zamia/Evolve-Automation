import { createMechInfoBrowserAdapter } from "../adapters/browser/mech-info.ts";
import { createResourceToggleBrowserAdapter } from "../adapters/browser/resource-toggles.ts";
import { createMechInfoEvolveAdapter } from "../adapters/evolve/combat/mech-info.ts";
import { createResourceToggleEvolveAdapter } from "../adapters/evolve/economy/resources/resource-toggles.ts";

type MechEvolveDependencies = Parameters<typeof createMechInfoEvolveAdapter>[0];
type MechBrowserDependencies = Parameters<
  typeof createMechInfoBrowserAdapter
>[0];
type ResourceEvolveDependencies = Parameters<
  typeof createResourceToggleEvolveAdapter
>[0];
type ResourceBrowserDependencies = Parameters<
  typeof createResourceToggleBrowserAdapter
>[0];

export interface MechResourceUiControlDependencies {
  readonly getMechInfoGame: () => unknown;
  readonly getMechManager: () => unknown;
  readonly getNiceNumber: (value: number) => string | number;
  readonly getMechInfoDocument: MechBrowserDependencies["getDocument"];
  readonly getMechInfoJQuery: MechBrowserDependencies["getJQuery"];
  readonly getMechInfoVueById: MechBrowserDependencies["getVueById"];
  readonly getResourceToggleGame: () => unknown;
  readonly getSettingsRaw: () => unknown;
  readonly getMarketManager: () => unknown;
  readonly getStorageManager: () => unknown;
  readonly getResourceToggleJQuery: ResourceBrowserDependencies["getJQuery"];
  readonly addToggleCallbacks: ResourceBrowserDependencies["addToggleCallbacks"];
}

export function createMechResourceUiControl({
  getMechInfoGame,
  getMechManager,
  getNiceNumber,
  getMechInfoDocument,
  getMechInfoJQuery,
  getMechInfoVueById,
  getResourceToggleGame,
  getSettingsRaw,
  getMarketManager,
  getStorageManager,
  getResourceToggleJQuery,
  addToggleCallbacks,
}: MechResourceUiControlDependencies) {
  const mechInfo = createMechInfoEvolveAdapter({
    getGame: getMechInfoGame as MechEvolveDependencies["getGame"],
    getMechManager: getMechManager as MechEvolveDependencies["getMechManager"],
    getNiceNumber: getNiceNumber as MechEvolveDependencies["getNiceNumber"],
  });
  const mechInfoBrowser = createMechInfoBrowserAdapter({
    getDocument: getMechInfoDocument,
    getJQuery: getMechInfoJQuery,
    getVueById: getMechInfoVueById,
    reader: mechInfo.reader,
    observer: mechInfo.observer,
  });
  const resourceToggleReader = createResourceToggleEvolveAdapter({
    getGame: getResourceToggleGame as ResourceEvolveDependencies["getGame"],
    getSettingsRaw:
      getSettingsRaw as ResourceEvolveDependencies["getSettingsRaw"],
    getMarketManager:
      getMarketManager as ResourceEvolveDependencies["getMarketManager"],
    getStorageManager:
      getStorageManager as ResourceEvolveDependencies["getStorageManager"],
  });
  const resourceToggleBrowser = createResourceToggleBrowserAdapter({
    getJQuery: getResourceToggleJQuery,
    reader: resourceToggleReader,
    addToggleCallbacks,
  });

  return Object.freeze({
    mechInfoReader: mechInfo.reader,
    mechInfoObserver: mechInfo.observer,
    mechInfoBrowserAdapter: mechInfoBrowser,
    resourceToggleReader,
    resourceToggleBrowserAdapter: resourceToggleBrowser,
    createMechInfo: mechInfoBrowser.createMechInfo,
    removeMechInfo: mechInfoBrowser.removeMechInfo,
    createMarketToggles: resourceToggleBrowser.createMarketToggles,
    removeMarketToggles: resourceToggleBrowser.removeMarketToggles,
    createStorageToggles: resourceToggleBrowser.createStorageToggles,
    removeStorageToggles: resourceToggleBrowser.removeStorageToggles,
  });
}
