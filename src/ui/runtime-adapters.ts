type RuntimeAdapterSettings = {
  activeTargetsUI: boolean;
  buildPlannerUI: boolean;
  showSettings: boolean;
  autoCraft: boolean;
  autoBuild: boolean;
  autoStorage: boolean;
  autoMarket: boolean;
  autoEject: boolean;
  autoSupply: boolean;
  autoARPA: boolean;
  autoMech: boolean;
};

type RuntimeAdapterActions = {
  buildActiveTargetsUI: () => void;
  buildBuildPlannerUI: () => void;
  buildScriptSettings: () => void;
  createCraftToggles: () => void;
  createBuildingToggles: () => void;
  createStorageToggles: () => void;
  createMarketToggles: () => void;
  createEjectToggles: () => void;
  createSupplyToggles: () => void;
  createArpaToggles: () => void;
  createMechInfo: () => void;
};

type JQueryNode = {
  length: number;
  next: () => { length: number };
  parent: () => { append: (node: JQueryNode) => unknown };
  eq: (index: number) => { click: () => unknown };
};

type RuntimeAdapterDependencies = {
  getSettings: () => { hellTurnOffLogMessages: boolean };
  getSettingsRaw: () => RuntimeAdapterSettings;
  getState: () => { buildingToggles: number };
  getGame: () => {
    global: {
      settings: {
        showStorage: boolean;
        showMarket: boolean;
        showEjector: boolean;
        showCargo: boolean;
        showGenetics: boolean;
        showMechLab: boolean;
      };
      portal: { fortress?: { notify?: string; s_ntfy?: string } };
    };
  };
  getJQuery: () => (selector: string) => JQueryNode;
  getActions: () => RuntimeAdapterActions;
};

export function createRuntimeAdapters({
  getSettings,
  getSettingsRaw,
  getState,
  getGame,
  getJQuery,
  getActions,
}: RuntimeAdapterDependencies) {
  function repairRuntimeAdapters(scriptNode: JQueryNode) {
    const settingsRaw = getSettingsRaw();
    const state = getState();
    const game = getGame();
    const jquery = getJQuery();
    const actions = getActions();
    const reordered = scriptNode.next().length > 0;
    if (reordered) {
      scriptNode.parent().append(scriptNode);
    }

    if (
      settingsRaw.activeTargetsUI &&
      jquery("#active_targets-wrapper").length === 0
    ) {
      actions.buildActiveTargetsUI();
    }
    if (
      settingsRaw.buildPlannerUI &&
      jquery("#script_planner-wrapper").length === 0
    ) {
      actions.buildBuildPlannerUI();
    }
    if (settingsRaw.showSettings && jquery("#script_settings").length === 0) {
      actions.buildScriptSettings();
    }
    if (
      settingsRaw.autoCraft &&
      jquery("#resources .ea-craft-toggle").length === 0
    ) {
      actions.createCraftToggles();
    }
    // Building toggles added to different tabs, game can redraw just one tab, destroying toggles there, and we still have total number of toggles above zero; we'll remember amount of toggle, and redraw it when number differ from what we have in game
    if (settingsRaw.autoBuild) {
      const currentBuildingToggles = jquery(
        "#mTabCivil .ea-building-toggle",
      ).length;
      if (
        currentBuildingToggles === 0 ||
        currentBuildingToggles !== state.buildingToggles
      ) {
        actions.createBuildingToggles();
      }
    }
    if (
      settingsRaw.autoStorage &&
      game.global.settings.showStorage &&
      jquery("#resStorage .ea-storage-toggle").length === 0
    ) {
      actions.createStorageToggles();
    }
    if (
      settingsRaw.autoMarket &&
      game.global.settings.showMarket &&
      jquery("#market .ea-market-toggle").length === 0
    ) {
      actions.createMarketToggles();
    }
    if (
      settingsRaw.autoEject &&
      game.global.settings.showEjector &&
      jquery("#resEjector .ea-eject-toggle").length === 0
    ) {
      actions.createEjectToggles();
    }
    if (
      settingsRaw.autoSupply &&
      game.global.settings.showCargo &&
      jquery("#resCargo .ea-supply-toggle").length === 0
    ) {
      actions.createSupplyToggles();
    }
    if (
      settingsRaw.autoARPA &&
      game.global.settings.showGenetics &&
      jquery("#arpaPhysics .ea-arpa-toggle").length === 0
    ) {
      actions.createArpaToggles();
    }

    if (
      settingsRaw.autoMech &&
      game.global.settings.showMechLab &&
      jquery("#mechList .ea-mech-info").length <
        jquery("#mechList .mechRow").length
    ) {
      actions.createMechInfo();
    }

    // Hell messages
    if (getSettings().hellTurnOffLogMessages) {
      if (game.global.portal.fortress?.notify === "Yes") {
        jquery("#fort .b-checkbox").eq(0).click();
      }
      if (game.global.portal.fortress?.s_ntfy === "Yes") {
        jquery("#fort .b-checkbox").eq(1).click();
      }
    }

    return reordered;
  }

  return { repairRuntimeAdapters };
}
