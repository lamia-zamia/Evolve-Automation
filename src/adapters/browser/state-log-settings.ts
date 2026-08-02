import {
  getStateLogSettingsReadModel,
  type StateLogSettingsControl,
} from "../../domain/state-log-settings.ts";
import type { StateLogSettingsIntentHandler } from "../../ports/state-log-settings.ts";
import {
  renderSettingsSectionContent,
  type ScrollDocument,
  type SettingsContentNode as JQueryNode,
} from "./settings-section.ts";

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
      () => intents.handle({ type: "reset-state-log-settings" }),
      updateStateLogSettingsContent,
    );
  }

  function updateStateLogSettingsContent(): void {
    renderSettingsSectionContent(
      {
        scrollDocument: getDocument(),
        jquery: getJQuery(),
        sectionId: readModel.sectionId,
      },
      (currentNode) => {
        for (const control of readModel.controls) {
          renderControl(currentNode, control);
        }
      },
    );
  }

  return Object.freeze({
    buildStateLogSettings,
    updateStateLogSettingsContent,
  });
}
