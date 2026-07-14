import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface TriggerSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createTriggerSettings({
  getDependency,
  getOverride,
}: TriggerSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const TriggerManager = liveObject(() => getDependency("TriggerManager"));
  const argType = liveObject(() => getDependency("argType"));
  const buildInputNode = liveFunction(() => getDependency("buildInputNode"));
  const buildSettingsSection = liveFunction(() =>
    getDependency("buildSettingsSection"),
  );
  const checkTypes = liveObject(() => getDependency("checkTypes"));
  const document = liveObject(() => getDependency("document"));
  const overrideOnlyChecks = liveObject(() =>
    getDependency("overrideOnlyChecks"),
  );
  const resetCheckbox = liveFunction(() => getDependency("resetCheckbox"));
  const resetTriggerSettings = liveFunction(() =>
    getDependency("resetTriggerSettings"),
  );
  const retBools = liveObject(() => getDependency("retBools"));
  const sorterHelper = liveFunction(() => getDependency("sorterHelper"));
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildTriggerSettingsImpl() {
    let sectionId = "trigger";
    let sectionName = "Trigger";

    let resetFunction = function () {
      resetTriggerSettings(true);
      updateSettingsFromState();
      updateTriggerSettingsContent();

      resetCheckbox("autoTrigger");
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateTriggerSettingsContent,
    );
  }

  function updateTriggerSettingsContentImpl() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_triggerContent");
    currentNode.empty().off("*");

    currentNode.append(
      '<div style="margin-top: 10px;"><button id="script_trigger_add" class="button">Add New Trigger</button></div>',
    );
    $("#script_trigger_add").on("click", addTriggerSetting);

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" colspan="3">Requirement</th>
              <th class="has-text-warning" colspan="5">Action</th>
            </tr>
            <tr>
              <th class="has-text-warning" style="width:16%">Type</th>
              <th class="has-text-warning" style="width:18%">Value</th>
              <th class="has-text-warning" style="width:6%" title="Numerical variables compared to this value using '>=', boolean variables - using '=='. String variables not currently supported by triggers.">Result</th>
              <th class="has-text-warning" style="width:16%">Type</th>
              <th class="has-text-warning" style="width:18%">Id</th>
              <th class="has-text-warning" style="width:6%">Count</th>
              <th style="width:20%"></th>
            </tr>
            <tbody id="script_triggerTableBody"></tbody>
          </table>`);

    let tableBodyNode = $("#script_triggerTableBody");
    let newTableBodyText = "";

    for (let i = 0; i < TriggerManager.priorityList.length; i++) {
      const trigger = TriggerManager.priorityList[i];
      newTableBodyText += `
            <tr id="script_trigger_${trigger.seq}" value="${trigger.seq}" class="script-draggable">
              <td style="width:16%"></td>
              <td style="width:18%"></td>
              <td style="width:6%"></td>
              <td style="width:16%"></td>
              <td style="width:18%"></td>
              <td style="width:6%"></td>
              <td style="width:20%"></td>
            </tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    for (let i = 0; i < TriggerManager.priorityList.length; i++) {
      const trigger = TriggerManager.priorityList[i];

      buildTriggerRequirementType(trigger);
      buildTriggerRequirementId(trigger);
      buildTriggerRequirementCount(trigger);

      buildTriggerActionType(trigger);
      buildTriggerActionId(trigger);
      buildTriggerActionCount(trigger);

      buildTriggerSettingsColumn(trigger);
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: sorterHelper,
      update: function () {
        let triggerIds = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        for (let i = 0; i < triggerIds.length; i++) {
          TriggerManager.getTrigger(parseInt(triggerIds[i])).priority = i;
        }

        TriggerManager.sortByPriority();
        updateSettingsFromState();
      },
    });

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function addTriggerSettingImpl() {
    let trigger = TriggerManager.AddTrigger(
      "Boolean",
      false,
      1,
      "research",
      "tech-club",
      0,
    );
    updateSettingsFromState();

    let tableBodyNode = $("#script_triggerTableBody");
    let newTableBodyText = "";

    newTableBodyText += `
        <tr id="script_trigger_${trigger.seq}" value="${trigger.seq}" class="script-draggable">
          <td style="width:16%"></td>
          <td style="width:18%"></td>
          <td style="width:6%"></td>
          <td style="width:16%"></td>
          <td style="width:18%"></td>
          <td style="width:6%"></td>
          <td style="width:20%"></td>
        </tr>`;

    tableBodyNode.append($(newTableBodyText));

    buildTriggerRequirementType(trigger);
    buildTriggerRequirementId(trigger);
    buildTriggerRequirementCount(trigger);

    buildTriggerActionType(trigger);
    buildTriggerActionId(trigger);
    buildTriggerActionCount(trigger);

    buildTriggerSettingsColumn(trigger);
  }

  function buildTriggerRequirementTypeImpl(trigger) {
    let triggerElement = $("#script_trigger_" + trigger.seq)
      .children()
      .eq(0);
    triggerElement.empty().off("*");

    // Requirement Type
    let types = (Object.entries(checkTypes) as Array<[string, Loose]>)
      .filter(
        (c) =>
          !overrideOnlyChecks.includes(c[0]) ||
          trigger.requirementType === c[0],
      )
      .map(
        ([id, type]) =>
          `<option value="${id}" title="${type.desc}">${id
            .replace(/([A-Z])/g, " $1")
            .trim()}</option>`,
      )
      .join();
    let typeSelectNode = $(`
          <select style="width: 100%">
            <option value = "chain" title = "This condition is met when above trigger is complete, always true for first trigger in list">Chain</option>
            ${types}
          </select>`);

    typeSelectNode.val(trigger.requirementType);

    triggerElement.append(typeSelectNode);

    typeSelectNode.on("change", function (this: Loose) {
      trigger.updateRequirementType(this.value);

      buildTriggerRequirementId(trigger);
      buildTriggerRequirementCount(trigger);

      updateSettingsFromState();
    });

    return;
  }

  function buildTriggerRequirementIdImpl(trigger) {
    let triggerElement = $("#script_trigger_" + trigger.seq)
      .children()
      .eq(1);
    triggerElement.empty().off("*");

    let check = checkTypes[trigger.requirementType];
    if (check) {
      triggerElement.append(
        buildInputNode(
          check.arg,
          check.options,
          trigger.requirementId,
          function (result) {
            trigger.requirementId = result;
            trigger.complete = false;
            updateSettingsFromState();
          },
        ),
      );
    }
  }

  function buildTriggerRequirementCountImpl(trigger) {
    let triggerElement = $("#script_trigger_" + trigger.seq)
      .children()
      .eq(2);
    triggerElement.empty().off("*");

    if (
      trigger.requirementType !== "Boolean" &&
      checkTypes[trigger.requirementType]
    ) {
      let retType = retBools.includes(trigger.requirementType)
        ? "boolean"
        : "number";
      triggerElement.append(
        buildInputNode(
          retType,
          null,
          trigger.requirementCount,
          function (result) {
            trigger.requirementCount = Number(result);
            trigger.complete = false;
            updateSettingsFromState();
          },
        ),
      );
    }
  }

  function buildTriggerActionTypeImpl(trigger) {
    let triggerElement = $("#script_trigger_" + trigger.seq)
      .children()
      .eq(3);
    triggerElement.empty().off("*");

    // Action Type
    let typeSelectNode = $(`
          <select style="width: 100%">
            <option value = "research" title = "Research technology">Research</option>
            <option value = "build" title = "Build buildings up to 'count' amount">Build</option>
            <option value = "arpa" title = "Build projects up to 'count' amount">A.R.P.A.</option>
          </select>`);
    typeSelectNode.val(trigger.actionType);

    triggerElement.append(typeSelectNode);

    typeSelectNode.on("change", function (this: Loose) {
      trigger.updateActionType(this.value);

      buildTriggerActionId(trigger);
      buildTriggerActionCount(trigger);

      updateSettingsFromState();
    });

    return;
  }

  function buildTriggerActionIdImpl(trigger) {
    let triggerElement = $("#script_trigger_" + trigger.seq)
      .children()
      .eq(4);
    triggerElement.empty().off("*");

    let argDef =
      trigger.actionType === "research"
        ? argType.research
        : trigger.actionType === "build"
          ? argType.building
          : trigger.actionType === "arpa"
            ? argType.project
            : null;

    if (argDef) {
      triggerElement.append(
        buildInputNode(
          argDef.arg,
          argDef.options,
          trigger.actionId,
          function (result) {
            trigger.actionId = result;
            trigger.complete = false;
            updateSettingsFromState();
          },
        ),
      );
    }
  }

  function buildTriggerActionCountImpl(trigger) {
    let triggerElement = $("#script_trigger_" + trigger.seq)
      .children()
      .eq(5);
    triggerElement.empty().off("*");

    if (trigger.actionType === "build" || trigger.actionType === "arpa") {
      triggerElement.append(
        buildInputNode("number", null, trigger.actionCount, function (result) {
          trigger.actionCount = Number(result);
          trigger.complete = false;
          updateSettingsFromState();
        }),
      );
    }
  }

  function buildTriggerSettingsColumnImpl(trigger) {
    let triggerElement = $("#script_trigger_" + trigger.seq)
      .children()
      .eq(6);
    triggerElement.empty().off("*");

    let deleteTriggerButton = $(
      '<a class="button is-small" style="width: 26px; height: 26px"><span>X</span></a>',
    );
    triggerElement.append(deleteTriggerButton);
    deleteTriggerButton.on("click", function () {
      TriggerManager.RemoveTrigger(trigger.seq);
      updateSettingsFromState();
      updateTriggerSettingsContent();
    });

    let duplicateTriggerButton = $(
      '<a class="button is-small" style="width: 26px; height: 26px"><span>&#9282;</span></a>',
    );
    triggerElement.append(duplicateTriggerButton);
    duplicateTriggerButton.on("click", function () {
      TriggerManager.DuplicateTrigger(trigger.seq);
      updateSettingsFromState();
      updateTriggerSettingsContent();
    });

    let evalizeTriggerButton = $(
      '<a class="button is-small" style="width: 26px; height: 26px"><span>E</span></a>',
    );
    triggerElement.append(evalizeTriggerButton);
    evalizeTriggerButton.on("click", function () {
      TriggerManager.EvalizeTrigger(trigger.seq);
    });
  }

  function buildTriggerSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildTriggerSettings") ?? buildTriggerSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateTriggerSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateTriggerSettingsContent") ??
      updateTriggerSettingsContentImpl;
    return implementation.apply(this, args);
  }

  function addTriggerSetting(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("addTriggerSetting") ?? addTriggerSettingImpl;
    return implementation.apply(this, args);
  }

  function buildTriggerRequirementType(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildTriggerRequirementType") ??
      buildTriggerRequirementTypeImpl;
    return implementation.apply(this, args);
  }

  function buildTriggerRequirementId(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildTriggerRequirementId") ?? buildTriggerRequirementIdImpl;
    return implementation.apply(this, args);
  }

  function buildTriggerRequirementCount(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildTriggerRequirementCount") ??
      buildTriggerRequirementCountImpl;
    return implementation.apply(this, args);
  }

  function buildTriggerActionType(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildTriggerActionType") ?? buildTriggerActionTypeImpl;
    return implementation.apply(this, args);
  }

  function buildTriggerActionId(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildTriggerActionId") ?? buildTriggerActionIdImpl;
    return implementation.apply(this, args);
  }

  function buildTriggerActionCount(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildTriggerActionCount") ?? buildTriggerActionCountImpl;
    return implementation.apply(this, args);
  }

  function buildTriggerSettingsColumn(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildTriggerSettingsColumn") ??
      buildTriggerSettingsColumnImpl;
    return implementation.apply(this, args);
  }

  return {
    buildTriggerSettings,
    updateTriggerSettingsContent,
    addTriggerSetting,
    buildTriggerRequirementType,
    buildTriggerRequirementId,
    buildTriggerRequirementCount,
    buildTriggerActionType,
    buildTriggerActionId,
    buildTriggerActionCount,
    buildTriggerSettingsColumn,
  };
}
