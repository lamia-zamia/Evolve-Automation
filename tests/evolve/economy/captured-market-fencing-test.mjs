import assert from "node:assert/strict";
import { createCapturedMarketPorts } from "../../../src/adapters/evolve/economy/market/captured-market.ts";

function fixture(side, afterCall = () => {}) {
  const root = {
    settings: { showMarket: true },
    race: {},
    tech: { currency: 4 },
    stats: { achieve: {} },
    city: { market: { qty: 1 } },
    resource: {
      Money: { amount: side === "buy" ? 100 : 0, max: 1000 },
      Iron: {
        trade: 0,
        display: true,
        value: 10,
        amount: side === "buy" ? 0 : 20,
        max: 100,
        diff: 0,
      },
    },
  };
  let currentRoot = root;
  const controls = new Map([
    [
      "market-qty",
      {
        elementId: "market-qty",
        generation: 1,
        data: root.city.market,
        methods: [],
      },
    ],
    [
      "market-Iron",
      {
        elementId: "market-Iron",
        generation: 1,
        methods: ["purchase", "sell"],
      },
    ],
  ]);
  const registry = {
    resolve: (id) => controls.get(id),
    invoke: (_handle, method) => {
      calls += 1;
      if (method === "purchase") {
        root.resource.Iron.amount += 1;
        root.resource.Money.amount -= 10;
      }
      if (method === "sell") {
        root.resource.Iron.amount -= 1;
        root.resource.Money.amount += 3;
      }
      afterCall({
        root,
        controls,
        replaceRoot: () => {
          currentRoot = { ...root };
        },
        calls,
      });
      return { ok: true };
    },
  };
  let calls = 0;
  const snapshot = {
    root,
    epoch: "test",
    mode: "global",
    rows: [controls.get("market-Iron")],
    quantity: controls.get("market-qty"),
  };
  const board = {
    current: () => snapshot,
    isCurrent: (candidate) =>
      candidate === snapshot &&
      currentRoot === root &&
      [...snapshot.rows, snapshot.quantity].every(
        (handle) =>
          controls.get(handle.elementId)?.generation === handle.generation,
      ),
  };
  const ports = createCapturedMarketPorts({
    rootState: { readRoot: () => currentRoot },
    controls: registry,
    board,
    readSettings: () => ({ tickRate: 4 }),
  });
  ports.reader.readGate();
  ports.reader.readSession();
  const decision = {
    kind: "trade",
    side,
    index: 0,
    resourceId: "Iron",
    multiplier: 5,
    repetitions: 3,
    expectedMoneyCurrent: root.resource.Money.amount,
    expectedResourceCurrent: root.resource.Iron.amount,
    expectedUnitPrice: side === "buy" ? 10 : 2.5,
  };
  return { root, controls, ports, decision, calls: () => calls };
}

for (const side of ["buy", "sell"]) {
  const sample = fixture(side);
  assert.equal(
    sample.ports.executor.execute(sample.decision).status,
    "succeeded",
  );
  assert.equal(sample.calls(), 3);
  assert.equal(sample.root.resource.Iron.amount, side === "buy" ? 3 : 17);
  assert.equal(sample.root.resource.Money.amount, side === "buy" ? 70 : 9);
  assert.equal(
    sample.ports.executor.execute({ kind: "restore-multiplier", multiplier: 1 })
      .status,
    "succeeded",
  );
  assert.equal(sample.root.city.market.qty, 1);
}

for (const mutation of ["root", "row", "quantity"]) {
  const sample = fixture("buy", ({ controls, replaceRoot, calls }) => {
    if (calls !== 1) return;
    if (mutation === "root") replaceRoot();
    else {
      const id = mutation === "row" ? "market-Iron" : "market-qty";
      controls.set(id, { ...controls.get(id), generation: 2 });
    }
  });
  assert.equal(sample.ports.executor.execute(sample.decision).status, "stale");
  assert.equal(sample.calls(), 1, `${mutation} stops repetitions`);
}

{
  const sample = fixture("buy", ({ root }) => {
    root.resource.Iron.amount -= 1;
    root.resource.Money.amount += 10;
  });
  assert.equal(
    sample.ports.executor.execute(sample.decision).status,
    "succeeded",
  );
  assert.equal(sample.calls(), 1, "native no-op stops repetitions");
}

{
  const sample = fixture("buy");
  assert.equal(
    sample.ports.executor.execute(sample.decision).status,
    "succeeded",
  );
  sample.root.city.market.qty = 7;
  assert.equal(
    sample.ports.executor.execute({ kind: "restore-multiplier", multiplier: 1 })
      .status,
    "stale",
  );
  assert.equal(
    sample.root.city.market.qty,
    7,
    "external quantity is never overwritten",
  );
}

console.log("captured market fencing tests passed");
