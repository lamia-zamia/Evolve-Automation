import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
let jqueryTrace = [];
let confirmMessages = [];
let confirmResult = true;

function jquery(selector) {
  if (selector === "#autoScriptContainer") {
    return {
      remove() {
        jqueryTrace.push(`remove:${selector}`);
      },
    };
  }
  return { ready() {} };
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;

const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  confirm(message) {
    confirmMessages.push(message);
    return confirmResult;
  },
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  document: { querySelector: () => null },
  $: jquery,
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.settingsTransfer?.importSettings, "function");
assert.equal(typeof hooks.settingsTransfer?.exportSettings, "function");
assert.equal(typeof hooks.setSettingsTransferTestContext, "function");

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
    trace,
    settingsRaw,
    actions: Object.fromEntries(
      actionNames.map((name) => [name, () => trace.push(name)]),
    ),
    GameLog: {
      logInfo: (...args) => trace.push(`logInfo:${args.join(":")}`),
    },
  };
}

function resetTrace() {
  jqueryTrace = [];
  confirmMessages = [];
}

let context = makeContext({ alpha: 1, nested: { enabled: true } });
hooks.setSettingsTransferTestContext(context);
assert.equal(
  hooks.settingsTransfer.exportSettings(),
  '{"alpha":1,"nested":{"enabled":true}}',
);

// A clean import does not prompt. It replaces the raw object, then preserves the exact action,
// DOM-removal, rebuild, filter, and success-log order.
resetTrace();
context = makeContext({ stale: true });
hooks.setSettingsTransferTestContext(context);
const cleanJson = JSON.stringify({ masterScriptToggle: true, overrides: {} });
assert.equal(hooks.settingsTransfer.importSettings(cleanJson), true);
assert.deepEqual(confirmMessages, []);
assert.deepEqual(context.trace, [
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
  "logInfo:special:Settings successfully imported",
]);
assert.deepEqual(jqueryTrace, ["remove:#autoScriptContainer"]);
assert.equal(hooks.settingsTransfer.exportSettings(), cleanJson);

const evaluated = {
  overrides: {
    autoBuild: [
      { type1: "Eval", arg1: "first()", type2: "Eval", arg2: "second()" },
    ],
    log_prestige_format: [{ ret: "prefix {eval:third()}" }],
  },
  triggers: [{ requirementType: "Eval", requirementId: "fourth()" }],
  log_prestige_format: "top {eval:fifth()}",
};
const expectedWarning =
  "Warning! Imported settings includes evaluated code, which will have full access to browser page, and can be potentially dangerous.\nOnly continue if you trust the source. Injected code:\n" +
  [
    "first()",
    "second()",
    "fourth()",
    "prefix {eval:third()}",
    "top {eval:fifth()}",
  ].join("\n");

// Declining the evaluated-code warning is a complete short-circuit.
resetTrace();
confirmResult = false;
context = makeContext({ unchanged: true });
hooks.setSettingsTransferTestContext(context);
assert.equal(
  hooks.settingsTransfer.importSettings(JSON.stringify(evaluated)),
  false,
);
assert.deepEqual(confirmMessages, [expectedWarning]);
assert.deepEqual(context.trace, []);
assert.deepEqual(jqueryTrace, []);
assert.equal(
  hooks.settingsTransfer.exportSettings(),
  JSON.stringify({ unchanged: true }),
);

// Accepting the same warning executes the identical transfer protocol.
resetTrace();
confirmResult = true;
assert.equal(
  hooks.settingsTransfer.importSettings(JSON.stringify(evaluated)),
  true,
);
assert.deepEqual(confirmMessages, [expectedWarning]);
assert.equal(
  context.trace.at(-1),
  "logInfo:special:Settings successfully imported",
);
assert.equal(
  hooks.settingsTransfer.exportSettings(),
  JSON.stringify(evaluated),
);

console.log("Settings transfer bundled characterization tests passed");
