import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const domTrace = [];
const handlers = [];
let modal = null;

function makeNode(label) {
  const node = {
    length: 1,
    empty() {
      return node;
    },
    off() {
      return node;
    },
    append(content) {
      domTrace.push(`append:${label}:${String(content).slice(0, 8)}`);
      if (
        label === "[object Object]" &&
        String(content).includes('id="scriptModal"')
      ) {
        modal = { style: { display: "none" } };
      }
      return node;
    },
    prepend(content) {
      domTrace.push(`prepend:${label}:${String(content).slice(0, 8)}`);
      return node;
    },
    toggleClass() {
      return node;
    },
    removeClass() {
      return node;
    },
    css() {
      return node;
    },
    prop() {
      return node;
    },
    on(...args) {
      handlers.push({
        label,
        event: String(args[0]),
        handler: args[2] ?? args[1],
      });
      return node;
    },
    appendTo() {
      return node;
    },
    ready() {
      return node;
    },
  };
  return node;
}

function jquery(value) {
  return makeNode(String(value));
}

const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  confirm: () => true,
  document: {
    body: {},
    documentElement: { scrollTop: 0 },
    getElementById: (id) => (id === "scriptModal" ? modal : null),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => makeNode("created-element"),
  },
  localStorage: { getItem: () => null, setItem: () => {} },
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

const trace = [];
hooks.setOptionsModalTestContext({
  settingsRaw: { overrides: {}, autoJobs: true },
  updateSettingsFromState: () => trace.push("persist"),
  builders: {
    government: () => trace.push("government"),
    war: () => trace.push("war"),
    hell: () => trace.push("hell"),
    fleet: () => trace.push("fleet"),
  },
});

hooks.optionsModal.updateOptionsUI();
assert.equal(
  domTrace.filter((entry) => entry.startsWith("prepend:")).length,
  6,
);
hooks.optionsModal.createOptionsModal();
assert.equal(typeof hooks.optionsModal.openOptionsModal, "function");
assert.ok(handlers.some((entry) => entry.label === "#scriptModalClose"));

console.log("Options modal bundled characterization tests passed");
