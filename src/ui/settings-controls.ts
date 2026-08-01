import type { OverrideModalEvent } from "./override-editor.ts";
import type { SelectOptionSource } from "./settings-inputs.ts";

type AnyRecord = Record<string, any>;
type AnyFunction = (...args: any[]) => any;

interface SettingsControlsDependencies {
  getJQuery: () => AnyFunction & AnyRecord;
  getSettingsRaw: () => AnyRecord;
  getRealNumber: () => AnyFunction;
  getUpdateSettingsFromState: () => AnyFunction;
  /** Opens the override editor for the clicked setting when the modifier key is held. */
  openOverrideModal: (event: OverrideModalEvent) => void;
  buildSelectOptions: (optionsList: readonly SelectOptionSource[]) => string;
}

export function createSettingsControls({
  getJQuery,
  getSettingsRaw,
  getRealNumber,
  getUpdateSettingsFromState,
  openOverrideModal,
  buildSelectOptions,
}: SettingsControlsDependencies) {
  const $ = getJQuery();
  const getRealNumberValue: AnyFunction = (...args) => getRealNumber()(...args);
  const updateSettingsFromState: AnyFunction = (...args) =>
    getUpdateSettingsFromState()(...args);

  function addSettingsToggle(
    node: any,
    settingName: any,
    labelText: any,
    hintText: any,
    enabledCallBack: any,
    disabledCallBack: any,
  ) {
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
      .on("change", "input", function (this: any) {
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

    if (getSettingsRaw()[settingName] && enabledCallBack) {
      enabledCallBack();
    }
  }

  function addSettingsNumber(
    node: any,
    settingName: any,
    labelText: any,
    hintText: any,
  ) {
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
      .on("change", "input", function (this: any) {
        let parsedValue = getRealNumberValue(this.value);
        if (!isNaN(parsedValue)) {
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
    node: any,
    settingName: any,
    labelText: any,
    hintText: any,
  ) {
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
      .on("change", "input", function (this: any) {
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
    node: any,
    settingName: any,
    labelText: any,
    hintText: any,
    optionsList: any,
  ) {
    let options = buildSelectOptions(optionsList);
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
      .on("change", function (this: any) {
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
    node: any,
    settingName: any,
    labelText: any,
    hintText: any,
    list: AnyRecord,
  ) {
    let listBlock = $(`
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

    let updateList = function (this: any) {
      let techsString = getSettingsRaw()
        [settingName].map(
          (id: any) =>
            Object.values(list).find((obj) => obj._vueBinding === id).name,
        )
        .join(", ");
      $(".script_" + settingName).val(techsString);
    };

    let onChange = function (this: any, event: any, ui: any) {
      event.preventDefault();

      // If it wasn't selected from list
      if (ui.item === null) {
        let typedName = Object.values(list).find(
          (obj) => obj.name === this.value,
        );
        if (typedName !== undefined) {
          ui.item = { label: this.value, value: typedName._vueBinding };
        }
      }

      // We have an item to switch
      if (ui.item !== null && list.hasOwnProperty(ui.item.value)) {
        this.value = ui.item.label;
        selectedItem = ui.item.value;
      } else {
        this.value = "";
        selectedItem = null;
      }
    };

    listBlock.find("input").autocomplete({
      minLength: 2,
      delay: 0,
      source: function (this: any, request: any, response: any) {
        let matcher = new RegExp(
          $.ui.autocomplete.escapeRegex(request.term),
          "i",
        );
        response(
          Object.values(list)
            .filter((item) => matcher.test(item.name))
            .map((item) => ({ label: item.name, value: item._vueBinding })),
        );
      },
      select: onChange, // Dropdown list click
      focus: onChange, // Arrow keys press
      change: onChange, // Keyboard type
    });

    listBlock.on("click", "button:eq(1)", function (this: any) {
      if (
        selectedItem &&
        !getSettingsRaw()[settingName].includes(selectedItem)
      ) {
        getSettingsRaw()[settingName].push(selectedItem);
        getSettingsRaw()[settingName].sort();
        updateSettingsFromState();
        updateList();
      }
    });

    listBlock.on("click", "button:eq(0)", function (this: any) {
      if (
        selectedItem &&
        getSettingsRaw()[settingName].includes(selectedItem)
      ) {
        getSettingsRaw()[settingName].splice(
          getSettingsRaw()[settingName].indexOf(selectedItem),
          1,
        );
        getSettingsRaw()[settingName].sort();
        updateSettingsFromState();
        updateList();
      }
    });

    updateList();
  }

  function addInputCallbacks(node: any, settingKey: any) {
    return node
      .on("change", function (this: any) {
        let parsedValue = getRealNumberValue(this.value);
        if (!isNaN(parsedValue)) {
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

  function addTableInput(node: any, settingKey: any) {
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

  function addToggleCallbacks(node: any, settingKey: any) {
    return node
      .on("change", "input", function (this: any) {
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

  function addTableToggle(node: any, settingKey: any) {
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
    note: any,
    title: any = "",
    color: any = "has-text-info",
  ) {
    return $(`<span class="${color}" title="${title}" >${note}</span>`);
  }

  function resetCheckbox(...items: string[]) {
    Array.from(items).forEach((item) =>
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
