import {
  type GovernmentSettingsControl,
  type GovernmentSettingsReadModel,
} from "../../domain/civic/government-settings.ts";
import type { GovernmentSettingsIntentHandler } from "../../ports/government-settings.ts";

interface ScrollDocument {
  documentElement: { scrollTop: number };
  body: { scrollTop: number };
}

interface JQueryNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
}
type Action = () => void;
type JQuery = (selector: string) => JQueryNode;

export interface GovernmentSettingsBrowserActions {
  readonly buildSettingsSection2: (
    parentNode: JQueryNode,
    secondaryPrefix: string,
    sectionId: string,
    sectionName: string,
    resetFunction: Action,
    updateSettingsContentFunction: (secondaryPrefix: string) => void,
  ) => void;
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
}

interface GovernmentSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly getReadModel: () => GovernmentSettingsReadModel;
  readonly intents: GovernmentSettingsIntentHandler;
  readonly getActions: () => GovernmentSettingsBrowserActions;
}

export interface GovernmentSettingsBrowserAdapter {
  buildGovernmentSettings(
    parentNode: JQueryNode,
    secondaryPrefix: string,
  ): void;
  updateGovernmentSettingsContent(secondaryPrefix: string): void;
}

export function createGovernmentSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  getReadModel,
  intents,
  getActions,
}: GovernmentSettingsBrowserDependencies): GovernmentSettingsBrowserAdapter {
  function renderControl(
    node: JQueryNode,
    control: GovernmentSettingsControl,
    actions: GovernmentSettingsBrowserActions,
  ): void {
    if (control.kind === "number") {
      actions.addSettingsNumber(
        node,
        control.settingName,
        control.label,
        control.hint,
      );
      return;
    }
    actions.addSettingsSelect(
      node,
      control.settingName,
      control.label,
      control.hint,
      control.options,
    );
  }

  function buildGovernmentSettings(
    parentNode: JQueryNode,
    secondaryPrefix: string,
  ): void {
    const readModel = getReadModel();
    const actions = getActions();
    actions.buildSettingsSection2(
      parentNode,
      secondaryPrefix,
      readModel.sectionId,
      readModel.sectionName,
      () => {
        intents.handle({
          type: "reset-government-settings",
          secondaryPrefix,
        });
      },
      updateGovernmentSettingsContent,
    );
  }

  function updateGovernmentSettingsContent(secondaryPrefix: string): void {
    const readModel = getReadModel();
    const actions = getActions();
    const document = getDocument();
    const currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;
    const currentNode = getJQuery()(
      `#script_${secondaryPrefix}${readModel.sectionId}Content`,
    );
    currentNode.empty().off("*");

    for (const control of readModel.controls) {
      renderControl(currentNode, control, actions);
    }

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  return Object.freeze({
    buildGovernmentSettings,
    updateGovernmentSettingsContent,
  });
}
