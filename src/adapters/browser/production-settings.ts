import {
  type ProductionSettingsControl,
  type ProductionSettingsReadModel,
} from "../../domain/production-settings.ts";
import type { ProductionSettingsIntentHandler } from "../../ports/production-settings.ts";

interface ScrollDocument {
  documentElement: { scrollTop: number };
  body: { scrollTop: number };
}

interface JQueryNode {
  empty(): JQueryNode;
  off(events: string): JQueryNode;
  append(value: unknown): JQueryNode;
  next(): JQueryNode;
  sortable(options: Record<string, unknown>): JQueryNode;
  sortable(command: string, options: Record<string, unknown>): string[];
}

type JQuery = (value: unknown) => JQueryNode;

interface ProductionSettingsDependencies {
  getDocument: () => ScrollDocument;
  getJQuery: () => JQuery;
  getReadModel: () => ProductionSettingsReadModel;
  intents: ProductionSettingsIntentHandler;
  buildSettingsSection: (
    sectionId: string,
    sectionName: string,
    resetFunction: () => void,
    updateSettingsContentFunction: () => void,
  ) => void;
  addSettingsNumber: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ) => unknown;
  addSettingsToggle: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
  ) => unknown;
  addSettingsSelect: (
    node: JQueryNode,
    settingName: string,
    labelText: string,
    hintText: string,
    options: readonly { val: string; label: string; hint: string }[],
  ) => unknown;
  addStandardHeading: (node: JQueryNode, heading: string) => void;
  addTableToggle: (node: JQueryNode, settingKey: string) => void;
  addTableInput: (node: JQueryNode, settingKey: string) => void;
  buildTableLabel: (note: string) => unknown;
  getSorterHelper: () => unknown;
}

export interface ProductionSettingsBrowserAdapter {
  buildProductionSettings(): void;
  updateProductionSettingsContent(): void;
  updateProductionTableSmelter(node: JQueryNode): void;
  updateProductionTableFoundry(node: JQueryNode): void;
  updateProductionTableFactory(node: JQueryNode): void;
  updateProductionTableMiningDrone(node: JQueryNode): void;
  updateProductionTableReplicator(node: JQueryNode): void;
}

