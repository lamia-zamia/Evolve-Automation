import assert from "node:assert/strict";

import { readTradeRoutesInput } from "../src/adapters/evolve/economy/market/trade-routes.ts";
import { planTradeRoutes } from "../src/domain/economy/market/trade-routes.ts";

// Exact copy of the deleted legacy `adjustTradeRoutes` algorithm, run against
// identical live fixtures to prove the reader + planner + apply path produces a
// byte-identical MarketManager call trace and Money rate-of-change.
function legacyAdjust({
  getSettings,
  getGame,
  getResources,
  getMarketManager,
  getGovernor,
  inflationChallengeShouldSaveMoney,
}) {
  const settings = getSettings();
  const game = getGame();
  const resources = getResources();
  const MarketManager = getMarketManager();

  let sellWeight = settings.tradeRouteSellExcess
    ? (resource) =>
        resource.usefulRatio >= 1
          ? resource.tradeSellPrice * 1000
          : resource.usefulRatio
    : (resource) =>
        resource.storageRatio >= 0.99
          ? resource.tradeSellPrice * 1000
          : resource.usefulRatio;

  let tradableResources = MarketManager.priorityList
    .filter(
      (r) =>
        r.isRoutesUnlocked() &&
        (r.autoTradeBuyEnabled || r.autoTradeSellEnabled),
    )
    .sort((a, b) => sellWeight(b) - sellWeight(a));
  let requiredTradeRoutes = {};
  let currentMoneyPerSecond = resources.Money.rateOfChange;
  let tradeRoutesUsed = 0;
  let importRouteCap = MarketManager.getImportRouteCap();
  let exportRouteCap = MarketManager.getExportRouteCap();
  let [maxTradeRoutes, unmanagedTradeRoutes] =
    MarketManager.getMaxTradeRoutes();
  let saveInflationMoney = inflationChallengeShouldSaveMoney();

  for (let i = 0; i < tradableResources.length; i++) {
    let resource = tradableResources[i];
    if (!resource.autoTradeSellEnabled) continue;
    requiredTradeRoutes[resource.id] = 0;
    if (
      tradeRoutesUsed >= maxTradeRoutes ||
      (game.global.race["banana"] && tradeRoutesUsed > 0) ||
      (settings.tradeRouteSellExcess
        ? resource.usefulRatio < 1
        : resource.storageRatio < 0.99)
    ) {
      continue;
    }
    let routesToAssign = Math.min(
      exportRouteCap,
      maxTradeRoutes - tradeRoutesUsed,
      Math.floor(resource.rateOfChange / resource.tradeRouteQuantity),
    );
    if (routesToAssign > 0) {
      tradeRoutesUsed += routesToAssign;
      requiredTradeRoutes[resource.id] -= routesToAssign;
      currentMoneyPerSecond += resource.tradeSellPrice * routesToAssign;
    }
  }

  if (saveInflationMoney) {
    for (let i = 0; i < tradableResources.length; i++) {
      let resource = tradableResources[i];
      if (resource.autoTradeBuyEnabled) {
        requiredTradeRoutes[resource.id] =
          requiredTradeRoutes[resource.id] ?? 0;
      }
    }
  }
  let minimumAllowedMoneyPerSecond = Math.min(
    resources.Money.maxQuantity - resources.Money.currentQuantity,
    Math.max(
      settings.tradeRouteMinimumMoneyPerSecond,
      (settings.tradeRouteMinimumMoneyPercentage / 100) * currentMoneyPerSecond,
    ),
  );

  let priorityGroups = {};
  for (let i = 0; i < tradableResources.length; i++) {
    let resource = tradableResources[i];
    if (!resource.autoTradeBuyEnabled) continue;
    requiredTradeRoutes[resource.id] = requiredTradeRoutes[resource.id] ?? 0;
    if (saveInflationMoney) continue;
    if (
      resource.autoTradeWeighting <= 0 ||
      (settings.tradeRouteSellExcess
        ? resource.usefulRatio > 0.99
        : resource.storageRatio > 0.98)
    ) {
      continue;
    }
    let priority = resource.autoTradePriority;
    if (resource.isDemanded()) {
      priority = Math.max(priority, 100);
      if (!resources.Money.isDemanded()) {
        minimumAllowedMoneyPerSecond = 0;
      }
    } else if (
      priority < 100 &&
      priority !== -1 &&
      resources.Money.isDemanded()
    ) {
      continue;
    }
    if (priority !== 0) {
      priorityGroups[priority] = priorityGroups[priority] ?? [];
      priorityGroups[priority].push(resource);
    }
  }
  let priorityList = Object.keys(priorityGroups)
    .sort((a, b) => Number(b) - Number(a))
    .map((key) => priorityGroups[key]);
  if (priorityGroups["-1"] && priorityList.length > 1) {
    priorityList.splice(priorityList.indexOf(priorityGroups["-1"], 1));
    priorityList[0].push(...priorityGroups["-1"]);
  }

  let resSorter = (a, b) =>
    requiredTradeRoutes[a.id] / a.autoTradeWeighting -
      requiredTradeRoutes[b.id] / b.autoTradeWeighting ||
    b.autoTradeWeighting - a.autoTradeWeighting;
  let remainingRoutes, unassignStep;
  if (getGovernor() === "entrepreneur") {
    remainingRoutes = tradeRoutesUsed - unmanagedTradeRoutes;
    unassignStep = 2;
  } else {
    remainingRoutes = maxTradeRoutes;
    unassignStep = 1;
  }
  outerLoop: for (
    let i = 0;
    i < priorityList.length && remainingRoutes > 0;
    i++
  ) {
    let trades = priorityList[i].sort(
      (a, b) => a.autoTradeWeighting - b.autoTradeWeighting,
    );
    assignLoop: while (trades.length > 0 && remainingRoutes > 0) {
      let resource = trades.sort(resSorter)[0];
      if (requiredTradeRoutes[resource.id] >= importRouteCap) {
        trades.shift();
        continue;
      }
      if (
        currentMoneyPerSecond - resource.tradeBuyPrice <
        minimumAllowedMoneyPerSecond
      ) {
        break outerLoop;
      }
      if (tradeRoutesUsed < maxTradeRoutes) {
        currentMoneyPerSecond -= resource.tradeBuyPrice;
        tradeRoutesUsed++;
        remainingRoutes--;
        requiredTradeRoutes[resource.id]++;
      } else {
        for (let otherId in requiredTradeRoutes) {
          if (requiredTradeRoutes[otherId] === undefined) continue;
          let otherResource = resources[otherId];
          let currentRequired = requiredTradeRoutes[otherId];
          if (currentRequired >= 0 || resource === otherResource) continue;
          if (
            currentMoneyPerSecond -
              otherResource.tradeSellPrice -
              resource.tradeBuyPrice >
              minimumAllowedMoneyPerSecond &&
            remainingRoutes >= unassignStep
          ) {
            currentMoneyPerSecond -= otherResource.tradeSellPrice;
            currentMoneyPerSecond -= resource.tradeBuyPrice;
            requiredTradeRoutes[otherId]++;
            requiredTradeRoutes[resource.id]++;
            remainingRoutes -= unassignStep;
            continue assignLoop;
          }
        }
        break outerLoop;
      }
    }
  }

  let adjustmentTradeRoutes = [];
  for (let i = 0; i < tradableResources.length; i++) {
    let resource = tradableResources[i];
    if (requiredTradeRoutes[resource.id] === undefined) continue;
    adjustmentTradeRoutes[i] =
      requiredTradeRoutes[resource.id] - resource.tradeRoutes;
    if (requiredTradeRoutes[resource.id] === 0 && resource.tradeRoutes !== 0) {
      MarketManager.zeroTradeRoutes(resource);
      adjustmentTradeRoutes[i] = 0;
    } else if (adjustmentTradeRoutes[i] > 0 && resource.tradeRoutes < 0) {
      MarketManager.addTradeRoutes(resource, adjustmentTradeRoutes[i]);
      adjustmentTradeRoutes[i] = 0;
    } else if (adjustmentTradeRoutes[i] < 0 && resource.tradeRoutes > 0) {
      MarketManager.removeTradeRoutes(resource, -1 * adjustmentTradeRoutes[i]);
      adjustmentTradeRoutes[i] = 0;
    }
  }
  for (let i = 0; i < tradableResources.length; i++) {
    let resource = tradableResources[i];
    if (requiredTradeRoutes[resource.id] === undefined) continue;
    if (adjustmentTradeRoutes[i] > 0) {
      MarketManager.addTradeRoutes(resource, adjustmentTradeRoutes[i]);
    } else if (adjustmentTradeRoutes[i] < 0) {
      MarketManager.removeTradeRoutes(resource, -1 * adjustmentTradeRoutes[i]);
    }
  }
  resources.Money.rateOfChange = currentMoneyPerSecond;
}

