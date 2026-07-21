import {
  type PlanetSettingsCell,
  type PlanetSettingsReadModel,
  type PlanetSettingsRow,
} from "../../domain/planet-settings.ts";
import type { PlanetSettingsIntentHandler } from "../../ports/planet-settings.ts";

interface ScrollDocument {
  documentElement: { scrollTop: number };
  body: { scrollTop: number };
}

interface JQueryNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
  append(content: unknown): JQueryNode;
  next(): JQueryNode;
}

type JQuery = (selector: string) => JQueryNode;
type Action = () => void;

export interface PlanetSettingsBrowserActions {
  readonly buildSettingsSection: (
    sectionId: string,
    sectionName: string,
    resetFunction: Action,
    updateSettingsContentFunction: Action,
  ) => void;
  readonly addTableInput: (node: JQueryNode, settingName: string) => void;
  readonly buildTableLabel: (label: string) => unknown;
}

interface PlanetSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly getReadModel: () => PlanetSettingsReadModel;
  readonly intents: PlanetSettingsIntentHandler;
  readonly getActions: () => PlanetSettingsBrowserActions;
}

export interface PlanetSettingsBrowserAdapter {
  buildPlanetSettings(): void;
  updatePlanetSettingsContent(): void;
}

export function createPlanetSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  getReadModel,
  intents,
  getActions,
}: PlanetSettingsBrowserDependencies): PlanetSettingsBrowserAdapter {
  function renderCell(
    tableElement: JQueryNode,
    cell: PlanetSettingsCell | undefined,
    actions: PlanetSettingsBrowserActions,
    hasFollowingCell: boolean,
  ): JQueryNode {
    const inputElement = tableElement.next();
    if (cell === undefined) {
      return hasFollowingCell ? inputElement.next() : inputElement;
    }
    tableElement.append(actions.buildTableLabel(cell.label));
    actions.addTableInput(inputElement, cell.settingName);
    return hasFollowingCell ? inputElement.next() : inputElement;
  }

  function buildPlanetSettings(): void {
    const readModel = getReadModel();
    const actions = getActions();
    actions.buildSettingsSection(
      readModel.sectionId,
      readModel.sectionName,
      () => {
        intents.handle({ type: "reset-planet-settings" });
      },
      updatePlanetSettingsContent,
    );
  }

  function updatePlanetSettingsContent(): void {
    const readModel = getReadModel();
    const actions = getActions();
    const document = getDocument();
    const currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;
    const currentNode = getJQuery()(`#script_${readModel.sectionId}Content`);
    currentNode.empty().off("*");

    currentNode.append(`
          <span>Planet Weighting = Biome Weighting + Trait Weighting + (Extras Intensity * Extras Weightings)</span>
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:20%">Biome</th>
              <th class="has-text-warning" style="width:calc(40% / 3)">Weighting</th>
              <th class="has-text-warning" style="width:20%">Trait</th>
              <th class="has-text-warning" style="width:calc(40% / 3)">Weighting</th>
              <th class="has-text-warning" style="width:20%">Extra</th>
              <th class="has-text-warning" style="width:calc(40% / 3)">Weighting</th>
            </tr>
            <tbody id="script_planetTableBody"></tbody>
          </table>`);

    const tableBodyNode = getJQuery()("#script_planetTableBody");
    let newTableBodyText = "";
    for (let index = 0; index < readModel.rows.length; index += 1) {
      newTableBodyText += `<tr><td id="script_planet_${index}" style="width:20%"></td><td style="width:calc(40% / 3);border-right-width:1px"></td><td style="width:20%"></td><td style="width:calc(40% / 3);border-right-width:1px"></td><td style="width:20%"></td><td style="width:calc(40% / 3)"></td>/tr>`;
    }
    tableBodyNode.append(getJQuery()(newTableBodyText));

    readModel.rows.forEach((row, index) => {
      renderRow(getJQuery()(`#script_planet_${index}`), row, actions);
    });

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function renderRow(
    tableElement: JQueryNode,
    row: PlanetSettingsRow,
    actions: PlanetSettingsBrowserActions,
  ): void {
    tableElement = renderCell(tableElement, row.biome, actions, true);
    tableElement = renderCell(tableElement, row.trait, actions, true);
    renderCell(tableElement, row.extra, actions, false);
  }

  return Object.freeze({
    buildPlanetSettings,
    updatePlanetSettingsContent,
  });
}
