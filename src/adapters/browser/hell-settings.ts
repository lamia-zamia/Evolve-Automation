import type {
  HellSettingsControl,
  HellSettingsReadModel,
} from "../../domain/hell-settings.ts";
import type { HellSettingsIntentHandler } from "../../ports/hell-settings.ts";

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
export interface HellSettingsBrowserActions {
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
  readonly addSettingsToggle: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ) => unknown;
}
interface HellSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly reader: { read(): HellSettingsReadModel };
  readonly intents: HellSettingsIntentHandler;
  readonly getActions: () => HellSettingsBrowserActions;
}
export interface HellSettingsBrowserAdapter {
  buildHellSettings(parentNode: JQueryNode, secondaryPrefix: string): void;
  updateHellSettingsContent(secondaryPrefix: string): void;
}

export function createHellSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  reader,
  intents,
  getActions,
}: HellSettingsBrowserDependencies): HellSettingsBrowserAdapter {
  function renderControl(
    node: JQueryNode,
    control: HellSettingsControl,
    actions: HellSettingsBrowserActions,
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
    actions.addSettingsToggle(
      node,
      control.settingName,
      control.label,
      control.hint,
    );
  }
  function buildHellSettings(
    parentNode: JQueryNode,
    secondaryPrefix: string,
  ): void {
    const model = reader.read();
    getActions().buildSettingsSection2(
      parentNode,
      secondaryPrefix,
      model.sectionId,
      model.sectionName,
      () => intents.handle({ type: "reset-hell-settings", secondaryPrefix }),
      updateHellSettingsContent,
    );
  }
  function updateHellSettingsContent(secondaryPrefix: string): void {
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
  return Object.freeze({ buildHellSettings, updateHellSettingsContent });
}
