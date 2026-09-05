import { createAutocomplete } from "../adapters/browser/autocomplete.ts";
import { createTableSorter } from "../adapters/browser/table-sorter.ts";
import { createMechStats } from "../ui/mech-stats.ts";

type MechStatsDependencies = Parameters<typeof createMechStats>[0];
type TableSorterDependencies = Parameters<typeof createTableSorter>[0];
type AutocompleteDependencies = Parameters<typeof createAutocomplete>[0];

export interface UiSupportControlDependencies {
  readonly getUiSurface: MechStatsDependencies["getUiSurface"];
  readonly getMechJQuery: MechStatsDependencies["getJQuery"];
  readonly getSortable: TableSorterDependencies["getSortable"];
  readonly getDocument: AutocompleteDependencies["getDocument"];
  readonly getMechManager: () => unknown;
  readonly getPoly: () => unknown;
  readonly getGame: () => unknown;
  readonly average: MechStatsDependencies["average"];
}

export function createUiSupportControl({
  getUiSurface,
  getMechJQuery,
  getSortable,
  getDocument,
  getMechManager,
  getPoly,
  getGame,
  average,
}: UiSupportControlDependencies) {
  const mechStats = createMechStats({
    getUiSurface,
    getJQuery: getMechJQuery,
    getMechManager: getMechManager as MechStatsDependencies["getMechManager"],
    getPoly: getPoly as MechStatsDependencies["getPoly"],
    getGame: getGame as MechStatsDependencies["getGame"],
    average,
  });
  const tableSorter = createTableSorter({ getSortable });
  const autocomplete = createAutocomplete({ getDocument });

  return Object.freeze({ ...mechStats, autocomplete, tableSorter });
}
