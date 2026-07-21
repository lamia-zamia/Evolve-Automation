import {
  getAchievementGuardSettingsReadModel,
  type AchievementGuardSettingsControl,
} from "../../domain/achievement-guard-settings.ts";
import type { AchievementGuardSettingsIntentHandler } from "../../ports/achievement-guard-settings.ts";

interface ScrollDocument {
  documentElement: { scrollTop: number };
  body: { scrollTop: number };
}

interface JQueryNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
}

type JQuery = (selector: string) => JQueryNode;

export interface AchievementGuardSettingsBrowserActions {
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
}

interface AchievementGuardSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly intents: AchievementGuardSettingsIntentHandler;
  readonly getActions: () => AchievementGuardSettingsBrowserActions;
}

export interface AchievementGuardSettingsBrowserAdapter {
  buildAchievementGuardSettings(): void;
  updateAchievementGuardSettingsContent(): void;
}

export function createAchievementGuardSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  intents,
  getActions,
}: AchievementGuardSettingsBrowserDependencies): AchievementGuardSettingsBrowserAdapter {
  const readModel = getAchievementGuardSettingsReadModel();

  function renderControl(
    node: JQueryNode,
    control: AchievementGuardSettingsControl,
    actions: AchievementGuardSettingsBrowserActions,
  ): void {
    actions.addSettingsToggle(
      node,
      control.settingName,
      control.label,
      control.hint,
    );
  }

  function buildAchievementGuardSettings(): void {
    const actions = getActions();
    actions.buildSettingsSection(
      readModel.sectionId,
      readModel.sectionName,
      () => {
        intents.handle({ type: "reset-achievement-guard-settings" });
      },
      updateAchievementGuardSettingsContent,
    );
  }

  function updateAchievementGuardSettingsContent(): void {
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
    buildAchievementGuardSettings,
    updateAchievementGuardSettingsContent,
  });
}
