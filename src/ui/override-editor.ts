import type { TableSorter } from "../adapters/browser/table-sorter.ts";
// The override editor: the modal a setting opens, the condition table inside it, the drag order,
// and the disabled inputs that show the setting's effective value. Every change it makes to stored
// settings is a typed intent handled elsewhere.

import { parseOverrideCondition } from "../domain/override-resolution.ts";
import type { OverrideEditor } from "../ports/override-editing.ts";
import type { DelegatedEvent, JQuery, JQueryNode } from "./jquery.ts";
import type {
  OverrideConditionControls,
  StoredSettings,
} from "./override-condition-controls.ts";
import type {
  ObjectListSource,
  SettingsInputOptions,
} from "./settings-inputs.ts";

/** What a settings control binds to its click so the editor knows which setting to open. */
export interface OverrideModalData {
  readonly label: string;
  readonly name: string;
  readonly type: string;
  readonly options?: SettingsInputOptions;
}

/** The click a settings control reports so a modifier-held click opens the override editor. */
export type OverrideModalEvent = DelegatedEvent<OverrideModalData>;

interface OverrideEditorControlsDependencies {
  /** Every stored change the editor makes. This module never writes settings itself. */
  readonly overrideEditor: OverrideEditor;
  readonly conditionControls: OverrideConditionControls;
  readonly getJQuery: () => JQuery;
  readonly getSettingsRaw: () => StoredSettings;
  readonly getSettings: () => Record<string, unknown>;
  readonly getTechIds: () => Record<string, { name?: unknown } | undefined>;
  readonly getCheckCustom: () => Record<string, string | undefined>;
  /** The modifier key that turns a click on a settings control into an override edit. */
  readonly getOverrideKey: () => string;
  readonly getOpenOptionsModal: () => (
    title: string,
    buildOptions: (modal: JQueryNode) => void,
  ) => void;
  readonly getTableSorter: () => TableSorter;
  readonly buildInputNode: (
    type: string,
    options: SettingsInputOptions,
    value: unknown,
    callback: (value: unknown) => void,
  ) => JQueryNode | string;
}

export interface OverrideEditorControls {
  openOverrideModal(event: OverrideModalEvent): void;
  buildOverrideSettings(
    settingName: string,
    type: string,
    options: SettingsInputOptions,
  ): void;
  buildInputNodeForDisplay(
    type: string,
    options: SettingsInputOptions,
    value: unknown,
  ): JQueryNode;
  changeDisplayInputNode(currentNode: JQueryNode): JQueryNode;
}

function listNames(value: unknown, nameOf: (item: unknown) => unknown): string {
  return Array.isArray(value)
    ? value.map((item) => nameOf(item) ?? "[Invalid item]").join(", ")
    : "";
}

