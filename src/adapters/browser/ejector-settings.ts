import type {
  EjectorSettingsControl,
  EjectorSettingsReadModel,
  EjectorSettingsRow,
} from "../../domain/economy/resources/ejector-settings.ts";
import type { EjectorSettingsIntentHandler } from "../../ports/ejector-settings.ts";

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

export interface EjectorSettingsBrowserActions {
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
  readonly addTableToggle: (node: JQueryNode, settingName: string) => void;
  readonly buildTableLabel: (
    label: string,
    title: string,
    color: string,
  ) => unknown;
}

interface EjectorSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly reader: { read(): EjectorSettingsReadModel };
  readonly intents: EjectorSettingsIntentHandler;
  readonly getActions: () => EjectorSettingsBrowserActions;
}

export interface EjectorSettingsBrowserAdapter {
  buildEjectorSettings(): void;
  updateEjectorSettingsContent(): void;
}

export function createEjectorSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  reader,
  intents,
  getActions,
}: EjectorSettingsBrowserDependencies): EjectorSettingsBrowserAdapter {
  function buildEjectorSettings(): void {
    const readModel = reader.read();
    const actions = getActions();
    actions.buildSettingsSection(
      readModel.sectionId,
      readModel.sectionName,
      () => intents.handle({ type: "reset-ejector-settings" }),
      updateEjectorSettingsContent,
    );
  }

  function updateEjectorSettingsContent(): void {
    const readModel = reader.read();
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
              <th class="has-text-warning" style="width:20%">Resource</th>
              <th class="has-text-warning" style="width:20%">Atomic Mass</th>
              <th class="has-text-warning" style="width:10%">Eject</th>
              <th class="has-text-warning" style="width:10%">Nanite</th>
              <th class="has-text-warning" style="width:30%">Supply Value</th>
              <th class="has-text-warning" style="width:10%">Supply</th>
            </tr>
            <tbody id="script_ejectorTableBody"></tbody>
          </table>`);

    const tableBodyNode = jquery("#script_ejectorTableBody");
    let newTableBodyText = "";
    for (const row of readModel.rows) {
      newTableBodyText += `<tr><td id="script_eject_${row.id}" style="width:20%"></td><td style="width:20%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:30%"></td><td style="width:10%"></td></tr>`;
    }
    tableBodyNode.append(jquery(newTableBodyText));

    for (const row of readModel.rows) {
      let cell = jquery(`#script_eject_${row.id}`);
      cell.append(actions.buildTableLabel(row.label, "", row.color));
      cell = cell.next();
      if (row.atomicMass > 0) {
        cell.append(
          `<span class="mass"><span class="has-text-warning">${row.atomicMass}</span> kt</span>`,
        );
      }
      cell = cell.next();
      if (row.showEject) actions.addTableToggle(cell, row.ejectSettingName);
      cell = cell.next();
      if (row.showNanite) actions.addTableToggle(cell, row.naniteSettingName);
      if (row.showSupply) {
        cell = cell.next();
        cell.append(
          `<span class="mass">Export <span class="has-text-caution">${row.supplyOut}</span>, Gain <span class="has-text-success">${row.supplyIn}</span></span>`,
        );
        cell = cell.next();
        actions.addTableToggle(cell, row.supplySettingName);
      }
    }

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function renderControl(
    node: JQueryNode,
    control: EjectorSettingsControl,
    actions: EjectorSettingsBrowserActions,
  ): void {
    if (control.kind === "select") {
      actions.addSettingsSelect(
        node,
        control.settingName,
        control.label,
        control.hint,
        control.options,
      );
    } else if (control.kind === "toggle") {
      actions.addSettingsToggle(
        node,
        control.settingName,
        control.label,
        control.hint,
      );
    } else {
      actions.addSettingsNumber(
        node,
        control.settingName,
        control.label,
        control.hint,
      );
    }
  }

  return Object.freeze({
    buildEjectorSettings,
    updateEjectorSettingsContent,
  });
}
