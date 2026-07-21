import {
  type ProjectSettingsReadModel,
  type ProjectSettingsRow,
} from "../../domain/project-settings.ts";
import type { ProjectSettingsIntentHandler } from "../../ports/project-settings.ts";

interface ScrollDocument {
  documentElement: { scrollTop: number };
  body: { scrollTop: number };
}

interface SortableOptions {
  readonly items: string;
  readonly helper: unknown;
  readonly update: () => void;
}

interface JQueryNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
  append(content: unknown): JQueryNode;
  next(): JQueryNode;
  sortable(options: SortableOptions): JQueryNode;
  sortable(
    command: "toArray",
    options: { readonly attribute: string },
  ): readonly string[];
}

type JQuery = (selector: string) => JQueryNode;
type Action = () => void;

export interface ProjectSettingsBrowserActions {
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
  readonly addTableInput: (node: JQueryNode, settingName: string) => void;
  readonly addTableToggle: (node: JQueryNode, settingName: string) => void;
  readonly buildTableLabel: (label: string) => unknown;
  readonly getSorterHelper: () => unknown;
}

interface ProjectSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly getReadModel: () => ProjectSettingsReadModel;
  readonly intents: ProjectSettingsIntentHandler;
  readonly getActions: () => ProjectSettingsBrowserActions;
}

export interface ProjectSettingsBrowserAdapter {
  buildProjectSettings(): void;
  updateProjectSettingsContent(): void;
}

export function createProjectSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  getReadModel,
  intents,
  getActions,
}: ProjectSettingsBrowserDependencies): ProjectSettingsBrowserAdapter {
  function buildProjectSettings(): void {
    const readModel = getReadModel();
    const actions = getActions();
    actions.buildSettingsSection(
      readModel.sectionId,
      readModel.sectionName,
      () => intents.handle({ type: "reset-project-settings" }),
      updateProjectSettingsContent,
    );
  }

  function updateProjectSettingsContent(): void {
    const readModel = getReadModel();
    const actions = getActions();
    const document = getDocument();
    const currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;
    const currentNode = getJQuery()(`#script_${readModel.sectionId}Content`);
    currentNode.empty().off("*");

    actions.addSettingsToggle(
      currentNode,
      "arpaScaleWeighting",
      "Scale weighting with progress",
      "Projects weighting scales  with current progress, making script more eager to spend resources on finishing nearly constructed projects.",
    );
    actions.addSettingsNumber(
      currentNode,
      "arpaStep",
      "Preferred progress step",
      "Projects will be weighted and build in this steps. Increasing number can speed up constructing. Step will be adjusted down when preferred step above remaining amount, or surpass storage caps. Weightings below will be multiplied by current step. Projects builded by triggers will always have maximum possible step.",
    );

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:25%">Project</th>
              <th class="has-text-warning" style="width:25%">Auto Build</th>
              <th class="has-text-warning" style="width:25%">Max Build</th>
              <th class="has-text-warning" style="width:25%">Weighting</th>
            </tr>
            <tbody id="script_projectTableBody"></tbody>
          </table>`);

    const tableBodyNode = getJQuery()("#script_projectTableBody");
    let newTableBodyText = "";
    for (const row of readModel.rows) {
      newTableBodyText += `<tr value="${row.id}" class="script-draggable"><td id="script_${row.id}" style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td><td style="width:25%"></td></tr>`;
    }
    tableBodyNode.append(getJQuery()(newTableBodyText));

    for (const row of readModel.rows) {
      let projectElement = getJQuery()(`#script_${row.id}`);
      projectElement.append(actions.buildTableLabel(row.label));

      projectElement = projectElement.next();
      actions.addTableToggle(projectElement, row.enabledSettingName);

      projectElement = projectElement.next();
      actions.addTableInput(projectElement, row.maximumSettingName);

      projectElement = projectElement.next();
      actions.addTableInput(projectElement, row.weightingSettingName);
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: actions.getSorterHelper(),
      update: () => {
        const projectIds = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        intents.handle({ type: "reorder-projects", projectIds });
      },
    });

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  return Object.freeze({
    buildProjectSettings,
    updateProjectSettingsContent,
  });
}
