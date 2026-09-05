import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const trace = [];
const selectorLengths = new Map();
let inserted;
let listElement = { id: "mech-list" };

function makeNode(label) {
  const target = function () {};
  let proxy;
  proxy = new Proxy(target, {
    apply() {
      return proxy;
    },
    get(_target, property) {
      if (property === "length") return selectorLengths.get(label) ?? 1;
      if (property === "__label") return label;
      if (property === "hasClass") return () => false;
      if (property === "remove") {
        return () => {
          trace.push(`remove:${label}`);
          return proxy;
        };
      }
      if (property === "text") {
        return (value) => {
          trace.push(`text:${label}:${value}`);
          return proxy;
        };
      }
      return () => proxy;
    },
  });
  return proxy;
}

function jquery(value) {
  return makeNode(String(value));
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;

const document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 0 },
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => {
    const note = {};
    inserted = note;
    return note;
  },
  getElementById: () => listElement,
};
const storageValues = new Map();
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

assert.equal(typeof hooks.setMechInfoTestContext, "function");
assert.deepEqual(Object.keys(hooks.mechInfo), [
  "createMechInfo",
  "removeMechInfo",
]);

const mechNode = {
  childNodes: { 0: {}, length: 1 },
  firstChild: {},
  insertBefore: (note) => {
    inserted = note;
    trace.push("insert");
  },
};
const observerTrace = [];
hooks.setMechInfoTestContext({
  game: {
    global: { portal: { mechbay: { mechs: [{ size: "collector" }] } } },
  },
  MechManager: {
    isActive: true,
    initLab: () => {
      throw new Error("active lab should not initialize");
    },
    bestMech: { collector: { power: 10 } },
    collectorValue: 2,
    getMechStats: () => ({ power: 5, efficiency: 0.25 }),
    mechObserver: {
      disconnect: () => observerTrace.push("disconnect"),
      observe: (...args) => observerTrace.push(`observe:${args.length}`),
    },
  },
  getNiceNumber: (value) => `nice:${value}`,
});

listElement = { id: "mech-list", children: { 0: mechNode, length: 1 } };
selectorLengths.set("#mechList .mechRow[draggable=true]", 0);
hooks.mechInfo.createMechInfo();
assert.equal(inserted.innerHTML, "50%, nice:10 /s | ");
assert.equal(inserted.className, "ea-mech-info");
assert.deepEqual(observerTrace, ["disconnect", "observe:2"]);

trace.length = 0;
hooks.mechInfo.removeMechInfo();
assert.ok(trace.includes("remove:#mechList .ea-mech-info"));
assert.equal(observerTrace.at(-1), "disconnect");

selectorLengths.set("#mechList .mechRow[draggable=true]", 1);
observerTrace.length = 0;
hooks.mechInfo.createMechInfo();
assert.deepEqual(observerTrace, []);

console.log("Mech-info bundled characterization tests passed");
