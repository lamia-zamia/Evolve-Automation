import assert from "node:assert/strict";

import { createFleetSettingsIntentHandler } from "../src/application/fleet-settings.ts";
import { createFleetSettingsBrowserAdapter } from "../src/adapters/browser/fleet-settings.ts";
import { createFleetSettingsEvolveAdapter } from "../src/adapters/evolve/fleet-settings.ts";

const game = {
  loc: (key) => key,
  actions: {
    space: {
      gxy_a: { info: { name: "Alpha" } },
      gxy_b: { info: { name: () => "Beta" } },
    },
    galaxy: {
      gxy_a: { info: { name: "Alpha System" } },
      gxy_b: { info: { name: "Beta System" } },
    },
  },
};
const reader = createFleetSettingsEvolveAdapter({
  getFleetManagerOuter: () => ({ ShipConfig: { hull: ["scout", "frigate"] } }),
  getGalaxyRegions: () => ["gxy_a", "gxy_b"],
  getGame: () => game,
  getSettingsRaw: () => ({
    fleet_pr_gxy_a: 1,
    fleet_pr_gxy_b: 0,
    overrides: {},
  }),
});
const model = reader.read();
assert.deepEqual(
  model.andromedaRegions.map((region) => region.id),
  ["gxy_b", "gxy_a"],
);
assert.deepEqual(
  model.outerComponents.hull.map((option) => option.val),
  ["scout", "frigate"],
);
assert.equal(Object.isFrozen(model), true);
assert.throws(
  () =>
    createFleetSettingsEvolveAdapter({
      getFleetManagerOuter: () => ({ ShipConfig: null }),
      getGalaxyRegions: () => [],
      getGame: () => game,
      getSettingsRaw: () => ({ overrides: {} }),
    }).read(),
  /ShipConfig/,
);

const trace = [];
const intents = createFleetSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    reorderAndromeda: (ids) => trace.push(["reorder", ...ids]),
    persist: () => trace.push("persist"),
  },
  render: (prefix) => trace.push(["render", prefix]),
  effects: { resetCheckbox: () => trace.push("checkbox") },
});
intents.handle({
  type: "reorder-andromeda-regions",
  secondaryPrefix: "x-",
  regionIds: ["gxy_b", "gxy_a"],
});
intents.handle({ type: "reset-fleet-settings", secondaryPrefix: "" });
assert.deepEqual(trace, [
  ["reorder", "gxy_b", "gxy_a"],
  "persist",
  ["render", ""],
  "reset",
  "persist",
  ["render", ""],
  "checkbox",
]);

const registrations = [];
const node = {
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
  toggleClass() {
    return this;
  },
  on() {
    return this;
  },
};
const browser = createFleetSettingsBrowserAdapter({
  getDocument: () => ({
    documentElement: { scrollTop: 0 },
    body: { scrollTop: 0 },
  }),
  getJQuery: () => node,
  reader: { read: () => model },
  intents,
  getActions: () => ({
    buildSettingsSection2: (...args) => registrations.push(args),
    addSettingsHeader1: () => {},
    addSettingsNumber: () => {},
    addSettingsSelect: () => {},
    addSettingsToggle: () => {},
    addTableInput: () => {},
    buildTableLabel: () => {},
    openOverrideModal: () => {},
    sorterHelper: () => {},
  }),
});
browser.buildFleetSettings(node, "secondary-");
assert.deepEqual(registrations[0].slice(1, 4), [
  "secondary-",
  "fleet",
  "Fleet",
]);

console.log(
  "Fleet settings domain, Evolve, browser, and application tests passed",
);
