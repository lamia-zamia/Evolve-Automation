import { createPrestigeTopBarBrowserAdapter } from "../adapters/browser/prestige-top-bar.ts";
import { createTotalDaysTopBarBrowserAdapter } from "../adapters/browser/total-days-top-bar.ts";
import { createPrestigeTopBarEvolveAdapter } from "../adapters/evolve/progression/prestige/prestige-top-bar.ts";
import { createTotalDaysTopBarEvolveAdapter } from "../adapters/evolve/total-days-top-bar.ts";

type PrestigeReaderDependencies = Parameters<
  typeof createPrestigeTopBarEvolveAdapter
>[0];
type PrestigeBrowserDependencies = Parameters<
  typeof createPrestigeTopBarBrowserAdapter
>[0];
type TotalDaysReaderDependencies = Parameters<
  typeof createTotalDaysTopBarEvolveAdapter
>[0];
type TotalDaysBrowserDependencies = Parameters<
  typeof createTotalDaysTopBarBrowserAdapter
>[0];

export interface TopBarControlsDependencies {
  readonly getPrestigeSettings: PrestigeReaderDependencies["getSettings"];
  readonly getPrestigeTypes: PrestigeReaderDependencies["getPrestigeTypes"];
  readonly getPrestigeDocument: PrestigeBrowserDependencies["getDocument"];
  readonly addPrestigeOptionUi: PrestigeBrowserDependencies["options"]["addOptionUI"];
  readonly buildPrestigeSettings: PrestigeBrowserDependencies["buildPrestigeSettings"];
  readonly getTotalDaysSettings: TotalDaysReaderDependencies["getSettings"];
  readonly getTotalDaysGame: TotalDaysReaderDependencies["getGame"];
  readonly getTotalDaysDocument: TotalDaysBrowserDependencies["getDocument"];
  readonly getTotalDaysJQuery: TotalDaysBrowserDependencies["getJQuery"];
}

export function createTopBarControls({
  getPrestigeSettings,
  getPrestigeTypes,
  getPrestigeDocument,
  addPrestigeOptionUi,
  buildPrestigeSettings,
  getTotalDaysSettings,
  getTotalDaysGame,
  getTotalDaysDocument,
  getTotalDaysJQuery,
}: TopBarControlsDependencies) {
  const prestigeTopBarReader = createPrestigeTopBarEvolveAdapter({
    getSettings: getPrestigeSettings,
    getPrestigeTypes,
  });
  const prestigeTopBarBrowserAdapter = createPrestigeTopBarBrowserAdapter({
    getDocument: getPrestigeDocument,
    reader: prestigeTopBarReader,
    options: { addOptionUI: addPrestigeOptionUi },
    buildPrestigeSettings,
  });
  const totalDaysTopBarReader = createTotalDaysTopBarEvolveAdapter({
    getSettings: getTotalDaysSettings,
    getGame: getTotalDaysGame,
  });
  const totalDaysTopBarBrowserAdapter = createTotalDaysTopBarBrowserAdapter({
    getDocument: getTotalDaysDocument,
    getJQuery: getTotalDaysJQuery,
    reader: totalDaysTopBarReader,
  });

  return Object.freeze({
    prestigeTopBarReader,
    prestigeTopBarBrowserAdapter,
    updatePrestigeInTopBar: prestigeTopBarBrowserAdapter.updatePrestigeInTopBar,
    totalDaysTopBarReader,
    totalDaysTopBarBrowserAdapter,
    updateTotalDaysInTopBar:
      totalDaysTopBarBrowserAdapter.updateTotalDaysInTopBar,
  });
}
