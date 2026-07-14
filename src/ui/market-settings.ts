import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface MarketSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createMarketSettings({
  getDependency,
  getOverride,
}: MarketSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const MarketManager = liveObject(() => getDependency("MarketManager"));
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
  const poly = liveObject(() => getDependency("poly"));
  const removeMarketToggles = liveFunction(() =>
    getDependency("removeMarketToggles"),
  );
  const resetCheckbox = liveFunction(() => getDependency("resetCheckbox"));
  const resetMarketSettings = liveFunction(() =>
    getDependency("resetMarketSettings"),
  );
  const resources = liveObject(() => getDependency("resources"));
  const settingsRaw = liveObject(() => getDependency("settingsRaw"));
  const sorterHelper = liveFunction(() => getDependency("sorterHelper"));
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildMarketSettingsImpl() {
    let sectionId = "market";
    let sectionName = "Market";

    let resetFunction = function () {
      resetMarketSettings(true);
      updateSettingsFromState();
      updateMarketSettingsContent();

      resetCheckbox("autoMarket", "autoGalaxyMarket");
      removeMarketToggles();
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateMarketSettingsContent,
    );
  }

  function updateMarketSettingsContentImpl() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_marketContent");
    currentNode.empty().off("*");

    addSettingsNumber(
      currentNode,
      "minimumMoney",
      "Manual trade minimum money",
      "Minimum money to keep after bulk buying",
    );
    addSettingsNumber(
      currentNode,
      "minimumMoneyPercentage",
      "Manual trade minimum money percentage",
      "Minimum percentage of money to keep after bulk buying",
    );
    addSettingsNumber(
      currentNode,
      "tradeRouteMinimumMoneyPerSecond",
      "Trade minimum money /s",
      "Uses the highest per second amount of these two values. Will trade for resources until this minimum money per second amount is hit",
    );
    addSettingsNumber(
      currentNode,
      "tradeRouteMinimumMoneyPercentage",
      "Trade minimum money percentage /s",
      "Uses the highest per second amount of these two values. Will trade for resources until this percentage of your money per second amount is hit",
    );
    addSettingsToggle(
      currentNode,
      "tradeRouteSellExcess",
      "Sell excess resources",
      "With this option enabled script will be allowed to sell resources above amounts needed for constructions or researches, without it script sell only capped resources. As side effect boughts will also be limited to that amounts, to avoid 'buy up to cap -> sell excess' loops.",
    );

    currentNode.append(`
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

    let tableBodyNode = $("#script_marketTableBody");
    let newTableBodyText = "";

    for (let i = 0; i < MarketManager.priorityList.length; i++) {
      const resource = MarketManager.priorityList[i];
      newTableBodyText += `<tr value="${resource.id}" class="script-draggable"><td id="script_market_${resource.id}" style="width:15%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%;border-right-width:1px"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other markets settings rows
    for (let i = 0; i < MarketManager.priorityList.length; i++) {
      const resource = MarketManager.priorityList[i];
      let marketElement = $("#script_market_" + resource.id);

      marketElement.append(buildTableLabel(resource.name));

      marketElement = marketElement.next();
      addTableToggle(marketElement, "buy" + resource.id);

      marketElement = marketElement.next();
      addTableInput(marketElement, "res_buy_r_" + resource.id);

      marketElement = marketElement.next();
      addTableToggle(marketElement, "sell" + resource.id);

      marketElement = marketElement.next();
      addTableInput(marketElement, "res_sell_r_" + resource.id);

      marketElement = marketElement.next();
      addTableToggle(marketElement, "res_trade_buy_" + resource.id);

      marketElement = marketElement.next();
      addTableToggle(marketElement, "res_trade_sell_" + resource.id);

      marketElement = marketElement.next();
      addTableInput(marketElement, "res_trade_w_" + resource.id);

      marketElement = marketElement.next();
      addTableInput(marketElement, "res_trade_p_" + resource.id);
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: sorterHelper,
      update: function () {
        let marketIds = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        for (let i = 0; i < marketIds.length; i++) {
          settingsRaw["res_buy_p_" + marketIds[i]] = i;
        }

        MarketManager.sortByPriority();
        updateSettingsFromState();
      },
    });

    addStandardHeading(currentNode, "Galaxy Trades");
    addSettingsNumber(
      currentNode,
      "marketMinIngredients",
      "Minimum materials to preserve",
      "Galaxy Market will buy resources only when all selling materials above given ratio",
    );

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:30%">Buy</th>
              <th class="has-text-warning" style="width:30%">Sell</th>
              <th class="has-text-warning" style="width:20%">Weighting</th>
              <th class="has-text-warning" style="width:20%">Priority</th>
            </tr>
            <tbody id="script_marketGalaxyTableBody"></tbody>
          </table>`);

    tableBodyNode = $("#script_marketGalaxyTableBody");
    newTableBodyText = "";

    for (let i = 0; i < poly.galaxyOffers.length; i++) {
      newTableBodyText += `<tr><td id="script_market_galaxy_${i}" style="width:30%"><td style="width:30%"></td></td><td style="width:20%"></td><td style="width:20%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other productions settings rows
    for (let i = 0; i < poly.galaxyOffers.length; i++) {
      let trade = poly.galaxyOffers[i];
      let buyResource = resources[trade.buy.res];
      let sellResource = resources[trade.sell.res];
      let marketElement = $("#script_market_galaxy_" + i);

      marketElement.append(
        buildTableLabel(buyResource.name, "has-text-success"),
      );

      marketElement = marketElement.next();
      marketElement.append(
        buildTableLabel(sellResource.name, "has-text-danger"),
      );

      marketElement = marketElement.next();
      addTableInput(marketElement, "res_galaxy_w_" + buyResource.id);

      marketElement = marketElement.next();
      addTableInput(marketElement, "res_galaxy_p_" + buyResource.id);
    }

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildMarketSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildMarketSettings") ?? buildMarketSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateMarketSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateMarketSettingsContent") ??
      updateMarketSettingsContentImpl;
    return implementation.apply(this, args);
  }

  return { buildMarketSettings, updateMarketSettingsContent };
}
