import assert from "node:assert/strict";

import { createLogFilter } from "../src/observability/log-filter.ts";

let settingsRaw = { logFilter: "first" };
let settings = { masterScriptToggle: true };
let state = { filterRegExp: null };
let translations = { first: "First" };
const filter = createLogFilter({
  getSettingsRaw: () => settingsRaw,
  getSettings: () => settings,
  getState: () => state,
  getPoly: () => ({ loc: (id) => translations[id] ?? id }),
});

filter.buildFilterRegExp();
assert.equal(state.filterRegExp.source, "^(First)$");
const removed = [];
filter.filterLog([
  {
    addedNodes: [{ innerText: "First", remove: () => removed.push("first") }],
  },
]);
assert.deepEqual(removed, ["first"]);

settingsRaw = { logFilter: "second" };
settings = { masterScriptToggle: true };
state = { filterRegExp: null };
translations = { second: "Second" };
filter.buildFilterRegExp();
assert.equal(state.filterRegExp.source, "^(Second)$");

console.log("Log filter module tests passed");
