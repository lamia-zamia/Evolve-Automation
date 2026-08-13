import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

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
const { hooks } = await loadCharacterizationBundle({
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
});
const registrations = [];
hooks.setPrestigeSettingsTestContext({
  prestigeTypes: [{ val: "none", label: "None", hint: "Endless" }],
  game: { loc: (key) => key, global: { race: { witch_hunter: false } } },
  buildings: {},
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
