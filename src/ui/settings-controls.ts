type AnyRecord = Record<string, any>;
type AnyFunction = (...args: any[]) => any;

interface SettingsControlsDependencies {
  getJQuery: () => AnyFunction & AnyRecord;
  getSettingsRaw: () => AnyRecord;
  getSettings: () => AnyRecord;
  getTechIds: () => AnyRecord;
  getWin: () => AnyRecord;
  getCheckCompare: () => AnyRecord;
  getCheckCustom: () => AnyRecord;
  getCheckTypes: () => AnyRecord;
  getOverrideKey: () => string;
  getRealNumber: () => AnyFunction;
  getOpenOptionsModal: () => AnyFunction;
  getSorterHelper: () => AnyFunction;
  getUpdateSettingsFromState: () => AnyFunction;
}

export function createSettingsControls({
  getJQuery,
  getSettingsRaw,
  getSettings,
  getTechIds,
  getWin,
  getCheckCompare,
  getCheckCustom,
  getCheckTypes,
  getOverrideKey,
  getRealNumber,
  getOpenOptionsModal,
  getSorterHelper,
  getUpdateSettingsFromState,
}: SettingsControlsDependencies) {
  const $ = getJQuery();
  const getRealNumberValue: AnyFunction = (...args) => getRealNumber()(...args);
  const openOptionsModal: AnyFunction = (...args) =>
    getOpenOptionsModal()(...args);
  const sorterHelper: AnyFunction = (...args) => getSorterHelper()(...args);
  const updateSettingsFromState: AnyFunction = (...args) =>
    getUpdateSettingsFromState()(...args);
  function _(check, arg) {
    return getCheckTypes()[check].fn(arg);
  }

  function openOverrideModal(event) {
    if (event[getOverrideKey()]) {
      event.preventDefault();
      openOptionsModal(event.data.label, function (this: any, modal) {
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

  function buildOverrideSettings(settingName, type, options) {
    const rebuild = () => buildOverrideSettings(settingName, type, options);
    let overrides = getSettingsRaw().overrides[settingName] ?? [];

    let currentNode = $(`#script_${settingName}Modal`);
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

    let listField = typeof getSettingsRaw()[settingName] === "object";
    let note = listField
      ? "All values passed checks will be added or removed from list"
      : "First value passed check will be used. Default value:";
    let note_2 = "The current value:";

    let current = listField
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
    let tableBodyNode = $(`#script_${settingName}ModalTable`);
    tableBodyNode.append($(newTableBodyText));

    // Default input
    if (!listField) {
      $(`#script_${settingName}_d td:eq(1)`).append(
        buildInputNode(
          type,
          options,
          getSettingsRaw()[settingName],
          function (this: any, result) {
            getSettingsRaw()[settingName] = result;
            updateSettingsFromState();

            let retType = typeof result === "boolean" ? "checked" : "value";
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
    $(`#script_${settingName}_d a`).on("click", function (this: any) {
      if (!getSettingsRaw().overrides[settingName]) {
        getSettingsRaw().overrides[settingName] = [];
        $(".script_bg_" + settingName).addClass("inactive-row");
      }
      getSettingsRaw().overrides[settingName].push({
        type1: "Boolean",
        arg1: true,
        type2: "Boolean",
        arg2: false,
        cmp: "==",
        ret: getSettingsRaw()[settingName],
      });
      updateSettingsFromState();
      rebuild();
    });

    for (let i = 0; i < overrides.length; i++) {
      let override = overrides[i];
      let tableElement = $(`#script_${settingName}_o${i}`).children().eq(0);

      tableElement.append(buildConditionType(override, 1, rebuild));
      tableElement = tableElement.next();
      tableElement.append(buildConditionArg(override, 1));
      tableElement = tableElement.next();
      tableElement.append(buildConditionComparator(override, rebuild));
      tableElement = tableElement.next();
      tableElement.append(buildConditionType(override, 2, rebuild));
      tableElement = tableElement.next();
      tableElement.append(buildConditionArg(override, 2));
      tableElement = tableElement.next();
      if (!getCheckCustom()[override.cmp]) {
        tableElement.append(buildConditionRet(override, type, options));
      }
      tableElement = tableElement.next();
      tableElement.append(buildConditionRemove(settingName, i, rebuild));
      tableElement.append(buildConditionDuplicate(settingName, i, rebuild));
      tableElement.append(buildConditionEvalize(settingName, i, rebuild));
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: sorterHelper,
      update: function (this: any) {
        let newOrder = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        getSettingsRaw().overrides[settingName] = newOrder.map(
          (i) => getSettingsRaw().overrides[settingName][i],
        );

        updateSettingsFromState();
        rebuild();
      },
    });
  }

  function buildInputNode(type, options, value, callback) {
    switch (type) {
      case "string":
        return $(`
                  <input type="text" class="input is-small" style="height: 22px; width:100%"/>`)
          .val(value)
          .on("change", function (this: any) {
            callback(this.value);
          });
      case "number":
        return $(`
                  <input type="text" class="input is-small" style="height: 22px; width:100%"/>`)
          .val(value)
          .on("change", function (this: any) {
            let parsedValue = getRealNumberValue(this.value);
            if (isNaN(parsedValue)) {
              parsedValue = value;
            }
            this.value = parsedValue;
            callback(parsedValue);
          });
      case "boolean":
        return $(`
                  <label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;">
                    <input type="checkbox">
                    <span class="check" style="height:5px; max-width:15px"></span><span style="margin-left: 20px;"></span>
                  </label>`)
          .find("input")
          .prop("checked", value)
          .on("change", function (this: any) {
            callback(this.checked);
          })
          .end();
      case "select":
        return $(`
                  <select style="width: 100%">${options}</select>`)
          .val(value)
          .on("change", function (this: any) {
            callback(this.value);
          });
      case "select_cb":
        return $(`
                  <select style="width: 100%">${buildSelectOptions(
                    options(),
                  )}</select>`)
          .val(value)
          .on("change", function (this: any) {
            callback(this.value);
          });
      case "list":
        return buildObjectListInput(
          options.list,
          options.name,
          options.id,
          value,
          callback,
        );
      case "list_cb":
        return buildObjectListInput(options(), "name", "id", value, callback);
      default:
        return "";
    }
  }

  function buildInputNodeForDisplay(type, options, value) {
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
      case "list":
        return $(`
                  <span></span>`).text(
          value
            .map((item) => options.list[item]?.name ?? "[Invalid item]")
            .join(", "),
        );
      default:
        return $(`
                  <span></span>`).text(JSON.stringify(value));
    }
  }

  function changeDisplayInputNode(currentNode) {
    let type = currentNode.attr("type");
    let id = currentNode.attr("value");
    let value = getSettings()[currentNode.attr("value")];
    let node = currentNode.find(`td:eq(1)>*:first-child`);
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
            value
              .map((item) => getTechIds()[item]?.name ?? "[Invalid item]")
              .join(", "),
          );
        }
      // fall through
      default:
        return node.text(JSON.stringify(value));
    }
  }

  function buildConditionType(override, num, rebuild) {
    let types = Object.entries(getCheckTypes())
      .map(
        ([id, type]) =>
          `<option value="${id}" title="${type.desc}">${id
            .replace(/([A-Z])/g, " $1")
            .trim()}</option>`,
      )
      .join();
    return $(`<select style="width: 100%">${types}</select>`)
      .val(override["type" + num])
      .on("change", function (this: any) {
        override["type" + num] = this.value;
        override["arg" + num] = getCheckTypes()[this.value].def;
        updateSettingsFromState();
        rebuild();
      });
  }

  function buildConditionArg(override, num) {
    let check = getCheckTypes()[override["type" + num]];
    return check
      ? buildInputNode(
          check.arg,
          check.options,
          override["arg" + num],
          function (this: any, result) {
            override["arg" + num] = result;
            updateSettingsFromState();
          },
        )
      : "";
  }

  function buildConditionComparator(override, rebuild) {
    let types = Object.entries(getCheckCompare())
      .map(
        ([id, fn]) =>
          `<option value="${id}" title="${
            getCheckCustom()[id] ?? fn.toString().substr(10)
          }">${id}</option>`,
      )
      .join();
    return $(`<select style="width: 100%">${types}</select>`)
      .val(override.cmp)
      .on("change", function (this: any) {
        override.cmp = this.value;
        updateSettingsFromState();
        rebuild();
      });
  }

  function buildConditionRemove(settingName, id, rebuild) {
    return $(
      `<a class="button is-small" style="width: 26px; height: 26px"><span>-</span></a>`,
    ).on("click", function (this: any) {
      getSettingsRaw().overrides[settingName].splice(id, 1);
      if (getSettingsRaw().overrides[settingName].length === 0) {
        delete getSettingsRaw().overrides[settingName];
        $(".script_bg_" + settingName).removeClass("inactive-row");
      }
      updateSettingsFromState();
      rebuild();
    });
  }

  function buildConditionDuplicate(settingName, id, rebuild) {
    return $(
      `<a class="button is-small" style="width: 26px; height: 26px"><span style="font-size: 1.2rem;">&#9282;</span></a>`,
    ).on("click", function (this: any) {
      getSettingsRaw().overrides[settingName].splice(id, 0, {
        ...getSettingsRaw().overrides[settingName][id],
      });
      updateSettingsFromState();
      rebuild();
    });
  }

  function buildConditionEvalize(settingName, id, rebuild) {
    return $(
      `<a class="button is-small" style="width: 26px; height: 26px"><span style="font-size: 0.9rem;">E</span></a>`,
    ).on("click", function (this: any) {
      let override = getSettingsRaw().overrides[settingName][id];
      let check = getCheckCompare()
        [override.cmp].toString()
        .substr(10)
        .replace(/([ab])/g, (s, v) => {
          let idx = v === "a" ? 1 : 2;
          switch (override["type" + idx]) {
            case "Number":
            case "Boolean":
              return override["arg" + idx];
            case "Eval":
              return `(${override["arg" + idx]})`;
            case "String":
              return JSON.stringify(override["arg" + idx]);
            default:
              return `_("${override["type" + idx]}",${JSON.stringify(
                override["arg" + idx],
              )})`;
          }
        });
      getWin().prompt("Eval of this condition:", check);
    });
  }

  function buildConditionRet(override, type, options) {
    return buildInputNode(
      type,
      options,
      override.ret,
      function (this: any, result) {
        override.ret = result;
        updateSettingsFromState();
      },
    );
  }

  function buildObjectListInput(list: AnyRecord, name, id, value, callback) {
    let listNode = $(`<input type="text" style="width:100%"></input>`);

    // Event handler
    let onChange = function (this: any, event, ui) {
      event.preventDefault();

      // If it wasn't selected from list
      if (ui.item === null) {
        let foundItem = Object.values(list).find(
          (obj) => obj[name] === this.value,
        );
        if (foundItem !== undefined) {
          ui.item = { label: this.value, value: foundItem[id] };
        }
      }

      if (
        ui.item !== null &&
        Object.values(list).some((obj) => obj[id] === ui.item.value)
      ) {
        // We have an item to switch
        this.value = ui.item.label;
        callback(ui.item.value);
      } else if (list.hasOwnProperty(value)) {
        // Or try to restore old valid value
        this.value = list[value][name];
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
      source: function (this: any, request, response) {
        let matcher = new RegExp(
          $.ui.autocomplete.escapeRegex(request.term),
          "i",
        );
        response(
          Object.values(list)
            .filter((item) => matcher.test(item[name]))
            .map((item) => ({ label: item[name], value: item[id] })),
        );
      },
      select: onChange, // Dropdown list click
      focus: onChange, // Arrow keys press
      change: onChange, // Keyboard type
    });

    if (Object.values(list).some((obj) => obj[id] === value)) {
      listNode.val(list[value][name]);
    }

    return listNode;
  }

  function addSettingsToggle(
    node,
    settingName,
    labelText,
    hintText,
    enabledCallBack,
    disabledCallBack,
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

  function addSettingsNumber(node, settingName, labelText, hintText) {
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

  function addSettingsString(node, settingName, labelText, hintText) {
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

  function buildSelectOptions(optionsList) {
    return optionsList
      .map(
        (item) =>
          `<option value="${item.val}" title="${item.hint ?? ""}">${
            item.label
          }</option>`,
      )
      .join();
  }

  function addSettingsSelect(
    node,
    settingName,
    labelText,
    hintText,
    optionsList,
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
    node,
    settingName,
    labelText,
    hintText,
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

    let selectedItem = "";

    let updateList = function (this: any) {
      let techsString = getSettingsRaw()
        [settingName].map(
          (id) =>
            Object.values(list).find((obj) => obj._vueBinding === id).name,
        )
        .join(", ");
      $(".script_" + settingName).val(techsString);
    };

    let onChange = function (this: any, event, ui) {
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
      source: function (this: any, request, response) {
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

  function addInputCallbacks(node, settingKey) {
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

  function addTableInput(node, settingKey) {
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

  function addToggleCallbacks(node, settingKey) {
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

  function addTableToggle(node, settingKey) {
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

  function buildTableLabel(note, title = "", color = "has-text-info") {
    return $(`<span class="${color}" title="${title}" >${note}</span>`);
  }

  function resetCheckbox(...items: string[]) {
    Array.from(items).forEach((item) =>
      $(".script_" + item).prop("checked", getSettingsRaw()[item]),
    );
  }

  return {
    evaluateCheck: _,
    openOverrideModal,
    buildOverrideSettings,
    buildInputNode,
    buildInputNodeForDisplay,
    changeDisplayInputNode,
    buildConditionType,
    buildConditionArg,
    buildConditionComparator,
    buildConditionRemove,
    buildConditionDuplicate,
    buildConditionEvalize,
    buildConditionRet,
    buildObjectListInput,
    addSettingsToggle,
    addSettingsNumber,
    addSettingsString,
    buildSelectOptions,
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
