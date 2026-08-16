import assert from "node:assert/strict";

import { readTradeRoutesInput } from "../src/adapters/evolve/economy/market/trade-routes.ts";

const baseSettings = {
  tradeRouteSellExcess: true,
  tradeRouteMinimumMoneyPerSecond: 5,
  tradeRouteMinimumMoneyPercentage: 10,
};

function resourceView(id, overrides = {}) {
  return {
    id,
    tradeRoutes: 1,
    autoTradeBuyEnabled: 1,
    autoTradeSellEnabled: 0,
    usefulRatio: 0.5,
    storageRatio: 0.25,
    tradeSellPrice: 8,
    tradeBuyPrice: 4,
    rateOfChange: 12,
    tradeRouteQuantity: 3,
    autoTradeWeighting: 2,
    autoTradePriority: 50,
    isRoutesUnlocked: () => true,
    isDemanded: () => true,
    ...overrides,
  };
}

function baseDeps(overrides = {}) {
  const resources = overrides.resources ?? {
    Money: {
      rateOfChange: 100,
      maxQuantity: 1e9,
      currentQuantity: 20,
      isDemanded: () => false,
    },
  };
  const manager = overrides.manager ?? {
    priorityList: [resourceView("Iron")],
    getImportRouteCap: () => 25,
    getExportRouteCap: () => 30,
    getMaxTradeRoutes: () => [12, 3],
    zeroTradeRoutes() {},
    addTradeRoutes() {},
    removeTradeRoutes() {},
  };
  return {
    getSettings: () => overrides.settings ?? baseSettings,
    getGame: () => overrides.game ?? { global: { race: { banana: true } } },
    getResources: () => resources,
    getMarketManager: () => manager,
    getGovernor: () => overrides.governor ?? "entrepreneur",
    shouldSaveInflationMoney: () => overrides.saveInflation ?? true,
  };
}

// Full mapping of a resource view, market caps, tuple, race, governor, assist.
{
  const input = readTradeRoutesInput(baseDeps());
  assert.deepEqual(input.settings, {
    tradeRouteSellExcess: true,
    tradeRouteMinimumMoneyPerSecond: 5,
    tradeRouteMinimumMoneyPercentage: 10,
  });
  assert.deepEqual(input.priorityList[0], {
    id: "Iron",
    tradeRoutes: 1,
    autoTradeBuyEnabled: true,
    autoTradeSellEnabled: false,
    usefulRatio: 0.5,
    storageRatio: 0.25,
    tradeSellPrice: 8,
    tradeBuyPrice: 4,
    rateOfChange: 12,
    tradeRouteQuantity: 3,
    autoTradeWeighting: 2,
    autoTradePriority: 50,
    isRoutesUnlocked: true,
    isDemanded: true,
  });
  assert.deepEqual(input.money, {
    rateOfChange: 100,
    maxQuantity: 1e9,
    currentQuantity: 20,
    isDemanded: false,
  });
  assert.equal(input.importRouteCap, 25);
  assert.equal(input.exportRouteCap, 30);
  assert.equal(input.maxTradeRoutes, 12);
  assert.equal(input.unmanagedTradeRoutes, 3);
  assert.equal(input.isBanana, true);
  assert.equal(input.isEntrepreneur, true);
  assert.equal(input.saveInflationMoney, true);
}

// Governor other than entrepreneur, no banana flag.
{
  const input = readTradeRoutesInput(
    baseDeps({ governor: "bureaucrat", game: { global: { race: {} } } }),
  );
  assert.equal(input.isEntrepreneur, false);
  assert.equal(input.isBanana, false);
}

// Boolean coercion of the enabled flags (truthy/falsy non-booleans).
{
  const input = readTradeRoutesInput(
    baseDeps({
      manager: {
        priorityList: [
          resourceView("Iron", {
            autoTradeBuyEnabled: 0,
            autoTradeSellEnabled: 1,
          }),
        ],
        getImportRouteCap: () => 1,
        getExportRouteCap: () => 1,
        getMaxTradeRoutes: () => [1, 0],
        zeroTradeRoutes() {},
        addTradeRoutes() {},
        removeTradeRoutes() {},
      },
    }),
  );
  assert.equal(input.priorityList[0].autoTradeBuyEnabled, false);
  assert.equal(input.priorityList[0].autoTradeSellEnabled, true);
}

// Result and nested entries are frozen.
{
  const input = readTradeRoutesInput(baseDeps());
  assert.ok(Object.isFrozen(input));
  assert.ok(Object.isFrozen(input.priorityList));
  assert.ok(Object.isFrozen(input.priorityList[0]));
  assert.ok(Object.isFrozen(input.money));
  assert.ok(Object.isFrozen(input.settings));
}

// A newly unlocked market can expose NaN for one cap refresh; treat it as no
// available routes while preserving strict validation for other malformed data.
{
  const input = readTradeRoutesInput(
    baseDeps({
      manager: {
        ...baseDeps().getMarketManager(),
        getMaxTradeRoutes: () => [Number.NaN, Number.NaN],
      },
    }),
  );
  assert.equal(input.maxTradeRoutes, 0);
  assert.equal(input.unmanagedTradeRoutes, 0);
}

// Malformed inputs throw at the boundary.
{
  const managerNoList = { ...baseDeps().getMarketManager(), priorityList: {} };
  const managerBadTuple = {
    ...baseDeps().getMarketManager(),
    getMaxTradeRoutes: () => 12,
  };
  const cases = [
    ["non-array priorityList", { manager: managerNoList }],
    ["non-array getMaxTradeRoutes", { manager: managerBadTuple }],
    [
      "non-string resource id",
      {
        manager: {
          ...baseDeps().getMarketManager(),
          priorityList: [resourceView(7)],
        },
      },
    ],
    [
      "non-number field",
      {
        manager: {
          ...baseDeps().getMarketManager(),
          priorityList: [resourceView("Iron", { tradeSellPrice: "cheap" })],
        },
      },
    ],
    ["missing Money", { resources: {} }],
    [
      "non-number setting",
      { settings: { ...baseSettings, tradeRouteMinimumMoneyPerSecond: "x" } },
    ],
  ];
  for (const [label, overrides] of cases) {
    assert.throws(
      () => readTradeRoutesInput(baseDeps(overrides)),
      `expected throw: ${label}`,
    );
  }
}

console.log("Trade routes adapter contract tests passed");
