import assert from "node:assert/strict";

import { createChallengeHelperSettingsBrowserAdapter } from "../src/adapters/browser/challenge-helper-settings.ts";

let document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 14 },
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
    controls.push({ kind: "toggle", key, label, hint });
    trace.push(`toggle:${key}`);
  },
  addSettingsNumber(_node, key, label, hint) {
    controls.push({ kind: "number", key, label, hint });
    trace.push(`number:${key}`);
  },
};

const settings = createChallengeHelperSettingsBrowserAdapter({
  getDocument: () => document,
  getJQuery: () => (selector) => makeNode(selector),
  intents: { handle: (intent) => trace.push(`intent:${intent.type}`) },
  getActions: () => actions,
});

settings.updateChallengeHelperSettingsContent();
assert.deepEqual(
  controls.map(({ kind, key }) => ({ kind, key })),
  [
    { kind: "toggle", key: "inflationChallengeAssist" },
    { kind: "number", key: "inflationChallengeSaveMinutes" },
    { kind: "toggle", key: "retirementChallengeAssist" },
  ],
);
assert.equal(document.documentElement.scrollTop, 14);
assert.equal(document.body.scrollTop, 14);

document = {
  documentElement: { scrollTop: 29 },
  body: { scrollTop: 4 },
};
jqueryContext = "second";
trace = [];
controls = [];
settings.updateChallengeHelperSettingsContent();
assert.deepEqual(trace, [
  "empty:second:#script_challengeHelperContent",
  "off:*",
  "toggle:inflationChallengeAssist",
  "number:inflationChallengeSaveMinutes",
  "toggle:retirementChallengeAssist",
]);
assert.equal(document.documentElement.scrollTop, 29);
assert.equal(document.body.scrollTop, 29);

trace = [];
settings.buildChallengeHelperSettings();
assert.deepEqual(trace, ["section:challengeHelper:Challenge Helper"]);
assert.equal(
  sectionRegistration[3],
  settings.updateChallengeHelperSettingsContent,
);

trace = [];
sectionRegistration[2]();
assert.deepEqual(trace, ["intent:reset-challenge-helper-settings"]);

assert.equal(
  controls[0].hint,
  "During Inflation, demand the $250B Wheelbarrow target, boost Money storage or income buildings as appropriate, and stop optional Money spending once the target can be reached soon.",
);

console.log("Challenge Helper settings browser adapter tests passed");
