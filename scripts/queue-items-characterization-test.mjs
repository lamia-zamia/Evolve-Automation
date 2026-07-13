import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => ({ ready() {} }),
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.setQueueItemTestContext, "function");
assert.equal(typeof hooks.queueItems?.checkAffordableCustom, "function");
assert.equal(typeof hooks.queueItems?.getQueuedItemObj, "function");

const building = { id: "city-foundry", title: "Foundry" };
const project = { id: "arpa-monument", title: "Monument" };
hooks.setQueueItemTestContext({
  resources: {
    Money: { currentQuantity: 100, maxQuantity: 1000 },
    Soul_Gem: { currentQuantity: 7, maxQuantity: 20 },
    Supply: { currentQuantity: 3, maxQuantity: 30 },
  },
  poly: { shipCosts: (type) => ({ Money: type === "corvette" ? 150 : 50 }) },
  MechManager: { getMechCost: () => [8, 4] },
  buildingIds: { "city-foundry": building },
  arpaIds: { "arpa-monument": project },
});

assert.equal(hooks.queueItems.checkAffordableCustom({ Money: 100 }), true);
assert.equal(hooks.queueItems.checkAffordableCustom({ Money: 101 }), false);
assert.equal(
  hooks.queueItems.checkAffordableCustom({ Money: 999 }, true),
  true,
);
assert.equal(hooks.queueItems.checkAffordableCustom({ Unknown: 0 }), false);

const ship = hooks.queueItems.getQueuedItemObj({
  action: "tp-ship",
  id: "ship-1",
  label: "Scout",
  type: "scout",
});
assert.deepEqual(
  { id: ship.id, name: ship.name, title: ship.title, cost: { ...ship.cost } },
  {
    id: "ship-1",
    name: "Scout",
    title: "Scout",
    cost: { Money: 50 },
  },
);
assert.equal(ship.isAffordable(), true);

const expensiveShip = hooks.queueItems.getQueuedItemObj({
  action: "tp-ship",
  id: "ship-2",
  label: "Corvette",
  type: "corvette",
});
assert.equal(expensiveShip.isAffordable(), false);
assert.equal(expensiveShip.isAffordable(true), true);

const mech = hooks.queueItems.getQueuedItemObj({
  action: "hell-mech",
  id: "mech-1",
  label: "Collector",
  type: "collector",
});
assert.deepEqual(
  { id: mech.id, name: mech.name, title: mech.title, cost: { ...mech.cost } },
  {
    id: "mech-1",
    name: "Collector",
    title: "Collector",
    cost: { Soul_Gem: 8, Supply: 4 },
  },
);
assert.equal(mech.isAffordable(), false);
assert.equal(mech.isAffordable(true), true);

assert.equal(
  hooks.queueItems.getQueuedItemObj({ action: "build", id: building.id }),
  building,
);
assert.equal(
  hooks.queueItems.getQueuedItemObj({ action: "arpa", id: project.id }),
  project,
);
assert.equal(
  hooks.queueItems.getQueuedItemObj({ action: "build", id: "missing" }),
  undefined,
);

console.log("Queue item bundled characterization tests passed");
