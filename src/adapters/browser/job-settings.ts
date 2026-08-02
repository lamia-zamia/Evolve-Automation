import {
  type JobSettingsBreakpoint,
  type JobSettingsControl,
  type JobSettingsReadModel,
  type JobSettingsRow,
} from "../../domain/civic/job-settings.ts";
import type { JobSettingsIntentHandler } from "../../ports/job-settings.ts";
import {
  renderSettingsSectionContent,
  type ScrollDocument,
  type SettingsContentNode,
} from "./settings-section.ts";

interface JQueryNode extends SettingsContentNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
  append(content: unknown): JQueryNode;
  addClass(className: string): JQueryNode;
  next(): JQueryNode;
  on(events: string, handler: () => void): JQueryNode;
  sortable(options: unknown): JQueryNode;
  sortable(method: string, options: unknown): string[];
}

type JQuery = (selector: string) => JQueryNode;
type Action = () => void;

export interface JobSettingsBrowserActions {
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
  readonly addSettingsToggle: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ) => unknown;
  readonly addSettingsString: (
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
  readonly getSorterHelper: () => unknown;
  readonly confirm: (message: string) => boolean;
}

interface JobSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly getReadModel: () => JobSettingsReadModel;
  readonly intents: JobSettingsIntentHandler;
  readonly getActions: () => JobSettingsBrowserActions;
}

export interface JobSettingsBrowserAdapter {
  buildJobSettings(): void;
  updateJobSettingsContent(): void;
}

export function createJobSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  getReadModel,
  intents,
  getActions,
}: JobSettingsBrowserDependencies): JobSettingsBrowserAdapter {
  function buildJobSettings(): void {
    const readModel = getReadModel();
    const actions = getActions();
    actions.buildSettingsSection(
      readModel.sectionId,
      readModel.sectionName,
      () => intents.handle({ type: "reset-job-settings" }),
      updateJobSettingsContent,
    );
  }

  function updateJobSettingsContent(): void {
    const readModel = getReadModel();
    const actions = getActions();
    const jquery = getJQuery();
    renderSettingsSectionContent(
      {
        scrollDocument: getDocument(),
        jquery,
        sectionId: readModel.sectionId,
      },
      (currentNode) => {
        renderJobContent(currentNode, readModel, actions, jquery);
      },
    );
  }

  function renderJobContent(
    currentNode: JQueryNode,
    readModel: JobSettingsReadModel,
    actions: JobSettingsBrowserActions,
    jquery: JQuery,
  ): void {
    for (const control of readModel.controls) {
      renderControl(currentNode, control, actions);
    }

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:35%">Job</th>
              <th class="has-text-warning" style="width:17%">1st Pass</th>
              <th class="has-text-warning" style="width:17%">2nd Pass</th>
              <th class="has-text-warning" style="width:17%">3rd Pass</th>
              <th class="has-text-warning" style="width:9%" title="When enabled script will limit amount of assigned workers down to maximum useful quantity, moving idling workers to other jobs">Smart</th>
              <td style="width:5%"><span id="script_resetJobsPriority" class="script-refresh"></span></td>
            </tr>
            <tbody id="script_jobTableBody"></tbody>
          </table>`);

    jquery("#script_resetJobsPriority").on("click", () => {
      if (actions.confirm("Are you sure you wish to reset jobs priority?")) {
        intents.handle({ type: "reset-job-priorities" });
      }
    });

    const tableBodyNode = jquery("#script_jobTableBody");
    let newTableBodyText = "";
    for (const row of readModel.rows) {
      newTableBodyText += `<tr value="${row.id}" class="script-draggable"><td id="script_${row.id}" style="width:35%"></td><td style="width:17%"></td><td style="width:17%"></td><td style="width:17%"></td><td style="width:9%"></td><td style="width:5%"></td></tr>`;
    }
    tableBodyNode.append(jquery(newTableBodyText));

    for (const row of readModel.rows) {
      let jobElement = jquery(`#script_${row.id}`);
      renderJobToggle(jobElement, row, actions, jquery);
      for (const breakpoint of row.breakpoints) {
        jobElement = jobElement.next();
        renderBreakpoint(jobElement, breakpoint, actions);
      }
      jobElement = jobElement.next();
      if (row.smartSettingName !== undefined) {
        actions.addTableToggle(jobElement, row.smartSettingName);
      }
      jobElement = jobElement.next();
      jobElement.append(jquery('<span class="script-lastcolumn"></span>'));
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: actions.getSorterHelper(),
      update: () => {
        const sortedIds = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        intents.handle({ type: "reorder-jobs", jobIds: sortedIds });
      },
    });
  }

  function renderControl(
    node: JQueryNode,
    control: JobSettingsControl,
    actions: JobSettingsBrowserActions,
  ): void {
    if (control.kind === "number") {
      actions.addSettingsNumber(
        node,
        control.settingName,
        control.label,
        control.hint,
      );
      return;
    }
    if (control.kind === "string") {
      actions.addSettingsString(
        node,
        control.settingName,
        control.label,
        control.hint,
      );
      return;
    }
    actions.addSettingsToggle(
      node,
      control.settingName,
      control.label,
      control.hint,
    );
  }

  function renderJobToggle(
    node: JQueryNode,
    row: JobSettingsRow,
    actions: JobSettingsBrowserActions,
    jquery: JQuery,
  ): void {
    const settingKey = row.enabledSettingName;
    node
      .addClass(
        `script_bg_${settingKey}${row.hasOverride ? " inactive-row" : ""}`,
      )
      .append(
        actions.addToggleCallbacks(
          jquery(`
          <label tabindex="0" class="switch" style="margin-top:4px; margin-left:10px;">
            <input class="script_${settingKey}" type="checkbox"${
              row.enabled ? " checked" : ""
            }>
            <span class="check" style="height:5px; max-width:15px"></span>
            <span class="has-text-${row.color}" style="margin-left: 20px;">${row.label}</span>
          </label>`),
          settingKey,
        ),
      );
  }

  function renderBreakpoint(
    node: JQueryNode,
    breakpoint: JobSettingsBreakpoint,
    actions: JobSettingsBrowserActions,
  ): void {
    if (breakpoint.kind === "managed") {
      node.append("<span>Managed</span>");
    } else if (breakpoint.kind === "weighted") {
      node.append("<span>Weighted</span>");
    } else {
      actions.addTableInput(node, breakpoint.settingName);
    }
  }

  return Object.freeze({ buildJobSettings, updateJobSettingsContent });
}