export function createOverrideEditorControls({
  overrideEditor,
  conditionControls,
  getJQuery,
  getSettingsRaw,
  getSettings,
  getTechIds,
  getCheckCustom,
  getOverrideKey,
  getOpenOptionsModal,
  getTableSorter,
  buildInputNode,
}: OverrideEditorControlsDependencies): OverrideEditorControls {
  const $ = getJQuery();

  function openOverrideModal(event: OverrideModalEvent): void {
    if (event[getOverrideKey()]) {
      event.preventDefault();
      getOpenOptionsModal()(event.data.label, (modal) => {
        modal.append(
          `<div style="margin-top: 10px; margin-bottom: 10px;" id="script_${event.data.name}Modal"></div>`,
        );
        $(".script-modal-content").addClass("override-modal");
        buildOverrideSettings(
          event.data.name,
          event.data.type,
          event.data.options,
        );
      });
    }
  }

  function buildOverrideSettings(
    settingName: string,
    type: string,
    options: SettingsInputOptions,
  ): void {
    const rebuild = () => buildOverrideSettings(settingName, type, options);
    const overrides = getSettingsRaw().overrides[settingName] ?? [];

    const currentNode = $(`#script_${settingName}Modal`);
    currentNode.empty().off("*");

    currentNode.append(`
          <table style="width:100%; text-align: left">
            <tr>
              <th class="has-text-warning" colspan="2">Variable 1</th>
              <th class="has-text-warning" colspan="1">Check</th>
              <th class="has-text-warning" colspan="2">Variable 2</th>
              <th class="has-text-warning" colspan="3">Result</th>
            </tr>
            <tr>
              <th class="has-text-warning" style="width:16%">Type</th>
              <th class="has-text-warning" style="width:16%">Value</th>
              <th class="has-text-warning" style="width:10%"></th>
              <th class="has-text-warning" style="width:16%">Type</th>
              <th class="has-text-warning" style="width:16%">Value</th>
              <th class="has-text-warning" style="width:14%"></th>
              <th style="width:12%"></th>
            </tr>
            <tbody id="script_${settingName}ModalTable"></tbody>
          </table>`);

    let newTableBodyText = "";
    for (let i = 0; i < overrides.length; i++) {
      newTableBodyText += `<tr id="script_${settingName}_o${i}" value="${i}" class="script-draggable"><td style="width:16%"></td><td style="width:16%"></td><td style="width:10%"></td><td style="width:16%"></td><td style="width:16%"></td><td style="width:14%"></td><td style="width:12%"><span class="script-lastcolumn"></span></td></tr>`;
    }

    const listField = typeof getSettingsRaw()[settingName] === "object";
    const note = listField
      ? "All values passed checks will be added or removed from list"
      : "First value passed check will be used. Default value:";
    const note_2 = "The current value:";

    const current = listField
      ? `<td style="width:32%" colspan="2">${note_2}</td>
          <td style="width:56%" colspan="4"></td>`
      : `<td style="width:74%" colspan="5">${note_2}</td>
          <td style="width:14%"></td>`;

    newTableBodyText += `
          <tr id="script_${settingName}_d" class="unsortable">
            <td style="width:74%" colspan="5">${note}</td>
            <td style="width:14%"></td>
            <td style="width:12%"><a class="button is-small" style="width: 26px; height: 26px"><span>+</span></a></td>
          </tr>
          <tr id="script_override_true_value" class="unsortable" value="${settingName}" type="${type}">
            ${current}
            <td style="width:12%"></td>
          </tr>`;
    const tableBodyNode = $(`#script_${settingName}ModalTable`);
    tableBodyNode.append($(newTableBodyText));

    // Default input
    if (!listField) {
      $(`#script_${settingName}_d td:eq(1)`).append(
        buildInputNode(
          type,
          options,
          getSettingsRaw()[settingName],
          (result) => {
            overrideEditor.setSettingValue(settingName, result);

            const retType = typeof result === "boolean" ? "checked" : "value";
            $(".script_" + settingName).prop(
              retType,
              getSettingsRaw()[settingName],
            );
          },
        ),
      );
    }
    $(`#script_override_true_value td:eq(1)`).append(
      buildInputNodeForDisplay(type, options, getSettings()[settingName]),
    );

    // Add button
    $(`#script_${settingName}_d a`).on("click", () => {
      const outcome = overrideEditor.applyEdit({
        kind: "add-condition",
        settingKey: settingName,
        result: getSettingsRaw()[settingName],
      });
      if (outcome.conditionCount === 1) {
        $(".script_bg_" + settingName).addClass("inactive-row");
      }
      rebuild();
    });

    for (let i = 0; i < overrides.length; i++) {
      // The storage boundary drops conditions that cannot be parsed, so a row without one is a
      // shape the editor never stored. It keeps its position and renders no controls.
      const condition = parseOverrideCondition(overrides[i]);
      if (condition === undefined) {
        continue;
      }
      let tableElement = $(`#script_${settingName}_o${i}`).children().eq(0);

      tableElement.append(
        conditionControls.buildConditionType(
          settingName,
          i,
          condition,
          1,
          rebuild,
        ),
      );
      tableElement = tableElement.next();
      tableElement.append(
        conditionControls.buildConditionArg(settingName, i, condition, 1),
      );
      tableElement = tableElement.next();
      tableElement.append(
        conditionControls.buildConditionComparator(
          settingName,
          i,
          condition,
          rebuild,
        ),
      );
      tableElement = tableElement.next();
      tableElement.append(
        conditionControls.buildConditionType(
          settingName,
          i,
          condition,
          2,
          rebuild,
        ),
      );
      tableElement = tableElement.next();
      tableElement.append(
        conditionControls.buildConditionArg(settingName, i, condition, 2),
      );
      tableElement = tableElement.next();
      if (!getCheckCustom()[condition.comparator]) {
        tableElement.append(
          conditionControls.buildConditionRet(
            settingName,
            i,
            condition,
            type,
            options,
          ),
        );
      }
      tableElement = tableElement.next();
      tableElement.append(
        conditionControls.buildConditionRemove(settingName, i, rebuild),
      );
      tableElement.append(
        conditionControls.buildConditionDuplicate(settingName, i, rebuild),
      );
      tableElement.append(
        conditionControls.buildConditionEvalize(settingName, i),
      );
    }

    getTableSorter().attach(tableBodyNode[0], {
      items: "tr:not(.unsortable)",
      attribute: "value",
      onOrderChanged: (newOrder) => {
        overrideEditor.applyEdit({
          kind: "reorder-conditions",
          settingKey: settingName,
          order: newOrder.map((position) => Number(position)),
        });
        rebuild();
      },
    });
  }

  function buildInputNodeForDisplay(
    type: string,
    options: SettingsInputOptions,
    value: unknown,
  ): JQueryNode {
    switch (type) {
      case "string":
      case "number":
        return $(`
                  <input type="text" class="input is-small" style="height: 22px; width:100%" disabled="disabled"/>`).val(
          value,
        );
      case "boolean":
        return $(`
                  <label tabindex="0" disabled="disabled" class="switch is-disabled" style="position:absolute; margin-top: 8px; margin-left: 10px;">
                    <input type="checkbox"  disabled="disabled">
                    <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span>
                  </label>`)
          .find("input")
          .prop("checked", value)
          .end();
      case "select":
        return $(`
                  <select style="width: 100%"  disabled="disabled" class="dropdown is-disabled">${options}</select>`).val(
          value,
        );
      case "list": {
        const list = (options as ObjectListSource).list;
        return $(`
                  <span></span>`).text(
          listNames(value, (item) => list[String(item)]?.["name"]),
        );
      }
      default:
        return $(`
                  <span></span>`).text(JSON.stringify(value));
    }
  }

  function changeDisplayInputNode(currentNode: JQueryNode): JQueryNode {
    const type = currentNode.attr("type");
    const id = currentNode.attr("value");
    const value = getSettings()[String(id)];
    const node = currentNode.find(`td:eq(1)>*:first-child`);
    switch (type) {
      case "string":
      case "number":
      case "select":
        return node.val(value);
      case "boolean":
        return node.find("input").prop("checked", value);
      case "list":
        if (id === "researchIgnore") {
          return node.text(
            listNames(value, (item) => getTechIds()[String(item)]?.name),
          );
        }
      // fall through
      default:
        return node.text(JSON.stringify(value));
    }
  }

  return {
    openOverrideModal,
    buildOverrideSettings,
    buildInputNodeForDisplay,
    changeDisplayInputNode,
  };
}
