import assert from "node:assert/strict";

globalThis.__EA_TEST_SURFACE_ENABLED__ = true;
const { createCapturedTradeRoutes } =
  await import("../../../src/adapters/evolve/economy/market/captured-trade-routes.ts");

const rounded = (value, digits) => ({
  receiver: value,
  digits,
  text: value.toFixed(digits),
});

function harness({
  trades = { Iron: 0 },
  operations,
  maximumRoutes = 1000,
  currency = 4,
  banana = false,
  demanded = false,
  dealmaker = false,
  onQuote,
  afterNative,
  duringNative,
} = {}) {
  let activeRoot = {
    race: {
      banana,
      governor: {
        g: { bg: dealmaker ? "dealmaker" : "none" },
        dealmaker,
      },
    },
    tech: { trade: 1, currency },
    city: {
      market: {
        mtrade: maximumRoutes,
        trade: Object.values(trades).reduce(
          (sum, routeCount) => sum + Math.abs(routeCount),
          0,
        ),
      },
    },
    resource: {
      Money: { amount: 1000, max: 10000, diff: 100 },
      ...Object.fromEntries(
        Object.entries(trades).map(([id, routeCount]) => [
          id,
          {
            display: true,
            trade: routeCount,
            amount: 0,
            max: 100,
            diff: 0,
            value: 10,
          },
        ]),
      ),
    },
  };
  const calls = [];
  const trace = [];
  const colorCalls = new Map();
  const controls = new Map(
    Object.keys(trades).map((id) => [
      `market-${id}`,
      {
        elementId: `market-${id}`,
        generation: 1,
        methods: ["autoBuy", "autoSell", "zero", "aSell", "aBuy"],
      },
    ]),
  );
  let board;
  const redraw = () => {
    board = {
      root: activeRoot,
      mode: "global",
      rows: [...controls.values()],
    };
  };
  redraw();
  const boardSource = {
    current: () => board,
    isCurrent: (snapshot) =>
      snapshot === board &&
      snapshot.root === activeRoot &&
      snapshot.rows.every(
        (row) => controls.get(row.elementId)?.generation === row.generation,
      ),
    redraw,
  };
  let quoted = [];
  const marketStep = (method, id) => {
    const root = activeRoot;
    const market = root.city.market;
    const resource = root.resource[id];
    if (method === "autoBuy") {
      if (
        root.race.governor.dealmaker &&
        Object.values(root.resource).reduce(
          (total, entry) => total + (entry.trade < 0 ? -entry.trade : 0),
          0,
        ) <=
          Object.values(root.resource).reduce(
            (total, entry) => total + (entry.trade > 0 ? entry.trade : 0),
            0,
          )
      )
        return false;
      const importCap = root.tech.currency >= 6 ? 1_000_000 : 100;
      if (resource.trade >= 0) {
        if (resource.trade >= importCap || market.trade >= market.mtrade)
          return false;
        market.trade += 1;
        resource.trade += 1;
      } else {
        market.trade -= 1;
        resource.trade += 1;
      }
    } else if (resource.trade <= 0) {
      const exportCap = banana
        ? root.tech.currency >= 6
          ? 1_000_000
          : 25
        : root.tech.currency >= 6
          ? 1_000_000
          : 100;
      const otherExport = Object.entries(root.resource).some(
        ([resourceId, entry]) => resourceId !== id && entry.trade < 0,
      );
      if (otherExport && banana && resource.trade === 0) return false;
      if (resource.trade <= -exportCap || market.trade >= market.mtrade)
        return false;
      market.trade += 1;
      resource.trade -= 1;
    } else {
      market.trade -= 1;
      resource.trade -= 1;
    }
    return true;
  };
  const invokeNative = (method, id, count) => {
    if (method === "zero") {
      const routeCount = activeRoot.resource[id].trade;
      if (routeCount !== 0) {
        const directional = routeCount > 0 ? "autoSell" : "autoBuy";
        for (let index = 0; index < Math.abs(routeCount); index += 1)
          marketStep(directional, id);
        colorCalls.set(id, (colorCalls.get(id) ?? 0) + 1);
      }
      return;
    }
    for (let index = 0; index < count; index += 1) {
      if (!marketStep(method, id)) break;
      duringNative?.({ index, id, method, activeRoot });
    }
    colorCalls.set(id, (colorCalls.get(id) ?? 0) + 1);
  };
  const registry = {
    resolve: (id) => controls.get(id),
    capturedElementIds: () => [...controls.keys()],
    invoke(handle, method, args = []) {
      if (method === "aSell" || method === "aBuy") {
        quoted =
          method === "aSell"
            ? [rounded(10, 1), rounded(1, 3)]
            : [rounded(1, 3), rounded(10, 1), rounded(10, 2)];
        if (method === "aBuy") onQuote?.(activeRoot);
        return { ok: true, value: undefined };
      }
      const id = args[0];
      const count = method === "zero" ? 1 : (args[1] ?? 1);
      calls.push({ method, resourceId: id, count });
      invokeNative(method, id, count);
      afterNative?.({ method, resourceId: id, count, activeRoot });
      return { ok: true, value: undefined };
    },
  };
  const routes = createCapturedTradeRoutes({
    rootState: { readRoot: () => activeRoot },
    controls: registry,
    board: boardSource,
    mechanics: {
      readRoundedValues(read) {
        quoted = [];
        read();
        return { kind: "value", value: quoted };
      },
    },
    keyState: { readMultiplierLatch: () => false },
    readSettings: () => ({
      autoMarket: true,
      res_trade_buy_Iron: true,
      res_trade_sell_Iron: true,
      res_trade_buy_Copper: true,
      res_trade_sell_Copper: true,
      res_trade_w_Iron: 1,
      res_trade_p_Iron: 1,
      res_buy_p_Iron: 1,
      res_trade_w_Copper: 1,
      res_trade_p_Copper: 1,
      res_buy_p_Copper: 1,
    }),
    readDemand: () => ({
      isDemanded: () => demanded,
      storageRequired: () => 100,
    }),
    testSurface: {
      resolveOperations: () => operations,
      onTrace: (event) => trace.push(event),
    },
  });
  return {
    calls,
    trace,
    colorCalls,
    controls,
    boardSource,
    root: () => activeRoot,
    replaceRoot: (next) => {
      activeRoot = next;
    },
    adjust: () => routes.adjust(),
  };
}

