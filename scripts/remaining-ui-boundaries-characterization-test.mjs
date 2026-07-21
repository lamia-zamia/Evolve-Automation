import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const storageValues = new Map();
const domElements = new Map();
const domTrace = [];

function makeNode(label) {
  const target = function () {};
  let proxy;
  proxy = new Proxy(target, {
    apply() {
      return proxy;
    },
    get(_target, property) {
      if (property === "length") return 1;
      if (property === Symbol.iterator) return function* () {};
      if (property === "sortable") {
        return (...args) => (args[0] === "toArray" ? [] : proxy);
      }
      if (["val", "prop", "attr"].includes(property)) {
        return (...args) => (args.length === 0 ? "" : proxy);
      }
      if (property === "is") return () => false;
      if (property === "remove") {
        return () => {
          domTrace.push(`remove:${label}`);
          return proxy;
        };
      }
      return (...args) => {
        domTrace.push(`${String(property)}:${label}:${args.length}`);
        return proxy;
      };
    },
  });
  return proxy;
}

function jquery(value) {
  domTrace.push(`select:${String(value)}`);
  return makeNode(String(value));
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;

const document = {
  documentElement: { scrollTop: 28 },
  body: { scrollTop: 6 },
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => makeNode("created-element"),
  getElementById: (id) => domElements.get(id) ?? null,
};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  confirm: () => true,
  document,
  localStorage: {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, String(value)),
  },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: jquery,
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

const boundaries = hooks.remainingUiBoundaries;
assert.deepEqual(Object.keys(boundaries), [
  "storage",
  "magic",
  "jobs",
  "weighting",
  "building",
  "options",
  "prestigeTopBar",
  "totalDaysTopBar",
  "arpaToggles",
  "craftToggles",
  "buildingToggles",
  "ejectToggles",
  "supplyToggles",
]);

const trace = [];
const registrations = [];
const settingsRaw = { overrides: {}, triggers: [], logFilter: "" };
const settings = { showSettings: true, displayTotalDaysTypeInTopBar: false };
const state = { buildingToggles: 0 };

const resetStubs = {};
const updateStubs = {};
for (const name of ["Storage", "Magic", "Job", "Weighting", "Building"]) {
  resetStubs[`reset${name}Settings`] = (reset) =>
    trace.push(`reset:${name.toLowerCase()}:${reset}`);
  updateStubs[`update${name}SettingsContent`] = (...args) =>
    trace.push(`update:${name.toLowerCase()}:${args.join("|")}`);
}

function buildSettingsSection(...args) {
  registrations.push({ kind: "primary", args });
}
function buildSettingsSection2(...args) {
  registrations.push({ kind: "secondary", args });
}

hooks.setRemainingUiBoundariesTestContext({
  $: jquery,
  settingsRaw,
  settings,
  game: { global: { stats: { days: 123 } } },
  state,
  resources: {},
  jobs: {},
  craftablesList: [{ id: "Plywood" }],
  StorageManager: { priorityList: [] },
  AlchemyManager: { priorityList: [] },
  RitualManager: { priorityList: [] },
  JobManager: { priorityList: [] },
  BuildingManager: { priorityList: [{ _vueBinding: "city1" }] },
  ProjectManager: { priorityList: [{ id: "Physics" }] },
  EjectManager: { priorityList: [{ id: "Iron" }] },
  SupplyManager: { priorityList: [{ id: "Coal" }] },
  buildSettingsSection,
  buildSettingsSection2,
  resetCheckbox: (...keys) => trace.push(`checkbox:${keys.join("|")}`),
  removeStorageToggles: () => trace.push("cleanup:storage"),
  removeBuildingToggles: () => trace.push("cleanup:building"),
  removeArpaToggles: () => trace.push("cleanup:arpa"),
  removeCraftToggles: () => trace.push("cleanup:craft"),
  removeEjectToggles: () => trace.push("cleanup:eject"),
  removeSupplyToggles: () => trace.push("cleanup:supply"),
  addToggleCallbacks: (node, key) => {
    trace.push(`toggle:${key}`);
    return node;
  },
  addOptionUI: (id, selector, title) =>
    trace.push(`option:${id}:${selector}:${title}`),
  ...resetStubs,
  ...updateStubs,
});

