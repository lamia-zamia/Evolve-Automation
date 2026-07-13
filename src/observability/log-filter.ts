interface LogFilterState {
  filterRegExp: RegExp | null;
}

interface LogMutation {
  addedNodes: { innerText: string; remove(): void }[];
}

interface LogFilterDependencies {
  getSettingsRaw: () => { logFilter: string };
  getSettings: () => { masterScriptToggle: boolean };
  getState: () => LogFilterState;
  getPoly: () => {
    loc(id: string, params?: string[] | number): string;
  };
}

export function createLogFilter({
  getSettingsRaw,
  getSettings,
  getState,
  getPoly,
}: LogFilterDependencies) {
  function buildFilterRegExp() {
    const settingsRaw = getSettingsRaw();
    const state = getState();
    const poly = getPoly();
    const regexps: string[] = [];
    const validIds: string[] = [];
    const strings = settingsRaw.logFilter.split(/[^0-9a-z_%]/g).filter(Boolean);
    for (const string of strings) {
      const [id, ...rawParams] = string.split("%");
      const params = rawParams.map(poly.loc);
      const message =
        poly.loc(id, params.length ? params : undefined) +
        (id === "civics_garrison_gained" ? "%0" : "");
      if (message === id) continue;
      regexps.push(
        message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%\d/g, ".*"),
      );
      validIds.push(string);
    }
    if (regexps.length > 0) {
      state.filterRegExp = new RegExp(`^(${regexps.join("|")})$`);
      settingsRaw.logFilter = validIds.join(", ");
    } else {
      state.filterRegExp = null;
      settingsRaw.logFilter = "";
    }
  }

  function filterLog(mutations: LogMutation[]) {
    const settings = getSettings();
    const state = getState();
    if (!settings.masterScriptToggle || !state.filterRegExp) return;
    mutations.forEach((mutation) =>
      mutation.addedNodes.forEach((node) => {
        if (state.filterRegExp!.test(node.innerText)) node.remove();
      }),
    );
  }

  return { buildFilterRegExp, filterLog };
}