{
  const test = harness({
    trades: { Iron: 205, Copper: 2 },
    operations: [
      { kind: "remove", resourceId: "Iron", count: 205 },
      { kind: "remove", resourceId: "Copper", count: 2 },
    ],
  });
  test.adjust();
  assert.deepEqual(
    test.calls.map(({ resourceId, count }) => [resourceId, count]),
    [
      ["Iron", 100],
      ["Iron", 100],
      ["Iron", 5],
      ["Copper", 2],
    ],
    JSON.stringify({
      calls: test.calls,
      plan: test.trace.find((event) => event.kind === "plan"),
    }),
  );
  assert.equal(test.root().resource.Iron.trade, 0);
  assert.equal(test.root().resource.Copper.trade, 0);
  assert.equal(test.root().city.market.trade, 0);
  assert.equal(
    test.trace.filter((event) => event.kind === "applied").length,
    207,
    "batched calls retain logical per-route trace transitions",
  );
}

{
  const test = harness({
    trades: { Iron: 2 },
    operations: [{ kind: "remove", resourceId: "Iron", count: 5 }],
  });
  test.adjust();
  assert.equal(test.root().resource.Iron.trade, -3);
  assert.equal(test.root().city.market.trade, 3);
}

{
  const test = harness({
    trades: { Iron: 3 },
    operations: [{ kind: "zero", resourceId: "Iron" }],
  });
  test.adjust();
  assert.deepEqual(test.calls, [
    { method: "zero", resourceId: "Iron", count: 1 },
  ]);
  assert.equal(test.root().resource.Iron.trade, 0);
  assert.equal(test.root().city.market.trade, 0);
  assert.equal(test.colorCalls.get("Iron"), 1);
}

{
  const test = harness({
    trades: { Iron: 0 },
    maximumRoutes: 10,
    demanded: true,
    operations: [
      { kind: "add", resourceId: "Iron", count: 5 },
      { kind: "remove", resourceId: "Iron", count: 1 },
    ],
    onQuote: (root) => {
      root.city.market.mtrade = 2;
    },
  });
  test.adjust();
  assert.equal(test.calls.length, 1);
  assert.deepEqual(
    test.trace.find((event) => event.kind === "partial-native-execution"),
    {
      kind: "partial-native-execution",
      operation: { kind: "add", resourceId: "Iron", count: 5 },
      requestedCount: 5,
      completedCount: 2,
    },
  );
  assert.equal(test.root().resource.Iron.trade, 2);
  assert.equal(test.root().city.market.trade, 2);
}

