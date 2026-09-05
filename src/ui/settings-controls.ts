import type {
  Autocomplete,
  AutocompleteInput,
} from "../adapters/browser/autocomplete.ts";
// The controls a settings page is built from. Each writes its setting through the raw settings bag
// and reports a modifier-held click to the override editor.

import type {
  AutocompleteEvent,
  AutocompleteItem,
  AutocompleteUi,
  EditableInput,
  JQuery,
  JQueryNode,
} from "./jquery.ts";
import type { StoredSettings } from "./override-condition-controls.ts";
import type { OverrideModalEvent } from "./override-editor.ts";
import type { ObjectList, SelectOptionSource } from "./settings-inputs.ts";

interface SettingsControlsDependencies {
  readonly getAutocomplete: () => Autocomplete;
  readonly getJQuery: () => JQuery;
  readonly getSettingsRaw: () => StoredSettings;
  readonly getRealNumber: () => (amountText: string) => number;
  readonly getUpdateSettingsFromState: () => () => void;
  /** Opens the override editor for the clicked setting when the modifier key is held. */
  readonly openOverrideModal: (event: OverrideModalEvent) => void;
  readonly buildSelectOptions: (
    optionsList: readonly SelectOptionSource[],
  ) => string;
}

export interface SettingsControls {
  addSettingsToggle(
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
    enabledCallBack?: () => void,
    disabledCallBack?: () => void,
  ): JQueryNode;
  addSettingsNumber(
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ): JQueryNode;
  addSettingsString(
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ): JQueryNode;
  addSettingsSelect(
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
    optionsList: readonly SelectOptionSource[],
  ): JQueryNode;
  addSettingsList(
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
    list: ObjectList,
  ): void;
  addInputCallbacks(node: JQueryNode, settingKey: string): JQueryNode;
  addTableInput(node: JQueryNode, settingKey: string): void;
  addToggleCallbacks(node: JQueryNode, settingKey: string): JQueryNode;
  addTableToggle(node: JQueryNode, settingKey: string): void;
  buildTableLabel(note: unknown, title?: unknown, color?: string): JQueryNode;
  resetCheckbox(...items: string[]): void;
}

