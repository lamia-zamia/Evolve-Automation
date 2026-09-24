import assert from "node:assert/strict";

import { createMechInfoBrowserAdapter } from "../src/adapters/browser/mech-info.ts";
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

const browserTrace = [];
let firstHasInfo = false;
const firstNode = {};
const mechNode = {
  childNodes: [firstNode],
  firstChild: firstNode,
  insertBefore: (note) => browserTrace.push(`insert:${note.innerHTML}`),
};
function jquery(selector) {
  if (selector === firstNode) {
    return {
      length: 1,
      hasClass: () => firstHasInfo,
      text: (value) => browserTrace.push(`text:${value}`),
      remove: () => browserTrace.push("remove"),
    };
  }
  const value = String(selector);
  if (value.includes("draggable")) return { length: 0 };
  return {
    length: 1,
    hasClass: () => firstHasInfo,
    text: (content) => browserTrace.push(`text:${content}`),
    remove: () => browserTrace.push("remove"),
  };
}
const listElement = { children: [mechNode] };
const adapter = createMechInfoBrowserAdapter({
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

adapter.createMechInfo();
assert.ok(browserTrace.includes("insert:typed note"));
assert.ok(browserTrace.includes("observe:true:true"));
firstHasInfo = true;
adapter.createMechInfo();
assert.ok(browserTrace.includes("text:typed note"));
adapter.removeMechInfo();
assert.equal(browserTrace.at(-1), "remove");

console.log("Mech-info domain and browser adapter tests passed");
