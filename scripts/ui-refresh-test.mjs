import assert from "node:assert/strict";

import { createUIRefresh } from "../src/ui/ui-refresh.ts";

function makeContext({
  hidden = false,
  created = false,
  reordered = false,
} = {}) {
  const trace = [];
  const document = {
    hidden,
    documentElement: { scrollTop: 120 },
    body: { scrollTop: 30 },
  };
  const actions = Object.fromEntries(
    [
      "createOptionsModal",
      "updateOptionsUI",
      "updatePrestigeInTopBar",
      "updateTotalDaysInTopBar",
    ].map((name) => [name, () => trace.push(name)]),
  );
  const scriptNode = { id: "captured-before-creation" };
  const phases = {
    ensureAutomationContainer: () => {
      trace.push("container");
      return { scriptNode, created };
    },
    repairRuntimeAdapters: (node) => {
      assert.equal(node, scriptNode);
      trace.push("adapters");
      return reordered;
    },
    updateSoulGemRate: () => trace.push("soulGems"),
    renderPreviousGameStats: () => trace.push("previousStats"),
  };
  return { trace, document, actions, phases };
}

let context = makeContext({ hidden: true });
const { updateUI } = createUIRefresh({
  getDocument: () => context.document,
  getActions: () => context.actions,
  getPhases: () => context.phases,
});
updateUI();
assert.deepEqual(context.trace, []);

context = makeContext();
updateUI();
assert.deepEqual(context.trace, [
  "createOptionsModal",
  "updateOptionsUI",
  "updatePrestigeInTopBar",
  "container",
  "adapters",
  "soulGems",
  "previousStats",
  "updateTotalDaysInTopBar",
]);
assert.equal(context.document.body.scrollTop, 30);

context = makeContext({ created: true });
updateUI();
assert.equal(context.document.documentElement.scrollTop, 120);
assert.equal(context.document.body.scrollTop, 120);

context = makeContext({ reordered: true });
context.document.documentElement.scrollTop = 0;
updateUI();
assert.equal(context.document.documentElement.scrollTop, 30);
assert.equal(context.document.body.scrollTop, 30);

console.log("UI refresh module tests passed");
