import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const trace = [];
const handlers = [];

function makeNode(label, length = 1) {
  const target = function () {};
  let proxy;
  proxy = new Proxy(target, {
    apply() {
      return proxy;
    },
    get(_target, property) {
      if (property === "length") return length;
      if (property === "label") return label;
      if (property === Symbol.iterator) return function* () {};
      if (property === "on") {
        return (...args) => {
          handlers.push({ label, args });
          return proxy;
        };
      }
      if (property === "find")
        return (selector) => makeNode(`${label} ${selector}`);
      if (property === "last") return () => proxy;
      if (property === "append") {
        return (...args) => {
          const value =
            typeof args[0] === "string" ? args[0] : args[0]?.label || "object";
          trace.push(`append:${label}:${value}`);
          return proxy;
        };
      }
      if (["val", "prop", "attr", "text", "html", "is"].includes(property)) {
        return (...args) => {
          trace.push(`${String(property)}:${label}:${args.join("|")}`);
          if (property === "is") return false;
          return args.length === 0 ? "" : proxy;
        };
      }
      return (...args) => {
        trace.push(`${String(property)}:${label}:${args.length}`);
        return proxy;
      };
    },
  });
  return proxy;
}

function jquery(value) {
  const label = typeof value === "string" ? value : value?.label || "object";
  trace.push(`select:${label}`);
  return makeNode(label, label === "#script_settings" ? 0 : 1);
}
jquery.isEmptyObject = (value) => Object.keys(value).length === 0;
jquery.ui = { autocomplete: { escapeRegex: (value) => value } };

const document = {
  hidden: false,
  documentElement: { scrollTop: 10 },
  body: { scrollTop: 4 },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: () => ({}),
  execCommand: () => true,
};
const { hooks } = await loadCharacterizationBundle({
  console,
  confirm: () => true,
  alert: () => {},
  document,
  localStorage: { getItem: () => null, setItem() {} },
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

const controls = hooks.settingsControls;
assert.equal(Object.keys(controls).length, 42);
assert.equal(controls.prestigeTypes[0].val, "none");
assert.match(controls.prestigeOptions, /Mutual Assured Destruction/);
assert.equal(controls.evaluateCheck("Number", "4.5"), "4.5");
assert.equal(controls.checkCompare[">="](4, 3), true);
assert.equal(controls.checkCustom["A?B"].includes("Var2"), true);
assert.equal(
  JSON.stringify(Object.keys(controls.argType)),
  JSON.stringify([
    "building_cost",
    "building",
    "research",
    "trait",
    "genus",
    "genus_ss",
    "project",
    "job",
    "job_servant",
    "resource",
    "race",
    "challenge",
    "universe",
    "government",
    "governor",
    "queue",
    "date",
    "soldiers",
    "tab",
    "biome",
    "ptrait",
    "industry",
    "other",
  ]),
);
assert.equal(
  JSON.stringify(Object.keys(controls.checkTypes)),
  JSON.stringify([
    "String",
    "Number",
    "Boolean",
    "SettingDefault",
    "SettingCurrent",
    "Eval",
    "BuildingCost",
    "BuildingUnlocked",
    "BuildingClickable",
    "BuildingAffordable",
    "BuildingCount",
    "BuildingEnabled",
    "BuildingDisabled",
    "BuildingQueued",
    "ProjectUnlocked",
    "ProjectCount",
    "ProjectProgress",
    "JobUnlocked",
    "JobCount",
    "JobMax",
    "JobWorkers",
    "JobServants",
    "ResearchUnlocked",
    "ResearchComplete",
    "ResourceUnlocked",
    "ResourceQuantity",
    "ResourceStorage",
    "ResourceMaxCost",
    "ResourceIncome",
    "ResourceRatio",
    "ResourceSatisfied",
    "ResourceSatisfyRatio",
    "ResourceDemanded",
    "RaceId",
    "RacePillared",
    "RaceGenus",
    "MimicGenus",
    "TraitLevel",
    "ResetType",
    "Challenge",
    "Universe",
    "Government",
    "Governor",
    "Queue",
    "Date",
    "Soldiers",
    "PlanetBiome",
    "PlanetTrait",
    "Industry",
    "Other",
  ]),
);

const settingsRaw = {
  overrides: {},
  demoSettingsCollapsed: true,
  enabled: true,
  amount: 12,
  text: "value",
  choice: "b",
};
hooks.setSettingsControlsTestContext({
  settingsRaw,
  settings: { scriptSettingsExportFilename: "settings.json" },
  game: { global: { settings: { civTabs: 0 } } },
  state: {},
  win: { prompt: () => {} },
});

const parent = makeNode("parent");
trace.length = 0;
controls.removeScriptSettings();
controls.buildScriptSettings();
controls.addStandardHeading(parent, "Heading");
controls.addSettingsHeader1(parent, "Header 1");
controls.addSettingsHeader2(parent, "Header 2");
controls.addSettingsToggle(parent, "enabled", "Enabled", "hint");
controls.addSettingsNumber(parent, "amount", "Amount", "hint");
controls.addSettingsString(parent, "text", "Text", "hint");
controls.addSettingsSelect(parent, "choice", "Choice", "hint", [
  { val: "a", label: "A" },
  { val: "b", label: "B", hint: "Bee" },
]);
controls.addTableInput(parent, "amount");
controls.addTableToggle(parent, "enabled");
controls.resetCheckbox("enabled");
assert.ok(trace.includes("remove:#script_settings:0"));
assert.ok(trace.some((entry) => entry.includes("append:parent")));
assert.ok(
  trace.some((entry) => entry.includes("prop:.script_enabled:checked|true")),
);
assert.equal(
  controls.buildSelectOptions([
    { val: "a", label: "A" },
    { val: "b", label: "B", hint: "Bee" },
  ]),
  '<option value="a" title="">A</option>,<option value="b" title="Bee">B</option>',
);

let secondaryUpdates = 0;
controls.buildSettingsSection(
  "demo",
  "Demo",
  () => {},
  () => {},
);
controls.buildSettingsSection2(
  parent,
  "secondary-",
  "demo",
  "Demo",
  () => {},
  () => secondaryUpdates++,
);
assert.equal(secondaryUpdates, 1);
assert.ok(
  trace.some((entry) => entry.includes('id="script_secondary-demoContent"')),
);

let resets = 0;
controls.genericResetFunction(() => resets++, "Demo");
assert.equal(resets, 1);
assert.equal(controls.buildTableLabel("note").length, 1);
assert.ok(handlers.some(({ args }) => args.includes("change")));
assert.ok(handlers.some(({ args }) => args.includes("click")));

console.log("Settings controls bundled characterization tests passed");
