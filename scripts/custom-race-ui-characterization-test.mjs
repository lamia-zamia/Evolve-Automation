import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const trace = [];
let labButton = null;

function makeNode(label) {
  const values = new Map();
  const target = function () {};
  let proxy;
  proxy = new Proxy(target, {
    apply() {
      return proxy;
    },
    get(_target, property) {
      if (property === "length") return label.includes("ImportStatus") ? 0 : 1;
      if (property === "label") return label;
      if (property === Symbol.iterator) return function* () {};
      if (property === "each") {
        return (callback) => {
          callback.call({ label: "preset-select" });
          return proxy;
        };
      }
      if (["val", "text", "html", "attr", "prop"].includes(property)) {
        return (...args) => {
          if (args.length === 0) return values.get(property) ?? "";
          values.set(property, args[0]);
          trace.push(`${String(property)}:${label}:${String(args[0])}`);
          return proxy;
        };
      }
      if (property === "append") {
        return (...args) => {
          trace.push(`append:${label}:${String(args[0])}`);
          return proxy;
        };
      }
      return (...args) => {
        trace.push(`${String(property)}:${label}:${args.length}`);
        return proxy;
      };
    },
  });
  proxy.label = label;
  return proxy;
}

function jquery(value) {
  const label = typeof value === "string" ? value : value?.label || "object";
  trace.push(`select:${label}`);
  return makeNode(label);
}
jquery.isEmptyObject = (value) => Object.keys(value).length === 0;

const document = {
  hidden: false,
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 0 },
  querySelector: (selector) =>
    selector === "#celestialLab .create button" ? labButton : null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: () => ({}),
};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  confirm: () => true,
  alert: (message) => trace.push(`alert:${message}`),
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
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.deepEqual(Object.keys(hooks.customRaceUI), [
  "showCustomRaceImportStatus",
  "getCustomRacePreset",
  "refreshCustomRacePresetSelectors",
  "buildCustomRacePresetEditor",
  "importCustomRaceIntoLab",
  "automateLab",
]);

const settingsRaw = {
  prestigeCustomRacePresets: [
    { name: " General ", json: " {bad" },
    { name: "Second", json: '{"genus":"humanoid"}' },
  ],
  prestigeCustomRacePreset: "0",
};
const settings = {
  ...settingsRaw,
  masterScriptToggle: false,
  autoPrestige: false,
};
const state = { customRaceImportAttempt: null };
const game = {
  global: {
    stats: { achieve: {} },
    race: { species: "human", universe: "standard" },
    civic: { govern: { type: "democracy" } },
    custom: {},
  },
  traits: {},
  races: {},
  actions: {
    city: {
      coal_power: { powered: () => 0 },
      oil_power: { powered: () => 0 },
    },
  },
  loc: (key) => key,
};
const poly = {
  genus_traits: { humanoid: {} },
  loc: (key) => key,
};
hooks.setCustomRaceUITestContext({
  settingsRaw,
  settings,
  state,
  game,
  poly,
  resources: {},
  races: { human: { genus: "humanoid" } },
  win: { document: { getElementById: () => null } },
});

assert.equal(
  JSON.stringify(hooks.customRaceUI.getCustomRacePreset(true)),
  JSON.stringify({ name: "General", json: "{bad" }),
);
settings.prestigeCustomRacePreset = "99";
assert.equal(
  JSON.stringify(hooks.customRaceUI.getCustomRacePreset()),
  JSON.stringify({ name: "General", json: "{bad" }),
);

trace.length = 0;
hooks.customRaceUI.showCustomRaceImportStatus("Paused", true);
assert.ok(
  trace.some(
    (entry) =>
      entry === 'text:<p id="scriptCustomRaceImportStatus"></p>:Paused',
  ),
);
assert.ok(
  trace.includes('toggleClass:<p id="scriptCustomRaceImportStatus"></p>:2'),
);

trace.length = 0;
hooks.customRaceUI.refreshCustomRacePresetSelectors();
assert.ok(
  trace.some((entry) => entry.includes("text:<option></option>: General ")),
);
assert.ok(
  trace.some((entry) => entry.includes("text:<option></option>:Second")),
);

state.customRaceImportAttempt = null;
assert.equal(hooks.customRaceUI.importCustomRaceIntoLab(), false);
assert.equal(state.customRaceImportAttempt, "99:{bad");
assert.ok(
  trace.some((entry) => entry.includes("invalid JSON")),
  "invalid JSON status missing",
);

hooks.customRaceUI.automateLab();
assert.equal(trace.includes("lab:click"), false);

const emptyRaw = {
  prestigeCustomRacePresets: [],
  prestigeCustomRacePreset: "0",
};
hooks.setCustomRaceUITestContext({ settingsRaw: emptyRaw });
trace.length = 0;
hooks.customRaceUI.buildCustomRacePresetEditor(makeNode("modal"));
assert.equal(emptyRaw.prestigeCustomRacePresets.length, 1);
assert.equal(emptyRaw.prestigeCustomRacePresets[0].name, "General");
assert.doesNotThrow(() =>
  JSON.parse(emptyRaw.prestigeCustomRacePresets[0].json),
);
assert.ok(trace.some((entry) => entry.includes("Custom Race Presets")));

console.log("Custom race UI bundled characterization tests passed");
