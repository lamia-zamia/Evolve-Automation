import {
  getAuthoritySettingsReadModel,
  type AuthoritySettingsControl,
} from "../../domain/authority-settings.ts";
import type { AuthoritySettingsIntentHandler } from "../../ports/authority-settings.ts";

interface ScrollDocument {
  documentElement: { scrollTop: number };
  body: { scrollTop: number };
}

interface JQueryNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
}

type JQuery = (selector: string) => JQueryNode;

export interface AuthoritySettingsBrowserActions {
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

interface AuthoritySettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly intents: AuthoritySettingsIntentHandler;
  readonly getActions: () => AuthoritySettingsBrowserActions;
}

export interface AuthoritySettingsBrowserAdapter {
  buildAuthoritySettings(): void;
  updateAuthoritySettingsContent(): void;
}

export function createAuthoritySettingsBrowserAdapter({
  getDocument,
  getJQuery,
  intents,
  getActions,
}: AuthoritySettingsBrowserDependencies): AuthoritySettingsBrowserAdapter {
  const readModel = getAuthoritySettingsReadModel();

  function renderControl(
    node: JQueryNode,
    control: AuthoritySettingsControl,
    actions: AuthoritySettingsBrowserActions,
  ): void {
    if (control.kind === "toggle") {
      actions.addSettingsToggle(
        node,
        control.settingName,
        control.label,
        control.hint,
      );
      return;
    }
    actions.addSettingsNumber(
      node,
      control.settingName,
      control.label,
      control.hint,
    );
  }

  function buildAuthoritySettings(): void {
    const actions = getActions();
    actions.buildSettingsSection(
      readModel.sectionId,
      readModel.sectionName,
      () => {
        intents.handle({ type: "reset-authority-settings" });
      },
      updateAuthoritySettingsContent,
    );
  }

  function updateAuthoritySettingsContent(): void {
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
    buildAuthoritySettings,
    updateAuthoritySettingsContent,
  });
}
