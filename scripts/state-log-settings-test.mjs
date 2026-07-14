import assert from "node:assert/strict";

import { createStateLogSettings } from "../src/ui/state-log-settings.ts";

let document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 14 },
};
let jqueryContext = "first";
let trace = [];
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

const settings = createStateLogSettings({
  getDocument: () => document,
  getJQuery: () => (selector) => {
    trace.push(`select:${jqueryContext}:${selector}`);
    return makeNode(selector);
  },
  resetStateLogSettings: (reset) => trace.push(`reset:${reset}`),
  updateSettingsFromState: () => trace.push("persist"),
  buildSettingsSection: (...args) => {
    sectionRegistration = args;
    trace.push(`section:${args[0]}:${args[1]}`);
  },
  addSettingsToggle: (_node, key, label, hint) =>
    trace.push(`toggle:${key}:${label}:${hint}`),
  addSettingsNumber: (_node, key, label, hint) =>
    trace.push(`number:${key}:${label}:${hint}`),
});

settings.buildStateLogSettings();
assert.deepEqual(trace, ["section:stateLog:State Log"]);
assert.equal(sectionRegistration[3], settings.updateStateLogSettingsContent);

trace = [];
sectionRegistration[2]();
assert.equal(trace[0], "reset:true");
assert.equal(trace[1], "persist");
assert.deepEqual(
  trace.slice(2).map((entry) => entry.split(":").slice(0, 2).join(":")),
  [
    "select:first",
    "empty:first",
    "off:*",
    "toggle:stateLogEnabled",
    "toggle:stateLogAutoDownload",
    "number:stateLogInterval",
  ],
);
assert.equal(document.documentElement.scrollTop, 14);
assert.equal(document.body.scrollTop, 14);

document = {
  documentElement: { scrollTop: 31 },
  body: { scrollTop: 6 },
};
jqueryContext = "second";
trace = [];
settings.updateStateLogSettingsContent();
assert.equal(trace[0], "select:second:#script_stateLogContent");
assert.equal(document.documentElement.scrollTop, 31);
assert.equal(document.body.scrollTop, 31);
assert.ok(
  trace.includes(
    "toggle:stateLogEnabled:Record state log:Record compact bottleneck-focused snapshots of game state over the run into localStorage (key ea_state_log), for offline analysis. Retrieve via window.eaExportStateLog() in the console.",
  ),
);
assert.ok(
  trace.includes(
    "number:stateLogInterval:Sample every N ticks:How often to record a state snapshot, counted in processed script ticks. A full run stays well under the 20000-sample cap at the default.",
  ),
);

console.log("State Log settings module tests passed");
