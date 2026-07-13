import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => ({ ready() {} }),
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.setLogFilterTestContext, "function");
assert.equal(typeof hooks.logFilter?.buildFilterRegExp, "function");
assert.equal(typeof hooks.logFilter?.filterLog, "function");

const settingsRaw = {
  logFilter: "hello, civics_garrison_gained, unknown, param%iron",
};
const settings = { masterScriptToggle: true };
const state = { filterRegExp: null };
const translations = {
  hello: "Hello (world)",
  civics_garrison_gained: "Gained",
  param: "Found %0",
  iron: "Iron",
};
hooks.setLogFilterTestContext({
  settingsRaw,
  settings,
  state,
  poly: {
    loc(id, params) {
      let value = translations[id] ?? id;
      if (Array.isArray(params)) {
        params.forEach((param, index) => {
          value = value.replace(`%${index}`, param);
        });
      }
      return value;
    },
  },
});

hooks.logFilter.buildFilterRegExp();
assert.equal(
  state.filterRegExp.source,
  "^(Hello \\(world\\)|Gained.*|Found Iron)$",
);
assert.equal(
  settingsRaw.logFilter,
  "hello, civics_garrison_gained, param%iron",
);

const removed = [];
const makeNode = (innerText) => ({
  innerText,
  remove: () => removed.push(innerText),
});
hooks.logFilter.filterLog([
  {
    addedNodes: [
      makeNode("Hello (world)"),
      makeNode("Gained 15 soldiers"),
      makeNode("Found Iron"),
      makeNode("Keep me"),
    ],
  },
]);
assert.deepEqual(removed, [
  "Hello (world)",
  "Gained 15 soldiers",
  "Found Iron",
]);

settings.masterScriptToggle = false;
hooks.logFilter.filterLog([{ addedNodes: [makeNode("Hello (world)")] }]);
assert.equal(removed.length, 3);

settingsRaw.logFilter = "unknown";
hooks.logFilter.buildFilterRegExp();
assert.equal(state.filterRegExp, null);
assert.equal(settingsRaw.logFilter, "");

console.log("Log filter bundled characterization tests passed");