function makeResource(id, options) {
  return {
    id,
    tradeRoutes: options.tradeRoutes ?? 0,
    autoTradeBuyEnabled: options.buy ?? false,
    autoTradeSellEnabled: options.sell ?? false,
    usefulRatio: options.usefulRatio ?? 0,
    storageRatio: options.storageRatio ?? 0,
    tradeSellPrice: options.sellPrice ?? 0,
    tradeBuyPrice: options.buyPrice ?? 0,
    rateOfChange: options.rate ?? 0,
    tradeRouteQuantity: options.qty ?? 1,
    autoTradeWeighting: options.weight ?? 1,
    autoTradePriority: options.priority ?? 0,
    _demanded: options.demanded ?? false,
    isRoutesUnlocked: () => options.locked !== true,
    isDemanded() {
      return this._demanded;
    },
  };
}

function buildFixture(scenario, calls) {
  const resources = {};
  for (const spec of scenario.resources) {
    resources[spec.id] = makeResource(spec.id, spec);
  }
  resources.Money = {
    id: "Money",
    rateOfChange: scenario.moneyRate ?? 0,
    maxQuantity: scenario.moneyMax ?? 1e9,
    currentQuantity: scenario.moneyCurrent ?? 0,
    _demanded: scenario.moneyDemanded ?? false,
    isDemanded() {
      return this._demanded;
    },
  };
  const priorityList = scenario.priority.map((id) => resources[id]);
  const MarketManager = {
    priorityList,
    getImportRouteCap: () => scenario.importCap ?? 100,
    getExportRouteCap: () => scenario.exportCap ?? 100,
    getMaxTradeRoutes: () => [scenario.max, scenario.unmanaged ?? 0],
    zeroTradeRoutes: (r) => calls.push(["zero", r.id]),
    addTradeRoutes: (r, n) => calls.push(["add", r.id, n]),
    removeTradeRoutes: (r, n) => calls.push(["remove", r.id, n]),
  };
  return {
    settings: scenario.settings,
    game: { global: { race: scenario.race ?? {} } },
    resources,
    MarketManager,
    governor: scenario.governor ?? "none",
    saveInflation: scenario.saveInflation ?? false,
  };
}

