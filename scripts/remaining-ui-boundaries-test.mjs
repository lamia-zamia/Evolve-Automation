import assert from "node:assert/strict";

import { liveFunction } from "../src/ui/dependencies.ts";
import { createStorageSettings } from "../src/ui/storage-settings.ts";
import { createMagicSettings } from "../src/ui/magic-settings.ts";
import { createJobSettings } from "../src/ui/job-settings.ts";
import { createWeightingSettings } from "../src/ui/weighting-settings.ts";
import { createBuildingSettings } from "../src/ui/building-settings.ts";
import { createProjectSettings } from "../src/ui/project-settings.ts";
import { createOptionsModalUI } from "../src/ui/options-modal.ts";
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

const settingsSpecs = [
  [
    "storage",
    createStorageSettings,
    "buildStorageSettings",
    "updateStorageSettingsContent",
    "storage",
    "Storage",
    false,
    ["checkbox:autoStorage", "cleanup:storage"],
  ],
  [
    "magic",
    createMagicSettings,
    "buildMagicSettings",
    "updateMagicSettingsContent",
    "magic",
    "Magic",
    false,
    ["checkbox:autoAlchemy|autoPylon|magicFullmetalHelper"],
  ],
  [
    "job",
    createJobSettings,
    "buildJobSettings",
    "updateJobSettingsContent",
    "job",
    "Job",
    false,
    ["checkbox:autoJobs|autoCraftsmen"],
  ],
  [
    "weighting",
    createWeightingSettings,
    "buildWeightingSettings",
    "updateWeightingSettingsContent",
    "weighting",
    "AutoBuild Weighting",
    false,
    [],
  ],
  [
    "building",
    createBuildingSettings,
    "buildBuildingSettings",
    "updateBuildingSettingsContent",
    "building",
    "Building",
    false,
    ["checkbox:autoBuild|autoPower", "cleanup:building"],
  ],
  [
    "project",
    createProjectSettings,
    "buildProjectSettings",
    "updateProjectSettingsContent",
    "project",
    "A.R.P.A.",
    false,
    ["checkbox:autoARPA"],
  ],
];

for (const [
  name,
  factory,
  buildName,
  updateName,
  id,
  label,
  secondary,
  cleanup,
] of settingsSpecs) {
  const trace = [];
  const resetName = `reset${name[0].toUpperCase() + name.slice(1)}Settings`;
  const context = {
    [resetName]: (value) => trace.push(`reset:first:${value}`),
    updateSettingsFromState: () => trace.push("persist"),
    resetCheckbox: (...keys) => trace.push(`checkbox:${keys.join("|")}`),
    removeStorageToggles: () => trace.push("cleanup:storage"),
    removeBuildingToggles: () => trace.push("cleanup:building"),
    buildFilterRegExp: () => trace.push("filter"),
  };
  let registration;
  context.buildSettingsSection = (...args) => (registration = args);
  context.buildSettingsSection2 = (...args) => (registration = args);
  const overrides = {
    [updateName]: (...args) => trace.push(`update:${args.join("|")}`),
  };
  const boundary = makeFactory(factory, context, overrides);
  if (secondary) boundary[buildName]({}, "");
  else boundary[buildName]();
  assert.equal(registration[secondary ? 2 : 0], id);
  assert.equal(registration[secondary ? 3 : 1], label);
  assert.equal(registration[secondary ? 5 : 3], boundary[updateName]);

  context[resetName] = (value) => trace.push(`reset:second:${value}`);
  registration[secondary ? 4 : 2]();
  assert.deepEqual(trace, [
    "reset:second:true",
    "persist",
    "update:",
    ...cleanup,
  ]);
}

const optionTrace = [];
const optionContext = {};
const optionOverrides = {
  addOptionUI: (id, selector, title) =>
    optionTrace.push(`${id}:${selector}:${title}`),
};
const options = makeFactory(
  createOptionsModalUI,
  optionContext,
  optionOverrides,
);
options.updateOptionsUI();
assert.deepEqual(optionTrace, [
  "s-government-options:#government .tabs ul:Government",
  "s-foreign-options:#garrison div h2:Foreign Affairs",
  "s-foreign-options2:#c_garrison div h2:Foreign Affairs",
  "s-hell-options:#gFort div h3:Hell",
  "s-hell-options2:#prtl_fortress div h3:Hell",
  "s-fleet-options:#hfleet h3:Fleet",
]);

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

console.log("Next 14 UI-boundary module tests passed");
