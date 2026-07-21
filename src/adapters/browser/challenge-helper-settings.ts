import {
  getChallengeHelperSettingsReadModel,
  type ChallengeHelperSettingsControl,
} from "../../domain/challenge-helper-settings.ts";
import type { ChallengeHelperSettingsIntentHandler } from "../../ports/challenge-helper-settings.ts";

interface ScrollDocument {
  documentElement: { scrollTop: number };
  body: { scrollTop: number };
}

interface JQueryNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
}

type JQuery = (selector: string) => JQueryNode;

export interface ChallengeHelperSettingsBrowserActions {
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

interface ChallengeHelperSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly intents: ChallengeHelperSettingsIntentHandler;
  readonly getActions: () => ChallengeHelperSettingsBrowserActions;
}

export interface ChallengeHelperSettingsBrowserAdapter {
  buildChallengeHelperSettings(): void;
  updateChallengeHelperSettingsContent(): void;
}

export function createChallengeHelperSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  intents,
  getActions,
}: ChallengeHelperSettingsBrowserDependencies): ChallengeHelperSettingsBrowserAdapter {
  const readModel = getChallengeHelperSettingsReadModel();

  function renderControl(
    node: JQueryNode,
    control: ChallengeHelperSettingsControl,
    actions: ChallengeHelperSettingsBrowserActions,
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

  function buildChallengeHelperSettings(): void {
    const actions = getActions();
    actions.buildSettingsSection(
      readModel.sectionId,
      readModel.sectionName,
      () => {
        intents.handle({ type: "reset-challenge-helper-settings" });
      },
      updateChallengeHelperSettingsContent,
    );
  }

  function updateChallengeHelperSettingsContent(): void {
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
    buildChallengeHelperSettings,
    updateChallengeHelperSettingsContent,
  });
}
