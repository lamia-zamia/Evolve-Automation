interface InterfaceSettingsState {
  activeTargetsUI: boolean;
  buildPlannerUI: boolean;
}

interface ScrollDocument {
  documentElement: { scrollTop: number };
  body: { scrollTop: number };
}

interface JQueryNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
}

type JQuery = (selector: string) => JQueryNode;
type Action = () => void;

interface InterfaceSettingsActions {
  resetInterfaceSettings(reset: boolean): void;
  updateSettingsFromState(): void;
  buildSettingsSection(
    sectionId: string,
    sectionName: string,
    resetFunction: Action,
    updateSettingsContentFunction: Action,
  ): void;
  addSettingsToggle(
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
    enabledCallBack?: Action,
    disabledCallBack?: Action,
  ): unknown;
  addSettingsHeader1(node: JQueryNode, headerText: string): void;
  buildActiveTargetsUI: Action;
  removeActiveTargetsUI: Action;
  buildBuildPlannerUI: Action;
  removeBuildPlannerUI: Action;
  updatePrestigeInTopBar: Action;
  updateTotalDaysInTopBar: Action;
}

interface InterfaceSettingsDependencies {
  getSettingsRaw: () => InterfaceSettingsState;
  getDocument: () => ScrollDocument;
  getJQuery: () => JQuery;
  getActions: () => InterfaceSettingsActions;
}

export function createInterfaceSettings({
  getSettingsRaw,
  getDocument,
  getJQuery,
  getActions,
}: InterfaceSettingsDependencies) {
  function buildInterfaceSettings() {
    const actions = getActions();
    const sectionId = "interface";
    const sectionName = "Interface";

    const resetFunction = function () {
      actions.resetInterfaceSettings(true);
      actions.updateSettingsFromState();
      updateInterfaceSettingsContent();

      const settingsRaw = getSettingsRaw();
      if (settingsRaw.activeTargetsUI) {
        actions.buildActiveTargetsUI();
      } else {
        actions.removeActiveTargetsUI();
      }

      if (settingsRaw.buildPlannerUI) {
        actions.buildBuildPlannerUI();
      } else {
        actions.removeBuildPlannerUI();
      }

      actions.updatePrestigeInTopBar();
      actions.updateTotalDaysInTopBar();
    };

    actions.buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateInterfaceSettingsContent,
    );
  }

  function updateInterfaceSettingsContent() {
    const actions = getActions();
    const document = getDocument();
    const currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    const currentNode = getJQuery()("#script_interfaceContent");
    currentNode.empty().off("*");

    actions.addSettingsToggle(
      currentNode,
      "activeTargetsUI",
      "Display detailed queue",
      "Add UI in right column to display currently active queued buildings, technologies, and triggers and their resources.",
      actions.buildActiveTargetsUI,
      actions.removeActiveTargetsUI,
    );
    actions.addSettingsToggle(
      currentNode,
      "buildPlannerUI",
      "Display script planner",
      "Add UI below the message log showing the top buildings/projects autoBuild wants next, their weights, what's blocking them, and cumulative bottleneck statistics for the current run.",
      actions.buildBuildPlannerUI,
      actions.removeBuildPlannerUI,
    );
    actions.addSettingsToggle(
      currentNode,
      "displayPrestigeTypeInTopBar",
      "Display prestige type in top bar",
      "Show the currently selected prestige type in the top bar",
      actions.updatePrestigeInTopBar,
      actions.updatePrestigeInTopBar,
    );
    actions.addSettingsToggle(
      currentNode,
      "displayTotalDaysTypeInTopBar",
      "Display total days in top bar",
      "Show the total days next to this year's days",
      actions.updateTotalDaysInTopBar,
      actions.updateTotalDaysInTopBar,
    );
    actions.addSettingsHeader1(currentNode, "Experimental");
    actions.addSettingsToggle(
      currentNode,
      "performanceHackAvoidDrawTech",
      "Enable performance hack: drawTech avoidance",
      "Enables experimental performance hacks designed to avoid excessive redraws of expensive game tabs. The ARPA path preserves game behaviour; the repeat-building path is narrowly guarded but may still be risky if game internals change.",
    );

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  return { buildInterfaceSettings, updateInterfaceSettingsContent };
}
