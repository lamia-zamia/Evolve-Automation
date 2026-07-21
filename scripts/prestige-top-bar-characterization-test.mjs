import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const storageValues = new Map();
const elements = new Map();
const createdElements = [];
let planetWrapPresent = false;

function makeJQueryNode() {
  const target = function () {};
  let proxy;
  proxy = new Proxy(target, {
    apply() {
      return proxy;
    },
    get(_target, property) {
      if (property === "length") return 1;
      if (property === Symbol.iterator) return function* () {};
      if (property === "sortable") {
        return (...args) => (args[0] === "toArray" ? [] : proxy);
      }
      return () => proxy;
    },
  });
  return proxy;
}

function makeElement(tagName) {
  const attributes = new Map();
  const element = {
    tagName,
    title: "",
    textContent: null,
    children: [],
    append(child) {
      this.children.push(child);
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    setAttribute(name, value) {
      attributes.set(name, value);
      if (name === "id") elements.set(value, this);
    },
    querySelector(selector) {
      return (
        this.children.find(
          (child) => child.getAttribute("class") === selector.slice(1),
        ) ?? null
      );
    },
    remove() {
      const id = attributes.get("id");
      if (id !== undefined) elements.delete(id);
    },
  };
  createdElements.push(element);
  return element;
}

const planetWrap = {
  children: [],
  append(child) {
    this.children.push(child);
  },
};
const document = {
  documentElement: { scrollTop: 28 },
  body: { scrollTop: 6 },
  querySelector: (selector) =>
    selector === ".planetWrap" && planetWrapPresent ? planetWrap : null,
  querySelectorAll: () => [],
  createElement: makeElement,
  getElementById: (id) => elements.get(id) ?? null,
};
function jquery() {
  return makeJQueryNode();
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;

const sandbox = {
  __EA_TEST_HOOKS__: hooks,
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
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.setPrestigeTopBarTestContext, "function");
assert.deepEqual(Object.keys(hooks.prestigeTopBar), [
  "updatePrestigeInTopBar",
  "removePrestigeFromTopBar",
]);

const optionCalls = [];
const settings = {
  displayPrestigeTypeInTopBar: true,
  prestigeType: "ascension",
};
hooks.setPrestigeTopBarTestContext({
  settings,
  prestigeTypes: [
    { val: "none", label: "None", hint: "No prestige" },
    { val: "ascension", label: "Ascension", hint: "Ascend" },
  ],
  addOptionUI: (...args) => optionCalls.push(args),
  buildPrestigeSettings: () => {},
});

planetWrapPresent = true;
hooks.prestigeTopBar.updatePrestigeInTopBar();
const parentNode = elements.get("s-prestige-type");
assert.ok(parentNode);
assert.equal(parentNode.getAttribute("data-prestige"), "ascension");
assert.equal(
  parentNode.getAttribute("style"),
  "border-left: 1px solid; margin-left: 0.75rem; padding-left: 0.75rem;",
);
assert.equal(parentNode.children[0].getAttribute("class"), "info");
assert.equal(parentNode.children[0].title, "Ascend");
assert.equal(parentNode.children[0].textContent, "Ascension");
assert.equal(optionCalls.length, 1);
assert.deepEqual(optionCalls[0].slice(0, 3), [
  "s-prestige-type-helper-btn",
  "#s-prestige-type",
  "Prestige",
]);

hooks.prestigeTopBar.updatePrestigeInTopBar();
assert.equal(optionCalls.length, 1);
settings.prestigeType = "unknown";
hooks.prestigeTopBar.updatePrestigeInTopBar();
assert.equal(parentNode.getAttribute("data-prestige"), "unknown");
assert.equal(parentNode.children[0].title, "");
assert.equal(parentNode.children[0].textContent, "unknown");

settings.displayPrestigeTypeInTopBar = false;
hooks.prestigeTopBar.updatePrestigeInTopBar();
assert.equal(elements.get("s-prestige-type"), undefined);

settings.displayPrestigeTypeInTopBar = true;
planetWrapPresent = false;
hooks.prestigeTopBar.updatePrestigeInTopBar();
assert.equal(elements.get("s-prestige-type"), undefined);

console.log("Prestige top-bar bundled characterization tests passed");
