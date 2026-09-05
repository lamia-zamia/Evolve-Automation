import type { TableSorter } from "./table-sorter.ts";
import type {
  MarketSettingsControl,
  MarketSettingsReadModel,
  MarketSettingsRow,
} from "../../domain/economy/market/market-settings.ts";
import type { MarketSettingsIntentHandler } from "../../ports/market-settings.ts";
import {
  renderSettingsSectionContent,
  type ScrollDocument,
  type SettingsContentNode,
} from "./settings-section.ts";

interface JQueryNode extends SettingsContentNode {
  /** The element itself, which the table sorter attaches to. */
  readonly 0: unknown;
  empty(): JQueryNode;
  off(events: string): JQueryNode;
  append(content: unknown): JQueryNode;
  next(): JQueryNode;
}

type JQuery = (selector: string) => JQueryNode;
type Action = () => void;

export interface MarketSettingsBrowserActions {
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
  readonly addStandardHeading: (node: JQueryNode, label: string) => unknown;
  readonly addTableInput: (node: JQueryNode, settingName: string) => void;
  readonly addTableToggle: (node: JQueryNode, settingName: string) => void;
  readonly buildTableLabel: (
    label: string,
    title?: string,
    className?: string,
  ) => unknown;
  readonly getTableSorter: () => TableSorter;
}

interface MarketSettingsBrowserDependencies {
  readonly getDocument: () => ScrollDocument;
  readonly getJQuery: () => JQuery;
  readonly reader: { read(): MarketSettingsReadModel };
  readonly intents: MarketSettingsIntentHandler;
  readonly getActions: () => MarketSettingsBrowserActions;
}

export interface MarketSettingsBrowserAdapter {
  buildMarketSettings(): void;
  updateMarketSettingsContent(): void;
}

