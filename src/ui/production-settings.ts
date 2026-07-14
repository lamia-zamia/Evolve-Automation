interface SettingsRecord extends Record<string, unknown> {
  overrides: Record<string, unknown>;
}

interface Resource {
  id: string;
  name: string;
}

interface Production {
  id?: string;
  resource: Resource;
}

interface SmelterManagerContract {
  managedFuelPriorityList(): Array<{ id: string }>;
}

interface ProductionManagerContract {
  Productions: Record<string, Production>;
}

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

interface SelectOption {
  val: string;
  label: string;
  hint: string;
}

interface ProductionSettingsDependencies {
  getSettingsRaw: () => SettingsRecord;
  getDocument: () => ScrollDocument;
  getJQuery: () => JQuery;
  getResources: () => Record<string, Resource>;
  getCraftablesList: () => Resource[];
  getSmelterManager: () => SmelterManagerContract;
  getFactoryManager: () => ProductionManagerContract;
  getDroidManager: () => ProductionManagerContract;
  getReplicatorManager: () => ProductionManagerContract;
  consumptionBalanceTarget: number;
  resetProductionSettings: (reset: boolean) => void;
  updateSettingsFromState: () => void;
  resetCheckbox: (...settingNames: string[]) => void;
  removeCraftToggles: () => void;
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
    options: SelectOption[],
  ) => unknown;
  addStandardHeading: (node: JQueryNode, heading: string) => void;
  addTableToggle: (node: JQueryNode, settingKey: string) => void;
  addTableInput: (node: JQueryNode, settingKey: string) => void;
  buildTableLabel: (note: string) => unknown;
  getSorterHelper: () => unknown;
}

