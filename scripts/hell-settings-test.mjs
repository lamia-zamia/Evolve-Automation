import assert from "node:assert/strict";

import { createHellSettingsIntentHandler } from "../src/application/hell-settings.ts";
import { createHellSettingsBrowserAdapter } from "../src/adapters/browser/hell-settings.ts";
import { getHellSettingsReadModel } from "../src/domain/combat/hell-settings.ts";

const model = getHellSettingsReadModel();
assert.deepEqual(
  model.controls
    .filter((control) => control.kind !== "header")
    .map((control) => control.settingName),
  [
    "hellHomeGarrison",
    "hellMinSoldiers",
    "hellMinSoldiersPercent",
    "hellAssaultReserve",
    "hellTargetFortressDamage",
    "hellLowWallsMulti",
    "hellHandlePatrolSize",
    "hellPatrolMinRating",
    "hellPatrolThreatPercent",
    "hellPatrolDroneMod",
    "hellPatrolDroidMod",
    "hellPatrolBootcampMod",
    "hellBolsterPatrolRating",
    "hellBolsterPatrolPercentTop",
    "hellBolsterPatrolPercentBottom",
    "hellAttractorBottomThreat",
    "hellAttractorTopThreat",
    "warlordHandleFortress",
    "warlordMinimumMinions",
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
  addSettingsToggle(_node, key) {
    trace.push(`toggle:${key}`);
  },
};
const scroll = { documentElement: { scrollTop: 0 }, body: { scrollTop: 18 } };
const intents = [];
const browser = createHellSettingsBrowserAdapter({
  getDocument: () => scroll,
  getJQuery: () => () => node,
  reader: { read: getHellSettingsReadModel },
  intents: { handle: (intent) => intents.push(intent) },
  getActions: () => actions,
});
browser.updateHellSettingsContent("x-");
assert.equal(trace[0], "header:Entering Hell");
assert.ok(trace.includes("toggle:hellAssaultReserve"));
assert.equal(scroll.documentElement.scrollTop, 18);
browser.buildHellSettings(node, "x-");
registration[4]();
assert.deepEqual(intents, [
  { type: "reset-hell-settings", secondaryPrefix: "x-" },
]);

const order = [];
const handler = createHellSettingsIntentHandler({
  writer: {
    resetToDefaults: () => order.push("reset"),
    persist: () => order.push("persist"),
  },
  renderSettingsContent: (prefix) => order.push(`render:${prefix}`),
  effects: { resetCheckboxes: () => order.push("checkbox") },
});
handler.handle({ type: "reset-hell-settings", secondaryPrefix: "x-" });
assert.deepEqual(order, ["reset", "persist", "render:x-", "checkbox"]);

console.log("Hell settings domain, browser, and application tests passed");
