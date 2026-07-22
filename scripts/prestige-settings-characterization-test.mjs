import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const node = () => ({
  empty() {
    return this;
  },
  off() {
    return this;
  },
  append() {
    return this;
  },
  find() {
    return this;
  },
  val(value) {
    return value === undefined ? "none" : this;
  },
  toggleClass() {
    return this;
  },
  on() {
    return this;
  },
  ready() {
    return this;
  },
});
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  confirm: () => true,
  document: {
    documentElement: { scrollTop: 0 },
    body: { scrollTop: 0 },
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
  },
  localStorage: { getItem: () => null, setItem: () => {} },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => node(),
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";
vm.runInNewContext(source, sandbox, { filename: "evolve_automation.user.js" });
const registrations = [];
hooks.setPrestigeSettingsTestContext({
  prestigeTypes: [{ val: "none", label: "None", hint: "Endless" }],
  game: { loc: (key) => key, global: { race: { witch_hunter: false } } },
  buildings: {},
  settingsRaw: {},
  actions: {
    buildSettingsSection2: (...args) => registrations.push(args),
    addSettingsHeader1: () => {},
    addSettingsNumber: () => {},
    addSettingsSelect: () => {},
    addSettingsToggle: () => {},
    openOverrideModal: () => {},
    openOptionsModal: () => {},
    buildCustomRacePresetEditor: {},
  },
});
hooks.prestigeSettings.buildPrestigeSettings(node(), "");
assert.deepEqual(
  registrations.map((args) => args.slice(1, 4)),
  [["", "prestige", "Prestige"]],
);

console.log("Prestige settings bundled characterization tests passed");
