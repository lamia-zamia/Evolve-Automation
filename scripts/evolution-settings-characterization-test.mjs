import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const registrations = [];
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
    return value === undefined ? "auto" : this;
  },
  html() {
    return this;
  },
  on() {
    return this;
  },
  sortable() {
    return [];
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
hooks.setEvolutionSettingsTestContext({
  game: { loc: (key) => key, races: {} },
  races: {},
  challenges: [],
  universes: [],
  prestigeTypes: [{ val: "none", label: "None", hint: "" }],
  settingsRaw: { evolutionQueue: [] },
  settings: {},
  evolutionSettingsToStore: [],
  getStarLevel: () => 1,
  actions: {
    buildSettingsSection: (...args) => registrations.push(args),
    addStandardHeading: () => {},
    addSettingsSelect: () => {},
    addSettingsToggle: () => {},
    sorterHelper: () => {},
  },
});
hooks.evolutionSettings.buildEvolutionSettings();
assert.deepEqual(
  registrations.map((args) => args.slice(0, 2)),
  [["evolution", "Evolution"]],
);

console.log("Evolution settings bundled characterization tests passed");
