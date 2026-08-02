import { type TraitSettingsReadModel } from "../../domain/traits/trait-settings.ts";
import type { TraitSettingsIntentHandler } from "../../ports/trait-settings.ts";
import {
  renderSettingsSectionContent,
  type ScrollDocument,
  type SettingsContentNode,
} from "./settings-section.ts";

interface TraitSettingsDependencies {
  getReadModel: () => TraitSettingsReadModel;
  getDocument: () => ScrollDocument;
  getJQuery: () => JQuery;
  intents: TraitSettingsIntentHandler;
  getSorterHelper: () => unknown;
  buildSettingsSection: (
    sectionId: string,
    sectionName: string,
    resetFunction: () => void,
    updateSettingsContentFunction: () => void,
  ) => void;
  addStandardHeading: (node: JQueryNode, heading: string) => void;
  addSettingsSelect: (
    node: JQueryNode,
    settingName: string,
    label: string,
    hint: string,
    options: readonly { val: string; label: string; hint: string }[],
  ) => JQueryNode;
  addSettingsNumber: (
    node: JQueryNode,
    settingName: string,
    label: string,
    hint: string,
  ) => unknown;
  addSettingsToggle: (
    node: JQueryNode,
    settingName: string,
    label: string,
    hint: string,
  ) => unknown;
  addTableToggle: (node: JQueryNode, settingName: string) => void;
  addTableInput: (node: JQueryNode, settingName: string) => void;
  buildTableLabel: (note: string, hint?: string, color?: string) => unknown;
}

interface JQueryNode extends SettingsContentNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
  append(value: unknown): JQueryNode;
  appendTo(node: JQueryNode): JQueryNode;
  on(events: string, ...args: unknown[]): JQueryNode;
  find(selector: string): JQueryNode;
  first(): JQueryNode;
  next(): JQueryNode;
  html(value: unknown): JQueryNode;
  prop(name: string, value?: unknown): boolean | JQueryNode;
  sortable(options: Record<string, unknown>): JQueryNode;
  sortable(command: string, options: Record<string, unknown>): string[];
}

type JQuery = (value: unknown) => JQueryNode;

export interface TraitSettingsBrowserAdapter {
  buildTraitSettings(): void;
  updateImitateWarning(): void;
  updateTraitSettingsContent(): void;
  makeToggleSwitchesMutuallyExclusive(
    switch1: JQueryNode,
    settingsKey1: string,
    switch2: JQueryNode,
    settingsKey2: string,
  ): void;
}