function runLegacy(scenario) {
  const calls = [];
  const f = buildFixture(scenario, calls);
  legacyAdjust({
    getSettings: () => f.settings,
    getGame: () => f.game,
    getResources: () => f.resources,
    getMarketManager: () => f.MarketManager,
    getGovernor: () => f.governor,
    inflationChallengeShouldSaveMoney: () => f.saveInflation,
  });
  return { calls, money: f.resources.Money.rateOfChange };
}

function runNew(scenario) {
  const calls = [];
  const f = buildFixture(scenario, calls);
  const result = planTradeRoutes(
    readTradeRoutesInput({
      getSettings: () => f.settings,
      getGame: () => f.game,
      getResources: () => f.resources,
      getMarketManager: () => f.MarketManager,
      getGovernor: () => f.governor,
      shouldSaveInflationMoney: () => f.saveInflation,
    }),
  );
  for (const op of result.operations) {
    const resource = f.resources[op.resourceId];
    if (op.kind === "zero") f.MarketManager.zeroTradeRoutes(resource);
    else if (op.kind === "add")
      f.MarketManager.addTradeRoutes(resource, op.count);
    else f.MarketManager.removeTradeRoutes(resource, op.count);
  }
  f.resources.Money.rateOfChange = result.moneyRate;
  return { calls, money: f.resources.Money.rateOfChange };
}

const base = {
  tradeRouteSellExcess: false,
  tradeRouteMinimumMoneyPerSecond: 0,
  tradeRouteMinimumMoneyPercentage: 0,
};

