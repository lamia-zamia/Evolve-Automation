import assert from "node:assert/strict";

import { createTotalDaysTopBarBrowserAdapter } from "../src/adapters/browser/total-days-top-bar.ts";
import { createTotalDaysTopBarEvolveAdapter } from "../src/adapters/evolve/total-days-top-bar.ts";

const reader = createTotalDaysTopBarEvolveAdapter({
  getSettings: () => ({ displayTotalDaysTypeInTopBar: true }),
  getGame: () => ({ global: { stats: { days: 456 } } }),
});
assert.equal(reader.readDisplayEnabled(), true);
assert.equal(reader.readTotalDays(), 456);

const uninitializedReader = createTotalDaysTopBarEvolveAdapter({
  getSettings: () => ({}),
  getGame: () => ({ global: { stats: { days: 0 } } }),
});
assert.equal(uninitializedReader.readDisplayEnabled(), false);

const malformedReader = createTotalDaysTopBarEvolveAdapter({
  getSettings: () => ({ displayTotalDaysTypeInTopBar: true }),
  getGame: () => ({ global: { stats: { days: "456" } } }),
});
assert.throws(() => malformedReader.readTotalDays(), /days.*finite number/);

const elements = new Map();
const browserTrace = [];
const dayNode = {
  after(node) {
    browserTrace.push(`after:${node.value}`);
    elements.set("s-total-days", {
      remove: () => elements.delete("s-total-days"),
    });
    return this;
  },
};
const calendarNode = {
  length: 1,
  find(selector) {
    browserTrace.push(`find:${selector}`);
    return dayNode;
  },
};
let calendarPresent = false;
const jquery = (value) => {
  if (typeof value === "string" && value === "#topBar .calendar") {
    browserTrace.push(`select:${value}`);
    return calendarPresent ? calendarNode : { length: 0 };
  }
  browserTrace.push(`markup:${value}`);
  return { value, length: 1 };
};
const document = {
  getElementById: (id) => elements.get(id) ?? null,
};
let enabled = false;
let totalDays = 7;
let readCount = 0;
const browserReader = {
  readDisplayEnabled: () => enabled,
  readTotalDays: () => {
    readCount++;
    return totalDays;
  },
};
const adapter = createTotalDaysTopBarBrowserAdapter({
  getDocument: () => document,
  getJQuery: () => jquery,
  reader: browserReader,
});

const countNode = { textContent: "" };
elements.set("s-total-days", {
  remove: () => {
    browserTrace.push("remove:total-days");
    elements.delete("s-total-days");
  },
});
elements.set("s-total-days-count", countNode);
adapter.updateTotalDaysInTopBar();
assert.equal(countNode.textContent, 7);
assert.equal(readCount, 1);
assert.deepEqual(browserTrace, ["remove:total-days"]);

browserTrace.length = 0;
elements.delete("s-total-days-count");
enabled = true;
adapter.updateTotalDaysInTopBar();
assert.equal(readCount, 1);
assert.deepEqual(browserTrace, ["select:#topBar .calendar"]);

browserTrace.length = 0;
calendarPresent = true;
adapter.addTotalDaysToTopBar();
assert.deepEqual(browserTrace, [
  "select:#topBar .calendar",
  "find:.day",
  'markup:<span id="s-total-days" class="has-text-warning" style="padding-left: 3px;">(<span id="s-total-days-count"></span>)</span>',
  'after:<span id="s-total-days" class="has-text-warning" style="padding-left: 3px;">(<span id="s-total-days-count"></span>)</span>',
]);

elements.set("s-total-days-count", countNode);
totalDays = 8;
browserTrace.length = 0;
adapter.updateTotalDaysInTopBar();
assert.equal(countNode.textContent, 8);
assert.equal(readCount, 2);

elements.delete("s-total-days");
adapter.removeTotalDaysFromTopBar();

console.log("Total-days top-bar adapter and Evolve contract tests passed");
