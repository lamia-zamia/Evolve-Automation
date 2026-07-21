import assert from "node:assert/strict";

import { liveFunction } from "../src/ui/dependencies.ts";
import { createArpaToggleUI } from "../src/ui/arpa-toggles.ts";
import { createBuildingToggleUI } from "../src/ui/building-toggles.ts";

function makeFactory(factory, context = {}, overrides = {}) {
  return factory({
    getDependency: (name) => context[name],
    getOverride: (name) => overrides[name],
  });
}

function jqueryNode() {
  return {
    length: 1,
    append() {
      return this;
    },
    parent() {
      return this;
    },
    css() {
      return this;
    },
    insertAfter() {
      return this;
    },
    remove() {
      return this;
    },
  };
}

const toggleTrace = [];
function toggleFixture(factory, context, createName, removeName) {
  const overrides = {
    [removeName]: () => toggleTrace.push(`remove:${removeName}`),
  };
  context.$ = () => jqueryNode();
  context.addToggleCallbacks = (node, key) => {
    toggleTrace.push(`toggle:${key}`);
    return node;
  };
  const boundary = makeFactory(factory, context, overrides);
  boundary[createName]();
  return { boundary, context, overrides };
}

toggleFixture(
  createArpaToggleUI,
  { ProjectManager: { priorityList: [{ id: "Physics" }] }, settingsRaw: {} },
  "createArpaToggles",
  "removeArpaToggles",
);
const buildingState = { buildingToggles: 0 };
toggleFixture(
  createBuildingToggleUI,
  {
    BuildingManager: { priorityList: [{ _vueBinding: "city1" }] },
    settings: { showSettings: true },
    settingsRaw: {},
    state: buildingState,
  },
  "createBuildingToggles",
  "removeBuildingToggles",
);
assert.deepEqual(toggleTrace, [
  "remove:removeArpaToggles",
  "toggle:arpa_Physics",
  "remove:removeBuildingToggles",
  "toggle:batcity1",
]);
assert.equal(buildingState.buildingToggles, 1);

class FirstClass {}
let currentClass = FirstClass;
const liveClass = liveFunction(() => currentClass);
assert.equal(new FirstClass() instanceof liveClass, true);
class SecondClass {}
currentClass = SecondClass;
assert.equal(new FirstClass() instanceof liveClass, false);
assert.equal(new SecondClass() instanceof liveClass, true);

console.log("Next 2 UI-boundary module tests passed");
