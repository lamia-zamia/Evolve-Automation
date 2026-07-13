import assert from "node:assert/strict";

import { createQueueItems } from "../src/planning/queue-items.ts";

let resources = {
  Money: { currentQuantity: 10, maxQuantity: 100 },
  Soul_Gem: { currentQuantity: 2, maxQuantity: 20 },
  Supply: { currentQuantity: 1, maxQuantity: 10 },
};
let shipCost = 20;
let mechCost = [3, 2];
let buildings = { building: { kind: "building" } };
let projects = { project: { kind: "project" } };
const queueItems = createQueueItems({
  getResources: () => resources,
  getPoly: () => ({ shipCosts: () => ({ Money: shipCost }) }),
  getMechManager: () => ({ getMechCost: () => mechCost }),
  getBuildingIds: () => buildings,
  getArpaIds: () => projects,
});

const ship = queueItems.getQueuedItemObj({
  action: "tp-ship",
  id: "ship",
  label: "Ship",
  type: "scout",
});
assert.equal(ship.isAffordable(), false);
assert.equal(ship.isAffordable(true), true);

resources = {
  Money: { currentQuantity: 50, maxQuantity: 50 },
  Soul_Gem: { currentQuantity: 5, maxQuantity: 5 },
  Supply: { currentQuantity: 5, maxQuantity: 5 },
};
shipCost = 40;
mechCost = [4, 4];
buildings = { replacement: { kind: "replacement-building" } };
projects = { replacementProject: { kind: "replacement-project" } };
assert.equal(ship.isAffordable(), true);
assert.equal(
  queueItems
    .getQueuedItemObj({
      action: "hell-mech",
      id: "mech",
      label: "Mech",
      type: "collector",
    })
    .isAffordable(),
  true,
);
assert.equal(
  queueItems.getQueuedItemObj({ action: "build", id: "replacement" }),
  buildings.replacement,
);
assert.equal(
  queueItems.getQueuedItemObj({
    action: "arpa",
    id: "replacementProject",
  }),
  projects.replacementProject,
);

console.log("Queue item module tests passed");
