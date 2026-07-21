import {
  type ResearchSettingsControl,
  type ResearchSettingsReadModel,
  type ResearchSettingsTechnologyCatalog,
} from "../../domain/research-settings.ts";
import type { ResearchSettingsIntentHandler } from "../../ports/research-settings.ts";

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

export interface ResearchSettingsBrowserActions {
  readonly buildSettingsSection: (
    sectionId: string,
    sectionName: string,
    resetFunction: Action,
    updateSettingsContentFunction: Action,
  ) => void;
  readonly addSettingsSelect: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
    options: readonly { val: string; label: string; hint: string }[],
  ) => unknown;
  readonly addSettingsList: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
    list: ResearchSettingsTechnologyCatalog,
  ) => unknown;
}

interface ResearchSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly getReadModel: () => ResearchSettingsReadModel;
  readonly intents: ResearchSettingsIntentHandler;
  readonly getActions: () => ResearchSettingsBrowserActions;
}

export interface ResearchSettingsBrowserAdapter {
  buildResearchSettings(): void;
  updateResearchSettingsContent(): void;
}

export function createResearchSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  getReadModel,
  intents,
  getActions,
}: ResearchSettingsBrowserDependencies): ResearchSettingsBrowserAdapter {
  function renderControl(
    node: JQueryNode,
    control: ResearchSettingsControl,
    actions: ResearchSettingsBrowserActions,
  ): void {
    if (control.kind === "select") {
      actions.addSettingsSelect(
        node,
        control.settingName,
        control.label,
        control.hint,
        control.options,
      );
      return;
    }
    actions.addSettingsList(
      node,
      control.settingName,
      control.label,
      control.hint,
      control.list,
    );
  }

  function buildResearchSettings(): void {
    const readModel = getReadModel();
    const actions = getActions();
    actions.buildSettingsSection(
      readModel.sectionId,
      readModel.sectionName,
      () => {
        intents.handle({ type: "reset-research-settings" });
      },
      updateResearchSettingsContent,
    );
  }

  function updateResearchSettingsContent(): void {
    const readModel = getReadModel();
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
    buildResearchSettings,
    updateResearchSettingsContent,
  });
}
