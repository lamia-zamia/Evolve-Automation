import {
  getWeightingSettingsReadModel,
  type WeightingSettingsControl,
  type WeightingSettingsReadModel,
  type WeightingSettingsRule,
} from "../../domain/weighting-settings.ts";
import type { WeightingSettingsIntentHandler } from "../../ports/weighting-settings.ts";

interface ScrollDocument {
  documentElement: { scrollTop: number };
  body: { scrollTop: number };
}

interface JQueryNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
  append(content: unknown): JQueryNode;
  find(selector: string): JQueryNode;
}

type JQuery = (selector: string) => JQueryNode;
type Action = () => void;

export interface WeightingSettingsBrowserActions {
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
  ) => unknown;
  readonly addTableInput: (node: JQueryNode, settingName: string) => void;
}

interface WeightingSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly intents: WeightingSettingsIntentHandler;
  readonly getActions: () => WeightingSettingsBrowserActions;
  readonly getReadModel?: () => WeightingSettingsReadModel;
}

export interface WeightingSettingsBrowserAdapter {
  buildWeightingSettings(): void;
  updateWeightingSettingsContent(): void;
}

export function createWeightingSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  intents,
  getActions,
  getReadModel = getWeightingSettingsReadModel,
}: WeightingSettingsBrowserDependencies): WeightingSettingsBrowserAdapter {
  function buildWeightingSettings(): void {
    const readModel = getReadModel();
    const actions = getActions();
    actions.buildSettingsSection(
      readModel.sectionId,
      readModel.sectionName,
      () => intents.handle({ type: "reset-weighting-settings" }),
      updateWeightingSettingsContent,
    );
  }

  function updateWeightingSettingsContent(): void {
    const readModel = getReadModel();
    const actions = getActions();
    const document = getDocument();
    const currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;
    const jquery = getJQuery();
    const currentNode = jquery(`#script_${readModel.sectionId}Content`);
    currentNode.empty().off("*");

    for (const control of readModel.controls) {
      renderControl(currentNode, control, actions);
    }

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:30%">Target</th>
              <th class="has-text-warning" style="width:60%">Condition</th>
              <th class="has-text-warning" style="width:10%">Multiplier</th>
            </tr>
            <tbody id="script_weightingTableBody"></tbody>
          </table>`);

    const tableBodyNode = jquery("#script_weightingTableBody");
    for (const rule of readModel.rules) {
      renderRule(tableBodyNode, rule, actions, jquery);
    }

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function renderControl(
    node: JQueryNode,
    control: WeightingSettingsControl,
    actions: WeightingSettingsBrowserActions,
  ): void {
    actions.addSettingsToggle(
      node,
      control.settingName,
      control.label,
      control.hint,
    );
  }

  function renderRule(
    table: JQueryNode,
    rule: WeightingSettingsRule,
    actions: WeightingSettingsBrowserActions,
    jquery: JQuery,
  ): void {
    const ruleNode = jquery(`
          <tr>
            <td style="width:30%"><span class="has-text-info">${rule.target}</span></td>
            <td style="width:60%"><span class="has-text-info">${rule.condition}</span></td>
            <td style="width:10%"></td>
          </tr>`);
    actions.addTableInput(ruleNode.find("td:eq(2)"), rule.settingName);
    table.append(ruleNode);
  }

  return Object.freeze({
    buildWeightingSettings,
    updateWeightingSettingsContent,
  });
}
