import assert from "node:assert/strict";

import { createPrestigeTopBarBrowserAdapter } from "../src/adapters/browser/prestige-top-bar.ts";
import { createPrestigeTopBarEvolveAdapter } from "../src/adapters/evolve/prestige-top-bar.ts";
import { selectPrestigeTopBarType } from "../src/domain/progression/prestige/prestige-top-bar.ts";

const catalog = [
  { value: "none", label: "None", hint: "No prestige" },
  { value: "ascension", label: "Ascension", hint: "Ascend" },
];
assert.deepEqual(selectPrestigeTopBarType(catalog, "ascension"), catalog[1]);
assert.deepEqual(selectPrestigeTopBarType(catalog, "unknown"), {
  value: "unknown",
  label: "unknown",
  hint: "",
});

const reader = createPrestigeTopBarEvolveAdapter({
  getSettings: () => ({
    displayPrestigeTypeInTopBar: true,
    prestigeType: "ascension",
  }),
  getPrestigeTypes: () => [
    { val: "none", label: "None", hint: "No prestige" },
    { val: "ascension", label: "Ascension", hint: "Ascend" },
  ],
});
assert.equal(reader.readDisplayEnabled(), true);
assert.equal(reader.readSelectedValue(), "ascension");
assert.deepEqual(reader.readTypeOptions(), catalog);

const uninitializedReader = createPrestigeTopBarEvolveAdapter({
  getSettings: () => ({}),
  getPrestigeTypes: () => [],
});
assert.equal(uninitializedReader.readDisplayEnabled(), false);
assert.throws(
  () => uninitializedReader.readSelectedValue(),
  /prestigeType.*string/,
);

const malformedReader = createPrestigeTopBarEvolveAdapter({
  getSettings: () => ({
    displayPrestigeTypeInTopBar: true,
    prestigeType: "ascension",
  }),
  getPrestigeTypes: () => [{ val: "ascension", label: "Ascension" }],
});
assert.throws(() => malformedReader.readTypeOptions(), /hint.*string/);

const elements = new Map();
const createdElements = [];
const planetWrap = {
  children: [],
  append(child) {
    this.children.push(child);
  },
};
let planetWrapPresent = true;
function createElement(tagName) {
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
const document = {
  getElementById: (id) => elements.get(id) ?? null,
  querySelector: (selector) =>
    selector === ".planetWrap" && planetWrapPresent ? planetWrap : null,
  createElement,
};
let displayEnabled = true;
let selectedValue = "ascension";
let typeOptions = catalog;
const optionCalls = [];
const buildPrestigeSettings = () => {};
const browserAdapter = createPrestigeTopBarBrowserAdapter({
  getDocument: () => document,
  reader: {
    readDisplayEnabled: () => displayEnabled,
    readSelectedValue: () => selectedValue,
    readTypeOptions: () => typeOptions,
  },
  options: {
    addOptionUI: (...args) => optionCalls.push(args),
  },
  buildPrestigeSettings,
});

browserAdapter.updatePrestigeInTopBar();
const parentNode = elements.get("s-prestige-type");
assert.ok(parentNode);
assert.equal(parentNode.getAttribute("data-prestige"), "ascension");
assert.equal(
  parentNode.getAttribute("style"),
  "border-left: 1px solid; margin-left: 0.75rem; padding-left: 0.75rem;",
);
assert.equal(parentNode.children.length, 1);
assert.equal(parentNode.children[0].getAttribute("class"), "info");
assert.equal(parentNode.children[0].title, "Ascend");
assert.equal(parentNode.children[0].textContent, "Ascension");
assert.equal(optionCalls.length, 1);
assert.deepEqual(optionCalls[0].slice(0, 3), [
  "s-prestige-type-helper-btn",
  "#s-prestige-type",
  "Prestige",
]);
assert.equal(optionCalls[0][3], buildPrestigeSettings);

browserAdapter.updatePrestigeInTopBar();
assert.equal(optionCalls.length, 1);
assert.equal(parentNode.children.length, 1);

selectedValue = "unknown";
typeOptions = catalog;
browserAdapter.updatePrestigeInTopBar();
assert.equal(parentNode.getAttribute("data-prestige"), "unknown");
assert.equal(parentNode.children[0].title, "");
assert.equal(parentNode.children[0].textContent, "unknown");

displayEnabled = false;
browserAdapter.updatePrestigeInTopBar();
assert.equal(elements.get("s-prestige-type"), undefined);

displayEnabled = true;
planetWrapPresent = false;
browserAdapter.updatePrestigeInTopBar();
assert.equal(elements.get("s-prestige-type"), undefined);

console.log(
  "Prestige top-bar adapter, domain, and Evolve contract tests passed",
);
