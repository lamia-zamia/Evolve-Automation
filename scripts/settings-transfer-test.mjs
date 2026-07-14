import assert from "node:assert/strict";

import { createSettingsTransfer } from "../src/settings/transfer.ts";

const actionNames = [
  "updateStandAloneSettings",
  "updateStateFromSettings",
  "updateSettingsFromState",
  "removeScriptSettings",
  "removeMechInfo",
  "removeStorageToggles",
  "removeMarketToggles",
  "removeArpaToggles",
  "removeCraftToggles",
  "removeBuildingToggles",
  "removeEjectToggles",
  "removeSupplyToggles",
  "updateUI",
  "buildFilterRegExp",
];

function makeContext(settingsRaw = {}) {
  const trace = [];
  return {
    settingsRaw,
    trace,
    jquery: Object.assign(
      (selector) => ({ remove: () => trace.push(`remove:${selector}`) }),
      { isEmptyObject: (value) => Object.keys(value).length === 0 },
    ),
    GameLog: {
      logInfo: (...args) => trace.push(`gameLog:${args.join(":")}`),
    },
    actions: Object.fromEntries(
      actionNames.map((name) => [name, () => trace.push(name)]),
    ),
  };
}

let context = makeContext({ initial: true });
let confirmed = true;
const consoleTrace = [];
const { importSettings, exportSettings } = createSettingsTransfer({
  getSettingsRaw: () => context.settingsRaw,
  setSettingsRaw: (value) => {
    context.settingsRaw = value;
  },
  getJQuery: () => context.jquery,
  getGameLog: () => context.GameLog,
  getActions: () => context.actions,
  confirmImport: () => confirmed,
  logToConsole: (message) => consoleTrace.push(message),
});

assert.equal(exportSettings(), '{"initial":true}');
assert.deepEqual(consoleTrace, ["Exporting script settings"]);

// Every mutable dependency is resolved per call, including the raw-state setter and action set.
const stale = context;
context = makeContext({ replacement: true });
assert.equal(importSettings('{"newValue":3}'), true);
assert.deepEqual(stale.settingsRaw, { initial: true });
assert.deepEqual(context.settingsRaw, { newValue: 3 });
assert.deepEqual(context.trace, [
  ...actionNames.slice(0, 12),
  "remove:#autoScriptContainer",
  ...actionNames.slice(12),
  "gameLog:special:Settings successfully imported",
]);

// The injected confirmation blocks the entire mutation/action protocol for evaluated imports.
context = makeContext({ safe: true });
confirmed = false;
assert.equal(
  importSettings(
    JSON.stringify({
      overrides: { autoBuild: [{ type1: "Eval", arg1: "danger()" }] },
    }),
  ),
  false,
);
assert.deepEqual(context.settingsRaw, { safe: true });
assert.deepEqual(context.trace, []);

assert.throws(() => importSettings("not json"), SyntaxError);

console.log("Settings transfer module tests passed");
