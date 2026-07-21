import {
  getStateLogSettingsReadModel,
  type StateLogSettingsControl,
} from "../../domain/state-log-settings.ts";
import type { StateLogSettingsIntentHandler } from "../../ports/state-log-settings.ts";

interface ScrollDocument {
  documentElement: { scrollTop: number };
  body: { scrollTop: number };
}

interface JQueryNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
}

type JQuery = (selector: string) => JQueryNode;

interface StateLogSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly intents: StateLogSettingsIntentHandler;
  readonly buildSettingsSection: (
    sectionId: string,
    sectionName: string,
    resetFunction: () => void,
    updateSettingsContentFunction: () => void,
  ) => void;
  readonly addSettingsToggle: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ) => unknown;
  readonly addSettingsNumber: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ) => unknown;
}

export interface StateLogSettingsBrowserAdapter {
  buildStateLogSettings(): void;
  updateStateLogSettingsContent(): void;
}

export function createStateLogSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  intents,
  buildSettingsSection,
  addSettingsToggle,
  addSettingsNumber,
}: StateLogSettingsBrowserDependencies): StateLogSettingsBrowserAdapter {
  const readModel = getStateLogSettingsReadModel();

  function renderControl(
    node: JQueryNode,
    control: StateLogSettingsControl,
  ): void {
    if (control.kind === "toggle") {
      addSettingsToggle(node, control.settingName, control.label, control.hint);
      return;
    }
    addSettingsNumber(node, control.settingName, control.label, control.hint);
  }

  function buildStateLogSettings(): void {
    buildSettingsSection(
      readModel.sectionId,
      readModel.sectionName,
      () => {
        intents.handle({ type: "reset-state-log-settings" });
        updateStateLogSettingsContent();
      },
      updateStateLogSettingsContent,
    );
  }

  function updateStateLogSettingsContent(): void {
    const document = getDocument();
    const currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;
    const currentNode = getJQuery()(`#script_${readModel.sectionId}Content`);
    currentNode.empty().off("*");

    for (const control of readModel.controls) {
      renderControl(currentNode, control);
    }

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  return Object.freeze({
    buildStateLogSettings,
    updateStateLogSettingsContent,
  });
}