export function createMarketSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  reader,
  intents,
  getActions,
}: MarketSettingsBrowserDependencies): MarketSettingsBrowserAdapter {
  function buildMarketSettings(): void {
    const readModel = reader.read();
    const actions = getActions();
    actions.buildSettingsSection(
      readModel.sectionId,
      readModel.sectionName,
      () => intents.handle({ type: "reset-market-settings" }),
      updateMarketSettingsContent,
    );
  }

  function updateMarketSettingsContent(): void {
    const readModel = reader.read();
    const actions = getActions();
    const jquery = getJQuery();
    renderSettingsSectionContent(
      {
        scrollDocument: getDocument(),
        jquery,
        sectionId: readModel.sectionId,
      },
      (currentNode) => {
        renderMarketContent(currentNode, readModel, actions, jquery);
      },
    );
  }

  function renderMarketContent(
    currentNode: JQueryNode,
    readModel: MarketSettingsReadModel,
    actions: MarketSettingsBrowserActions,
    jquery: JQuery,
  ): void {
    for (const control of readModel.controls) {
      if (control.kind === "heading") break;
      renderControl(currentNode, control, actions);
    }
    renderMarketTable(currentNode, readModel, actions, jquery, intents);
    const galaxyHeading = readModel.controls.find(
      (control) => control.kind === "heading",
    );
    if (galaxyHeading?.kind === "heading") {
      actions.addStandardHeading(currentNode, galaxyHeading.label);
    }
    const galaxyControl = readModel.controls[readModel.controls.length - 1];
    if (galaxyControl?.kind === "number") {
      renderControl(currentNode, galaxyControl, actions);
    }
    renderGalaxyTable(currentNode, readModel, actions, jquery);
  }

  function renderControl(
    node: JQueryNode,
    control: Exclude<MarketSettingsControl, { kind: "heading" }>,
    actions: MarketSettingsBrowserActions,
  ): void {
    if (control.kind === "number") {
      actions.addSettingsNumber(
        node,
        control.settingName,
        control.label,
        control.hint,
      );
    } else {
      actions.addSettingsToggle(
        node,
        control.settingName,
        control.label,
        control.hint,
      );
    }
  }

  function renderMarketTable(
    node: JQueryNode,
    readModel: MarketSettingsReadModel,
    actions: MarketSettingsBrowserActions,
    jquery: JQuery,
    intents: MarketSettingsIntentHandler,
  ): void {
    node.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" colspan="1"></th>
              <th class="has-text-warning" colspan="4">Manual Trades</th>
              <th class="has-text-warning" colspan="4">Trade Routes</th>
              <th class="has-text-warning" colspan="1"></th>
            </tr>
            <tr>
              <th class="has-text-warning" style="width:15%">Resource</th>
              <th class="has-text-warning" style="width:10%">Buy</th>
              <th class="has-text-warning" style="width:10%">Ratio</th>
              <th class="has-text-warning" style="width:10%">Sell</th>
              <th class="has-text-warning" style="width:10%">Ratio</th>
              <th class="has-text-warning" style="width:10%">In</th>
              <th class="has-text-warning" style="width:10%">Away</th>
              <th class="has-text-warning" style="width:10%">Weighting</th>
              <th class="has-text-warning" style="width:10%">Priority</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_marketTableBody"></tbody>
          </table>`);
    const tableBodyNode = jquery("#script_marketTableBody");
    let rows = "";
    for (const row of readModel.rows) {
      rows += `<tr value="${row.id}" class="script-draggable"><td id="script_market_${row.id}" style="width:15%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%;border-right-width:1px"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>`;
    }
    tableBodyNode.append(jquery(rows));
    for (const row of readModel.rows) renderMarketRow(row, actions, jquery);
    actions.getTableSorter().attach(tableBodyNode[0], {
      items: "tr:not(.unsortable)",
      attribute: "value",
      onOrderChanged: (resourceIds) => {
        intents.handle({ type: "reorder-market-resources", resourceIds });
      },
    });
  }

  function renderMarketRow(
    row: MarketSettingsRow,
    actions: MarketSettingsBrowserActions,
    jquery: JQuery,
  ): void {
    let cell = jquery(`#script_market_${row.id}`);
    cell.append(actions.buildTableLabel(row.label));
    cell = cell.next();
    actions.addTableToggle(cell, row.buySettingName);
    cell = cell.next();
    actions.addTableInput(cell, row.buyRatioSettingName);
    cell = cell.next();
    actions.addTableToggle(cell, row.sellSettingName);
    cell = cell.next();
    actions.addTableInput(cell, row.sellRatioSettingName);
    cell = cell.next();
    actions.addTableToggle(cell, row.tradeBuySettingName);
    cell = cell.next();
    actions.addTableToggle(cell, row.tradeSellSettingName);
    cell = cell.next();
    actions.addTableInput(cell, row.tradeWeightingSettingName);
    cell = cell.next();
    actions.addTableInput(cell, row.tradePrioritySettingName);
  }

  function renderGalaxyTable(
    node: JQueryNode,
    readModel: MarketSettingsReadModel,
    actions: MarketSettingsBrowserActions,
    jquery: JQuery,
  ): void {
    node.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:30%">Buy</th>
              <th class="has-text-warning" style="width:30%">Sell</th>
              <th class="has-text-warning" style="width:20%">Weighting</th>
              <th class="has-text-warning" style="width:20%">Priority</th>
            </tr>
            <tbody id="script_marketGalaxyTableBody"></tbody>
          </table>`);
    const tableBodyNode = jquery("#script_marketGalaxyTableBody");
    let rows = "";
    readModel.galaxyRows.forEach(
      (_row, index) =>
        (rows += `<tr><td id="script_market_galaxy_${index}" style="width:30%"><td style="width:30%"></td></td><td style="width:20%"></td><td style="width:20%"></td></tr>`),
    );
    tableBodyNode.append(jquery(rows));
    readModel.galaxyRows.forEach((row, index) => {
      let cell = jquery(`#script_market_galaxy_${index}`);
      cell.append(
        actions.buildTableLabel(row.buyLabel, "", "has-text-success"),
      );
      cell = cell.next();
      cell.append(
        actions.buildTableLabel(row.sellLabel, "", "has-text-danger"),
      );
      cell = cell.next();
      actions.addTableInput(cell, row.weightingSettingName);
      cell = cell.next();
      actions.addTableInput(cell, row.prioritySettingName);
    });
  }

  return Object.freeze({ buildMarketSettings, updateMarketSettingsContent });
}
