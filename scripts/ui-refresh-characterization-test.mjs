import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const stored = new Map();
const selectorLengths = new Map();
const nextLengths = new Map();
const handlers = new Map();
let jqueryTrace = [];

function valueLabel(value) {
  if (typeof value !== "string") {
    return value?.selector ?? "<node>";
  }
  if (value.includes('id="autoScriptContainer"')) {
    return "automation-container";
  }
  if (value.includes("Safe mode active")) {
    return "safe-mode-warning";
  }
  if (value.includes('id="bulk-sell"')) {
    return "bulk-sell";
  }
  if (value.includes("Previous Game")) {
    return value.replace(/\s+/g, " ").trim();
  }
  return value.replace(/\s+/g, " ").trim();
}

function jquery(selector) {
  const label = typeof selector === "string" ? selector : "<node>";
  jqueryTrace.push(`select:${label}`);
  const wrapper = {
    selector: label,
    length: selectorLengths.get(label) ?? 0,
    ready() {
      return this;
    },
    append(value) {
      jqueryTrace.push(`append:${label}:${valueLabel(value)}`);
      return this;
    },
    toggleClass(name, enabled) {
      jqueryTrace.push(`toggleClass:${label}:${name}:${enabled}`);
      return this;
    },
    css(property, value) {
      jqueryTrace.push(`css:${label}:${property}:${value}`);
      return this;
    },
    on(event, ...args) {
      const handler = args.at(-1);
      handlers.set(`${label}:${event}`, handler);
      jqueryTrace.push(`on:${label}:${event}`);
      return this;
    },
    next() {
      jqueryTrace.push(`next:${label}`);
      return { length: nextLengths.get(label) ?? 0 };
    },
    parent() {
      jqueryTrace.push(`parent:${label}`);
      return {
        append(value) {
          jqueryTrace.push(`parentAppend:${label}:${valueLabel(value)}`);
        },
      };
    },
    eq(index) {
      jqueryTrace.push(`eq:${label}:${index}`);
      return {
        click() {
          jqueryTrace.push(`click:${label}:${index}`);
        },
      };
    },
    text(value) {
      jqueryTrace.push(`text:${label}:${value}`);
      return this;
    },
  };
  return wrapper;
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;

const document = {
  hidden: false,
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 0 },
  querySelector: () => null,
  getElementById: () => null,
};

