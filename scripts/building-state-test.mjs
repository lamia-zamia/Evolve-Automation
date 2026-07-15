import assert from "node:assert/strict";
import { createBuildingStateInitialization } from "../src/game/building-state.ts";

function makeBuildings(prefix, missing = new Set()) {
  const instances = new Map();
  return new Proxy(
    {},
    {
      get(_target, id) {
        if (missing.has(id)) return undefined;
        if (!instances.has(id)) {
          instances.set(id, {
            id: `${prefix}:${id}`,
            isSwitchable: () => id.endsWith("Mission"),
          });
        }
        return instances.get(id);
      },
    },
  );
}

let buildings = makeBuildings("first");
let BuildingManager = {};
const { initBuildingState } = createBuildingStateInitialization({
  getBuildings: () => buildings,
  getBuildingManager: () => BuildingManager,
});

initBuildingState();
const firstManager = BuildingManager;
assert.equal(firstManager.priorityList.length, 404);
assert.equal(firstManager.priorityList[0].id, "first:Windmill");
assert.equal(firstManager.priorityList.at(-1).id, "first:CoalMine");
assert.equal(
  firstManager.statePriorityList.every((building) =>
    building.id.endsWith("Mission"),
  ),
  true,
);

buildings = makeBuildings("second", new Set(["Windmill", "CoalMine"]));
BuildingManager = {};
initBuildingState();

assert.equal(BuildingManager.priorityList.length, 402);
assert.equal(BuildingManager.priorityList[0].id, "second:Mill");
assert.equal(BuildingManager.priorityList.at(-1).id, "second:Mine");
assert.equal(firstManager.priorityList[0].id, "first:Windmill");

console.log("Building state initialization module tests passed");
