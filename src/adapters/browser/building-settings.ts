import {
  type BuildingSettingsControl,
  type BuildingSettingsReadModel,
  type BuildingSettingsRow,
} from "../../domain/building-settings.ts";
import type { BuildingSettingsIntentHandler } from "../../ports/building-settings.ts";

interface BuildingElement {
  id: string;
  value: string;
  textContent: string;
  style: { display: string };
  getElementsByTagName(name: string): ArrayLike<BuildingElement>;
}

interface BuildingDocument {
  documentElement: { scrollTop: number };
  body: { scrollTop: number };
  getElementById(id: string): BuildingElement | null;
}

interface JQueryEvent {
  readonly [key: string]: unknown;
  readonly target?: { readonly nodeName?: string };
  preventDefault?(): void;
}

interface JQueryInput {
  checked: boolean;
}

interface JQueryNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
  append(content: unknown): JQueryNode;
  appendTo(node: JQueryNode): JQueryNode;
  find(selector: string): JQueryNode;
  next(): JQueryNode;
  addClass(className: string): JQueryNode;
  toggleClass(className: string, value: boolean): JQueryNode;
  prop(name: string, value: unknown): JQueryNode;
  on(events: string, handler: (event: JQueryEvent) => void): JQueryNode;
  on(
    events: string,
    selector: string,
    handler: (this: JQueryInput, event: JQueryEvent) => void,
  ): JQueryNode;
  sortable(options: SortableOptions): JQueryNode;
  sortable(
    command: "toArray",
    options: { readonly attribute: string },
  ): readonly string[];
}

interface SortableOptions {
  readonly items: string;
  readonly helper: unknown;
  readonly update: () => void;
}

type JQuery = (selector: string) => JQueryNode;
type Action = () => void;

export interface BuildingSettingsBrowserActions {
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
  readonly addTableInput: (node: JQueryNode, settingName: string) => void;
  readonly addTableToggle: (node: JQueryNode, settingName: string) => void;
  readonly addToggleCallbacks: (
    node: JQueryNode,
    settingName: string,
  ) => JQueryNode;
  readonly buildTableLabel: (
    label: string,
    title: string,
    color: string,
  ) => JQueryNode;
  readonly confirm: (message: string) => boolean;
  readonly getSorterHelper: () => unknown;
}

interface BuildingSettingsBrowserDependencies {
  readonly getDocument: () => BuildingDocument;
  readonly getJQuery: () => JQuery;
  readonly getReadModel: () => BuildingSettingsReadModel;
  readonly getFilterMatches: (query: string) => readonly string[] | undefined;
  readonly intents: BuildingSettingsIntentHandler;
  readonly getActions: () => BuildingSettingsBrowserActions;
}

export interface BuildingSettingsBrowserAdapter {
  buildBuildingSettings(): void;
  updateBuildingSettingsContent(): void;
  filterBuildingSettingsTable(): void;
}

