import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const storageTrace = [];
const storageValues = new Map();

function makeNode(label = "node") {
  const target = function () {};
  let proxy;
  proxy = new Proxy(target, {
    apply() {
      return proxy;
    },
    get(_target, property) {
      if (property === "length") return 0;
      if (property === Symbol.iterator) return function* () {};
      if (property === "sortable") {
        return (...args) => (args[0] === "toArray" ? [] : proxy);
      }
      if (property === "val" || property === "prop" || property === "attr") {
        return (...args) => (args.length === 0 ? "" : proxy);
      }
      if (property === "data") return () => undefined;
      if (property === "is") return () => false;
      if (property === "toString") return () => label;
      return () => proxy;
    },
  });
  return proxy;
}

function jquery(value) {
  return makeNode(String(value));
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;

const document = {
  documentElement: { scrollTop: 31 },
  body: { scrollTop: 7 },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  confirm: () => true,
  document,
  localStorage: {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem(key, value) {
      storageValues.set(key, String(value));
      storageTrace.push(`storage:${key}`);
    },
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

const boundaries = hooks.settingsBoundaries;
assert.deepEqual(Object.keys(boundaries), [
  "general",
  "achievementGuard",
  "challengeHelper",
  "prestige",
  "government",
  "authority",
  "evolution",
  "planet",
  "trigger",
  "research",
  "war",
  "hell",
  "fleet",
  "mech",
  "ejector",
  "market",
]);

const trace = [];
const registrations = [];
const updateStubs = {};
const resetStubs = {};

for (const name of Object.keys(boundaries)) {
  const updateName = Object.keys(boundaries[name]).find(
    (key) => key.startsWith("update") && key.endsWith("SettingsContent"),
  );
  updateStubs[updateName] = (...args) =>
    trace.push(`update:${name}:${args.join("|")}`);
  const resetName = `reset${
    name === "achievementGuard"
      ? "AchievementGuard"
      : name === "challengeHelper"
        ? "ChallengeHelper"
        : name[0].toUpperCase() + name.slice(1)
  }Settings`;
  resetStubs[resetName] = (reset) => trace.push(`reset:${name}:${reset}`);
}

function buildSettingsSection(...args) {
  registrations.push({
    kind: "primary",
    id: args[0],
    label: args[1],
    reset: args[2],
    update: args[3],
  });
}

function buildSettingsSection2(...args) {
  registrations.push({
    kind: "secondary",
    prefix: args[1],
    id: args[2],
    label: args[3],
    reset: args[4],
    update: args[5],
  });
}

hooks.setSettingsBoundariesTestContext({
  $: jquery,
  settingsRaw: { overrides: {}, triggers: [] },
  settings: {},
  game: { global: {} },
  state: {},
  resources: {},
  races: {},
  buildings: {},
  techIds: {},
  poly: { galaxyOffers: [], loc: (key) => key },
  GovernmentManager: {},
  TriggerManager: { Triggers: [], priorityList: [] },
  SpyManager: {},
  FleetManagerOuter: {},
  MechManager: {},
  EjectManager: { priorityList: [] },
  NaniteManager: { priorityList: [] },
  SupplyManager: { priorityList: [] },
  MarketManager: { priorityList: [] },
  buildSettingsSection,
  buildSettingsSection2,
  resetCheckbox: (...keys) => trace.push(`checkbox:${keys.join("|")}`),
  removeMechInfo: () => trace.push("remove:mechInfo"),
  removeEjectToggles: () => trace.push("remove:ejectToggles"),
  removeSupplyToggles: () => trace.push("remove:supplyToggles"),
  removeMarketToggles: () => trace.push("remove:marketToggles"),
  ...updateStubs,
  ...resetStubs,
});

const parentNode = makeNode("parent");
const secondary = new Set(["prestige", "government", "war", "hell", "fleet"]);
for (const [name, functions] of Object.entries(boundaries)) {
  const build = Object.entries(functions).find(([key]) =>
    key.startsWith("build"),
  )[1];
  if (secondary.has(name)) build(parentNode, "");
  else build();
}

assert.deepEqual(
  registrations.map(({ kind, prefix, id, label }) => ({
    kind,
    ...(kind === "secondary" ? { prefix } : {}),
    id,
    label,
  })),
  [
    { kind: "primary", id: "general", label: "General" },
    {
      kind: "primary",
      id: "achievementGuard",
      label: "Achievement Guard",
    },
    {
      kind: "primary",
      id: "challengeHelper",
      label: "Challenge Helper",
    },
    { kind: "secondary", prefix: "", id: "prestige", label: "Prestige" },
    {
      kind: "secondary",
      prefix: "",
      id: "government",
      label: "Government",
    },
    { kind: "primary", id: "authority", label: "Authority" },
    { kind: "primary", id: "evolution", label: "Evolution" },
    { kind: "primary", id: "planet", label: "Planet Weighting" },
    { kind: "primary", id: "trigger", label: "Trigger" },
    { kind: "primary", id: "research", label: "Research" },
    {
      kind: "secondary",
      prefix: "",
      id: "war",
      label: "Foreign Affairs",
    },
    { kind: "secondary", prefix: "", id: "hell", label: "Hell" },
    { kind: "secondary", prefix: "", id: "fleet", label: "Fleet" },
    { kind: "primary", id: "mech", label: "Mech & Spire" },
    {
      kind: "primary",
      id: "ejector",
      label: "Ejector, Supply & Nanite",
    },
    { kind: "primary", id: "market", label: "Market" },
  ],
);

for (const registration of registrations) registration.reset();

const behavioralTrace = trace.filter(
  (entry) =>
    entry.startsWith("reset:") ||
    entry.startsWith("update:") ||
    entry.startsWith("checkbox:") ||
    entry.startsWith("remove:"),
);
assert.deepEqual(behavioralTrace, [
  "reset:general:true",
  "update:general:",
  "checkbox:masterScriptToggle|showSettings|autoPrestige",
  "reset:achievementGuard:true",
  "update:achievementGuard:",
  "reset:challengeHelper:true",
  "update:challengeHelper:",
  "reset:prestige:true",
  "update:prestige:",
  "reset:government:true",
  "update:government:",
  "checkbox:autoTax|autoGovernment",
  "reset:authority:true",
  "update:authority:",
  "reset:evolution:true",
  "update:evolution:",
  "checkbox:autoEvolution",
  "reset:planet:true",
  "update:planet:",
  "reset:trigger:true",
  "update:trigger:",
  "checkbox:autoTrigger",
  "reset:research:true",
  "update:research:",
  "checkbox:autoResearch",
  "reset:war:true",
  "update:war:",
  "checkbox:autoFight",
  "reset:hell:true",
  "update:hell:",
  "checkbox:autoHell",
  "reset:fleet:true",
  "update:fleet:",
  "checkbox:autoFleet",
  "reset:mech:true",
  "update:mech:",
  "checkbox:autoMech",
  "remove:mechInfo",
  "reset:ejector:true",
  "update:ejector:",
  "checkbox:autoEject|autoSupply|autoNanite",
  "remove:ejectToggles",
  "remove:supplyToggles",
  "reset:market:true",
  "update:market:",
  "checkbox:autoMarket|autoGalaxyMarket",
  "remove:marketToggles",
]);

assert.ok(storageTrace.length >= 16);
console.log("16 settings-boundary bundled characterization tests passed");
