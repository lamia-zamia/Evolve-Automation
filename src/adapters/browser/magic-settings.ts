import {
  type MagicAlchemyRow,
  type MagicPylonRow,
  type MagicSettingsControl,
  type MagicSettingsReadModel,
} from "../../domain/magic-settings.ts";
import type { MagicSettingsIntentHandler } from "../../ports/magic-settings.ts";

interface ScrollDocument {
  documentElement: { scrollTop: number };
  body: { scrollTop: number };
}

interface JQueryNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
  append(content: unknown): JQueryNode;
  next(): JQueryNode;
}

type JQuery = (selector: string) => JQueryNode;
type Action = () => void;

export interface MagicSettingsBrowserActions {
  readonly buildSettingsSection: (
    sectionId: string,
    sectionName: string,
    resetFunction: Action,
    updateSettingsContentFunction: Action,
  ) => void;
  readonly addStandardHeading: (node: JQueryNode, heading: string) => void;
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
  readonly addTableInput: (node: JQueryNode, settingName: string) => void;
  readonly addTableToggle: (node: JQueryNode, settingName: string) => void;
  readonly buildTableLabel: (
    label: string,
    title?: string,
    color?: string,
  ) => unknown;
}

interface MagicSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly getReadModel: () => MagicSettingsReadModel;
  readonly intents: MagicSettingsIntentHandler;
  readonly getActions: () => MagicSettingsBrowserActions;
}

export interface MagicSettingsBrowserAdapter {
  buildMagicSettings(): void;
  updateMagicSettingsContent(): void;
}

export function createMagicSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  getReadModel,
  intents,
  getActions,
}: MagicSettingsBrowserDependencies): MagicSettingsBrowserAdapter {
  function buildMagicSettings(): void {
    const readModel = getReadModel();
    const actions = getActions();
    actions.buildSettingsSection(
      readModel.sectionId,
      readModel.sectionName,
      () => intents.handle({ type: "reset-magic-settings" }),
      updateMagicSettingsContent,
    );
  }

  function updateMagicSettingsContent(): void {
    const readModel = getReadModel();
    const actions = getActions();
    const document = getDocument();
    const currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;
    const currentNode = getJQuery()(`#script_${readModel.sectionId}Content`);
    currentNode.empty().off("*");
    const jquery = getJQuery();

    for (const control of readModel.alchemyControls) {
      renderControl(currentNode, control, actions);
    }
    renderAlchemy(currentNode, readModel.alchemyRows, actions, jquery);
    for (const control of readModel.pylonControls) {
      renderControl(currentNode, control, actions);
    }
    renderPylon(currentNode, readModel.pylonRows, actions, jquery);

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function renderControl(
    node: JQueryNode,
    control: MagicSettingsControl,
    actions: MagicSettingsBrowserActions,
  ): void {
    switch (control.kind) {
      case "heading":
        actions.addStandardHeading(node, control.label);
        return;
      case "number":
        actions.addSettingsNumber(
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

  function renderAlchemy(
    currentNode: JQueryNode,
    rows: readonly MagicAlchemyRow[],
    actions: MagicSettingsBrowserActions,
    getJQuery: JQuery,
  ): void {
    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:20%">Resource</th>
              <th class="has-text-warning" style="width:20%">Enabled</th>
              <th class="has-text-warning" style="width:20%">Weighting</th>
              <th class="has-text-warning" style="width:40%"></th>
            </tr>
            <tbody id="script_alchemyTableBody"></tbody>
          </table>`);
    const tableBodyNode = getJQuery("#script_alchemyTableBody");
    let newTableBodyText = "";
    for (const row of rows) {
      newTableBodyText += `<tr><td id="script_alchemy_${row.id}" style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:40%"></td></tr>`;
    }
    tableBodyNode.append(getJQuery(newTableBodyText));

    for (const row of rows) {
      let node = getJQuery(`#script_alchemy_${row.id}`);
      node.append(actions.buildTableLabel(row.label, "", row.color));
      node = node.next();
      actions.addTableToggle(node, row.enabledSettingName);
      node = node.next();
      actions.addTableInput(node, row.weightingSettingName);
    }
  }

  function renderPylon(
    currentNode: JQueryNode,
    rows: readonly MagicPylonRow[],
    actions: MagicSettingsBrowserActions,
    getJQuery: JQuery,
  ): void {
    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:55%">Ritual</th>
              <th class="has-text-warning" style="width:20%">Weighting</th>
              <th style="width:25%"></th>
            </tr>
            <tbody id="script_magicTableBodyPylon"></tbody>
          </table>`);
    const tableBodyNode = getJQuery("#script_magicTableBodyPylon");
    let newTableBodyText = "";
    for (const row of rows) {
      newTableBodyText += `<tr><td id="script_pylon_${row.id}" style="width:55%"></td><td style="width:20%"></td><td style="width:25%"></td></tr>`;
    }
    tableBodyNode.append(getJQuery(newTableBodyText));

    for (const row of rows) {
      let node = getJQuery(`#script_pylon_${row.id}`);
      node.append(actions.buildTableLabel(row.label));
      node = node.next();
      actions.addTableInput(node, row.weightingSettingName);
    }
  }

  return Object.freeze({
    buildMagicSettings,
    updateMagicSettingsContent,
  });
}
