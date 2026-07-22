import assert from "node:assert/strict";

import { createMechSettingsIntentHandler } from "../src/application/mech-settings.ts";
import { createMechSettingsBrowserAdapter } from "../src/adapters/browser/mech-settings.ts";
import { createMechSettingsEvolveAdapter } from "../src/adapters/evolve/mech-settings.ts";

const reader = createMechSettingsEvolveAdapter({
  getMechManager: () => ({ Size: ["small", "large"] }),
  getGame: () => ({ loc: (key) => `loc:${key}` }),
});
const model = reader.read();
const size = model.controls.find(
  (control) => control.kind === "select" && control.settingName === "mechSize",
);
assert.deepEqual(
  size.options.slice(-2).map(({ val, label, hint }) => ({ val, label, hint })),
  [
    {
      val: "small",
      label: "loc:portal_mech_size_small",
      hint: "loc:portal_mech_size_small_desc",
    },
    {
      val: "large",
      label: "loc:portal_mech_size_large",
      hint: "loc:portal_mech_size_large_desc",
    },
  ],
);
let registration;
const trace = [];
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
  on() {
    return this;
  },
};
const actions = {
  buildSettingsSection(...args) {
    registration = args;
    trace.push(`section:${args[0]}:${args[1]}`);
  },
  addSettingsNumber(_node, key) {
    trace.push(`number:${key}`);
  },
  addSettingsSelect(_node, key) {
    trace.push(`select:${key}`);
  },
  addSettingsToggle(_node, key) {
    trace.push(`toggle:${key}`);
  },
  addStandardHeading(_node, label) {
    trace.push(`heading:${label}`);
  },
  calculateMechStats: () => trace.push("stats"),
};
const scroll = { documentElement: { scrollTop: 0 }, body: { scrollTop: 13 } };
const intents = [];
const browser = createMechSettingsBrowserAdapter({
  getDocument: () => scroll,
  getJQuery: () => () => node,
  reader,
  intents: { handle: (intent) => intents.push(intent) },
  getActions: () => actions,
});
browser.updateMechSettingsContent();
assert.equal(trace[0], "select:mechScrap");
assert.ok(trace.includes("heading:Mech Stats"));
assert.equal(trace.at(-1), "stats");
assert.equal(scroll.documentElement.scrollTop, 13);
browser.buildMechSettings();
registration[2]();
assert.deepEqual(intents, [{ type: "reset-mech-settings" }]);

const order = [];
const handler = createMechSettingsIntentHandler({
  writer: {
    resetToDefaults: () => order.push("reset"),
    persist: () => order.push("persist"),
  },
  renderSettingsContent: () => order.push("render"),
  effects: {
    resetCheckboxes: () => order.push("checkbox"),
    removeMechInfo: () => order.push("remove"),
  },
});
handler.handle({ type: "reset-mech-settings" });
assert.deepEqual(order, ["reset", "persist", "render", "checkbox", "remove"]);

console.log(
  "Mech settings domain, Evolve, browser, and application tests passed",
);
