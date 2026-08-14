import { createMechStats } from "../ui/mech-stats.ts";
import { createSortHelper } from "../ui/sort-helper.ts";

type MechStatsDependencies = Parameters<typeof createMechStats>[0];
type SortHelperDependencies = Parameters<typeof createSortHelper>[0];

export interface UiSupportControlDependencies {
  readonly getUiSurface: MechStatsDependencies["getUiSurface"];
  readonly getMechJQuery: MechStatsDependencies["getJQuery"];
  readonly getSortJQuery: SortHelperDependencies["getJQuery"];
  readonly getMechManager: () => unknown;
  readonly getPoly: () => unknown;
  readonly getGame: () => unknown;
  readonly average: MechStatsDependencies["average"];
  readonly isHTMLElement: SortHelperDependencies["isHTMLElement"];
}

export function createUiSupportControl({
  getUiSurface,
  getMechJQuery,
  getSortJQuery,
  getMechManager,
  getPoly,
  getGame,
  average,
  isHTMLElement,
}: UiSupportControlDependencies) {
  const mechStats = createMechStats({
    getUiSurface,
    getJQuery: getMechJQuery,
    getMechManager: getMechManager as MechStatsDependencies["getMechManager"],
    getPoly: getPoly as MechStatsDependencies["getPoly"],
    getGame: getGame as MechStatsDependencies["getGame"],
    average,
  });
  const sortHelper = createSortHelper({
    getJQuery: getSortJQuery,
    isHTMLElement,
  });

  return Object.freeze({ ...mechStats, ...sortHelper });
}
