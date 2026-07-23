import assert from "node:assert/strict";

import { createEvolutionSettingsIntentHandler } from "../src/application/evolution-settings.ts";
import { createEvolutionSettingsBrowserAdapter } from "../src/adapters/browser/evolution-settings.ts";
import { createEvolutionSettingsEvolveAdapter } from "../src/adapters/evolve/progression/evolution/evolution-settings.ts";

const race = {
  id: "human",
  name: "Human",
  desc: "desc",
  getCondition: () => "sun",
  getHabitability: () => 1,
};
const game = {
  loc: (key) => key,
  races: { human: { type: "humanoid" }, beast: { type: "beast" } },
};
const dependencies = {
  getGame: () => game,
  getRaces: () => ({ human: race }),
  getChallenges: () => [[{ id: "banana" }]],
  getUniverses: () => ["normal"],
  getSettingsRaw: () => ({
    userEvolutionTarget: "human",
    evolutionQueue: [{ userEvolutionTarget: "human", prestigeType: "none" }],
  }),
  getSettings: () => ({
    userEvolutionTarget: "human",
    userEvolutionGenus: "humanoid",
    prestigeType: "none",
    challenge_banana: false,
  }),
  getSettingsToStore: () => [
    "userEvolutionTarget",
    "userEvolutionGenus",
    "prestigeType",
    "challenge_banana",
  ],
  getPrestigeTypes: () => [{ val: "none", label: "None", hint: "" }],
  getStarLevel: () => 2,
};
const adapter = createEvolutionSettingsEvolveAdapter(dependencies);
const model = adapter.read();
assert.equal(model.queue[0].raceLabel, "Human, genelab_genus_humanoid");
assert.equal(model.raceWarning.className, "has-text-success");
assert.equal(
  model.controls.some((control) => control.kind === "header"),
  true,
);
assert.equal(Object.isFrozen(model), true);
assert.throws(
  () =>
    createEvolutionSettingsEvolveAdapter({
      ...dependencies,
      getSettingsRaw: () => ({}),
    }).read(),
  /evolutionQueue/,
);

const trace = [];
const handler = createEvolutionSettingsIntentHandler({
  writer: {
    resetToDefaults: () => trace.push("reset"),
    setTarget: (value) => trace.push(["target", value]),
    addCurrent: (value) => trace.push(["add", value]),
    remove: (value) => trace.push(["remove", value]),
    edit: (...args) => trace.push(["edit", ...args]),
    reorder: (value) => trace.push(["reorder", ...value]),
    persist: () => trace.push("persist"),
  },
  render: () => trace.push("render"),
  effects: { resetCheckbox: () => trace.push("checkbox") },
});
handler.handle({ type: "set-evolution-target", value: "human" });
handler.handle({ type: "reset-evolution-settings" });
assert.deepEqual(trace, [
  ["target", "human"],
  "persist",
  "render",
  "reset",
  "persist",
  "render",
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
  find() {
    return this;
  },
  val(value) {
    return value === undefined ? "human" : this;
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
};
const browser = createEvolutionSettingsBrowserAdapter({
  getDocument: () => ({
    documentElement: { scrollTop: 0 },
    body: { scrollTop: 0 },
  }),
  getJQuery: () => node,
  reader: { read: () => model },
  intents: handler,
  getActions: () => ({
    buildSettingsSection: (...args) => registrations.push(args),
    addStandardHeading: () => {},
    addSettingsSelect: () => {},
    addSettingsToggle: () => {},
    sorterHelper: () => {},
  }),
});
browser.buildEvolutionSettings();
assert.deepEqual(registrations[0].slice(0, 2), ["evolution", "Evolution"]);

console.log(
  "Evolution settings domain, Evolve, browser, and application tests passed",
);
