import assert from "node:assert/strict";
import { planGalaxyMarket } from "../src/domain/economy/market/galaxy-market.ts";
import { createCapturedGalaxyMarketPorts } from "../src/adapters/evolve/economy/market/captured-galaxy-market.ts";

const buyIds = [
  "Deuterium",
  "Neutronium",
  "Adamantite",
  "Elerium",
  "Nano_Tube",
  "Graphene",
  "Stanene",
  "Bolognium",
  "Vitreloy",
];
const sellIds = [
  "Helium_3",
  "Copper",
  "Iron",
  "Oil",
  "Titanium",
  "Lumber",
  "Aluminium",
  "Uranium",
  "Infernite",
];

function makeHarness({ smoldering = false } = {}) {
  const resources = {};
  for (const id of new Set([...buyIds, ...sellIds, "Chrysotile"])) {
    resources[id] = { amount: 0, max: 100, display: true };
  }
  for (const id of sellIds) resources[id].amount = 100;
  resources.Chrysotile.amount = 100;
  const root = {
    race: { smoldering },
    galaxy: {
      trade: {
        max: 3,
        cur: 0,
        ...Object.fromEntries(buyIds.map((_, index) => [`f${index}`, 0])),
      },
    },
    resource: resources,
  };
  const calls = [];
  const registry = {
    resolve(id) {
      return id === "galaxyTrade"
        ? { elementId: id, generation: 1, methods: ["less", "more"] }
        : undefined;
    },
    invoke(_handle, method, args = []) {
      const index = args[0];
      calls.push([method, index]);
      if (!Number.isSafeInteger(index) || index < 0 || index >= buyIds.length) {
        return { ok: false, reason: "threw", detail: "invalid route index" };
      }
      const field = `f${index}`;
      if (method === "more" && root.galaxy.trade.cur < root.galaxy.trade.max) {
        root.galaxy.trade[field] += 1;
        root.galaxy.trade.cur += 1;
      }
      if (method === "less" && root.galaxy.trade[field] > 0) {
        root.galaxy.trade[field] -= 1;
        root.galaxy.trade.cur -= 1;
      }
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => ["galaxyTrade"],
  };
  const ports = createCapturedGalaxyMarketPorts({
    rootState: { readRoot: () => root },
    controls: registry,
    readSettings: () => ({
      marketMinIngredients: 0.5,
      ...Object.fromEntries(
        buyIds.flatMap((id, index) => [
          [`res_galaxy_w_${id}`, 1],
          [`res_galaxy_p_${id}`, index + 1],
        ]),
      ),
    }),
    readDemand: () => ({ isDemanded: (id) => id === "Deuterium" }),
  });
  return { root, calls, ports };
}

{
  const { root, calls, ports } = makeHarness();
  const input = ports.reader.read();
  assert.equal(input.initialized, true);
  assert.equal(input.offers.length, 9);
  assert.equal(input.offers[5].sellResourceId, "Lumber");
  const decision = planGalaxyMarket(input);
  assert.ok(decision);
  assert.equal(decision.adjustments[0].delta, 3);
  assert.equal(ports.executor.execute(decision).status, "succeeded");
  assert.equal(root.galaxy.trade.f0, 3);
  assert.deepEqual(calls, [
    ["more", 0],
    ["more", 0],
    ["more", 0],
  ]);
}

{
  const { ports } = makeHarness({ smoldering: true });
  assert.equal(ports.reader.read().offers[5].sellResourceId, "Chrysotile");
}

{
  const { root, ports } = makeHarness();
  const decision = planGalaxyMarket(ports.reader.read());
  assert.ok(decision);
  root.galaxy.trade.f0 = 1;
  root.galaxy.trade.cur = 1;
  assert.equal(ports.executor.execute(decision).status, "stale");
}

console.log("captured galaxy market tests passed");