const settingsSpecs = [
  ["storage", "buildStorageSettings", "storage", "Storage", false],
  ["magic", "buildMagicSettings", "magic", "Magic", false],
  ["jobs", "buildJobSettings", "job", "Job", false],
  [
    "weighting",
    "buildWeightingSettings",
    "weighting",
    "AutoBuild Weighting",
    false,
  ],
  ["building", "buildBuildingSettings", "building", "Building", false],
];
const parentNode = makeNode("parent");
for (const [boundaryName, buildName, id, label, secondary] of settingsSpecs) {
  if (secondary) boundaries[boundaryName][buildName](parentNode, "");
  else boundaries[boundaryName][buildName]();
  const registration = registrations.at(-1);
  assert.equal(registration.kind, secondary ? "secondary" : "primary");
  assert.equal(registration.args[secondary ? 2 : 0], id);
  assert.equal(registration.args[secondary ? 3 : 1], label);
}

for (const registration of registrations) {
  registration.args[registration.kind === "secondary" ? 4 : 2]();
}
assert.deepEqual(
  trace.filter((entry) => /^(reset|update|checkbox|cleanup):/.test(entry)),
  [
    "reset:storage:true",
    "update:storage:",
    "checkbox:autoStorage",
    "cleanup:storage",
    "reset:magic:true",
    "update:magic:",
    "checkbox:autoAlchemy|autoPylon|magicFullmetalHelper",
    "reset:job:true",
    "update:job:",
    "checkbox:autoJobs|autoCraftsmen",
    "reset:weighting:true",
    "update:weighting:",
    "reset:building:true",
    "update:building:",
    "checkbox:autoBuild|autoPower",
    "cleanup:building",
  ],
);

trace.length = 0;
boundaries.options.updateOptionsUI();
assert.deepEqual(trace, [
  "option:s-government-options:#government .tabs ul:Government",
  "option:s-foreign-options:#garrison div h2:Foreign Affairs",
  "option:s-foreign-options2:#c_garrison div h2:Foreign Affairs",
  "option:s-hell-options:#gFort div h3:Hell",
  "option:s-hell-options2:#prtl_fortress div h3:Hell",
  "option:s-fleet-options:#hfleet h3:Fleet",
]);

trace.length = 0;
boundaries.arpaToggles.createArpaToggles();
boundaries.craftToggles.createCraftToggles();
boundaries.buildingToggles.createBuildingToggles();
boundaries.ejectToggles.createEjectToggles();
boundaries.supplyToggles.createSupplyToggles();
assert.deepEqual(trace, [
  "cleanup:arpa",
  "toggle:arpa_Physics",
  "cleanup:craft",
  "toggle:craftPlywood",
  "cleanup:building",
  "toggle:batcity1",
  "cleanup:eject",
  "toggle:res_ejectIron",
  "cleanup:supply",
  "toggle:res_supplyCoal",
]);
assert.equal(state.buildingToggles, 1);

const prestigeNode = { remove: () => trace.push("topbar:removePrestige") };
const totalDaysNode = { remove: () => trace.push("topbar:removeDays") };
const totalDaysCount = { textContent: "" };
domElements.set("s-prestige-type", prestigeNode);
domElements.set("s-total-days", totalDaysNode);
domElements.set("s-total-days-count", totalDaysCount);
trace.length = 0;
boundaries.prestigeTopBar.removePrestigeFromTopBar();
boundaries.totalDaysTopBar.updateTotalDaysInTopBar();
assert.deepEqual(trace, ["topbar:removePrestige", "topbar:removeDays"]);
assert.equal(totalDaysCount.textContent, 123);

