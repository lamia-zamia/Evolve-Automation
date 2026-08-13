import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const handlers = new Map();
const sortableHandlers = new Map();
let trace = [];
let controls = [];
let addedClasses = [];
let sortableIds = ["wood", "coal"];

function compact(value) {
  return value.replace(/\s+/g, " ").trim();
}

function htmlLabel(value) {
  if (typeof value !== "string") {
    return value?.label ?? "<node>";
  }
  if (value.includes('id="script_productionSettings"')) {
    return "section:production";
  }
  const background = value.match(/script_bg_([A-Za-z0-9_]+)/u)?.[1];
  if (background) {
    const type = value.includes("<select")
      ? "select"
      : value.includes('type="checkbox"')
        ? "toggle"
        : "number";
    return `control:${type}:${background}`;
  }
  const tableControl = value.match(/class="script_([A-Za-z0-9_]+)"/u)?.[1];
  if (tableControl) {
    return `${value.includes('type="checkbox"') ? "table-toggle" : "table-input"}:${tableControl}`;
  }
  const table = value.match(/<tbody id="([A-Za-z0-9_]+)"/u)?.[1];
  if (table) {
    return `table:${table}`;
  }
  const rowIds = [...value.matchAll(/id="([A-Za-z0-9_]+)"/gu)].map(
    (match) => match[1],
  );
  if (rowIds.length) {
    return `rows:${rowIds.join(",")}`;
  }
  if (value.includes("<span")) {
    return `label:${compact(value.replace(/<[^>]+>/gu, ""))}`;
  }
  return compact(value);
}

function makeWrapper(label, parent = null) {
  return {
    label,
    length: 1,
    ready() {
      return this;
    },
    empty() {
      trace.push(`empty:${label}`);
      return this;
    },
    off(events) {
      trace.push(`off:${label}:${events}`);
      return this;
    },
    append(value) {
      trace.push(`append:${label}:${htmlLabel(value)}`);
      return this;
    },
    appendTo(node) {
      trace.push(`appendTo:${label}:${node.label}`);
      return this;
    },
    toggleClass(name, enabled) {
      trace.push(`toggleClass:${label}:${name}:${enabled}`);
      return this;
    },
    addClass(name) {
      addedClasses.push(name);
      trace.push(`addClass:${label}:${name}`);
      return this;
    },
    removeClass(name) {
      trace.push(`removeClass:${label}:${name}`);
      return this;
    },
    on(event, ...args) {
      const delegated = typeof args[0] === "string" ? args[0] : "";
      const handler = args.at(-1);
      handlers.set(`${label}:${event}:${delegated}`, handler);
      trace.push(`on:${label}:${event}:${delegated || "-"}`);
      return this;
    },
    find(selector) {
      trace.push(`find:${label}:${selector}`);
      return makeWrapper(`${label}|find:${selector}`, this);
    },
    end() {
      return parent ?? this;
    },
    val(value) {
      trace.push(`val:${label}:${value}`);
      return this;
    },
    prop(name, value) {
      trace.push(`prop:${label}:${name}:${value}`);
      return this;
    },
    next() {
      return makeWrapper(`${label}>next`);
    },
    is(selector) {
      trace.push(`is:${label}:${selector}`);
      return true;
    },
    sortable(arg) {
      if (typeof arg === "string") {
        trace.push(`sortable:${label}:${arg}`);
        return sortableIds;
      }
      sortableHandlers.set(label, arg.update);
      trace.push(`sortable:${label}:init`);
      return this;
    },
    remove() {
      trace.push(`remove:${label}`);
      return this;
    },
  };
}

