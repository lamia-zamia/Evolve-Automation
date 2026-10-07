import assert from "node:assert/strict";

import { runMarketTradesAutomation } from "../src/application/market.ts";
import {
  createCapturedMarketPorts,
  MARKET_QUANTITY_CONTROL,
} from "../src/adapters/evolve/economy/market/captured-market.ts";

const root = {
  settings: { showMarket: true },
  race: {},
  tech: { currency: 4 },
  city: { market: { qty: 1 } },
  stats: { achieve: {} },
  resource: {
    Money: { amount: 500, max: 1000 },
    Iron: { trade: 0, value: 10, amount: 0, max: 100, diff: 0 },
    Copper: { trade: 0, value: 10, amount: 100, max: 100, diff: 0 },
  },
};

const controls = new Map();
controls.set(MARKET_QUANTITY_CONTROL, {
  elementId: MARKET_QUANTITY_CONTROL,
  generation: 1,
  methods: ["val", "limit", "less", "more"],
  data: root.city.market,
});
for (const id of ["Iron", "Copper"]) {
  controls.set(`market-${id}`, {
    elementId: `market-${id}`,
    generation: 1,
    methods: ["purchase", "sell"],
    data: { r: root.resource[id], m: root.city.market },
  });
}

const registry = {
  resolve: (id) => controls.get(id),
  capturedElementIds: () => [...controls.keys()],
  invoke: (handle, method, args = []) => {
    if (handle.elementId === MARKET_QUANTITY_CONTROL) {
      if (method === "less") root.city.market.qty -= 1;
      if (method === "more") root.city.market.qty += 1;
      return { ok: true, value: undefined };
    }
    const id = args[0];
    const resource = root.resource[id];
    if (!resource)
      return { ok: false, reason: "threw", detail: "missing resource" };
    if (method === "purchase") {
      const amount = Math.floor(
        Math.min(
          root.city.market.qty,
          root.resource.Money.amount / resource.value,
          resource.max - resource.amount,
        ),
      );
      if (amount > 0) {
        resource.amount += amount;
        root.resource.Money.amount -= Math.round(resource.value * amount);
      }
    } else if (method === "sell") {
      const price = resource.value / 4;
      const amount = Math.floor(
        Math.min(
          root.city.market.qty,
          resource.amount,
          (root.resource.Money.max - root.resource.Money.amount) / price,
        ),
      );
      if (amount > 0) {
        resource.amount -= amount;
        root.resource.Money.amount += Math.round(price * amount);
      }
    }
    return { ok: true, value: undefined };
  },
};

function marketBoard(gameRoot) {
  const snapshot = {
    root: gameRoot,
    mode: "global",
    epoch: "test",
    quantity: controls.get(MARKET_QUANTITY_CONTROL),
    rows: [controls.get("market-Iron"), controls.get("market-Copper")],
  };
  return {
    current: () => snapshot,
    isCurrent: (board) =>
      board === snapshot &&
      board.root === gameRoot &&
      [...board.rows, board.quantity].every(
        (row) => registry.resolve(row.elementId)?.generation === row.generation,
      ),
  };
}

const ports = createCapturedMarketPorts({
  rootState: { readRoot: () => root },
  controls: registry,
  board: marketBoard(root),
  readSettings: () => ({
    tickRate: 4,
    minimumMoney: 0,
    minimumMoneyPercentage: 0,
    buyIron: true,
    res_buy_r_Iron: 0.5,
    res_buy_p_Iron: 0,
    sellCopper: true,
    res_sell_r_Copper: 0.9,
    res_buy_p_Copper: 1,
  }),
});

assert.deepEqual(ports.reader.readGate(), {
  unlocked: true,
  ordinary: true,
  noTrade: false,
});

// Once legacy Supply Zones split resources the ordinary trade market is gone: the market tab
// draws a per-zone black market and never creates `#market-qty`, so there is nothing to automate.
// The gate closes rather than letting the session read throw once per cycle.
{
  const regionalRoot = {
    ...root,
    race: { ...(root.race ?? {}), supplyZones: true, supplySplit: true },
    tech: { ...(root.tech ?? {}), shadow: 5 },
  };
  const regionalPorts = createCapturedMarketPorts({
    rootState: { readRoot: () => regionalRoot },
    controls: registry,
    board: marketBoard(regionalRoot),
    readSettings: () => ({ tickRate: 4 }),
  });
  assert.deepEqual(regionalPorts.reader.readGate(), {
    unlocked: true,
    ordinary: false,
    noTrade: false,
  });
  // One level below is still the ordinary market.
  const belowRoot = { ...root, tech: { ...(root.tech ?? {}), shadow: 4 } };
  assert.equal(
    createCapturedMarketPorts({
      rootState: { readRoot: () => belowRoot },
      controls: registry,
      board: marketBoard(belowRoot),
      readSettings: () => ({ tickRate: 4 }),
    }).reader.readGate().unlocked,
    true,
  );
}

assert.deepEqual(ports.reader.readSession(), {
  originalMultiplier: 1,
  maximumMultiplier: 5000,
  minimumMoneyAllowed: 0,
});
assert.equal(ports.reader.readSell(0, false)?.unitPrice, 2.5);

const outcome = runMarketTradesAutomation({
  reader: ports.reader,
  executor: ports.executor,
});
assert.equal(outcome.status, "succeeded");
assert.equal(root.resource.Iron.amount, 50);
assert.equal(root.resource.Copper.amount, 90);
assert.equal(root.resource.Money.amount, 25);
assert.equal(root.city.market.qty, 1);

root.race = { arrogant: 1, merchant: 1, conniving: 1, asymmetrical: 1 };
const traitPorts = createCapturedMarketPorts({
  rootState: { readRoot: () => root },
  controls: registry,
  board: marketBoard(root),
  readSettings: () => ({ tickRate: 4 }),
});
traitPorts.reader.readGate();
traitPorts.reader.readSession();
assert.equal(
  traitPorts.reader.readSell(0, false)?.unitPrice,
  10 / (4 * 0.75 * 1.2 * 0.85),
);
assert.equal(traitPorts.reader.readBuy(0, 0).unitPrice, 10 * 1.1 * 0.95);

let settingsReads = 0;
const coherentPorts = createCapturedMarketPorts({
  rootState: { readRoot: () => root },
  controls: registry,
  board: marketBoard(root),
  readSettings: () => {
    settingsReads += 1;
    return settingsReads === 1
      ? {
          tickRate: 4,
          sellCopper: true,
          buyCopper: true,
          res_sell_r_Copper: 0.7,
          res_buy_r_Copper: 0.3,
          res_buy_p_Copper: 0,
          res_buy_p_Iron: 1,
        }
      : {
          tickRate: 1,
          sellCopper: false,
          buyCopper: false,
          res_sell_r_Copper: 0,
          res_buy_r_Copper: 0,
          res_buy_p_Copper: 5,
          res_buy_p_Iron: 0,
        };
  },
});
coherentPorts.reader.readGate();
coherentPorts.reader.readSession();
const coherentSell = coherentPorts.reader.readSell(0, false);
const coherentBuy = coherentPorts.reader.readBuy(0, 0);
assert.equal(coherentSell?.resourceId, "Copper");
assert.equal(coherentSell?.autoSellEnabled, true);
assert.equal(coherentSell?.autoSellRatio, 0.7);
assert.equal(coherentBuy.autoBuyEnabled, true);
assert.equal(coherentBuy.autoBuyRatio, 0.3);
assert.equal(settingsReads, 1);

console.log("captured market tests passed");