export function createBuildingSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  getReadModel,
  getFilterMatches,
  intents,
  getActions,
}: BuildingSettingsBrowserDependencies): BuildingSettingsBrowserAdapter {
  function buildBuildingSettings(): void {
    const readModel = getReadModel();
    const actions = getActions();
    actions.buildSettingsSection(
      readModel.sectionId,
      readModel.sectionName,
      () => intents.handle({ type: "reset-building-settings" }),
      updateBuildingSettingsContent,
    );
  }

  function updateBuildingSettingsContent(): void {
    const readModel = getReadModel();
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
          <div><input id="script_buildingSearch" class="script-searchsettings" type="text" placeholder="Search for buildings..."></div>
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:35%">Building</th>
              <th class="has-text-warning" style="width:15%" title="Enables auto building. Triggers ignores this option, allowing to build disabled things.">Auto Build</th>
              <th class="has-text-warning" style="width:15%" title="Maximum amount of buildings to build. Triggers ignores this option, allowing to build above limit. Can be also used to limit amount of enabled buildings, with respective option above.">Max Build</th>
              <th class="has-text-warning" style="width:15%" title="Script will try to spend 2x amount of resources on building having 2x weighting, and such.">Weighting</th>
              <th class="has-text-warning" style="width:20%" title="First toggle enables basic automation based on priority, power, support, and consumption. Second enables logic made specially for particlular building, their effects are different, but generally it tries to behave smarter than just staying enabled all the time.">Auto Power</th>
            </tr>
            <tbody id="script_buildingTableBody"></tbody>
          </table>`);

    jquery("#script_buildingSearch").on("keyup", () =>
      filterBuildingSettingsTable(),
    );

    const tableBodyNode = jquery("#script_buildingTableBody");
    let newTableBodyText =
      '<tr value="All" class="unsortable"><td id="script_bldallToggle" style="width:35%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:20%"><span id="script_resetBuildingsPriority" class="script-refresh"></span></td></tr>';
    for (const row of readModel.rows) {
      newTableBodyText += `<tr value="${row.id}" class="script-draggable"><td id="script_${row.id}" style="width:35%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:20%"></td></tr>`;
    }
    tableBodyNode.append(jquery(newTableBodyText));

    let buildingElement = jquery("#script_bldallToggle");
    buildingElement.append(
      '<span class="has-text-warning" style="margin-left: 20px;">All Buildings</span>',
    );
    buildingElement = buildingElement.next();
    buildingElement.append(buildAllToggle(readModel, actions, jquery, true));
    buildingElement = buildingElement.next().next().next();
    buildingElement.append(buildAllToggle(readModel, actions, jquery, false));

    jquery("#script_resetBuildingsPriority").on("click", () => {
      if (
        actions.confirm("Are you sure you wish to reset buildings priority?")
      ) {
        intents.handle({ type: "reset-building-priorities" });
      }
    });

    for (const row of readModel.rows) {
      let rowNode = jquery(`#script_${row.id}`);
      rowNode.append(actions.buildTableLabel(row.label, "", row.color));
      rowNode = rowNode.next();
      actions.addTableToggle(rowNode, row.autoBuildSettingName);
      rowNode = rowNode.next();
      actions.addTableInput(rowNode, row.maximumSettingName);
      rowNode = rowNode.next();
      actions.addTableInput(rowNode, row.weightingSettingName);
      rowNode = rowNode.next();
      renderBuildingState(rowNode, row, actions, jquery);
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: actions.getSorterHelper(),
      update: () => {
        const sortedIds = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        intents.handle({ type: "reorder-buildings", buildingIds: sortedIds });
      },
    });

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function filterBuildingSettingsTable(): void {
    const document = getDocument();
    const searchNode = document.getElementById("script_buildingSearch");
    const tableNode = document.getElementById("script_buildingTableBody");
    if (!searchNode || !tableNode) return;
    const filter = searchNode.value.toUpperCase();
    const rows = tableNode.getElementsByTagName("tr");
    const matchingIds = getFilterMatches(filter);
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row) continue;
      const firstCell = row.getElementsByTagName("td")[0];
      if (!firstCell) continue;
      if (matchingIds !== undefined) {
        const match = firstCell.id.match(/^script_(.*)$/);
        const id = match?.[1];
        row.style.display = id && matchingIds.includes(id) ? "" : "none";
      } else if (firstCell.textContent.toUpperCase().includes(filter)) {
        row.style.display = "";
      } else {
        row.style.display = "none";
      }
    }
  }

  function renderControl(
    node: JQueryNode,
    control: BuildingSettingsControl,
    actions: BuildingSettingsBrowserActions,
  ): void {
    if (control.kind === "toggle") {
      actions.addSettingsToggle(
        node,
        control.settingName,
        control.label,
        control.hint,
      );
    } else if (control.kind === "number") {
      actions.addSettingsNumber(
        node,
        control.settingName,
        control.label,
        control.hint,
      );
    } else if (control.kind === "select") {
      actions.addSettingsSelect(
        node,
        control.settingName,
        control.label,
        control.hint,
        control.options,
      );
    }
  }

  function buildAllToggle(
    readModel: BuildingSettingsReadModel,
    actions: BuildingSettingsBrowserActions,
    jquery: JQuery,
    enabledToggle: boolean,
  ): JQueryNode {
    const settingName = enabledToggle
      ? "buildingEnabledAll"
      : "buildingStateAll";
    const inputClass = enabledToggle
      ? "script_buildingEnabledAll"
      : "script_buildingStateAll";
    const checked = enabledToggle ? readModel.allEnabled : readModel.allState;
    const label = enabledToggle
      ? `<label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;">
            <input class="${inputClass}" type="checkbox"${checked ? " checked" : ""}>
            <span class="check" style="height:5px; max-width:15px"></span>
            <span style="margin-left: 20px;"></span>
          </label>`
      : `<label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;">
            <input class="${inputClass}" type="checkbox"${checked ? " checked" : ""}>
            <span class="check" style="height:5px; max-width:15px"></span>
            <span style="margin-left: 20px;"></span>
          </label>`;
    return jquery(label)
      .on("change", "input", function (this: JQueryInput) {
        intents.handle({
          type: enabledToggle ? "set-all-autobuild" : "set-all-autopower",
          enabled: this.checked,
        });
        jquery(
          enabledToggle ? '[class^="script_bat"]' : '[class^="script_bld_s_"]',
        ).prop("checked", this.checked);
      })
      .on("click", (event) => {
        if (event[readModel.overrideKey]) event.preventDefault?.();
        if (
          event.target?.nodeName === "INPUT" &&
          !actions.confirm(
            enabledToggle
              ? "Are you sure you wish to change the Auto Build state of ALL buildings?"
              : "Are you sure you wish to change the Auto Power state of ALL buildings?",
          )
        ) {
          event.preventDefault?.();
        }
      });
  }

  function renderBuildingState(
    node: JQueryNode,
    row: BuildingSettingsRow,
    actions: BuildingSettingsBrowserActions,
    jquery: JQuery,
  ): void {
    if (row.stateSettingName) {
      actions
        .addToggleCallbacks(
          jquery(`
              <label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;">
                <input class="script_${row.stateSettingName}" type="checkbox"${
                  row.stateEnabled ? " checked" : ""
                }>
                <span class="check" style="height:5px; max-width:15px"></span>
                <span style="margin-left: 20px;"></span>
              </label>`),
          row.stateSettingName,
        )
        .appendTo(node);
      node.addClass(`script_bg_${row.stateSettingName}`);
    }

    if (row.smartSettingName) {
      const smartNode = jquery(`
              <label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 35px;">
                <input class="script_${row.smartSettingName}" type="checkbox"${
                  row.smartEnabled ? " checked" : ""
                }>
                <span class="check" style="height:5px; max-width:15px"></span>
                <span style="margin-left: 20px;"></span>
              </label>`);
      if (row.smartLinkedIds) {
        const linkedIds = row.smartLinkedIds;
        smartNode.on("change", "input", function (this: JQueryInput) {
          intents.handle({
            type: "set-linked-smart-state",
            buildingIds: linkedIds,
            enabled: this.checked,
          });
          for (const id of linkedIds) {
            jquery(`.script_bld_s2_${id}`).prop("checked", this.checked);
          }
        });
      } else {
        actions.addToggleCallbacks(smartNode, row.smartSettingName);
      }
      node.append(smartNode).addClass(`script_bg_${row.smartSettingName}`);
    }

    node.append('<span class="script-lastcolumn"></span>');
    node.toggleClass(
      "inactive-row",
      row.hasStateOverride || row.hasSmartOverride,
    );
  }

  return Object.freeze({
    buildBuildingSettings,
    updateBuildingSettingsContent,
    filterBuildingSettingsTable,
  });
}
