import assert from "node:assert/strict";

import { createPrestigeSettingsIntentHandler } from "../src/application/prestige-settings.ts";
import { createPrestigeSettingsBrowserAdapter } from "../src/adapters/browser/prestige-settings.ts";
import { createPrestigeSettingsEvolveAdapter } from "../src/adapters/evolve/progression/prestige/prestige-settings.ts";

const types = [
  { val: "none", label: "None", hint: "Endless" },
  { val: "mad", label: "MAD", hint: "Reset" },
];
const adapter = createPrestigeSettingsEvolveAdapter({
  getPrestigeTypes: () => types,
  getGame: () => ({
    loc: (key) => key,
    global: { race: { witch_hunter: false } },
  }),
  getSettingsRaw: () => ({}),
  getBuildings: () => ({ TauStarBluePill: { isUnlocked: () => true } }),
  isPrestigeAllowed: () => true,
  haveTech: (id) => id === "mad",
  isBioseederPrestigeAvailable: () => false,
  isCataclysmPrestigeAvailable: () => false,
  isWhiteholePrestigeAvailable: () => false,
  isApocalypsePrestigeAvailable: () => false,
  isAscensionPrestigeAvailable: () => false,
  isWitchAscensionPrestigeAvailable: () => false,
  isDemonicPrestigeAvailable: () => false,
});
const model = adapter.read();
assert.equal(model.controls.length > 10, true);
assert.match(
  model.controls.find(
    (control) =>
      control.kind === "number" &&
      control.settingName === "prestigeDemonicPotential",
  ).hint,
  /^Perform reset only if current mech team potential at or below given amount\./,
);
assert.equal(
  model.controls.find(
    (control) =>
      control.kind === "select" && control.settingName === "prestigeVaxStrat",
  ).options.length,
  5,
);
assert.equal(
  adapter.getConfirmationText("mad"),
  "MAD has already been researched.",
);
assert.equal(
  adapter.getConfirmationText("matrix"),
  "Matrix is built and powered.",
);
assert.throws(
  () =>
    createPrestigeSettingsEvolveAdapter({
      getPrestigeTypes: () => ({}),
      getGame: () => ({ loc: (key) => key }),
      getSettingsRaw: () => ({}),
      getBuildings: () => ({}),
      isPrestigeAllowed: () => false,
      haveTech: () => false,
      isBioseederPrestigeAvailable: () => false,
      isCataclysmPrestigeAvailable: () => false,
      isWhiteholePrestigeAvailable: () => false,
      isApocalypsePrestigeAvailable: () => false,
      isAscensionPrestigeAvailable: () => false,
      isWitchAscensionPrestigeAvailable: () => false,
      isDemonicPrestigeAvailable: () => false,
    }).read(),
  /prestigeTypes/,
);

const trace = [];
const intentHandler = createPrestigeSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    setPrestigeType: (value) => trace.push(["type", value]),
    setGoalStandard: () => trace.push("goal"),
    persist: () => trace.push("persist"),
  },
  reader: { getConfirmationText: (value) => (value === "mad" ? "ready" : "") },
  render: (prefix) => trace.push(["render", prefix]),
  effects: { confirm: () => false },
});
intentHandler.handle({ type: "set-prestige-type", value: "mad" });
intentHandler.handle({
  type: "reset-prestige-settings",
  secondaryPrefix: "x-",
});
assert.deepEqual(trace, [
  ["type", "none"],
  "goal",
  "persist",
  ["render", ""],
  "reset",
  "persist",
  ["render", "x-"],
]);

const registrations = [];
const buttonClicks = [];
const appended = [];
const node = {
  empty() {
    return this;
  },
  off() {
    return this;
  },
  append(content) {
    appended.push(content);
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
};
const button = {
  on(events, handler) {
    if (events === "click") buttonClicks.push(handler);
    return this;
  },
};
const optionsModalCalls = [];
const browser = createPrestigeSettingsBrowserAdapter({
  getDocument: () => ({
    documentElement: { scrollTop: 0 },
    body: { scrollTop: 0 },
  }),
  getJQuery: () => (selector) =>
    selector.startsWith("<button") ? button : node,
  reader: { read: () => model },
  intents: intentHandler,
  getActions: () => ({
    buildSettingsSection2: (...args) => registrations.push(args),
    addSettingsHeader1: () => {},
    addSettingsNumber: () => {},
    addSettingsSelect: () => {},
    addSettingsToggle: () => {},
    openOverrideModal: () => {},
    openOptionsModal: (title, editor) =>
      optionsModalCalls.push([title, editor]),
    buildCustomRacePresetEditor: {},
  }),
});
browser.buildPrestigeSettings(node, "secondary-");
assert.deepEqual(registrations[0].slice(1, 4), [
  "secondary-",
  "prestige",
  "Prestige",
]);
browser.updatePrestigeSettingsContent("secondary-");
assert.equal(appended.length, 1);
assert.equal(buttonClicks.length, 1);
buttonClicks[0]();
assert.deepEqual(optionsModalCalls, [["Custom Race Presets", {}]]);

console.log(
  "Prestige settings domain, Evolve, browser, and application tests passed",
);