export function createTraitSettingsBrowserAdapter({
  getReadModel,
  getDocument,
  getJQuery,
  getSorterHelper,
  intents,
  buildSettingsSection,
  addStandardHeading,
  addSettingsSelect,
  addSettingsNumber,
  addSettingsToggle,
  addTableToggle,
  addTableInput,
  buildTableLabel,
}: TraitSettingsDependencies): TraitSettingsBrowserAdapter {
  function buildTraitSettings() {
    const readModel = getReadModel();
    buildSettingsSection(
      readModel.sectionId,
      readModel.sectionName,
      () => intents.handle({ type: "reset-trait-settings" }),
      updateTraitSettingsContent,
    );
  }

  function updateImitateWarning() {
    const readModel = getReadModel();
    const $ = getJQuery();
    if (readModel.imitateRaceCompleted !== undefined) {
      if (readModel.imitateRaceCompleted) {
        $("#script_imitate_warning").html(
          `<span class="has-text-success">You have completed an AI Apocalypse with this race and can imitate it.</span>`,
        );
      } else {
        $("#script_imitate_warning").html(
          `<span class="has-text-danger">Warning! You have NOT completed an AI Apocalypse with this race, and cannot imitate it.</span>`,
        );
      }
    } else {
      $("#script_imitate_warning").empty();
    }
  }

  function controlOptions(
    readModel: TraitSettingsReadModel,
    settingName: string,
  ): readonly { val: string; label: string; hint: string }[] {
    const control = readModel.controls.find(
      (candidate) => candidate.settingName === settingName,
    );
    if (!control || control.kind !== "select") {
      throw new Error(`Missing Trait select control: ${settingName}`);
    }
    return control.options;
  }

  function updateTraitSettingsContent(): void {
    const readModel = getReadModel();
    const $ = getJQuery();
    renderSettingsSectionContent(
      {
        scrollDocument: getDocument(),
        jquery: $,
        sectionId: readModel.sectionId,
      },
      (contentNode) => {
        renderTraitContent(contentNode, readModel, $);
      },
    );
  }

  function renderTraitContent(
    currentNode: JQueryNode,
    readModel: TraitSettingsReadModel,
    $: JQuery,
  ): void {
    addStandardHeading(currentNode, "Major Traits");
    addSettingsSelect(
      currentNode,
      "shifterGenus",
      "Mimic genus",
      "Mimic selected genus, if avaialble. If you want to add some conditional overrides to this setting, keep in mind changing genus redraws game page, frequent changes can drastically harm game performance.",
      readModel.genusOptions,
    );

    const imitateControl = addSettingsSelect(
      currentNode,
      "imitateRace",
      "Imitate race",
      "Imitate selected race, if available.",
      readModel.imitateOptions,
    );
    imitateControl.on("change", "select", () => {
      intents.handle({ type: "clear-evolution-target" });
      updateImitateWarning();
    });

    currentNode.append(`<div><span id="script_imitate_warning"></span></div>`);
    updateImitateWarning();

    addSettingsSelect(
      currentNode,
      "buildingShrineType",
      "Magnificent shrine",
      "Auto Build shrines only at moons of chosen shrine",
      controlOptions(readModel, "buildingShrineType"),
    );
    addSettingsNumber(
      currentNode,
      "slaveIncome",
      "Minimum income to buy slave",
      "Script will use Slave Market only when money is capped, or have income above given number",
    );

    addSettingsSelect(
      currentNode,
      "psychicPower",
      "Psychic Powers",
      "Activates selected power with full energy. 10 murders required to research advanced powers will be performed automatically, if needed.",
      readModel.psychicOptions,
    );

    addSettingsSelect(
      currentNode,
      "psychicBoostRes",
      "Boosted Resource",
      "Resource for Boost Resource Production psychic power.",
      readModel.psychicBoostOptions,
    );

    addSettingsSelect(
      currentNode,
      "wishMinor",
      "Minor Wish",
      "Uses this minor wish when available.",
      readModel.wishMinorOptions,
    );
    addSettingsSelect(
      currentNode,
      "wishMajor",
      "Major Wish",
      "Uses this major wish when available.",
      readModel.wishMajorOptions,
    );

    addSettingsToggle(
      currentNode,
      "jobScalePop",
      "High Pop job scale",
      "Auto Job will automatically scaly breakpoints to match population increase",
    );

    addStandardHeading(currentNode, "Ocular Powers");
    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:50%">Name</th>
              <th class="has-text-warning" style="width:25%">Enabled</th>
              <th class="has-text-warning" style="width:25%">Priority</th>
            </tr>
            <tbody id="script_ocularPowersTableBody"></tbody>
          </table>
        `);
    const ocularTableBodyNode = $("#script_ocularPowersTableBody");
    readModel.ocularRows.forEach((p) => {
      let tr = $(`<tr><td></td><td></td><td></td></tr>`);
      tr.appendTo(ocularTableBodyNode);

      let ocularPowerElement = tr.find("td").first();
      ocularPowerElement.append(buildTableLabel(p.label, p.hint));

      ocularPowerElement = ocularPowerElement.next();
      addTableToggle(ocularPowerElement, `ocularPower_${p.id}`);

      ocularPowerElement = ocularPowerElement.next();
      addTableInput(ocularPowerElement, `ocularPower_p_${p.id}`);
    });

    // Minor Traits
    addStandardHeading(currentNode, "Minor Traits");

    let sequenceOptions = [
      {
        val: "none",
        label: "Ignore",
        hint: "Ignored by script, managed by game and player",
      },
      { val: "enabled", label: "Enable", hint: "Sequencer enabled" },
      { val: "disabled", label: "Disable", hint: "Sequencer disabled" },
      {
        val: "decode",
        label: "Decode",
        hint: "Decode genome only, with no further mutations",
      },
    ];
    addSettingsSelect(
      currentNode,
      "geneticsSequence",
      "Sequencer",
      "Manages genome decoding, and mutations",
      sequenceOptions,
    );

    let boostOptions = [
      {
        val: "none",
        label: "Ignore",
        hint: "Ignored by script, managed by game and player",
      },
      { val: "enabled", label: "Enable", hint: "Booster enabled" },
      { val: "disabled", label: "Disable", hint: "Booster disabled" },
    ];
    addSettingsSelect(
      currentNode,
      "geneticsBoost",
      "Sequence Booster",
      "Manages sequencer booster",
      boostOptions,
    );

    let assembleOptions = [
      {
        val: "none",
        label: "Ignore",
        hint: "Ignored by script, managed by game and player",
      },
      { val: "enabled", label: "Enable", hint: "Auto Sequencer enable" },
      { val: "disabled", label: "Disable", hint: "Auto Sequencer disable" },
      {
        val: "auto",
        label: "Script Managed",
        hint: "Gene assembling managed by script, allowing to dump excess knowledge at faster rate, matching income",
      },
    ];
    addSettingsSelect(
      currentNode,
      "geneticsAssemble",
      "Auto Sequence",
      "Manages genome decoding, and mutations",
      assembleOptions,
    );

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:20%">Minor Trait</th>
              <th class="has-text-warning" style="width:20%">Enabled</th>
              <th class="has-text-warning" style="width:20%">Weighting</th>
              <th class="has-text-warning" style="width:40%"></th>
            </tr>
            <tbody id="script_minorTraitTableBody"></tbody>
          </table>`);

    let tableBodyNode = $("#script_minorTraitTableBody");
    let newTableBodyText = "";

    for (const trait of readModel.minorRows) {
      newTableBodyText += `<tr value="${trait.id}" class="script-draggable"><td id="script_minorTrait_${trait.id}" style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:40%"><span class="script-lastcolumn"></span></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other minorTraits settings rows
    for (const trait of readModel.minorRows) {
      let minorTraitElement = $("#script_minorTrait_" + trait.id);

      minorTraitElement.append(buildTableLabel(trait.label, trait.hint));

      minorTraitElement = minorTraitElement.next();
      addTableToggle(minorTraitElement, "mTrait_" + trait.id);

      minorTraitElement = minorTraitElement.next();
      addTableInput(minorTraitElement, "mTrait_w_" + trait.id);
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: getSorterHelper(),
      update: function () {
        let minorTraitNames = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        intents.handle({
          type: "reorder-minor-traits",
          traitIds: minorTraitNames,
        });
      },
    });

    // Trait Mutations

    addStandardHeading(currentNode, "Trait Mutation");
    addSettingsToggle(
      currentNode,
      "doNotGoBelowPlasmidSoftcap",
      "Do not go below Plasmid softcap",
      "Script will not mutate if the number of remaining plasmids or anti plamids would be lower than the softcap (250 + Phage)",
    );
    addSettingsNumber(
      currentNode,
      "minimumPlasmidsToPreserve",
      "Minimum Plasmids / Anti-Plasmids to preserve",
      "Script will not mutate if the number of remaining plasmids or anti plamids would be lower than this value",
    );

    currentNode.append(`
        <table style="width:100%">
        <tr>
            <th class="has-text-warning" style="width:30%">Species / Genus</th>
            <th class="has-text-warning" style="width:25%">Trait</th>
            <th class="has-text-warning" style="width:10%">Cost</th>
            <th class="has-text-warning" style="width:10%">Add</th>
            <th class="has-text-warning" style="width:10%">Remove</th>
            <th class="has-text-warning" style="width:10%">Reset</th>
            <th class="has-text-warning" style="width:5%"></th>
        </tr>
        <tbody id="script_mutateTraitTableBody"></tbody>
        </table>`);

    let mutateTraitTableBodyNode = $("#script_mutateTraitTableBody");
    newTableBodyText = "";

    for (const trait of readModel.mutableRows) {
      newTableBodyText += `<tr value="${trait.id}" class="script-draggable"><td id="script_mutableTrait_${trait.id}" style="width:30%"></td><td style="width:25%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>`;
    }
    mutateTraitTableBodyNode.append($(newTableBodyText));

    // Build all other mutableTraits settings rows
    for (const trait of readModel.mutableRows) {
      let mutableTraitElement = $("#script_mutableTrait_" + trait.id);

      mutableTraitElement.append(
        buildTableLabel(trait.sourceLabel, trait.sourceHint, trait.sourceColor),
      );

      mutableTraitElement = mutableTraitElement.next();
      mutableTraitElement.append(
        buildTableLabel(trait.traitLabel, trait.traitHint, trait.traitColor),
      );

      mutableTraitElement = mutableTraitElement.next();
      mutableTraitElement.append(
        buildTableLabel(trait.costLabel, trait.costHint),
      );

      mutableTraitElement = mutableTraitElement.next();
      if (trait.gainable) {
        // TODO check if beast_of_burden can be gained by other races during winter event.
        addTableToggle(mutableTraitElement, "mutableTrait_gain_" + trait.id);
      }

      mutableTraitElement = mutableTraitElement.next();
      addTableToggle(mutableTraitElement, "mutableTrait_purge_" + trait.id);

      if (trait.gainable) {
        makeToggleSwitchesMutuallyExclusive(
          $(".script_mutableTrait_gain_" + trait.id),
          "mutableTrait_gain_" + trait.id,
          $(".script_mutableTrait_purge_" + trait.id),
          "mutableTrait_purge_" + trait.id,
        );
      }

      mutableTraitElement = mutableTraitElement.next();
      if (trait.resettable) {
        addTableToggle(mutableTraitElement, "mutableTrait_reset_" + trait.id);
      }
    }

    mutateTraitTableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: getSorterHelper(),
      update: function () {
        let mutableTraitNames = mutateTraitTableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        intents.handle({
          type: "reorder-mutable-traits",
          traitIds: mutableTraitNames,
        });
      },
    });
  }

  function makeToggleSwitchesMutuallyExclusive(
    switch1: JQueryNode,
    settingsKey1: string,
    switch2: JQueryNode,
    settingsKey2: string,
  ): void {
    switch1.on("change", function () {
      if (
        switch1.prop("checked") === true &&
        switch2.prop("checked") === true
      ) {
        switch2.prop("checked", false);
        intents.handle({
          type: "set-trait-setting",
          settingName: settingsKey2,
          value: false,
        });
      }
    });
    switch2.on("change", function () {
      if (
        switch1.prop("checked") === true &&
        switch2.prop("checked") === true
      ) {
        switch1.prop("checked", false);
        intents.handle({
          type: "set-trait-setting",
          settingName: settingsKey1,
          value: false,
        });
      }
    });
  }

  return Object.freeze({
    buildTraitSettings,
    updateImitateWarning,
    updateTraitSettingsContent,
    makeToggleSwitchesMutuallyExclusive,
  });
}
