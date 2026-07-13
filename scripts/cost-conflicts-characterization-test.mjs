import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
function jquery() {
  return { ready() {} };
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;
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
  $: jquery,
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.getCostConflict, "function");
assert.equal(typeof hooks.setCostConflictTestContext, "function");

const resources = {
  Iron: { id: "Iron", name: "Iron", currentQuantity: 100 },
  Copper: { id: "Copper", name: "Copper", currentQuantity: 50 },
  Knowledge: {
    id: "Knowledge",
    name: "Knowledge",
    currentQuantity: 1000,
  },
};
hooks.setCostConflictTestContext({
  state: { conflictTargets: [] },
  resources,
});
assert.equal(hooks.getCostConflict({ cost: {} }), null);

const first = {
  name: "First Project",
  cost: { Iron: 80, Knowledge: 950 },
};
const second = {
  name: "Second Project",
  cost: { Iron: 90, Knowledge: 100 },
};
const blockedKnowledge = {
  name: "Blocked Project",
  cost: { Copper: 60, Knowledge: 2000 },
};
hooks.setCostConflictTestContext({
  state: { conflictTargets: [first, second, blockedKnowledge] },
  resources,
});

const conflict = hooks.getCostConflict({
  cost: { Iron: 30, Copper: 0, Knowledge: 100 },
});
assert.equal(conflict.res, resources.Copper);
assert.equal(conflict.obj, blockedKnowledge);
assert.deepEqual([...conflict.resList], ["Iron", "Knowledge", "Copper"]);
assert.deepEqual(
  [...conflict.actionList],
  ["First Project", "Second Project", "Blocked Project"],
);

hooks.setCostConflictTestContext({
  state: { conflictTargets: [blockedKnowledge] },
  resources,
});
resources.Copper.currentQuantity = 60;
const knowledgeConflict = hooks.getCostConflict({
  cost: { Copper: 0, Knowledge: 100 },
});
assert.equal(knowledgeConflict.res, resources.Knowledge);
assert.deepEqual([...knowledgeConflict.resList], ["Knowledge"]);
resources.Knowledge.currentQuantity = 2100;
assert.equal(
  hooks.getCostConflict({ cost: { Copper: 0, Knowledge: 0 } }),
  null,
);

console.log("Cost conflict bundled characterization tests passed");
