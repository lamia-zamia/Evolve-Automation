import assert from "node:assert/strict";

import { createAchievementGuardSettingsBrowserAdapter } from "../src/adapters/browser/achievement-guard-settings.ts";

let document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 16 },
};
let jqueryContext = "first";
let trace = [];
let controls = [];
let sectionRegistration;

function makeNode(selector) {
  return {
    empty() {
      trace.push(`empty:${jqueryContext}:${selector}`);
      return this;
    },
    off(events) {
      trace.push(`off:${events}`);
      return this;
    },
  };
}

let actions = {
  buildSettingsSection(...args) {
    sectionRegistration = args;
    trace.push(`section:${args[0]}:${args[1]}`);
  },
  addSettingsToggle(_node, key, label, hint) {
    controls.push({ key, label, hint });
    trace.push(`toggle:${key}`);
  },
};

const settings = createAchievementGuardSettingsBrowserAdapter({
  getDocument: () => document,
  getJQuery: () => (selector) => makeNode(selector),
  intents: { handle: (intent) => trace.push(`intent:${intent.type}`) },
  getActions: () => actions,
});

settings.updateAchievementGuardSettingsContent();
assert.deepEqual(
  controls.map(({ key }) => key),
  [
    "achievementGuards",
    "guardPacifist",
    "guardDreaded",
    "guardCultOfPersonality",
    "guardAnarchist",
    "guardEnergetic",
    "guardRedDead",
    "guardSecondEvolution",
    "guardBananaRepublic",
  ],
);
assert.equal(document.documentElement.scrollTop, 16);
assert.equal(document.body.scrollTop, 16);

document = {
  documentElement: { scrollTop: 31 },
  body: { scrollTop: 5 },
};
jqueryContext = "second";
trace = [];
controls = [];
settings.updateAchievementGuardSettingsContent();
assert.deepEqual(trace.slice(0, 2), [
  "empty:second:#script_achievementGuardContent",
  "off:*",
]);
assert.equal(document.documentElement.scrollTop, 31);
assert.equal(document.body.scrollTop, 31);
assert.equal(controls[0].label, "Enable achievement guards");

trace = [];
settings.buildAchievementGuardSettings();
assert.deepEqual(trace, ["section:achievementGuard:Achievement Guard"]);
assert.equal(
  sectionRegistration[3],
  settings.updateAchievementGuardSettingsContent,
);

trace = [];
sectionRegistration[2]();
assert.deepEqual(trace, ["intent:reset-achievement-guard-settings"]);

console.log("Achievement Guard settings browser adapter tests passed");