{
  const test = harness({
    trades: { Iron: 0 },
    maximumRoutes: 500,
    currency: 6,
    demanded: true,
    operations: [{ kind: "add", resourceId: "Iron", count: 101 }],
    onQuote: (root) => {
      root.tech.currency = 4;
    },
  });
  test.adjust();
  assert.deepEqual(
    test.calls.map(({ count }) => count),
    [100, 1],
  );
  assert.equal(test.root().resource.Iron.trade, 100);
  assert.equal(test.root().city.market.trade, 100);
  assert.ok(
    test.trace.some(
      (event) =>
        event.kind === "skipped" && event.reason === "native-result-mismatch",
    ),
    "the next batch stops at the native import cap",
  );
}

{
  const test = harness({
    trades: { Iron: 0 },
    maximumRoutes: 20,
    currency: 6,
    demanded: true,
    dealmaker: false,
    operations: [{ kind: "add", resourceId: "Iron", count: 5 }],
    onQuote: (root) => {
      root.race.governor.dealmaker = true;
    },
  });
  test.adjust();
  assert.equal(test.calls.length, 1);
  assert.equal(test.root().resource.Iron.trade, 0);
  assert.equal(test.root().city.market.trade, 0);
  assert.ok(
    test.trace.some(
      (event) =>
        event.kind === "skipped" && event.reason === "native-result-mismatch",
    ),
  );
}

{
  const test = harness({
    trades: { Iron: 3, Copper: -1 },
    banana: true,
    operations: [{ kind: "remove", resourceId: "Iron", count: 5 }],
  });
  test.adjust();
  assert.equal(test.root().resource.Iron.trade, 0);
  assert.equal(test.root().city.market.trade, 1);
  assert.equal(
    test.trace.find((event) => event.kind === "partial-native-execution")
      ?.completedCount,
    3,
    "Banana export exclusivity stops a crossing batch after imports are removed",
  );
}

{
  const test = harness({
    trades: { Iron: -98 },
    operations: [{ kind: "remove", resourceId: "Iron", count: 5 }],
  });
  test.adjust();
  assert.equal(test.root().resource.Iron.trade, -100);
  assert.equal(test.root().city.market.trade, 100);
  assert.equal(
    test.trace.find((event) => event.kind === "partial-native-execution")
      ?.completedCount,
    2,
    "the native export cap stops and reports a partial batch",
  );
}

for (const replacement of [
  "control",
  "root",
  "resource",
  "resource-container",
  "board",
]) {
  const test = harness({
    trades: { Iron: 205 },
    operations: [{ kind: "remove", resourceId: "Iron", count: 205 }],
    afterNative: ({ activeRoot }) => {
      if (test.calls.length !== 1) return;
      if (replacement === "control")
        test.controls.set("market-Iron", {
          ...test.controls.get("market-Iron"),
          generation: 2,
        });
      if (replacement === "root") test.replaceRoot(structuredClone(activeRoot));
      if (replacement === "resource")
        activeRoot.resource.Iron = structuredClone(activeRoot.resource.Iron);
      if (replacement === "resource-container")
        activeRoot.resource = structuredClone(activeRoot.resource);
      if (replacement === "board") test.boardSource.redraw();
    },
  });
  test.adjust();
  assert.equal(
    test.calls.length,
    1,
    `${replacement} replacement stops batches`,
  );
}

{
  let replaced = false;
  const test = harness({
    trades: { Iron: 205 },
    operations: [{ kind: "remove", resourceId: "Iron", count: 205 }],
    duringNative: ({ index, activeRoot }) => {
      if (index !== 0 || replaced) return;
      replaced = true;
      const next = structuredClone(activeRoot);
      testRef.replaceRoot(next);
    },
  });
  const testRef = test;
  test.adjust();
  assert.equal(test.calls.length, 1);
  assert.equal(test.root().resource.Iron.trade, 105);
  assert.equal(
    test.trace.find((event) => event.kind === "skipped")?.reason,
    "native-result-mismatch",
  );
}
