import type { TableSorter } from "./table-sorter.ts";
import {
  type StorageSettingsControl,
  type StorageSettingsReadModel,
} from "../../domain/economy/storage/storage-settings.ts";
import type { StorageSettingsIntentHandler } from "../../ports/storage-settings.ts";
import {
  renderSettingsSectionContent,
  type ScrollDocument,
  type SettingsContentNode,
} from "./settings-section.ts";

interface JQueryNode extends SettingsContentNode {
  /** The element itself, which the table sorter attaches to. */
  readonly 0: unknown;
  empty(): JQueryNode;
  off(events: string): JQueryNode;
  append(content: unknown): JQueryNode;
  next(): JQueryNode;
}

type JQuery = (selector: string) => JQueryNode;
type Action = () => void;

export interface StorageSettingsBrowserActions {
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
  readonly addTableToggle: (node: JQueryNode, settingName: string) => void;
  readonly buildTableLabel: (label: string) => unknown;
  readonly getTableSorter: () => TableSorter;
}

interface StorageSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly getReadModel: () => StorageSettingsReadModel;
  readonly intents: StorageSettingsIntentHandler;
  readonly getActions: () => StorageSettingsBrowserActions;
}

export interface StorageSettingsBrowserAdapter {
  buildStorageSettings(): void;
  updateStorageSettingsContent(): void;
}

export function createStorageSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  getReadModel,
  intents,
  getActions,
}: StorageSettingsBrowserDependencies): StorageSettingsBrowserAdapter {
  function buildStorageSettings(): void {
    const readModel = getReadModel();
    const actions = getActions();
    actions.buildSettingsSection(
      readModel.sectionId,
      readModel.sectionName,
      () => intents.handle({ type: "reset-storage-settings" }),
      updateStorageSettingsContent,
    );
  }

  function updateStorageSettingsContent(): void {
    const readModel = getReadModel();
    const actions = getActions();
    renderSettingsSectionContent(
      {
        scrollDocument: getDocument(),
        jquery: getJQuery(),
        sectionId: readModel.sectionId,
      },
      (currentNode) => {
        renderStorageContent(currentNode, readModel, actions);
      },
    );
  }

  function renderStorageContent(
    currentNode: JQueryNode,
    readModel: StorageSettingsReadModel,
    actions: StorageSettingsBrowserActions,
  ): void {
    for (const control of readModel.controls) {
      renderControl(currentNode, control, actions);
    }

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:35%">Resource</th>
              <th class="has-text-warning" style="width:15%">Enabled</th>
              <th class="has-text-warning" style="width:15%">Store Overflow</th>
              <th class="has-text-warning" style="width:15%">Min Storage</th>
              <th class="has-text-warning" style="width:15%">Max Storage</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_storageTableBody"></tbody>
          </table>`);

    const tableBodyNode = getJQuery()("#script_storageTableBody");
    let newTableBodyText = "";
    for (const row of readModel.rows) {
      newTableBodyText += `<tr value="${row.id}" class="script-draggable"><td id="script_storage_${row.id}" style="width:35%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>`;
    }
    tableBodyNode.append(getJQuery()(newTableBodyText));

    for (const row of readModel.rows) {
      let storageElement = getJQuery()(`#script_storage_${row.id}`);
      storageElement.append(actions.buildTableLabel(row.label));

      storageElement = storageElement.next();
      actions.addTableToggle(storageElement, row.enabledSettingName);

      storageElement = storageElement.next();
      actions.addTableToggle(storageElement, row.overflowSettingName);

      storageElement = storageElement.next();
      actions.addTableInput(storageElement, row.minimumSettingName);

      storageElement = storageElement.next();
      actions.addTableInput(storageElement, row.maximumSettingName);
    }

    actions.getTableSorter().attach(tableBodyNode[0], {
      items: "tr:not(.unsortable)",
      attribute: "value",
      onOrderChanged: (resourceIds) => {
        intents.handle({ type: "reorder-storage-resources", resourceIds });
      },
    });
  }

  function renderControl(
    node: JQueryNode,
    control: StorageSettingsControl,
    actions: StorageSettingsBrowserActions,
  ): void {
    actions.addSettingsToggle(
      node,
      control.settingName,
      control.label,
      control.hint,
    );
  }

  return Object.freeze({
    buildStorageSettings,
    updateStorageSettingsContent,
  });
}
