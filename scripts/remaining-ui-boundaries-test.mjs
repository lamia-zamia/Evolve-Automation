import assert from "node:assert/strict";

import { liveFunction } from "../src/ui/dependencies.ts";
import { createPrestigeTopBar } from "../src/ui/prestige-top-bar.ts";
import { createTotalDaysTopBar } from "../src/ui/total-days-top-bar.ts";
import { createArpaToggleUI } from "../src/ui/arpa-toggles.ts";
import { createCraftToggleUI } from "../src/ui/craft-toggles.ts";
import { createBuildingToggleUI } from "../src/ui/building-toggles.ts";
import { createEjectToggleUI } from "../src/ui/eject-toggles.ts";
import { createSupplyToggleUI } from "../src/ui/supply-toggles.ts";

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
const craftFixture = toggleFixture(
  createCraftToggleUI,
  { craftablesList: [{ id: "Plywood" }], settingsRaw: {} },
  "createCraftToggles",
  "removeCraftToggles",
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
toggleFixture(
  createEjectToggleUI,
  { EjectManager: { priorityList: [{ id: "Iron" }] }, settingsRaw: {} },
  "createEjectToggles",
  "removeEjectToggles",
);
toggleFixture(
  createSupplyToggleUI,
  { SupplyManager: { priorityList: [{ id: "Coal" }] }, settingsRaw: {} },
  "createSupplyToggles",
  "removeSupplyToggles",
);
assert.deepEqual(toggleTrace, [
  "remove:removeArpaToggles",
  "toggle:arpa_Physics",
  "remove:removeCraftToggles",
  "toggle:craftPlywood",
  "remove:removeBuildingToggles",
  "toggle:batcity1",
  "remove:removeEjectToggles",
  "toggle:res_ejectIron",
  "remove:removeSupplyToggles",
  "toggle:res_supplyCoal",
]);
assert.equal(buildingState.buildingToggles, 1);

toggleTrace.length = 0;
craftFixture.context.craftablesList = [{ id: "Brick" }];
craftFixture.context.addToggleCallbacks = (node, key) => {
  toggleTrace.push(`replacement:${key}`);
  return node;
};
craftFixture.boundary.createCraftToggles();
assert.deepEqual(toggleTrace, [
  "remove:removeCraftToggles",
  "replacement:craftBrick",
]);

const elements = new Map();
const topBarTrace = [];
elements.set("s-prestige-type", {
  remove: () => topBarTrace.push("prestige:remove"),
});
elements.set("s-total-days", {
  remove: () => topBarTrace.push("days:remove"),
});
const countNode = { textContent: "" };
elements.set("s-total-days-count", countNode);
const document = { getElementById: (id) => elements.get(id) ?? null };
const prestigeTopBar = makeFactory(createPrestigeTopBar, { document });
prestigeTopBar.removePrestigeFromTopBar();
const totalDaysTopBar = makeFactory(createTotalDaysTopBar, {
  $: () => jqueryNode(),
  document,
  game: { global: { stats: { days: 456 } } },
  settings: { displayTotalDaysTypeInTopBar: false },
});
totalDaysTopBar.updateTotalDaysInTopBar();
assert.deepEqual(topBarTrace, ["prestige:remove", "days:remove"]);
assert.equal(countNode.textContent, 456);

class FirstClass {}
let currentClass = FirstClass;
const liveClass = liveFunction(() => currentClass);
assert.equal(new FirstClass() instanceof liveClass, true);
class SecondClass {}
currentClass = SecondClass;
assert.equal(new FirstClass() instanceof liveClass, false);
assert.equal(new SecondClass() instanceof liveClass, true);

console.log("Next 7 UI-boundary module tests passed");
