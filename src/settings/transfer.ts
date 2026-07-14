type EvalOverride = {
  type1?: string;
  arg1?: string;
  type2?: string;
  arg2?: string;
  ret?: string;
};

type ImportedSettings = {
  scriptName?: string;
  overrides?: Record<string, EvalOverride[]>;
  triggers?: Array<{ requirementType?: string; requirementId?: string }>;
  log_prestige_format?: string;
  [key: string]: unknown;
};

type SettingsTransferActions = {
  updateStandAloneSettings: () => void;
  updateStateFromSettings: () => void;
  updateSettingsFromState: () => void;
  removeScriptSettings: () => void;
  removeMechInfo: () => void;
  removeStorageToggles: () => void;
  removeMarketToggles: () => void;
  removeArpaToggles: () => void;
  removeCraftToggles: () => void;
  removeBuildingToggles: () => void;
  removeEjectToggles: () => void;
  removeSupplyToggles: () => void;
  updateUI: () => void;
  buildFilterRegExp: () => void;
};

type JQuery = {
  (selector: string): { remove: () => void };
  isEmptyObject: (value: unknown) => boolean;
};

type SettingsTransferDependencies = {
  getSettingsRaw: () => ImportedSettings;
  setSettingsRaw: (value: ImportedSettings) => void;
  getJQuery: () => JQuery;
  getGameLog: () => {
    logInfo: (type: string, message: string) => void;
  };
  getActions: () => SettingsTransferActions;
  confirmImport: (message: string) => boolean;
  logToConsole: (message: string) => void;
};

export function createSettingsTransfer({
  getSettingsRaw,
  setSettingsRaw,
  getJQuery,
  getGameLog,
  getActions,
  confirmImport,
  logToConsole,
}: SettingsTransferDependencies) {
  function importSettings(str: string) {
    //let saveState = JSON.parse(LZString.decompressFromBase64(str));
    const saveState = JSON.parse(str) as ImportedSettings | null;
    const jquery = getJQuery();
    if (
      !saveState &&
      typeof saveState === "object" &&
      (saveState!.scriptName === "TMVictor" || jquery.isEmptyObject(saveState))
    ) {
      return false;
    }
    const evals: string[] = [];
    Object.values(saveState!.overrides ?? []).forEach((list) =>
      list.forEach((override) => {
        if (override.type1 === "Eval") {
          evals.push(override.arg1 as string);
        }
        if (override.type2 === "Eval") {
          evals.push(override.arg2 as string);
        }
      }),
    );
    saveState!.triggers?.forEach((trigger) => {
      if (trigger.requirementType === "Eval") {
        evals.push(trigger.requirementId as string);
      }
    });
    Object.values(saveState!.overrides?.log_prestige_format ?? []).forEach(
      (prestigeLogFormatOverride) => {
        if (prestigeLogFormatOverride.ret!.includes("{eval:")) {
          evals.push(prestigeLogFormatOverride.ret as string);
        }
      },
    );

    if (saveState!.log_prestige_format?.includes("{eval:")) {
      evals.push(saveState!.log_prestige_format);
    }

    if (
      evals.length > 0 &&
      !confirmImport(
        "Warning! Imported settings includes evaluated code, which will have full access to browser page, and can be potentially dangerous.\nOnly continue if you trust the source. Injected code:\n" +
          evals.join("\n"),
      )
    ) {
      return false;
    }
    logToConsole("Importing script settings");
    setSettingsRaw(saveState!);
    const actions = getActions();
    actions.updateStandAloneSettings();
    actions.updateStateFromSettings();
    actions.updateSettingsFromState();
    actions.removeScriptSettings();
    actions.removeMechInfo();
    actions.removeStorageToggles();
    actions.removeMarketToggles();
    actions.removeArpaToggles();
    actions.removeCraftToggles();
    actions.removeBuildingToggles();
    actions.removeEjectToggles();
    actions.removeSupplyToggles();
    getJQuery()("#autoScriptContainer").remove();
    actions.updateUI();
    actions.buildFilterRegExp();

    getGameLog().logInfo("special", "Settings successfully imported");

    return true;
  }

  function exportSettings() {
    logToConsole("Exporting script settings");
    // return LZString.compressToBase64(JSON.stringify(global));
    return JSON.stringify(getSettingsRaw());
  }

  return { importSettings, exportSettings };
}
