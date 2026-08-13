import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const storageValues = new Map();
const domElements = new Map();
const domTrace = [];
let calendarPresent = false;

function makeNode(label) {
  const target = function () {};
  let proxy;
  proxy = new Proxy(target, {
    apply() {
      return proxy;
    },
    get(_target, property) {
      if (property === "length") {
        return label === "#topBar .calendar" ? (calendarPresent ? 1 : 0) : 1;
      }
      if (property === Symbol.iterator) return function* () {};
      if (property === "sortable") {
        return (...args) => (args[0] === "toArray" ? [] : proxy);
      }
      if (property === "remove") {
        return () => {
          domTrace.push(`remove:${label}`);
          domElements.delete(label === "s-total-days" ? "s-total-days" : label);
          return proxy;
        };
      }
      if (property === "after") {
        return () => {
          domTrace.push("after:markup");
          domElements.set("s-total-days", { remove() {} });
          return proxy;
        };
      }
      if (property === "find") {
        return (selector) => {
          domTrace.push(`find:${label}:${selector}`);
          return makeNode(`${label}.find(${selector})`);
        };
      }
      return (...args) => {
        domTrace.push(`${String(property)}:${label}:${args.length}`);
        return proxy;
      };
    },
  });
  return proxy;
}

function jquery(value) {
  domTrace.push(
    typeof value === "string" && value.startsWith("<span")
      ? `markup:${value}`
      : `select:${String(value)}`,
  );
  return makeNode(String(value));
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;

const document = {
  documentElement: { scrollTop: 28 },
  body: { scrollTop: 6 },
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => makeNode("created-element"),
  getElementById: (id) => domElements.get(id) ?? null,
};
const { hooks } = await loadCharacterizationBundle({
  console,
  confirm: () => true,
  document,
  localStorage: {
    getItem: (key) => storageValues.get(key) ?? null,
    setItem: (key, value) => storageValues.set(key, String(value)),
  },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: jquery,
});

assert.equal(typeof hooks.setTotalDaysTopBarTestContext, "function");
assert.deepEqual(Object.keys(hooks.totalDaysTopBar), [
  "updateTotalDaysInTopBar",
  "addTotalDaysToTopBar",
  "removeTotalDaysFromTopBar",
]);

const countNode = { textContent: "" };
domElements.set("s-total-days", {
  remove: () => {
    domTrace.push("remove:total-days");
    domElements.delete("s-total-days");
  },
});
domElements.set("s-total-days-count", countNode);
hooks.setTotalDaysTopBarTestContext({
  settings: { displayTotalDaysTypeInTopBar: false },
  game: { global: { stats: { days: 123 } } },
});
domTrace.length = 0;
hooks.totalDaysTopBar.updateTotalDaysInTopBar();
assert.deepEqual(domTrace, ["remove:total-days"]);
assert.equal(countNode.textContent, 123);

domElements.delete("s-total-days-count");
calendarPresent = false;
hooks.setTotalDaysTopBarTestContext({
  settings: { displayTotalDaysTypeInTopBar: true },
  game: { global: { stats: { days: 124 } } },
});
domTrace.length = 0;
hooks.totalDaysTopBar.updateTotalDaysInTopBar();
assert.deepEqual(domTrace, ["select:#topBar .calendar"]);

calendarPresent = true;
domTrace.length = 0;
hooks.totalDaysTopBar.addTotalDaysToTopBar();
assert.equal(domTrace[0], "select:#topBar .calendar");
assert.equal(domTrace[1], "find:#topBar .calendar:.day");
assert.match(domTrace[2], /^markup:<span id="s-total-days"/);
assert.equal(domTrace[3], "after:markup");

domElements.set("s-total-days-count", countNode);
domTrace.length = 0;
hooks.totalDaysTopBar.updateTotalDaysInTopBar();
assert.equal(countNode.textContent, 124);
assert.equal(domTrace.length, 0);

console.log("Total-days top-bar bundled characterization tests passed");