export function createProductionSettings({
  getSettingsRaw,
  getDocument,
  getJQuery,
  getResources,
  getCraftablesList,
  getSmelterManager,
  getFactoryManager,
  getDroidManager,
  getReplicatorManager,
  consumptionBalanceTarget,
  resetProductionSettings,
  updateSettingsFromState,
  resetCheckbox,
  removeCraftToggles,
  buildSettingsSection,
  addSettingsNumber,
  addSettingsToggle,
  addSettingsSelect,
  addStandardHeading,
  addTableToggle,
  addTableInput,
  buildTableLabel,
  getSorterHelper,
}: ProductionSettingsDependencies) {
  function buildProductionSettings() {
    const sectionId = "production";
    const sectionName = "Production";

    const resetFunction = function () {
      resetProductionSettings(true);
      updateSettingsFromState();
      updateProductionSettingsContent();

      resetCheckbox(
        "autoQuarry",
        "autoMine",
        "autoExtractor",
        "autoGraphenePlant",
        "autoSmelter",
        "autoCraft",
        "autoFactory",
        "autoMiningDroid",
        "autoReplicator",
      );
      removeCraftToggles();
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateProductionSettingsContent,
    );
  }

  function updateProductionSettingsContent() {
    const document = getDocument();
    const currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    const currentNode = getJQuery()("#script_productionContent");
    currentNode.empty().off("*");

    addSettingsNumber(
      currentNode,
      "productionChrysotileWeight",
      "Chrysotile weighting (Quarry, Smoldering)",
      "Chrysotile weighting for autoQuarry, applies after adjusting to difference between current amounts of Stone and Chrysotile",
    );
    addSettingsNumber(
      currentNode,
      "productionAdamantiteWeight",
      "Adamantite weighting (Mine, The True Path)",
      "Adamantite weighting for autoMine, applies after adjusting to difference between current amounts of Aluminium and Adamantite",
    );
    addSettingsNumber(
      currentNode,
      "productionExtWeight_common",
      "Aluminium weighting (Extractor Ship, The True Path)",
      "Aluminium weighting for autoExtractor, applies after adjusting to difference between current amounts of Iron and Aluminium",
    );
    addSettingsNumber(
      currentNode,
      "productionExtWeight_uncommon",
      "Neutronium weighting (Extractor Ship, The True Path)",
      "Neutronium weighting for autoExtractor, applies after adjusting to difference between current amounts of Iridium and Neutronium",
    );
    addSettingsNumber(
      currentNode,
      "productionExtWeight_rare",
      "Elerium weighting (Extractor Ship, The True Path)",
      "Elerium weighting for autoExtractor, applies after adjusting to difference between current amounts of Orichalcum and Elerium",
    );
    // Named incorrectly now, affects both factory and craftsmen
    // TODO: Implement focus material mode for other production types
    addSettingsToggle(
      currentNode,
      "productionFactoryFocusMaterials",
      "Prioritize keeping materials stockpiled",
      `Aggressively request stockpiling ${consumptionBalanceTarget}s + min materials worth of materials to ensure factory and craftsmen can always produce`,
    );

    updateProductionTableSmelter(currentNode);
    updateProductionTableFoundry(currentNode);
    updateProductionTableFactory(currentNode);
    updateProductionTableMiningDrone(currentNode);
    updateProductionTableReplicator(currentNode);

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function updateProductionTableSmelter(currentNode: JQueryNode) {
    addStandardHeading(currentNode, "Smelter");

    const smelterOptions = [
      {
        val: "iron",
        label: "Prioritize Iron",
        hint: "Produce only Iron, untill storage capped, and switch to Steel after that",
      },
      {
        val: "steel",
        label: "Prioritize Steel",
        hint: "Produce as much Steel as possible, untill storage capped, and switch to Iron after that",
      },
      {
        val: "storage",
        label: "Up to full storages",
        hint: "Produce both Iron and Steel at ratio which will fill both storages at same time for both",
      },
      {
        val: "required",
        label: "Up to required amounts",
        hint: "Produce both Iron and Steel at ratio which will produce maximum amount of resources required for buildings at same time for both",
      },
    ];
    addSettingsSelect(
      currentNode,
      "productionSmelting",
      "Smelters production",
      "Distribution of smelters between iron and steel",
      smelterOptions,
    );
    addSettingsNumber(
      currentNode,
      "productionSmeltingIridium",
      "Iridium ratio",
      "Share of smelters dedicated to Iridium",
    );

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

    const smelterFuels = getSmelterManager().managedFuelPriorityList();

    for (let i = 0; i < smelterFuels.length; i++) {
      const fuel = smelterFuels[i];
      newTableBodyText += `<tr value="${fuel.id}" class="script-draggable"><td id="script_smelter_${fuel.id}" style="width:95%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other productions settings rows
    for (let i = 0; i < smelterFuels.length; i++) {
      const fuel = smelterFuels[i];
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
        const settingsRaw = getSettingsRaw();
        for (let i = 0; i < fuelIds.length; i++) {
          settingsRaw["smelter_fuel_p_" + fuelIds[i]] = i;
        }

        updateSettingsFromState();
      },
    });
  }

  function updateProductionTableFactory(currentNode: JQueryNode) {
    addStandardHeading(currentNode, "Factory");
    const weightingOptions = [
      {
        val: "none",
        label: "None",
        hint: "Use configured weightings with no additional adjustments, resources with x2 weighting will be produced two times more intense than with x1, etc.",
      },
      {
        val: "demanded",
        label: "Prioritize demanded",
        hint: "Ignore resources once stored amount surpass cost of most expensive building, until all missing resources will be crafted. After that works as with 'none' adjustments.",
      },
      {
        val: "buildings",
        label: "Buildings weightings",
        hint: "Uses weightings of buildings which are waiting for resources, as multipliers to production weighting. This option requires autoBuild.",
      },
    ];
    addSettingsSelect(
      currentNode,
      "productionFactoryWeighting",
      "Weightings adjustments",
      "Configures how exactly the resources will be weighted against each other",
      weightingOptions,
    );
    addSettingsNumber(
      currentNode,
      "productionFactoryMinIngredients",
      "Minimum materials to preserve",
      "Factory will craft resources only when all required materials above given ratio",
    );

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

    const productionSettings = Object.values(getFactoryManager().Productions);

    for (let i = 0; i < productionSettings.length; i++) {
      const production = productionSettings[i];
      newTableBodyText += `<tr><td id="script_factory_${production.resource.id}" style="width:35%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:5%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other productions settings rows
    for (let i = 0; i < productionSettings.length; i++) {
      const production = productionSettings[i];
      let productionElement = $("#script_factory_" + production.resource.id);

      productionElement.append(buildTableLabel(production.resource.name));

      productionElement = productionElement.next();
      addTableToggle(productionElement, "production_" + production.resource.id);

      productionElement = productionElement.next();
      addTableInput(
        productionElement,
        "production_w_" + production.resource.id,
      );

      productionElement = productionElement.next();
      addTableInput(
        productionElement,
        "production_p_" + production.resource.id,
      );
    }
  }

  function updateProductionTableFoundry(currentNode: JQueryNode) {
    addStandardHeading(currentNode, "Foundry");
    const weightingOptions = [
      {
        val: "none",
        label: "None",
        hint: "Use configured weightings with no additional adjustments, craftables with x2 weighting will be crafted two times more intense than with x1, etc.",
      },
      {
        val: "demanded",
        label: "Prioritize demanded",
        hint: "Ignore craftables once stored amount surpass cost of most expensive building, until all missing resources will be crafted. After that works as with 'none' adjustments.",
      },
      {
        val: "buildings",
        label: "Buildings weightings",
        hint: "Uses weightings of buildings which are waiting for craftables, as multipliers to craftables weighting. This option requires autoBuild.",
      },
    ];
    addSettingsSelect(
      currentNode,
      "productionFoundryWeighting",
      "Weightings adjustments",
      "Configures how exactly craftables will be weighted against each other",
      weightingOptions,
    );

    const assignOptions = [
      { val: "always", label: "Always", hint: "Always assign all craftsmens" },
      {
        val: "nocraft",
        label: "No Manual Crafting",
        hint: "Assign workers only manual crafting is not possible, servants still always will be assigned",
      },
      {
        val: "advanced",
        label: "Advanced",
        hint: "Assign workers only to advanced craftables(Scarletite, Quantium), basic craftables will be crafted by servants",
      },
      { val: "servants", label: "Servants", hint: "Assign only servants" },
    ];
    addSettingsSelect(
      currentNode,
      "productionCraftsmen",
      "Assign craftsmen",
      "Configures when workers should be assigned to crafting jobs",
      assignOptions,
    );

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
    const craftablesList = getCraftablesList();
    const resources = getResources();

    for (let i = 0; i < craftablesList.length; i++) {
      const resource = craftablesList[i];
      newTableBodyText += `<tr><td id="script_foundry_${resource.id}" style="width:21%"></td><td style="width:17%"></td><td style="width:17%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:5%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other productions settings rows
    for (let i = 0; i < craftablesList.length; i++) {
      const resource = craftablesList[i];
      let productionElement = $("#script_foundry_" + resource.id);

      productionElement.append(buildTableLabel(resource.name));

      // TODO: Make two toggles, for manual craft and foundry
      productionElement = productionElement.next();
      addTableToggle(productionElement, "craft" + resource.id);

      productionElement = productionElement.next();
      addTableToggle(productionElement, "job_" + resource.id);

      productionElement = productionElement.next();
      if (
        resource === resources.Scarletite ||
        resource === resources.Quantium
      ) {
        productionElement.append("<span>Managed</span>");
      } else {
        addTableInput(productionElement, "foundry_w_" + resource.id);
      }

      productionElement = productionElement.next();
      addTableInput(productionElement, "foundry_p_" + resource.id);
    }
  }

  function updateProductionTableMiningDrone(currentNode: JQueryNode) {
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

    const droidProducts = Object.values(getDroidManager().Productions);

    for (let i = 0; i < droidProducts.length; i++) {
      const production = droidProducts[i];
      newTableBodyText += `<tr><td id="script_droid_${production.resource.id}" style="width:35%"><td style="width:20%"></td><td style="width:20%"></td></td><td style="width:20%"></td><td style="width:5%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other productions settings rows
    for (let i = 0; i < droidProducts.length; i++) {
      const production = droidProducts[i];
      let productionElement = $("#script_droid_" + production.resource.id);

      productionElement.append(buildTableLabel(production.resource.name));

      productionElement = productionElement.next().next();
      addTableInput(productionElement, "droid_w_" + production.resource.id);

      productionElement = productionElement.next();
      addTableInput(productionElement, "droid_pr_" + production.resource.id);
    }
  }

  function updateProductionTableReplicator(currentNode: JQueryNode) {
    addStandardHeading(currentNode, "Replicator");

    addSettingsToggle(
      currentNode,
      "replicatorAssignGovernorTask",
      "Assign governor task",
      "If active, the replicator scheduler governor task will be set, the power adjustment will be enabled.",
    );
    addSettingsSelect(
      currentNode,
      "replicatorWeightingMode",
      "Weighting mode",
      "Replicator only picks from enabled resources with the current highest valid priority (or -1 priority). After that, replicator use is split between resources of identical weighting. Setting configures how that split happens.",
      [
        {
          val: "mass",
          hint: "Spends more time on resources that are easy to replicate. A resource with 2x the weighting will have roughly 2x the time spent. Based on differences in atomic mass, resources at similar weightings may have very different quantities.",
          label: "By atomic mass",
        },
        {
          val: "quantity",
          hint: "Spends more time on resources that are hard to replicate. A resource with 2x the weighting will be focused until you have roughly 2x the amount. Resources at similar weightings will have similar quantities.",
          label: "By resource quantity",
        },
        {
          val: "legacy",
          hint: "Legacy mode, similar to previous script behavior. Only the resource with the highest weighting is picked. If multiple resources have the same weighting then it will focus exclusively on one of those resources. This mode exists only to give you time to migrate your config to using the priority field.",
          label: "Legacy (deprecated)",
        },
      ],
    );

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

    const replicatorProducts = Object.values(
      getReplicatorManager().Productions,
    );

    for (let i = 0; i < replicatorProducts.length; i++) {
      const production = replicatorProducts[i];
      newTableBodyText += `<tr><td id="script_replicator_${production.resource.id}" style="width:35%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:5%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other productions settings rows
    for (let i = 0; i < replicatorProducts.length; i++) {
      const production = replicatorProducts[i];
      let productionElement = $("#script_replicator_" + production.resource.id);

      productionElement.append(buildTableLabel(production.resource.name));

      productionElement = productionElement.next();
      addTableToggle(productionElement, "replicator_" + production.resource.id);

      productionElement = productionElement.next();
      addTableInput(
        productionElement,
        "replicator_w_" + production.resource.id,
      );

      productionElement = productionElement.next();
      addTableInput(
        productionElement,
        "replicator_p_" + production.resource.id,
      );
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