const { hooks } = await loadCharacterizationBundle({
  console,
  localStorage: {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  document,
  $: jquery,
});

assert.equal(typeof hooks.updateUI, "function");
assert.equal(typeof hooks.setUIRefreshTestContext, "function");

const actionNames = [
  "createOptionsModal",
  "updateOptionsUI",
  "updatePrestigeInTopBar",
  "updateSettingsFromState",
  "buildScriptSettings",
  "removeScriptSettings",
  "createMechInfo",
  "removeMechInfo",
  "createCraftToggles",
  "removeCraftToggles",
  "createBuildingToggles",
  "removeBuildingToggles",
  "createArpaToggles",
  "removeArpaToggles",
  "createStorageToggles",
  "removeStorageToggles",
  "createMarketToggles",
  "removeMarketToggles",
  "createEjectToggles",
  "removeEjectToggles",
  "createSupplyToggles",
  "removeSupplyToggles",
  "buildActiveTargetsUI",
  "buildBuildPlannerUI",
  "updateDebugData",
  "updateScriptData",
  "finalizeScriptData",
  "updateTotalDaysInTopBar",
];

function makeActions(trace) {
  const actions = {};
  for (const name of actionNames) {
    const action = (...args) =>
      trace.push(args.length === 0 ? name : `${name}:${args.join(":")}`);
    action.label = name;
    actions[name] = action;
  }
  actions.autoMarket = (...args) => trace.push(`autoMarket:${args.join(":")}`);
  actions.autoMarket.label = "autoMarket";
  actions.getNiceNumber = (value) => {
    trace.push(`getNiceNumber:${value}`);
    return `nice(${value})`;
  };
  actions.getNiceNumber.label = "getNiceNumber";
  actions.createSettingToggle = (_node, key, _title, enabled, disabled) =>
    trace.push(
      `toggle:${key}:${enabled?.label ?? "-"}:${disabled?.label ?? "-"}`,
    );
  return actions;
}

function baseContext(overrides = {}) {
  const actionTrace = [];
  return {
    actionTrace,
    settings: { hellTurnOffLogMessages: false, ...overrides.settings },
    settingsRaw: {
      toggleSettingsCollapsed: false,
      activeTargetsUI: false,
      buildPlannerUI: false,
      showSettings: false,
      autoCraft: false,
      autoBuild: false,
      autoStorage: false,
      autoMarket: false,
      autoEject: false,
      autoSupply: false,
      autoARPA: false,
      autoMech: false,
      ...overrides.settingsRaw,
    },
    state: {
      buildingToggles: 0,
      scriptTick: 0,
      soulGemLast: 0,
      soulGemIncomes: [{ sec: 0, gems: 0 }],
      soulGemPerHour: 0,
      ...overrides.state,
    },
    game: {
      global: {
        settings: {},
        portal: {},
        ...overrides.gameGlobal,
      },
      loc: (key) => `loc:${key}`,
    },
    resources: {
      Soul_Gem: {
        isUnlocked: () => false,
        currentQuantity: 0,
        ...overrides.soulGem,
      },
    },
    win: {
      LZString: { decompressFromUTF16: (value) => value },
    },
    safeMode: overrides.safeMode ?? false,
    overrideKeyLabel: overrides.overrideKeyLabel ?? "Ctrl",
    actions: makeActions(actionTrace),
  };
}

function resetDom() {
  jqueryTrace = [];
  selectorLengths.clear();
  nextLengths.clear();
  handlers.clear();
  document.hidden = false;
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

// Hidden tabs are a complete short-circuit before action or DOM resolution.
resetDom();
document.hidden = true;
let context = baseContext();
hooks.setUIRefreshTestContext(context);
hooks.updateUI();
assert.deepEqual(context.actionTrace, []);
assert.deepEqual(jqueryTrace, []);

// Missing-container construction pins the complete toggle order and callback wiring, safe-mode
// warning, collapse handler, and bulk-market handler.
resetDom();
context = baseContext({
  safeMode: true,
  overrideKeyLabel: "Alt",
  settingsRaw: { toggleSettingsCollapsed: true },
});
selectorLengths.set("#autoScriptContainer", 0);
selectorLengths.set("#statsPanel .cstat", 0);
hooks.setUIRefreshTestContext(context);
hooks.updateUI();

const toggleKeys = [
  "masterScriptToggle",
  "showSettings",
  "autoPrestige",
  "autoEvolution",
  "autoFight",
  "autoHell",
  "autoMech",
  "autoFleet",
  "autoTax",
  "autoGovernment",
  "autoCraft",
  "autoTrigger",
  "autoBuild",
  "autoARPA",
  "autoPower",
  "autoStorage",
  "autoMarket",
  "autoGalaxyMarket",
  "autoResearch",
  "autoJobs",
  "autoCraftsmen",
  "autoAlchemy",
  "autoPylon",
  "autoQuarry",
  "autoMine",
  "autoExtractor",
  "autoSmelter",
  "autoFactory",
  "autoMiningDroid",
  "autoGraphenePlant",
  "autoGenetics",
  "autoMinorTrait",
  "autoMutateTraits",
  "autoEject",
  "autoSupply",
  "autoNanite",
  "autoReplicator",
];
const callbackLabels = {
  showSettings: ["buildScriptSettings", "removeScriptSettings"],
  autoMech: ["createMechInfo", "removeMechInfo"],
  autoCraft: ["createCraftToggles", "removeCraftToggles"],
  autoBuild: ["createBuildingToggles", "removeBuildingToggles"],
  autoARPA: ["createArpaToggles", "removeArpaToggles"],
  autoStorage: ["createStorageToggles", "removeStorageToggles"],
  autoMarket: ["createMarketToggles", "removeMarketToggles"],
  autoEject: ["createEjectToggles", "removeEjectToggles"],
  autoSupply: ["createSupplyToggles", "removeSupplyToggles"],
};
assert.deepEqual(context.actionTrace, [
  "createOptionsModal",
  "updateOptionsUI",
  "updatePrestigeInTopBar",
  ...toggleKeys.map((key) => {
    const callbacks = callbackLabels[key] ?? ["-", "-"];
    return `toggle:${key}:${callbacks[0]}:${callbacks[1]}`;
  }),
  "updateTotalDaysInTopBar",
]);
assert.deepEqual(jqueryTrace, [
  "select:#autoScriptContainer",
  "select:#resources",
  "append:#resources:automation-container",
  "select:#resources",
  "append:#resources:safe-mode-warning",
  "select:#toggleSettingsCollapsed",
  "select:#scriptToggles",
  "toggleClass:#toggleSettingsCollapsed:script-contentactive:false",
  "css:#scriptToggles:display:none",
  "on:#toggleSettingsCollapsed:click",
  "append:#scriptToggles:bulk-sell",
  "select:#bulk-sell",
  "on:#bulk-sell:mouseup",
  "next:#autoScriptContainer",
  "select:#statsPanel .cstat",
]);

handlers.get("#toggleSettingsCollapsed:click")();
assert.equal(context.settingsRaw.toggleSettingsCollapsed, false);
assert.deepEqual(context.actionTrace.slice(-1), ["updateSettingsFromState"]);
handlers.get("#bulk-sell:mouseup")();
assert.deepEqual(context.actionTrace.slice(-4), [
  "updateDebugData",
  "updateScriptData",
  "finalizeScriptData",
  "autoMarket:true:true",
]);

// Existing-container repair covers every feature adapter, reordering, Hell notification clicks,
// Soul Gem sampling/display, prior-run stats, and scroll restoration.
resetDom();
selectorLengths.set("#autoScriptContainer", 1);
nextLengths.set("#autoScriptContainer", 1);
for (const selector of [
  "#active_targets-wrapper",
  "#script_planner-wrapper",
  "#script_settings",
  "#resources .ea-craft-toggle",
  "#mTabCivil .ea-building-toggle",
  "#resStorage .ea-storage-toggle",
  "#market .ea-market-toggle",
  "#resEjector .ea-eject-toggle",
  "#resCargo .ea-supply-toggle",
  "#arpaPhysics .ea-arpa-toggle",
]) {
  selectorLengths.set(selector, 0);
}
selectorLengths.set("#mechList .ea-mech-info", 1);
selectorLengths.set("#mechList .mechRow", 2);
selectorLengths.set("#statsPanel .cstat", 1);
document.documentElement.scrollTop = 120;
document.body.scrollTop = 30;
stored.set(
  "evolveBak",
  JSON.stringify({
    stats: {
      know: 1,
      starved: 2,
      died: 3,
      attacks: 4,
      days: 5,
      dkills: 6,
      sac: 0,
      murders: 7,
      psykill: 0,
    },
  }),
);
context = baseContext({
  settings: { hellTurnOffLogMessages: true },
  settingsRaw: {
    activeTargetsUI: true,
    buildPlannerUI: true,
    showSettings: true,
    autoCraft: true,
    autoBuild: true,
    autoStorage: true,
    autoMarket: true,
    autoEject: true,
    autoSupply: true,
    autoARPA: true,
    autoMech: true,
  },
  state: {
    buildingToggles: 2,
    scriptTick: 400,
    soulGemLast: 5,
    soulGemIncomes: [{ sec: 0, gems: 2 }],
  },
  gameGlobal: {
    settings: {
      showStorage: true,
      showMarket: true,
      showEjector: true,
      showCargo: true,
      showGenetics: true,
      showMechLab: true,
    },
    portal: { fortress: { notify: "Yes", s_ntfy: "Yes" } },
  },
  soulGem: { isUnlocked: () => true, currentQuantity: 8 },
});
hooks.setUIRefreshTestContext(context);
hooks.updateUI();
assert.deepEqual(context.actionTrace, [
  "createOptionsModal",
  "updateOptionsUI",
  "updatePrestigeInTopBar",
  "buildActiveTargetsUI",
  "buildBuildPlannerUI",
  "buildScriptSettings",
  "createCraftToggles",
  "createBuildingToggles",
  "createStorageToggles",
  "createMarketToggles",
  "createEjectToggles",
  "createSupplyToggles",
  "createArpaToggles",
  "createMechInfo",
  "getNiceNumber:180",
  "updateTotalDaysInTopBar",
]);
assert.deepEqual(JSON.parse(JSON.stringify(context.state.soulGemIncomes)), [
  { sec: 0, gems: 2 },
  { sec: 100, gems: 3 },
]);
assert.equal(context.state.soulGemLast, 8);
assert.equal(context.state.soulGemPerHour, 180);
assert.equal(document.documentElement.scrollTop, 120);
assert.equal(document.body.scrollTop, 120);
assert.ok(
  jqueryTrace.includes(
    "parentAppend:#autoScriptContainer:#autoScriptContainer",
  ),
);
assert.ok(jqueryTrace.includes("click:#fort .b-checkbox:0"));
assert.ok(jqueryTrace.includes("click:#fort .b-checkbox:1"));
assert.ok(jqueryTrace.includes("text:#resSoul_Gem span:eq(2):~nice(180) /h"));
assert.ok(
  jqueryTrace.some(
    (entry) =>
      entry.startsWith("append:#statsPanel:") &&
      entry.includes("Previous Game") &&
      entry.includes("loc:achieve_stats_demons_kills"),
  ),
);

console.log("UI refresh bundled characterization tests passed");