export function createProductionSettingsBrowserAdapter({
  getDocument,
  getJQuery,
  getReadModel,
  intents,
  buildSettingsSection,
  addSettingsNumber,
  addSettingsToggle,
  addSettingsSelect,
  addStandardHeading,
  addTableToggle,
  addTableInput,
  buildTableLabel,
  getSorterHelper,
}: ProductionSettingsDependencies): ProductionSettingsBrowserAdapter {
  function buildProductionSettings(): void {
    const readModel = getReadModel();
    buildSettingsSection(
      readModel.sectionId,
      readModel.sectionName,
      () => intents.handle({ type: "reset-production-settings" }),
      updateProductionSettingsContent,
    );
  }

  function updateProductionSettingsContent(): void {
    const readModel = getReadModel();
    const document = getDocument();
    const currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    const currentNode = getJQuery()("#script_productionContent");
    currentNode.empty().off("*");

    const tableControlNames = new Set([
      "productionSmelting",
      "productionSmeltingIridium",
      "productionFoundryWeighting",
      "productionCraftsmen",
      "productionFactoryWeighting",
      "productionFactoryMinIngredients",
      "replicatorAssignGovernorTask",
      "replicatorWeightingMode",
    ]);
    for (const control of readModel.controls) {
      if (!tableControlNames.has(control.settingName)) {
        renderControl(currentNode, control);
      }
    }

    updateProductionTableSmelter(currentNode);
    updateProductionTableFoundry(currentNode);
    updateProductionTableFactory(currentNode);
    updateProductionTableMiningDrone(currentNode);
    updateProductionTableReplicator(currentNode);

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function renderControl(
    node: JQueryNode,
    control: ProductionSettingsControl,
  ): void {
    if (control.kind === "number") {
      addSettingsNumber(node, control.settingName, control.label, control.hint);
    } else if (control.kind === "toggle") {
      addSettingsToggle(node, control.settingName, control.label, control.hint);
    } else {
      addSettingsSelect(
        node,
        control.settingName,
        control.label,
        control.hint,
        control.options,
      );
    }
  }

  function renderControlBySetting(node: JQueryNode, settingName: string): void {
    const control = getReadModel().controls.find(
      (candidate) => candidate.settingName === settingName,
    );
    if (!control) throw new Error(`Missing Production control: ${settingName}`);
    renderControl(node, control);
  }

  function updateProductionTableSmelter(currentNode: JQueryNode): void {
    const readModel = getReadModel();
    addStandardHeading(currentNode, "Smelter");

    renderControlBySetting(currentNode, "productionSmelting");
    renderControlBySetting(currentNode, "productionSmeltingIridium");

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:95%">Fuel</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_productionTableBodySmelter"></tbody>
          </table>`);

    const $ = getJQuery();
    const tableBodyNode = $("#script_productionTableBodySmelter");
    let newTableBodyText = "";

    const smelterFuels = readModel.smelterFuels;

    for (let i = 0; i < smelterFuels.length; i++) {
      const fuel = smelterFuels[i]!;
      newTableBodyText += `<tr value="${fuel.id}" class="script-draggable"><td id="script_smelter_${fuel.id}" style="width:95%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other productions settings rows
    for (let i = 0; i < smelterFuels.length; i++) {
      const fuel = smelterFuels[i]!;
      const productionElement = $("#script_smelter_" + fuel.id);

      productionElement.append(buildTableLabel(fuel.id));
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: getSorterHelper(),
      update: function () {
        const fuelIds = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        intents.handle({ type: "reorder-smelter-fuels", fuelIds });
      },
    });
  }

  function updateProductionTableFactory(currentNode: JQueryNode) {
    addStandardHeading(currentNode, "Factory");
    renderControlBySetting(currentNode, "productionFactoryWeighting");
    renderControlBySetting(currentNode, "productionFactoryMinIngredients");

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:35%">Resource</th>
              <th class="has-text-warning" style="width:20%">Enabled</th>
              <th class="has-text-warning" style="width:20%">Weighting</th>
              <th class="has-text-warning" style="width:20%">Priority</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_productionTableBodyFactory"></tbody>
          </table>`);

    const $ = getJQuery();
    const tableBodyNode = $("#script_productionTableBodyFactory");
    let newTableBodyText = "";

    const productionSettings = getReadModel().factoryRows;

    for (let i = 0; i < productionSettings.length; i++) {
      const production = productionSettings[i]!;
      newTableBodyText += `<tr><td id="script_factory_${production.id}" style="width:35%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:5%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other productions settings rows
    for (let i = 0; i < productionSettings.length; i++) {
      const production = productionSettings[i]!;
      let productionElement = $("#script_factory_" + production.id);

      productionElement.append(buildTableLabel(production.label));

      productionElement = productionElement.next();
      addTableToggle(productionElement, "production_" + production.id);

      productionElement = productionElement.next();
      addTableInput(productionElement, "production_w_" + production.id);

      productionElement = productionElement.next();
      addTableInput(productionElement, "production_p_" + production.id);
    }
  }

  function updateProductionTableFoundry(currentNode: JQueryNode) {
    addStandardHeading(currentNode, "Foundry");
    renderControlBySetting(currentNode, "productionFoundryWeighting");
    renderControlBySetting(currentNode, "productionCraftsmen");

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:21%" title="Resource name">Resource</th>
              <th class="has-text-warning" style="width:17%" title="Resource won't ever be crafted with this option disabled">Enabled</th>
              <th class="has-text-warning" style="width:17%" title="Resource won't use foundry workers for craft with this option disabled">Craftsmen</th>
              <th class="has-text-warning" style="width:20%" title="Ratio between resources. Script assign craftsmans to resource with lowest 'amount / weighting'. Ignored by manual crafting.">Weighting</th>
              <th class="has-text-warning" style="width:20%" title="Only craft resource when storage ratio of all required materials above given number. E.g. bricks with 0.1 min materials will be crafted only when cement storage at least 10% filled.">Min Materials</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_productionTableBodyFoundry"></tbody>
          </table>`);

    const $ = getJQuery();
    const tableBodyNode = $("#script_productionTableBodyFoundry");
    let newTableBodyText = "";
    const craftablesList = getReadModel().foundryRows;

    for (let i = 0; i < craftablesList.length; i++) {
      const resource = craftablesList[i]!;
      newTableBodyText += `<tr><td id="script_foundry_${resource.id}" style="width:21%"></td><td style="width:17%"></td><td style="width:17%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:5%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other productions settings rows
    for (let i = 0; i < craftablesList.length; i++) {
      const resource = craftablesList[i]!;
      let productionElement = $("#script_foundry_" + resource.id);

      productionElement.append(buildTableLabel(resource.label));

      // TODO: Make two toggles, for manual craft and foundry
      productionElement = productionElement.next();
      addTableToggle(productionElement, "craft" + resource.id);

      productionElement = productionElement.next();
      addTableToggle(productionElement, "job_" + resource.id);

      productionElement = productionElement.next();
      if (resource.managed) {
        productionElement.append("<span>Managed</span>");
      } else {
        addTableInput(productionElement, "foundry_w_" + resource.id);
      }

      productionElement = productionElement.next();
      addTableInput(productionElement, "foundry_p_" + resource.id);
    }
  }

  function updateProductionTableMiningDrone(currentNode: JQueryNode) {
    const readModel = getReadModel();
    addStandardHeading(currentNode, "Mining Droid");

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:35%">Resource</th>
              <th class="has-text-warning" style="width:20%"></th>
              <th class="has-text-warning" style="width:20%">Weighting</th>
              <th class="has-text-warning" style="width:20%">Priority</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_productionTableBodyMiningDrone"></tbody>
          </table>`);

    const $ = getJQuery();
    const tableBodyNode = $("#script_productionTableBodyMiningDrone");
    let newTableBodyText = "";

    const droidProducts = readModel.miningDroidRows;

    for (let i = 0; i < droidProducts.length; i++) {
      const production = droidProducts[i]!;
      newTableBodyText += `<tr><td id="script_droid_${production.id}" style="width:35%"><td style="width:20%"></td><td style="width:20%"></td></td><td style="width:20%"></td><td style="width:5%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other productions settings rows
    for (let i = 0; i < droidProducts.length; i++) {
      const production = droidProducts[i]!;
      let productionElement = $("#script_droid_" + production.id);

      productionElement.append(buildTableLabel(production.label));

      productionElement = productionElement.next().next();
      addTableInput(productionElement, "droid_w_" + production.id);

      productionElement = productionElement.next();
      addTableInput(productionElement, "droid_pr_" + production.id);
    }
  }

  function updateProductionTableReplicator(currentNode: JQueryNode) {
    addStandardHeading(currentNode, "Replicator");

    renderControlBySetting(currentNode, "replicatorAssignGovernorTask");
    renderControlBySetting(currentNode, "replicatorWeightingMode");

    currentNode.append(`
        <table style="width:100%">
          <tr>
            <th class="has-text-warning" style="width:35%">Resource</th>
            <th class="has-text-warning" style="width:20%">Enabled</th>
            <th class="has-text-warning" style="width:20%">Weighting</th>
            <th class="has-text-warning" style="width:20%">Priority</th>
            <th style="width:5%"></th>
          </tr>
          <tbody id="script_productionTableBodyReplicator"></tbody>
        </table>`);

    const $ = getJQuery();
    const tableBodyNode = $("#script_productionTableBodyReplicator");
    let newTableBodyText = "";

    const replicatorProducts = getReadModel().replicatorRows;

    for (let i = 0; i < replicatorProducts.length; i++) {
      const production = replicatorProducts[i]!;
      newTableBodyText += `<tr><td id="script_replicator_${production.id}" style="width:35%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:5%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other productions settings rows
    for (let i = 0; i < replicatorProducts.length; i++) {
      const production = replicatorProducts[i]!;
      let productionElement = $("#script_replicator_" + production.id);

      productionElement.append(buildTableLabel(production.label));

      productionElement = productionElement.next();
      addTableToggle(productionElement, "replicator_" + production.id);

      productionElement = productionElement.next();
      addTableInput(productionElement, "replicator_w_" + production.id);

      productionElement = productionElement.next();
      addTableInput(productionElement, "replicator_p_" + production.id);
    }
  }

  return {
    buildProductionSettings,
    updateProductionSettingsContent,
    updateProductionTableSmelter,
    updateProductionTableFoundry,
    updateProductionTableFactory,
    updateProductionTableMiningDrone,
    updateProductionTableReplicator,
  };
}
