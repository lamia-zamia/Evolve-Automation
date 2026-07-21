import {
  getGeneralSettingsReadModel,
  type GeneralSettingsControl,
} from "../../domain/general-settings.ts";
import type { GeneralSettingsIntentHandler } from "../../ports/general-settings.ts";

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

export interface GeneralSettingsBrowserActions {
  readonly buildSettingsSection: (
    sectionId: string,
    sectionName: string,
    resetFunction: Action,
    updateSettingsContentFunction: Action,
  ) => void;
  readonly addSettingsHeader1: (node: JQueryNode, headerText: string) => void;
  readonly addSettingsNumber: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ) => unknown;
  readonly addSettingsSelect: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
    options: readonly { val: string; label: string; hint: string }[],
  ) => unknown;
  readonly addSettingsString: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ) => unknown;
  readonly addSettingsToggle: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ) => unknown;
}

interface GeneralSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly intents: GeneralSettingsIntentHandler;
  readonly getActions: () => GeneralSettingsBrowserActions;
}

export interface GeneralSettingsBrowserAdapter {
  buildGeneralSettings(): void;
  updateGeneralSettingsContent(): void;
}

export function createGeneralSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  intents,
  getActions,
}: GeneralSettingsBrowserDependencies): GeneralSettingsBrowserAdapter {
  const readModel = getGeneralSettingsReadModel();

  function renderControl(
    node: JQueryNode,
    control: GeneralSettingsControl,
    actions: GeneralSettingsBrowserActions,
  ): void {
    switch (control.kind) {
      case "header":
        actions.addSettingsHeader1(node, control.label);
        return;
      case "number":
        actions.addSettingsNumber(
          node,
          control.settingName,
          control.label,
          control.hint,
        );
        return;
      case "select":
        actions.addSettingsSelect(
          node,
          control.settingName,
          control.label,
          control.hint,
          control.options,
        );
        return;
      case "string":
        actions.addSettingsString(
          node,
          control.settingName,
          control.label,
          control.hint,
        );
        return;
      case "toggle":
        actions.addSettingsToggle(
          node,
          control.settingName,
          control.label,
          control.hint,
        );
        return;
    }
  }

  function buildGeneralSettings(): void {
    const actions = getActions();
    actions.buildSettingsSection(
      readModel.sectionId,
      readModel.sectionName,
      () => {
        intents.handle({ type: "reset-general-settings" });
      },
      updateGeneralSettingsContent,
    );
  }

  function updateGeneralSettingsContent(): void {
    const actions = getActions();
    const document = getDocument();
    const currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;
    const currentNode = getJQuery()(`#script_${readModel.sectionId}Content`);
    currentNode.empty().off("*");

    for (const control of readModel.controls) {
      renderControl(currentNode, control, actions);
    }

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  return Object.freeze({
    buildGeneralSettings,
    updateGeneralSettingsContent,
  });
}
