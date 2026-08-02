import {
  getInterfaceSettingsReadModel,
  type InterfaceSettingsControl,
} from "../../domain/interface-settings.ts";
import type { InterfaceSettingsIntentHandler } from "../../ports/interface-settings.ts";
import {
  renderSettingsSectionContent,
  type ScrollDocument,
  type SettingsContentNode as JQueryNode,
} from "./settings-section.ts";

type JQuery = (selector: string) => JQueryNode;
type Action = () => void;

interface InterfaceSettingsControlCallbacks {
  readonly enabled?: Action;
  readonly disabled?: Action;
}

export interface InterfaceSettingsBrowserActions {
  readonly buildSettingsSection: (
    sectionId: string,
    sectionName: string,
    resetFunction: Action,
    updateSettingsContentFunction: Action,
  ) => void;
  readonly addSettingsToggle: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
    enabledCallBack?: Action,
    disabledCallBack?: Action,
  ) => unknown;
  readonly addSettingsHeader1: (node: JQueryNode, headerText: string) => void;
  readonly controlEffects: Readonly<
    Record<string, InterfaceSettingsControlCallbacks>
  >;
}

interface InterfaceSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly intents: InterfaceSettingsIntentHandler;
  readonly getActions: () => InterfaceSettingsBrowserActions;
}

export interface InterfaceSettingsBrowserAdapter {
  buildInterfaceSettings(): void;
  updateInterfaceSettingsContent(): void;
}

export function createInterfaceSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  intents,
  getActions,
}: InterfaceSettingsBrowserDependencies): InterfaceSettingsBrowserAdapter {
  const readModel = getInterfaceSettingsReadModel();

  function renderControl(
    node: JQueryNode,
    control: InterfaceSettingsControl,
    actions: InterfaceSettingsBrowserActions,
  ): void {
    if (control.kind === "header") {
      actions.addSettingsHeader1(node, control.label);
      return;
    }

    const callbacks = actions.controlEffects[control.settingName];
    actions.addSettingsToggle(
      node,
      control.settingName,
      control.label,
      control.hint,
      callbacks?.enabled,
      callbacks?.disabled,
    );
  }

  function buildInterfaceSettings(): void {
    const actions = getActions();
    actions.buildSettingsSection(
      readModel.sectionId,
      readModel.sectionName,
      () => {
        intents.handle({ type: "reset-interface-settings" });
      },
      updateInterfaceSettingsContent,
    );
  }

  function updateInterfaceSettingsContent(): void {
    const actions = getActions();
    renderSettingsSectionContent(
      {
        scrollDocument: getDocument(),
        jquery: getJQuery(),
        sectionId: readModel.sectionId,
      },
      (currentNode) => {
        for (const control of readModel.controls) {
          renderControl(currentNode, control, actions);
        }
      },
    );
  }

  return Object.freeze({
    buildInterfaceSettings,
    updateInterfaceSettingsContent,
  });
}
