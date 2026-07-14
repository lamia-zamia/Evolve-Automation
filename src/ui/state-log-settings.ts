interface ScrollDocument {
  documentElement: { scrollTop: number };
  body: { scrollTop: number };
}

interface JQueryNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
}

type JQuery = (selector: string) => JQueryNode;

interface StateLogSettingsDependencies {
  getDocument: () => ScrollDocument;
  getJQuery: () => JQuery;
  resetStateLogSettings: (reset: boolean) => void;
  updateSettingsFromState: () => void;
  buildSettingsSection: (
    sectionId: string,
    sectionName: string,
    resetFunction: () => void,
    updateSettingsContentFunction: () => void,
  ) => void;
  addSettingsToggle: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ) => unknown;
  addSettingsNumber: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ) => unknown;
}

export function createStateLogSettings({
  getDocument,
  getJQuery,
  resetStateLogSettings,
  updateSettingsFromState,
  buildSettingsSection,
  addSettingsToggle,
  addSettingsNumber,
}: StateLogSettingsDependencies) {
  function buildStateLogSettings() {
    const sectionId = "stateLog";
    const sectionName = "State Log";

    const resetFunction = function () {
      resetStateLogSettings(true);
      updateSettingsFromState();
      updateStateLogSettingsContent();
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateStateLogSettingsContent,
    );
  }

  function updateStateLogSettingsContent() {
    const document = getDocument();
    const currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    const currentNode = getJQuery()("#script_stateLogContent");
    currentNode.empty().off("*");

    addSettingsToggle(
      currentNode,
      "stateLogEnabled",
      "Record state log",
      "Record compact bottleneck-focused snapshots of game state over the run into localStorage (key ea_state_log), for offline analysis. Retrieve via window.eaExportStateLog() in the console.",
    );
    addSettingsToggle(
      currentNode,
      "stateLogAutoDownload",
      "Auto-download log on reset",
      "When a reset (prestige) commits, automatically download the recorded state log as a JSON file.",
    );
    addSettingsNumber(
      currentNode,
      "stateLogInterval",
      "Sample every N ticks",
      "How often to record a state snapshot, counted in processed script ticks. A full run stays well under the 20000-sample cap at the default.",
    );

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  return { buildStateLogSettings, updateStateLogSettingsContent };
}
