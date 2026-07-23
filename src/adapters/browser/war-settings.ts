import type {
  WarSettingsControl,
  WarSettingsReadModel,
} from "../../domain/combat/war-settings.ts";
import type { WarSettingsIntentHandler } from "../../ports/war-settings.ts";

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

export interface WarSettingsBrowserActions {
  readonly buildSettingsSection2: (
    parentNode: JQueryNode,
    secondaryPrefix: string,
    sectionId: string,
    sectionName: string,
    resetFunction: Action,
    updateSettingsContentFunction: (secondaryPrefix: string) => void,
  ) => void;
  readonly addSettingsHeader1: (node: JQueryNode, label: string) => unknown;
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
    options: readonly unknown[],
  ) => unknown;
  readonly addSettingsToggle: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ) => unknown;
}

interface WarSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly reader: { read(): WarSettingsReadModel };
  readonly intents: WarSettingsIntentHandler;
  readonly getActions: () => WarSettingsBrowserActions;
}

export interface WarSettingsBrowserAdapter {
  buildWarSettings(parentNode: JQueryNode, secondaryPrefix: string): void;
  updateWarSettingsContent(secondaryPrefix: string): void;
}

export function createWarSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  reader,
  intents,
  getActions,
}: WarSettingsBrowserDependencies): WarSettingsBrowserAdapter {
  function renderControl(
    node: JQueryNode,
    control: WarSettingsControl,
    actions: WarSettingsBrowserActions,
  ): void {
    if (control.kind === "header") {
      actions.addSettingsHeader1(node, control.label);
      return;
    }
    if (control.kind === "number") {
      actions.addSettingsNumber(
        node,
        control.settingName,
        control.label,
        control.hint,
      );
      return;
    }
    if (control.kind === "toggle") {
      actions.addSettingsToggle(
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
  function buildWarSettings(
    parentNode: JQueryNode,
    secondaryPrefix: string,
  ): void {
    const model = reader.read();
    getActions().buildSettingsSection2(
      parentNode,
      secondaryPrefix,
      model.sectionId,
      model.sectionName,
      () => intents.handle({ type: "reset-war-settings", secondaryPrefix }),
      updateWarSettingsContent,
    );
  }
  function updateWarSettingsContent(secondaryPrefix: string): void {
    const model = reader.read();
    const document = getDocument();
    const scroll =
      document.documentElement.scrollTop || document.body.scrollTop;
    const node = getJQuery()(
      `#script_${secondaryPrefix}${model.sectionId}Content`,
    );
    node.empty().off("*");
    const actions = getActions();
    for (const control of model.controls) renderControl(node, control, actions);
    document.documentElement.scrollTop = document.body.scrollTop = scroll;
  }
  return Object.freeze({ buildWarSettings, updateWarSettingsContent });
}
