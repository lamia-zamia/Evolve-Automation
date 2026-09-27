import type {
  MechSettingsControl,
  MechSettingsReadModel,
} from "../../domain/combat/mech-settings.ts";
import type { MechSettingsIntentHandler } from "../../ports/mech-settings.ts";
import {
  renderSettingsSectionContent,
  type ScrollDocument,
  type SettingsContentNode,
} from "./settings-section.ts";
interface JQueryNode extends SettingsContentNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
  append(content: unknown): JQueryNode;
  on(events: string, handler: () => void): JQueryNode;
}
type JQuery = (selector: string) => JQueryNode;
type Action = () => void;
export interface MechSettingsBrowserActions {
  readonly buildSettingsSection: (
    sectionId: string,
    sectionName: string,
    resetFunction: Action,
    updateSettingsContentFunction: Action,
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
    options: readonly unknown[],
  ) => unknown;
  readonly addSettingsToggle: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ) => unknown;
  readonly addStandardHeading: (node: JQueryNode, label: string) => unknown;
}
interface MechSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly reader: { read(): MechSettingsReadModel };
  readonly intents: MechSettingsIntentHandler;
  readonly getActions: () => MechSettingsBrowserActions;
}
export interface MechSettingsBrowserAdapter {
  buildMechSettings(): void;
  updateMechSettingsContent(): void;
}

export function createMechSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  reader,
  intents,
  getActions,
}: MechSettingsBrowserDependencies): MechSettingsBrowserAdapter {
  function renderControl(
    node: JQueryNode,
    control: MechSettingsControl,
    actions: MechSettingsBrowserActions,
  ): void {
    if (control.kind === "header") {
      actions.addStandardHeading(node, control.label);
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
  function buildMechSettings(): void {
    const model = reader.read();
    getActions().buildSettingsSection(
      model.sectionId,
      model.sectionName,
      () => intents.handle({ type: "reset-mech-settings" }),
      updateMechSettingsContent,
    );
  }
  function updateMechSettingsContent(): void {
    const model = reader.read();
    const actions = getActions();
    renderSettingsSectionContent(
      {
        scrollDocument: getDocument(),
        jquery: getJQuery(),
        sectionId: model.sectionId,
      },
      (node) => {
        renderMechContent(node, model, actions);
      },
    );
  }

  function renderMechContent(
    node: JQueryNode,
    model: MechSettingsReadModel,
    actions: MechSettingsBrowserActions,
  ): void {
    for (const control of model.controls) {
      renderControl(node, control, actions);
    }
  }
  return Object.freeze({ buildMechSettings, updateMechSettingsContent });
}
