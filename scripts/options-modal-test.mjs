import assert from "node:assert/strict";

import { createOptionsModalBrowserAdapter } from "../src/adapters/browser/options-modal.ts";
import { getOptionsModalButtonDefinitions } from "../src/domain/options-modal.ts";

assert.deepEqual(
  getOptionsModalButtonDefinitions().map((definition) => definition.id),
  [
    "s-government-options",
    "s-foreign-options",
    "s-foreign-options2",
    "s-hell-options",
    "s-hell-options2",
    "s-fleet-options",
  ],
);

const trace = [];
const handlers = [];
let modalElement = null;
const elements = new Map();
const document = {
  body: {},
  getElementById(id) {
    if (id === "scriptModal") return modalElement;
    return elements.get(id) ?? null;
  },
};

function makeNode(label, length = 1) {
  const node = {
    label,
    length,
    empty() {
      trace.push(`empty:${label}`);
      return node;
    },
    off(events) {
      trace.push(`off:${label}:${events}`);
      return node;
    },
    append(content) {
      trace.push(`append:${label}:${String(content).slice(0, 10)}`);
      if (
        label === "[object Object]" &&
        String(content).includes('id="scriptModal"')
      ) {
        modalElement = { style: { display: "none" } };
      }
      return node;
    },
    prepend(content) {
      trace.push(`prepend:${label}:${String(content).slice(0, 10)}`);
      return node;
    },
    toggleClass(className, value) {
      trace.push(`toggle:${label}:${className}:${value}`);
      return node;
    },
    removeClass(className) {
      trace.push(`removeClass:${label}:${className}`);
      return node;
    },
    css(property, value) {
      trace.push(`css:${label}:${property}:${value}`);
      return node;
    },
    prop(property, value) {
      trace.push(`prop:${label}:${property}:${value}`);
      return node;
    },
    on(...args) {
      const event = String(args[0]);
      const selector = typeof args[1] === "string" ? args[1] : undefined;
      const data =
        selector === undefined && typeof args[1] !== "function"
          ? args[1]
          : undefined;
      const handler =
        typeof args[1] === "function" ? args[1] : (args[2] ?? args[1]);
      handlers.push({ label, event, selector, data, handler });
      return node;
    },
    appendTo(target) {
      trace.push(`appendTo:${label}:${target.label}`);
      return node;
    },
  };
  return node;
}

function jquery(selector) {
  const label = String(selector);
  if (label === "#missing") return makeNode(label, 0);
  return makeNode(label);
}

const settingsRaw = { overrides: { autoJobs: true }, autoJobs: true };
const writerTrace = [];
const builders = {
  government: (node, prefix) =>
    writerTrace.push(`government:${prefix}:${node.label}`),
  war: (node, prefix) => writerTrace.push(`war:${prefix}:${node.label}`),
  hell: (node, prefix) => writerTrace.push(`hell:${prefix}:${node.label}`),
  fleet: (node, prefix) => writerTrace.push(`fleet:${prefix}:${node.label}`),
};
const settings = createOptionsModalBrowserAdapter({
  getDocument: () => document,
  getJQuery: () => jquery,
  getWindow: () => ({ window: true }),
  getSettingsReader: () => ({
    readToggle: (settingName) => ({
      checked: Boolean(settingsRaw[settingName]),
      inactive: Boolean(settingsRaw.overrides[settingName]),
    }),
  }),
  getSettingsWriter: () => ({
    setToggle: (settingName, checked) => {
      settingsRaw[settingName] = checked;
      writerTrace.push(`set:${settingName}:${checked}`);
    },
    persist: () => writerTrace.push("persist"),
  }),
  getBuilders: () => builders,
  openOverrideModal: (event) => writerTrace.push(`override:${event.data.name}`),
});

settings.updateOptionsUI();
assert.deepEqual(
  trace.filter((entry) => entry.startsWith("prepend:")),
  [
    "prepend:#government .tabs ul:[object Ob",
    "prepend:#garrison div h2:[object Ob",
    "prepend:#c_garrison div h2:[object Ob",
    "prepend:#gFort div h3:[object Ob",
    "prepend:#prtl_fortress div h3:[object Ob",
    "prepend:#hfleet h3:[object Ob",
  ],
);

const parent = makeNode("parent");
settings.createSettingToggle(parent, "autoJobs", "Manage jobs");
assert.ok(trace.some((entry) => entry.includes("inactive-row:true")));
const changeHandler = handlers.find(
  (entry) => entry.event === "change" && entry.selector === "input",
);
changeHandler.handler.call({ checked: false }, {});
assert.deepEqual(writerTrace.slice(-2), ["set:autoJobs:false", "persist"]);

modalElement = { style: { display: "none" } };
const optionButtonHandler = handlers.find(
  (entry) =>
    entry.event === "click" && entry.label.includes("s-government-options"),
);
optionButtonHandler.handler({});
assert.equal(modalElement.style.display, "block");
assert.equal(writerTrace.at(-1), "government:c_:#scriptModalBody");

modalElement = null;
settings.createOptionsModal();
assert.ok(trace.some((entry) => entry.startsWith("append:[object Object]:")));
assert.ok(handlers.some((entry) => entry.label === "#scriptModalClose"));
assert.ok(
  handlers.some(
    (entry) => entry.event === "click" && entry.label === "[object Object]",
  ),
);

console.log("Options modal browser adapter tests passed");