function jquery(value) {
  const label = htmlLabel(value);
  if (label.startsWith("control:")) {
    controls.push(label);
  }
  trace.push(`select:${label}`);
  return makeWrapper(label);
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;

const triggerElement = {
  classList: { toggle() {} },
  nextElementSibling: { style: {} },
};
const document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 0 },
  querySelector: () => null,
  getElementById: () => triggerElement,
};
const stored = new Map();
const { hooks } = await loadCharacterizationBundle({
  console,
  confirm: () => true,
  document,
  localStorage: {
    getItem: (key) => stored.get(key) ?? null,
    setItem(key, value) {
      stored.set(key, value);
      trace.push(`store:${key}`);
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
});

const resource = (id, name = id) => ({ id, name });
const resources = {
  Plywood: resource("Plywood"),
  Brick: resource("Brick"),
  Wrought_Iron: resource("Wrought_Iron"),
  Sheet_Metal: resource("Sheet_Metal"),
  Mythril: resource("Mythril"),
  Aerogel: resource("Aerogel"),
  Nanoweave: resource("Nanoweave"),
  Scarletite: resource("Scarletite"),
  Quantium: resource("Quantium"),
};
const craftablesList = [
  resources.Plywood,
  resources.Scarletite,
  resources.Quantium,
];
const SmelterManager = {
  Fuels: {
    Coal: { id: "coal" },
    Wood: { id: "wood" },
  },
  managedFuelPriorityList: () => [{ id: "coal" }, { id: "wood" }],
};
const factoryProduct = (id) => ({ resource: resource(id) });
const FactoryManager = {
  Productions: Object.fromEntries(
    ["LuxuryGoods", "Furs", "Alloy", "Polymer", "NanoTube", "Stanene"].map(
      (id) => [id, factoryProduct(id)],
    ),
  ),
};
const DroidManager = {
  Productions: Object.fromEntries(
    ["Adamantite", "Aluminium", "Uranium", "Coal"].map((id) => [
      id,
      factoryProduct(id),
    ]),
  ),
};
const ReplicatorManager = {
  Productions: Object.fromEntries(
    ["Food", "Iron"].map((id) => [id, { id, resource: resource(id) }]),
  ),
};
const settingsRaw = {
  overrides: {},
  triggers: [],
  productionSettingsCollapsed: true,
  productionSmelting: "storage",
  productionFoundryWeighting: "buildings",
  productionCraftsmen: "advanced",
  productionFactoryWeighting: "demanded",
  replicatorWeightingMode: "quantity",
};

hooks.setProductionSettingsTestContext({
  settingsRaw,
  resources,
  craftablesList,
  SmelterManager,
  FactoryManager,
  DroidManager,
  ReplicatorManager,
});
assert.deepEqual(Object.keys(hooks.productionSettings), [
  "buildProductionSettings",
  "updateProductionSettingsContent",
  "updateProductionTableSmelter",
  "updateProductionTableFoundry",
  "updateProductionTableFactory",
  "updateProductionTableMiningDrone",
  "updateProductionTableReplicator",
]);

trace = [];
controls = [];
addedClasses = [];
document.documentElement.scrollTop = 63;
document.body.scrollTop = 8;
hooks.productionSettings.updateProductionSettingsContent();

assert.deepEqual(controls, [
  "control:number:productionChrysotileWeight",
  "control:number:productionAdamantiteWeight",
  "control:number:productionExtWeight_common",
  "control:number:productionExtWeight_uncommon",
  "control:number:productionExtWeight_rare",
  "control:toggle:productionFactoryFocusMaterials",
  "control:select:productionSmelting",
  "control:number:productionSmeltingIridium",
  "control:select:productionFoundryWeighting",
  "control:select:productionCraftsmen",
  "control:select:productionFactoryWeighting",
  "control:number:productionFactoryMinIngredients",
  "control:toggle:replicatorAssignGovernorTask",
  "control:select:replicatorWeightingMode",
]);
assert.deepEqual(
  trace
    .filter((entry) => entry.startsWith("append:#script_productionContent:"))
    .map((entry) => entry.replace("append:#script_productionContent:", "")),
  [
    "label:Smelter",
    "table:script_productionTableBodySmelter",
    "label:Foundry",
    "table:script_productionTableBodyFoundry",
    "label:Factory",
    "table:script_productionTableBodyFactory",
    "label:Mining Droid",
    "table:script_productionTableBodyMiningDrone",
    "label:Replicator",
    "table:script_productionTableBodyReplicator",
  ],
);
assert.ok(addedClasses.includes("script_bg_craftPlywood"));
assert.ok(addedClasses.includes("script_bg_job_Scarletite"));
assert.ok(addedClasses.includes("script_bg_production_LuxuryGoods"));
assert.ok(addedClasses.includes("script_bg_droid_w_Adamantite"));
assert.ok(addedClasses.includes("script_bg_replicator_p_Food"));
assert.ok(
  trace.includes(
    "append:#script_foundry_Scarletite>next>next>next:label:Managed",
  ),
);
assert.ok(
  trace.includes(
    "append:#script_foundry_Quantium>next>next>next:label:Managed",
  ),
);
assert.equal(document.documentElement.scrollTop, 63);
assert.equal(document.body.scrollTop, 63);

const smelterSortable = "#script_productionTableBodySmelter";
assert.equal(typeof sortableHandlers.get(smelterSortable), "function");
sortableHandlers.get(smelterSortable)();
assert.equal(settingsRaw.smelter_fuel_p_wood, 0);
assert.equal(settingsRaw.smelter_fuel_p_coal, 1);
assert.ok(trace.includes("store:settings"));

trace = [];
hooks.productionSettings.buildProductionSettings();
assert.ok(trace.includes("append:#script_settings:section:production"));
assert.ok(
  handlers.has("section:production|find:> #productionSettingsCollapsed:click:"),
);
assert.ok(
  handlers.has("section:production|find:#script_resetproduction:click:"),
);

console.log("Production settings bundled characterization tests passed");
