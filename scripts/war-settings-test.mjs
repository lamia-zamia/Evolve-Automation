import assert from "node:assert/strict";

import { createWarSettingsIntentHandler } from "../src/application/war-settings.ts";
import { createWarSettingsBrowserAdapter } from "../src/adapters/browser/war-settings.ts";
import { createWarSettingsEvolveAdapter } from "../src/adapters/evolve/war-settings.ts";

const reader = createWarSettingsEvolveAdapter({
  getSpyManager: () => ({
    Types: { Annex: { id: "annex" }, Purchase: { id: "purchase" } },
  }),
  getGame: () => ({ loc: (key) => `localized:${key}` }),
});
const model = reader.read();
assert.equal(model.sectionName, "Foreign Affairs");
const policy = model.controls.find(
  (control) =>
    control.kind === "select" &&
    control.settingName === "foreignPolicyInferior",
);
assert.deepEqual(
  policy.options.map(({ val, label }) => ({ val, label })),
  [
    { val: "Ignore", label: "Ignore" },
    { val: "Annex", label: "localized:civics_spy_annex" },
    { val: "Purchase", label: "localized:civics_spy_purchase" },
    { val: "Occupy", label: "Occupy" },
  ],
);

let registration;
const trace = [];
const scroll = { documentElement: { scrollTop: 0 }, body: { scrollTop: 17 } };
const node = {
  empty() {
    return this;
  },
  off() {
    return this;
  },
};
const actions = {
  buildSettingsSection2(...args) {
    registration = args;
    trace.push(`section:${args[1]}:${args[2]}:${args[3]}`);
  },
  addSettingsHeader1(_node, label) {
    trace.push(`header:${label}`);
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
};
const intents = [];
const browser = createWarSettingsBrowserAdapter({
  getDocument: () => scroll,
  getJQuery: () => () => node,
  reader,
  intents: { handle: (intent) => intents.push(intent) },
  getActions: () => actions,
});
browser.updateWarSettingsContent("x-");
assert.equal(trace[0], "header:Foreign Powers");
assert.ok(trace.includes("toggle:foreignPacifist"));
assert.ok(trace.includes("select:foreignProtect"));
assert.equal(scroll.documentElement.scrollTop, 17);
browser.buildWarSettings(node, "x-");
assert.deepEqual(registration.slice(1, 4), ["x-", "war", "Foreign Affairs"]);
registration[4]();
assert.deepEqual(intents, [
  { type: "reset-war-settings", secondaryPrefix: "x-" },
]);

const order = [];
const handler = createWarSettingsIntentHandler({
  writer: {
    resetToDefaults: () => order.push("reset"),
    persist: () => order.push("persist"),
  },
  renderSettingsContent: (prefix) => order.push(`render:${prefix}`),
  effects: { resetCheckboxes: () => order.push("checkbox") },
});
handler.handle({ type: "reset-war-settings", secondaryPrefix: "x-" });
assert.deepEqual(order, ["reset", "persist", "render:x-", "checkbox"]);

console.log(
  "War settings domain, Evolve, browser, and application tests passed",
);
