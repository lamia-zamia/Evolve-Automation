// The value inputs shared by the settings pages, the override editor, and the trigger editor.
// Each builds one node and reports an edit through its callback; nothing here writes settings.

import type {
  AutocompleteEvent,
  AutocompleteItem,
  AutocompleteUi,
  EditableInput,
  JQuery,
  JQueryNode,
} from "./jquery.ts";

/** One entry of a `<select>` built from a list rather than from prepared markup. */
export interface SelectOptionSource {
  readonly val: unknown;
  readonly label: unknown;
  readonly hint?: unknown;
}

/** A record of named objects an autocomplete input picks one of. */
export type ObjectList = Record<string, Record<string, unknown>>;

/** An object list plus the fields to display and to store. */
export interface ObjectListSource {
  readonly list: ObjectList;
  readonly name: string;
  readonly id: string;
}

/**
 * What an input renders its choices from. The input kind names how this is read: `select` is
 * prepared markup, `select_cb` and `list_cb` are sampled when the control is built, and `list`
 * names the object list and its fields. The other kinds read nothing.
 */
export type SettingsInputOptions =
  | string
  | ObjectListSource
  | (() => readonly SelectOptionSource[])
  | (() => ObjectList)
  | undefined;

export type SettingsInputCallback = (value: unknown) => void;

interface SettingsInputsDependencies {
  readonly getJQuery: () => JQuery;
  readonly getRealNumber: () => (amountText: string) => number;
}

export interface SettingsInputs {
  buildSelectOptions(optionsList: readonly SelectOptionSource[]): string;
  buildInputNode(
    type: string,
    options: SettingsInputOptions,
    value: unknown,
    callback: SettingsInputCallback,
  ): JQueryNode | string;
  buildObjectListInput(
    list: ObjectList,
    name: string,
    id: string,
    value: unknown,
    callback: SettingsInputCallback,
  ): JQueryNode;
}

export function createSettingsInputs({
  getJQuery,
  getRealNumber,
}: SettingsInputsDependencies): SettingsInputs {
  const $ = getJQuery();

  function buildSelectOptions(
    optionsList: readonly SelectOptionSource[],
  ): string {
    return optionsList
      .map(
        (item) =>
          `<option value="${item.val}" title="${item.hint ?? ""}">${
            item.label
          }</option>`,
      )
      .join();
  }

  function buildInputNode(
    type: string,
    options: SettingsInputOptions,
    value: unknown,
    callback: SettingsInputCallback,
  ): JQueryNode | string {
    switch (type) {
      case "string":
        return $(`
                  <input type="text" class="input is-small" style="height: 22px; width:100%"/>`)
          .val(value)
          .on("change", function (this: EditableInput) {
            callback(this.value);
          });
      case "number":
        return $(`
                  <input type="text" class="input is-small" style="height: 22px; width:100%"/>`)
          .val(value)
          .on("change", function (this: EditableInput) {
            const parsed = getRealNumber()(this.value);
            // An unparsable entry falls back to the value the input was built with.
            const result: unknown = Number.isNaN(parsed) ? value : parsed;
            this.value = String(result);
            callback(result);
          });
      case "boolean":
        return $(`
                  <label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;">
                    <input type="checkbox">
                    <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span>
                  </label>`)
          .find("input")
          .prop("checked", value)
          .on("change", function (this: EditableInput) {
            callback(this.checked);
          })
          .end();
      case "select":
        return $(`
                  <select style="width: 100%">${options}</select>`)
          .val(value)
          .on("change", function (this: EditableInput) {
            callback(this.value);
          });
      case "select_cb":
        return $(`
                  <select style="width: 100%">${buildSelectOptions(
                    (options as () => readonly SelectOptionSource[])(),
                  )}</select>`)
          .val(value)
          .on("change", function (this: EditableInput) {
            callback(this.value);
          });
      case "list": {
        const source = options as ObjectListSource;
        return buildObjectListInput(
          source.list,
          source.name,
          source.id,
          value,
          callback,
        );
      }
      case "list_cb":
        return buildObjectListInput(
          (options as () => ObjectList)(),
          "name",
          "id",
          value,
          callback,
        );
      default:
        return "";
    }
  }

  function buildObjectListInput(
    list: ObjectList,
    name: string,
    id: string,
    value: unknown,
    callback: SettingsInputCallback,
  ): JQueryNode {
    const listNode = $(`<input type="text" style="width:100%"></input>`);

    // Event handler
    const onChange = function (
      this: EditableInput,
      event: AutocompleteEvent,
      ui: AutocompleteUi,
    ) {
      event.preventDefault();

      // If it wasn't selected from list
      if (ui.item === null) {
        const foundItem = Object.values(list).find(
          (obj) => obj[name] === this.value,
        );
        if (foundItem !== undefined) {
          ui.item = { label: this.value, value: foundItem[id] };
        }
      }

      if (
        ui.item !== null &&
        Object.values(list).some((obj) => obj[id] === ui.item?.value)
      ) {
        // We have an item to switch
        this.value = ui.item.label;
        callback(ui.item.value);
      } else if (Object.hasOwn(list, String(value))) {
        // Or try to restore old valid value
        this.value = String(list[String(value)]?.[name]);
        callback(value);
      } else {
        // No luck, set it empty
        this.value = "";
        callback(null);
      }
    };

    listNode.autocomplete({
      minLength: 2,
      delay: 0,
      source: function (
        request: { term: string },
        response: (items: AutocompleteItem[]) => void,
      ) {
        const matcher = new RegExp(
          $.ui.autocomplete.escapeRegex(request.term),
          "i",
        );
        response(
          Object.values(list)
            .filter((item) => matcher.test(String(item[name])))
            .map((item) => ({
              label: String(item[name]),
              value: item[id],
            })),
        );
      },
      select: onChange, // Dropdown list click
      focus: onChange, // Arrow keys press
      change: onChange, // Keyboard type
    });

    if (Object.values(list).some((obj) => obj[id] === value)) {
      listNode.val(list[String(value)]?.[name]);
    }

    return listNode;
  }

  return { buildSelectOptions, buildInputNode, buildObjectListInput };
}