const scenarios = [
  // 1. Sell excess + buy a priority down to the money floor.
  {
    settings: { ...base },
    resources: [
      {
        id: "Iron",
        sell: true,
        storageRatio: 1,
        sellPrice: 8,
        rate: 30,
        qty: 10,
      },
      { id: "Copper", buy: true, priority: 50, buyPrice: 5 },
    ],
    priority: ["Iron", "Copper"],
    max: 10,
  },
  // 2. Inflation save: buying skipped, selling kept.
  {
    settings: { ...base },
    saveInflation: true,
    resources: [
      {
        id: "Iron",
        sell: true,
        storageRatio: 1,
        sellPrice: 8,
        rate: 30,
        qty: 10,
      },
      { id: "Copper", buy: true, priority: 50, buyPrice: 5 },
    ],
    priority: ["Iron", "Copper"],
    max: 10,
  },
  // 3. Stale routes zeroed when no longer qualifying.
  {
    settings: { ...base },
    resources: [{ id: "Tin", sell: true, storageRatio: 0.5, tradeRoutes: 3 }],
    priority: ["Tin"],
    max: 10,
  },
  // 4. Banana Republic: single sell route only.
  {
    settings: { ...base },
    race: { banana: true },
    resources: [
      {
        id: "Gold",
        sell: true,
        storageRatio: 1,
        sellPrice: 10,
        rate: 100,
        qty: 10,
      },
      {
        id: "Silver",
        sell: true,
        storageRatio: 1,
        sellPrice: 5,
        rate: 100,
        qty: 10,
      },
    ],
    priority: ["Gold", "Silver"],
    max: 100,
  },
  // 5. Sell-excess mode uses usefulRatio thresholds.
  {
    settings: { ...base, tradeRouteSellExcess: true },
    resources: [
      {
        id: "Iron",
        sell: true,
        usefulRatio: 1,
        sellPrice: 8,
        rate: 40,
        qty: 10,
      },
      { id: "Copper", buy: true, priority: 50, buyPrice: 3, usefulRatio: 0.5 },
    ],
    priority: ["Iron", "Copper"],
    max: 8,
  },
  // 6. Demanded resource with money not demanded ignores the money floor.
  {
    settings: { ...base, tradeRouteMinimumMoneyPerSecond: 1000 },
    resources: [
      {
        id: "Iron",
        sell: true,
        storageRatio: 1,
        sellPrice: 5,
        rate: 50,
        qty: 10,
      },
      { id: "Copper", buy: true, priority: 20, buyPrice: 4, demanded: true },
    ],
    priority: ["Iron", "Copper"],
    max: 10,
  },
  // 7. Low priority buy skipped when money is demanded.
  {
    settings: { ...base },
    moneyDemanded: true,
    resources: [
      {
        id: "Iron",
        sell: true,
        storageRatio: 1,
        sellPrice: 5,
        rate: 50,
        qty: 10,
      },
      { id: "Copper", buy: true, priority: 20, buyPrice: 4 },
    ],
    priority: ["Iron", "Copper"],
    max: 10,
  },
  // 8. Entrepreneur governor: unassign step of two, unmanaged routes carved out.
  {
    settings: { ...base },
    governor: "entrepreneur",
    unmanaged: 2,
    resources: [
      {
        id: "Iron",
        sell: true,
        storageRatio: 1,
        sellPrice: 6,
        rate: 60,
        qty: 10,
      },
      { id: "Copper", buy: true, priority: 50, buyPrice: 2 },
      { id: "Zinc", buy: true, priority: 50, buyPrice: 1, weight: 2 },
    ],
    priority: ["Iron", "Copper", "Zinc"],
    max: 12,
  },
  // 9. Priority -1 group folded into the top group (verbatim splice quirk).
  {
    settings: { ...base },
    resources: [
      {
        id: "Iron",
        sell: true,
        storageRatio: 1,
        sellPrice: 6,
        rate: 80,
        qty: 10,
      },
      { id: "Copper", buy: true, priority: 80, buyPrice: 2 },
      { id: "Zinc", buy: true, priority: -1, buyPrice: 1 },
    ],
    priority: ["Iron", "Copper", "Zinc"],
    max: 12,
  },
  // 10. No free routes: buying forces unassigning a sell route.
  {
    settings: { ...base },
    resources: [
      {
        id: "Iron",
        sell: true,
        storageRatio: 1,
        sellPrice: 2,
        rate: 30,
        qty: 10,
      },
      { id: "Copper", buy: true, priority: 100, buyPrice: 1 },
    ],
    priority: ["Iron", "Copper"],
    max: 3,
  },
];

let index = 0;
for (const scenario of scenarios) {
  index += 1;
  const legacy = runLegacy(scenario);
  const next = runNew(scenario);
  assert.deepEqual(
    next.calls,
    legacy.calls,
    `scenario ${index} call trace mismatch`,
  );
  assert.equal(next.money, legacy.money, `scenario ${index} money mismatch`);
}

console.log(
  `Trade routes dual-run parity tests passed (${scenarios.length} scenarios)`,
);
