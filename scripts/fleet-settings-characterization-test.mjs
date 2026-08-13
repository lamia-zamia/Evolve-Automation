import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const trace = [];
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
  next() {
    return this;
  },
  sortable() {
    return [];
  },
  ready() {
    return this;
  },
  toggleClass() {
    return this;
  },
  on() {
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

hooks.setFleetSettingsTestContext({
  FleetManagerOuter: { Regions: [], ShipConfig: {} },
  galaxyRegions: [],
  game: { loc: (key) => key, actions: {} },
  settingsRaw: { overrides: {} },
  actions: {
    buildSettingsSection2: (...args) =>
      trace.push(["build", args[1], args[2], args[3]]),
    addSettingsHeader1: () => {},
    addSettingsNumber: () => {},
    addSettingsSelect: () => {},
    addSettingsToggle: () => {},
    addStandardHeading: () => {},
    addTableInput: () => {},
    buildTableLabel: () => {},
    openOverrideModal: () => {},
    sorterHelper: () => {},
  },
  resetFleetSettings: (value) => trace.push(["reset", value]),
  updateSettingsFromState: () => trace.push("persist"),
  resetCheckbox: (key) => trace.push(["checkbox", key]),
});
const parent = node();
hooks.fleetSettings.buildFleetSettings(parent, "");
assert.deepEqual(trace, [["build", "", "fleet", "Fleet"]]);

console.log("Fleet settings bundled characterization tests passed");
