import {
  type FleetSettingsControl,
  type FleetSettingsReadModel,
} from "../../domain/combat/fleet-settings.ts";
import type { FleetSettingsIntentHandler } from "../../ports/fleet-settings.ts";
import {
  renderSettingsSectionContent,
  type ScrollDocument,
  type SettingsContentNode,
} from "./settings-section.ts";

interface JQueryNode extends SettingsContentNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
  append(content: unknown): JQueryNode;
  next(): JQueryNode;
  sortable(
    option: string | Record<string, unknown>,
    value?: unknown,
  ): JQueryNode | string[];
  toggleClass(name: string, value: boolean): JQueryNode;
  on(events: string, dataOrHandler: unknown, handler?: unknown): JQueryNode;
}
type JQuery = (selector: string) => JQueryNode;
type Action = () => void;

export interface FleetSettingsBrowserActions {
  readonly buildSettingsSection2: (
    parent: JQueryNode,
    prefix: string,
    id: string,
    name: string,
    reset: Action,
    update: (prefix: string) => void,
  ) => void;
  readonly addSettingsHeader1: (node: JQueryNode, label: string) => unknown;
  readonly addStandardHeading: (node: JQueryNode, label: string) => unknown;
  readonly addSettingsNumber: (
    node: JQueryNode,
    setting: string,
    label: string,
    hint: string,
  ) => unknown;
  readonly addSettingsSelect: (
    node: JQueryNode,
    setting: string,
    label: string,
    hint: string,
    options: readonly unknown[],
  ) => unknown;
  readonly addSettingsToggle: (
    node: JQueryNode,
    setting: string,
    label: string,
    hint: string,
  ) => unknown;
  readonly addTableInput: (node: JQueryNode, setting: string) => unknown;
  readonly buildTableLabel: (label: string) => unknown;
  readonly openOverrideModal: (event: unknown) => void;
  readonly sorterHelper: unknown;
}
interface FleetSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly reader: { read(): FleetSettingsReadModel };
  readonly intents: FleetSettingsIntentHandler;
  readonly getActions: () => FleetSettingsBrowserActions;
}
export interface FleetSettingsBrowserAdapter {
  buildFleetSettings(parent: JQueryNode, secondaryPrefix: string): void;
  updateFleetSettingsContent(secondaryPrefix: string): void;
}

function renderControl(
  node: JQueryNode,
  control: FleetSettingsControl,
  actions: FleetSettingsBrowserActions,
): void {
  if (control.kind === "header")
    return void actions.addSettingsHeader1(node, control.label);
  if (control.kind === "number")
    return void actions.addSettingsNumber(
      node,
      control.settingName,
      control.label,
      control.hint,
    );
  if (control.kind === "toggle")
    return void actions.addSettingsToggle(
      node,
      control.settingName,
      control.label,
      control.hint,
    );
  if (control.kind === "select") {
    actions.addSettingsSelect(
      node,
      control.settingName,
      control.label,
      control.hint,
      control.options,
    );
  }
}

export function createFleetSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  reader,
  intents,
  getActions,
}: FleetSettingsBrowserDependencies): FleetSettingsBrowserAdapter {
  function buildFleetSettings(
    parent: JQueryNode,
    secondaryPrefix: string,
  ): void {
    const model = reader.read();
    getActions().buildSettingsSection2(
      parent,
      secondaryPrefix,
      model.sectionId,
      model.sectionName,
      () => intents.handle({ type: "reset-fleet-settings", secondaryPrefix }),
      updateFleetSettingsContent,
    );
  }
  function renderOuter(
    node: JQueryNode,
    prefix: string,
    model: FleetSettingsReadModel,
    actions: FleetSettingsBrowserActions,
  ): void {
    actions.addStandardHeading(node, "Outer Solar");
    for (const control of model.outerControls)
      renderControl(node, control, actions);
    node.append(
      '<div class="has-text-info">While the Eris Digsite is incomplete, its effective defense target is raised automatically from the configured scan/post-capture value so active Troopers and Tanks can overcome Digsite regeneration.</div>',
    );
    actions.addSettingsHeader1(node, "Fighter");
    for (const [type, options] of Object.entries(model.outerComponents))
      actions.addSettingsSelect(
        node,
        `fleet_outer_${type}`,
        ``,
        "Preset ship component",
        options,
      );
    actions.addSettingsHeader1(node, "Scout");
    for (const [type, options] of Object.entries(model.outerComponents))
      actions.addSettingsSelect(
        node,
        `fleet_scout_${type}`,
        ``,
        "Preset ship component",
        options,
      );
    node.append(
      `<table style="width:100%; text-align: left"><tbody id="script_${prefix}fleetOuterTable"></tbody></table>`,
    );
    const body = getJQuery()(`#script_${prefix}fleetOuterTable`);
    body.append(
      getJQuery()(
        model.outerRegions
          .map(
            (region) =>
              `<tr><td id="script_${prefix}fleet_${region.id}"></td><td></td><td></td><td></td><td></td></tr>`,
          )
          .join(""),
      ),
    );
    for (const region of model.outerRegions) {
      let cell = getJQuery()(`#script_${prefix}fleet_${region.id}`);
      cell.append(actions.buildTableLabel(region.label));
      cell = cell.next();
      actions.addTableInput(cell, `fleet_outer_pr_${region.id}`);
      cell = cell.next();
      actions.addTableInput(cell, `fleet_outer_def_${region.id}`);
      cell = cell.next();
      actions.addTableInput(cell, `fleet_outer_sc_${region.id}`);
    }
  }
  function renderAndromeda(
    node: JQueryNode,
    prefix: string,
    model: FleetSettingsReadModel,
    actions: FleetSettingsBrowserActions,
  ): void {
    actions.addStandardHeading(node, "Andromeda");
    for (const control of model.andromedaControls)
      renderControl(node, control, actions);
    node.append(
      `<table style="width:100%; text-align:left"><tbody id="script_${prefix}fleetTableBody"></tbody></table>`,
    );
    const body = getJQuery()(`#script_${prefix}fleetTableBody`);
    for (const region of model.andromedaRegions) {
      const row = getJQuery()(
        `<tr value="${region.id}" class="script-draggable"><td id="script_${prefix}fleet_${region.id}"></td><td><span class="script-lastcolumn"></span></td></tr>`,
      );
      row.toggleClass("inactive-row", false).on(
        "click",
        {
          label: `Andromeda region priority (${region.settingName})`,
          name: region.settingName,
          type: "number",
        },
        actions.openOverrideModal,
      );
      body.append(row);
      getJQuery()(`#script_${prefix}fleet_${region.id}`).append(
        actions.buildTableLabel(region.label),
      );
    }
    body.sortable({
      items: "tr:not(.unsortable)",
      helper: actions.sorterHelper,
      update: () => {
        const ids = body.sortable("toArray", { attribute: "value" });
        if (Array.isArray(ids))
          intents.handle({
            type: "reorder-andromeda-regions",
            secondaryPrefix: prefix,
            regionIds: ids,
          });
      },
    });
  }
  function updateFleetSettingsContent(secondaryPrefix: string): void {
    const model = reader.read();
    const actions = getActions();
    renderSettingsSectionContent(
      {
        scrollDocument: getDocument(),
        jquery: getJQuery(),
        sectionId: `${secondaryPrefix}${model.sectionId}`,
      },
      (node) => {
        renderOuter(node, secondaryPrefix, model, actions);
        renderAndromeda(node, secondaryPrefix, model, actions);
      },
    );
  }
  return Object.freeze({ buildFleetSettings, updateFleetSettingsContent });
}