export function createSettingsControls({
  getAutocomplete,
  getJQuery,
  getSettingsRaw,
  getRealNumber,
  getUpdateSettingsFromState,
  openOverrideModal,
  buildSelectOptions,
}: SettingsControlsDependencies): SettingsControls {
  const $ = getJQuery();
  const getRealNumberValue = (amountText: string): number =>
    getRealNumber()(amountText);
  const updateSettingsFromState = (): void => getUpdateSettingsFromState()();

  /** Migration guarantees a list setting stores an array of ids. */
  const readListSetting = (settingName: string): string[] =>
    getSettingsRaw()[settingName] as string[];

  function addSettingsToggle(
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
    enabledCallBack?: () => void,
    disabledCallBack?: () => void,
  ): JQueryNode {
    return $(`
          <div class="script_bg_${settingName}" style="margin-top: 5px; width: 90%; display: inline-block; text-align: left;">
            <label title="${hintText}" tabindex="0" class="switch">
              <input class="script_${settingName}" type="checkbox" ${
                getSettingsRaw()[settingName] ? " checked" : ""
              }><span class="check"></span>
              <span style="margin-left: 10px;">${labelText}</span>
            </label>
          </div>`)
      .toggleClass(
        "inactive-row",
        Boolean(getSettingsRaw().overrides[settingName]),
      )
      .on("change", "input", function (this: EditableInput) {
        getSettingsRaw()[settingName] = this.checked;
        updateSettingsFromState();

        $(".script_" + settingName).prop(
          "checked",
          getSettingsRaw()[settingName],
        );

        if (getSettingsRaw()[settingName] && enabledCallBack) {
          enabledCallBack();
        }
        if (!getSettingsRaw()[settingName] && disabledCallBack) {
          disabledCallBack();
        }
      })
      .on(
        "click",
        {
          label: `${labelText} (${settingName})`,
          name: settingName,
          type: "boolean",
        },
        openOverrideModal,
      )
      .appendTo(node);
  }

  function addSettingsNumber(
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ): JQueryNode {
    return $(`
          <div class="script_bg_${settingName}" style="margin-top: 5px; display: inline-block; width: 90%; text-align: left;">
            <label title="${hintText}" tabindex="0">
              <span>${labelText}</span>
              <input class="script_${settingName}" type="text" style="text-align: right; height: 18px; width: 150px; float: right;" value="${getSettingsRaw()[settingName]}"></input>
            </label>
          </div>`)
      .toggleClass(
        "inactive-row",
        Boolean(getSettingsRaw().overrides[settingName]),
      )
      .on("change", "input", function (this: EditableInput) {
        const parsedValue = getRealNumberValue(this.value);
        if (!Number.isNaN(parsedValue)) {
          getSettingsRaw()[settingName] = parsedValue;
          updateSettingsFromState();
        }
        $(".script_" + settingName).val(getSettingsRaw()[settingName]);
      })
      .on(
        "click",
        {
          label: `${labelText} (${settingName})`,
          name: settingName,
          type: "number",
        },
        openOverrideModal,
      )
      .appendTo(node);
  }

  function addSettingsString(
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ): JQueryNode {
    return $(`
          <div class="script_bg_${settingName}" style="margin-top: 5px; display: inline-block; width: 90%; text-align: left;">
            <label title="${hintText}" tabindex="0">
              <span>${labelText}</span>
              <input class="script_${settingName}" type="text" style="text-align: right; height: 18px; width: 70%; float: right;" value="${getSettingsRaw()[settingName]}"></input>
            </label>
          </div>`)
      .toggleClass(
        "inactive-row",
        Boolean(getSettingsRaw().overrides[settingName]),
      )
      .on("change", "input", function (this: EditableInput) {
        getSettingsRaw()[settingName] = this.value;
        updateSettingsFromState();
        $(".script_" + settingName).val(getSettingsRaw()[settingName]);
      })
      .on(
        "click",
        {
          label: `${labelText} (${settingName})`,
          name: settingName,
          type: "string",
        },
        openOverrideModal,
      )
      .appendTo(node);
  }

  function addSettingsSelect(
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
    optionsList: readonly SelectOptionSource[],
  ): JQueryNode {
    const options = buildSelectOptions(optionsList);
    return $(`
          <div class="script_bg_${settingName}" style="margin-top: 5px; display: inline-block; width: 90%; text-align: left;">
            <label title="${hintText}" tabindex="0">
              <span>${labelText}</span>
              <select class="script_${settingName}" style="width: 150px; float: right;">
                ${options}
              </select>
            </label>
          </div>`)
      .toggleClass(
        "inactive-row",
        Boolean(getSettingsRaw().overrides[settingName]),
      )
      .find("select")
      .val(getSettingsRaw()[settingName])
      .on("change", function (this: EditableInput) {
        getSettingsRaw()[settingName] = this.value;
        updateSettingsFromState();

        $(".script_" + settingName).val(getSettingsRaw()[settingName]);
      })
      .end()
      .on(
        "click",
        {
          label: `${labelText} (${settingName})`,
          name: settingName,
          type: "select",
          options: options,
        },
        openOverrideModal,
      )
      .appendTo(node);
  }

  function addSettingsList(
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
    list: ObjectList,
  ): void {
    const listBlock = $(`
          <div class="script_bg_${settingName}" style="display: inline-block; width: 90%; margin-top: 6px;">
            <label title="${hintText}" tabindex="0">
              <span>${labelText}</span>
              <input type="text" style="height: 25px; width: 150px; float: right;" placeholder="Research...">
              <button class="button" style="height: 25px; float: right; margin-right: 4px; margin-left: 4px;">Remove</button>
              <button class="button" style="height: 25px; float: right;">Add</button>
            </label>
            <br>
            <textarea class="script_${settingName} textarea" style="margin-top: 12px" readonly></textarea>
          </div>`)
      .toggleClass(
        "inactive-row",
        Boolean(getSettingsRaw().overrides[settingName]),
      )
      .on(
        "click",
        {
          label: `Add or Remove (${settingName})`,
          name: settingName,
          type: "list",
          options: { list: list, name: "name", id: "_vueBinding" },
        },
        openOverrideModal,
      )
      .appendTo(node);

    let selectedItem: string | null = "";

    const updateList = (): void => {
      const names = readListSetting(settingName).map((id) => {
        const entry = Object.values(list).find(
          (candidate) => candidate._vueBinding === id,
        );
        // An id the game no longer lists shows as itself rather than failing the whole render.
        return entry === undefined ? id : String(entry.name);
      });
      $(".script_" + settingName).val(names.join(", "));
    };

    const onChange = function (
      this: AutocompleteInput,
      event: AutocompleteEvent,
      ui: AutocompleteUi,
    ) {
      event.preventDefault();

      // If it wasn't selected from list
      if (ui.item === null) {
        const typedName = Object.values(list).find(
          (obj) => obj.name === this.value,
        );
        if (typedName !== undefined) {
          ui.item = { label: this.value, value: typedName._vueBinding };
        }
      }

      // We have an item to switch
      if (ui.item !== null && Object.hasOwn(list, String(ui.item.value))) {
        this.value = ui.item.label;
        selectedItem = String(ui.item.value);
      } else {
        this.value = "";
        selectedItem = null;
      }
    };

    const autocomplete = getAutocomplete();
    autocomplete.attach(listBlock.find("input")[0], {
      minLength: 2,
      source: function (
        request: { term: string },
        response: (items: AutocompleteItem[]) => void,
      ) {
        const matcher = new RegExp(autocomplete.escapeRegex(request.term), "i");
        response(
          Object.values(list)
            .filter((item) => matcher.test(String(item.name)))
            .map((item) => ({
              label: String(item.name),
              value: item._vueBinding,
            })),
        );
      },
      select: onChange, // Dropdown list click
      focus: onChange, // Arrow keys press
      change: onChange, // Keyboard type
    });

    listBlock.on("click", "button:eq(1)", function () {
      const selected = readListSetting(settingName);
      if (selectedItem && !selected.includes(selectedItem)) {
        selected.push(selectedItem);
        selected.sort();
        updateSettingsFromState();
        updateList();
      }
    });

    listBlock.on("click", "button:eq(0)", function () {
      const selected = readListSetting(settingName);
      if (selectedItem && selected.includes(selectedItem)) {
        selected.splice(selected.indexOf(selectedItem), 1);
        selected.sort();
        updateSettingsFromState();
        updateList();
      }
    });

    updateList();
  }

  function addInputCallbacks(node: JQueryNode, settingKey: string): JQueryNode {
    return node
      .on("change", function (this: EditableInput) {
        const parsedValue = getRealNumberValue(this.value);
        if (!Number.isNaN(parsedValue)) {
          getSettingsRaw()[settingKey] = parsedValue;
          updateSettingsFromState();
        }
        $(".script_" + settingKey).val(getSettingsRaw()[settingKey]);
      })
      .on(
        "click",
        { label: `Number (${settingKey})`, name: settingKey, type: "number" },
        openOverrideModal,
      );
  }

  function addTableInput(node: JQueryNode, settingKey: string): void {
    node
      .addClass(
        "script_bg_" +
          settingKey +
          (getSettingsRaw().overrides[settingKey] ? " inactive-row" : ""),
      )
      .append(
        addInputCallbacks(
          $(
            `<input class="script_${settingKey}" type="text" class="input is-small" style="height: 25px; width:100%" value="${getSettingsRaw()[settingKey]}"/>`,
          ),
          settingKey,
        ),
      );
  }

  function addToggleCallbacks(
    node: JQueryNode,
    settingKey: string,
  ): JQueryNode {
    return node
      .on("change", "input", function (this: EditableInput) {
        getSettingsRaw()[settingKey] = this.checked;
        updateSettingsFromState();

        $(".script_" + settingKey).prop(
          "checked",
          getSettingsRaw()[settingKey],
        );
      })
      .on(
        "click",
        { label: `Toggle (${settingKey})`, name: settingKey, type: "boolean" },
        openOverrideModal,
      );
  }

  function addTableToggle(node: JQueryNode, settingKey: string): void {
    node
      .addClass(
        "script_bg_" +
          settingKey +
          (getSettingsRaw().overrides[settingKey] ? " inactive-row" : ""),
      )
      .append(
        addToggleCallbacks(
          $(`
          <label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;">
            <input class="script_${settingKey}" type="checkbox"${
              getSettingsRaw()[settingKey] ? " checked" : ""
            }>
            <span class="check" style="height:5px; max-width:15px"></span>
            <span style="margin-left: 20px;"></span>
          </label>`),
          settingKey,
        ),
      );
  }

  function buildTableLabel(
    note: unknown,
    title: unknown = "",
    color = "has-text-info",
  ): JQueryNode {
    return $(`<span class="${color}" title="${title}" >${note}</span>`);
  }

  function resetCheckbox(...items: string[]): void {
    items.forEach((item) =>
      $(".script_" + item).prop("checked", getSettingsRaw()[item]),
    );
  }

  return {
    addSettingsToggle,
    addSettingsNumber,
    addSettingsString,
    addSettingsSelect,
    addSettingsList,
    addInputCallbacks,
    addTableInput,
    addToggleCallbacks,
    addTableToggle,
    buildTableLabel,
    resetCheckbox,
  };
}