domTrace.length = 0;
hooks.setRemainingUiBoundariesTestContext({
  removeArpaToggles: undefined,
  removeCraftToggles: undefined,
  removeBuildingToggles: undefined,
  removeEjectToggles: undefined,
  removeSupplyToggles: undefined,
});
boundaries.arpaToggles.removeArpaToggles();
boundaries.craftToggles.removeCraftToggles();
boundaries.buildingToggles.removeBuildingToggles();
boundaries.ejectToggles.removeEjectToggles();
boundaries.supplyToggles.removeSupplyToggles();
assert.ok(domTrace.includes("remove:#arpaPhysics .ea-arpa-toggle"));
assert.ok(domTrace.includes("remove:#resources .ea-craft-toggle"));
assert.ok(domTrace.includes("remove:#mTabCivil .ea-building-toggle"));
assert.ok(domTrace.includes("remove:#resEjector .ea-eject-toggle"));
assert.ok(domTrace.includes("remove:#resCargo .ea-supply-toggle"));

const inline = hooks.finalInlineUiBoundaries;
assert.deepEqual(Object.keys(inline), [
  "updateActiveTargetsUI",
  "buildActiveTargetsUI",
  "removeActiveTargetsUI",
  "buildBuildPlannerUI",
  "removeBuildPlannerUI",
  "createMechInfo",
  "removeMechInfo",
  "createMarketToggles",
  "removeMarketToggles",
  "createStorageToggles",
  "removeStorageToggles",
]);

hooks.setFinalInlineUiBoundariesTestContext({
  settingsRaw: {
    buyIron: true,
    sellIron: false,
    res_trade_buy_Iron: true,
    res_trade_sell_Iron: false,
    res_storageIron: true,
    res_storage_o_Iron: false,
  },
  state: { plannerStats: {} },
  game: {
    global: {
      race: {},
      portal: { mechbay: { mechs: [] } },
    },
    loc: (key) => `loc:${key}`,
  },
  resources: { Food: { id: "Food" }, Iron: { id: "Iron" } },
  MarketManager: { priorityList: [{ id: "Iron" }] },
  StorageManager: { priorityList: [{ id: "Iron" }] },
  MechManager: {
    isActive: false,
    initLab: () => false,
    mechObserver: { disconnect: () => domTrace.push("mech:disconnect") },
  },
});

domTrace.length = 0;
inline.buildActiveTargetsUI();
inline.removeActiveTargetsUI();
inline.buildBuildPlannerUI();
inline.removeBuildPlannerUI();
inline.createMechInfo();
inline.removeMechInfo();
inline.createMarketToggles();
inline.removeMarketToggles();
inline.createStorageToggles();
inline.removeStorageToggles();
assert.ok(
  domTrace.some(
    (entry) =>
      entry.startsWith("select:") && entry.includes("active_targets-wrapper"),
  ),
);
assert.ok(
  domTrace.some(
    (entry) =>
      entry.startsWith("select:") && entry.includes("script_planner-wrapper"),
  ),
);
assert.ok(domTrace.includes("mech:disconnect"));
for (const key of [
  "buyIron",
  "sellIron",
  "res_trade_buy_Iron",
  "res_trade_sell_Iron",
  "res_storageIron",
  "res_storage_o_Iron",
]) {
  assert.ok(
    domTrace.some((entry) => entry.includes(`script_${key}`)),
    `missing inline toggle ${key}`,
  );
}
assert.ok(domTrace.includes("remove:#market .ea-market-toggle"));
assert.ok(domTrace.includes("remove:#script_market_top_row"));
assert.ok(domTrace.includes("remove:#resStorage .ea-storage-toggle"));
assert.ok(domTrace.includes("remove:#script_storage_top_row"));

console.log("Next 13 UI-boundary bundled characterization tests passed");
