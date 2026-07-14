import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface MagicSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createMagicSettings({
  getDependency,
  getOverride,
}: MagicSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const AlchemyManager = liveObject(() => getDependency("AlchemyManager"));
  const RitualManager = liveObject(() => getDependency("RitualManager"));
  const addSettingsNumber = liveFunction(() =>
    getDependency("addSettingsNumber"),
  );
  const addSettingsToggle = liveFunction(() =>
    getDependency("addSettingsToggle"),
  );
  const addStandardHeading = liveFunction(() =>
    getDependency("addStandardHeading"),
  );
  const addTableInput = liveFunction(() => getDependency("addTableInput"));
  const addTableToggle = liveFunction(() => getDependency("addTableToggle"));
  const buildSettingsSection = liveFunction(() =>
    getDependency("buildSettingsSection"),
  );
  const buildTableLabel = liveFunction(() => getDependency("buildTableLabel"));
  const document = liveObject(() => getDependency("document"));
  const game = liveObject(() => getDependency("game"));
  const resetCheckbox = liveFunction(() => getDependency("resetCheckbox"));
  const resetMagicSettings = liveFunction(() =>
    getDependency("resetMagicSettings"),
  );
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildMagicSettingsImpl() {
    let sectionId = "magic";
    let sectionName = "Magic";

    let resetFunction = function () {
      resetMagicSettings(true);
      updateSettingsFromState();
      updateMagicSettingsContent();

      resetCheckbox("autoAlchemy", "autoPylon", "magicFullmetalHelper");
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateMagicSettingsContent,
    );
  }

  function updateMagicSettingsContentImpl() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_magicContent");
    currentNode.empty().off("*");

    updateMagicAlchemy(currentNode);
    updateMagicPylon(currentNode);

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function updateMagicAlchemyImpl(currentNode) {
    addStandardHeading(currentNode, "Alchemy");
    addSettingsNumber(
      currentNode,
      "magicAlchemyManaUse",
      "Mana income used",
      "Income portion to use on alchemy. Setting to 1 is not recommended, leftover mana will be used for rituals.",
    );
    addSettingsToggle(
      currentNode,
      "magicFullmetalHelper",
      "Fullmetal helper",
      "In Magic universe with Alchemy II, keep one non-basic alchemy transmutation active long enough to claim Fullmetal if the achievement is still below the current star level. Requires autoAlchemy.",
    );

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:20%">Resource</th>
              <th class="has-text-warning" style="width:20%">Enabled</th>
              <th class="has-text-warning" style="width:20%">Weighting</th>
              <th class="has-text-warning" style="width:40%"></th>
            </tr>
            <tbody id="script_alchemyTableBody"></tbody>
          </table>`);

    let tableBodyNode = $("#script_alchemyTableBody");
    let newTableBodyText = "";

    for (let resource of AlchemyManager.priorityList) {
      newTableBodyText += `<tr><td id="script_alchemy_${resource.id}" style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:40%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    for (let resource of AlchemyManager.priorityList) {
      let node = $("#script_alchemy_" + resource.id);

      let color =
        AlchemyManager.transmuteTier(resource) > 1
          ? "has-text-advanced"
          : "has-text-info";
      node.append(buildTableLabel(resource.name, "", color));

      node = node.next();
      addTableToggle(node, "res_alchemy_" + resource.id);

      node = node.next();
      addTableInput(node, "res_alchemy_w_" + resource.id);
    }
  }

  function updateMagicPylonImpl(currentNode) {
    addStandardHeading(currentNode, "Pylon");
    addSettingsNumber(
      currentNode,
      "productionRitualManaUse",
      "Mana income used",
      "Income portion to use on rituals. Setting to 1 is not recommended, as it will halt mana regeneration. Applied only when mana not capped - with capped mana script will always use all income.",
    );
    addSettingsToggle(
      currentNode,
      "productionRitualSafe",
      "Safe rituals",
      "Limit max rituals to safe, unsuspicious amount. Have no effect out of Witch Hunter scenario.",
    );

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:55%">Ritual</th>
              <th class="has-text-warning" style="width:20%">Weighting</th>
              <th style="width:25%"></th>
            </tr>
            <tbody id="script_magicTableBodyPylon"></tbody>
          </table>`);

    let tableBodyNode = $("#script_magicTableBodyPylon");
    let newTableBodyText = "";

    let pylonProducts = Object.values(RitualManager.Productions) as Loose[];

    for (let i = 0; i < pylonProducts.length; i++) {
      let production = pylonProducts[i];
      newTableBodyText += `<tr><td id="script_pylon_${production.id}" style="width:55%"></td><td style="width:20%"></td><td style="width:25%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other productions settings rows
    for (let i = 0; i < pylonProducts.length; i++) {
      let production = pylonProducts[i];
      let productionElement = $("#script_pylon_" + production.id);

      productionElement.append(
        buildTableLabel(game.loc(`modal_pylon_spell_${production.id}`)),
      );

      productionElement = productionElement.next();
      addTableInput(productionElement, "spell_w_" + production.id);
    }
  }

  function buildMagicSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildMagicSettings") ?? buildMagicSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateMagicSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateMagicSettingsContent") ??
      updateMagicSettingsContentImpl;
    return implementation.apply(this, args);
  }

  function updateMagicAlchemy(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateMagicAlchemy") ?? updateMagicAlchemyImpl;
    return implementation.apply(this, args);
  }

  function updateMagicPylon(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateMagicPylon") ?? updateMagicPylonImpl;
    return implementation.apply(this, args);
  }

  return {
    buildMagicSettings,
    updateMagicSettingsContent,
    updateMagicAlchemy,
    updateMagicPylon,
  };
}
