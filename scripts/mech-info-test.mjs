import assert from "node:assert/strict";

import { createMechInfoBrowserAdapter } from "../src/adapters/browser/mech-info.ts";
import { createMechInfoEvolveAdapter } from "../src/adapters/evolve/combat/mech-info.ts";
import { formatMechInfo } from "../src/domain/combat/mech-info.ts";

assert.equal(
  formatMechInfo(
    {
      size: "collector",
      power: 5,
      efficiency: 0.25,
      bestPower: 10,
      collectorValue: 2,
    },
    (value) => `n:${value}`,
  ),
  "50%, n:10 /s | ",
);
assert.equal(
  formatMechInfo(
    { size: "scout", power: 8, efficiency: 0.25, bestPower: 10 },
    (value) => `n:${value}`,
  ),
  "80%, n:800, n:25 | ",
);

let manager = {
  isActive: true,
  initLab: () => {
    throw new Error("active lab should not initialize");
  },
  bestMech: { collector: { power: 10 }, scout: { power: 20 } },
  collectorValue: 2,
  getMechStats: (mech) =>
    mech.size === "collector"
      ? { power: 5, efficiency: 0.25 }
      : { power: 10, efficiency: 0.5 },
  mechObserver: {
    disconnect: () => trace.push("disconnect"),
    observe: (...args) => trace.push(`observe:${args.length}`),
  },
};
const trace = [];
const readerAdapter = createMechInfoEvolveAdapter({
  getGame: () => ({
    global: {
      portal: {
        mechbay: { mechs: [{ size: "collector" }, { size: "scout" }] },
      },
    },
  }),
  getMechManager: () => manager,
  getNiceNumber: (value) => `n:${value}`,
});
assert.equal(readerAdapter.reader.ensureLabActive(), true);
assert.deepEqual(readerAdapter.reader.readItems(2), [
  { text: "50%, n:10 /s | " },
  { text: "50%, n:1000, n:50 | " },
]);
readerAdapter.observer.disconnect();
readerAdapter.observer.observe({}, { childList: true });
assert.deepEqual(trace, ["disconnect", "observe:2"]);

manager = {
  ...manager,
  isActive: false,
  initLab: () => true,
};
const inactiveReader = createMechInfoEvolveAdapter({
  getGame: () => ({ global: { portal: { mechbay: { mechs: [] } } } }),
  getMechManager: () => manager,
  getNiceNumber: (value) => String(value),
});
assert.equal(inactiveReader.reader.ensureLabActive(), true);

const malformedReader = createMechInfoEvolveAdapter({
  getGame: () => ({
    global: { portal: { mechbay: { mechs: [{ size: 1 }] } } },
  }),
  getMechManager: () => ({
    isActive: true,
    bestMech: {},
    getMechStats: () => ({ power: 1, efficiency: 1 }),
  }),
  getNiceNumber: String,
});
assert.throws(
  () => malformedReader.reader.readItems(1),
  /mechs\[0\]\.size.*string/,
);

const browserTrace = [];
let firstHasInfo = false;
const firstNode = {
  hasClass: () => firstHasInfo,
  text: (value) => browserTrace.push(`text:${value}`),
};
const mechNode = {
  childNodes: { 0: firstNode, length: 1 },
  firstChild: firstNode,
  insertBefore: (note) => browserTrace.push(`insert:${note.innerHTML}`),
};
function jquery(selector) {
  const value = String(selector);
  if (value.includes("draggable")) {
    return { length: 0 };
  }
  if (value.includes("ea-mech-info")) {
    return {
      length: 1,
      remove: () => browserTrace.push("remove"),
    };
  }
  return {
    length: 1,
    hasClass: () => firstHasInfo,
    text: (content) => browserTrace.push(`text:${content}`),
  };
}
const listElement = { children: { 0: mechNode, length: 1 } };
const browserAdapter = createMechInfoBrowserAdapter({
  getDocument: () => ({
    createElement: () => ({}),
    getElementById: () => listElement,
  }),
  getJQuery: () => jquery,
  reader: {
    ensureLabActive: () => true,
    readItems: () => [{ text: "typed note" }],
  },
  observer: {
    disconnect: () => browserTrace.push("disconnect"),
    observe: (target, options) =>
      browserTrace.push(
        `observe:${target === listElement}:${options.childList}`,
      ),
  },
});
browserAdapter.createMechInfo();
assert.ok(browserTrace.includes("insert:typed note"));
assert.ok(browserTrace.includes("observe:true:true"));
firstHasInfo = true;
browserAdapter.createMechInfo();
assert.ok(browserTrace.includes("text:typed note"));
browserAdapter.removeMechInfo();
assert.equal(browserTrace.at(-1), "remove");

console.log("Mech-info domain, Evolve, and browser adapter tests passed");
