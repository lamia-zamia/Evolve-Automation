import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const handlers = new Map();
let trace = [];

function compact(value) {
  return value.replace(/\s+/g, " ").trim();
}

function jqueryLabel(value) {
  if (typeof value !== "string") {
    return value?.label ?? "<node>";
  }
  if (value.includes('id="script_stateLogSettings"')) {
    return "section:stateLog";
  }
  const setting = value.match(/<input class="script_([A-Za-z0-9_]+)"/u)?.[1];
  if (setting) {
    return `control:${setting}`;
  }
  return compact(value);
}

function jquery(value) {
  const label = jqueryLabel(value);
  trace.push(`select:${label}`);
  const wrapper = {
    label,
    length: 1,
    ready() {
      return this;
    },
    empty() {
      trace.push(`empty:${label}`);
      return this;
    },
    off(event) {
      trace.push(`off:${label}:${event}`);
      return this;
    },
    append(child) {
      trace.push(`append:${label}:${jqueryLabel(child)}`);
      return this;
    },
    appendTo(node) {
      trace.push(`appendTo:${label}:${node.label}`);
      return this;
    },
    toggleClass(name, enabled) {
      trace.push(`toggleClass:${label}:${name}:${enabled}`);
      return this;
    },
    on(event, ...args) {
      const delegatedSelector = typeof args[0] === "string" ? args[0] : "-";
      const handler = args.at(-1);
      trace.push(`on:${label}:${event}:${delegatedSelector}`);
      handlers.set(`${label}:${event}`, handler);
      return this;
    },
    find(selector) {
      trace.push(`find:${label}:${selector}`);
      return jquery(`${label} ${selector}`);
    },
    is(selector) {
      trace.push(`is:${label}:${selector}`);
      return true;
    },
    prop(name, value) {
      trace.push(`prop:${label}:${name}:${value}`);
      return this;
    },
    val(value) {
      trace.push(`val:${label}:${value}`);
      return this;
    },
  };
  return wrapper;
}
jquery.isEmptyObject = (object) => Object.keys(object).length === 0;

const triggerElement = {
  classList: {
    toggle(name) {
      trace.push(`classToggle:stateLog:${name}`);
    },
  },
  nextElementSibling: { style: { display: "none" } },
};
const document = {
  documentElement: { scrollTop: 0 },
  body: { scrollTop: 0 },
  querySelector: () => null,
  getElementById(id) {
    trace.push(`getElementById:${id}`);
    return id === "stateLogSettingsCollapsed" ? triggerElement : null;
  },
};

const stored = new Map();
const settingsRaw = {
  overrides: {
    stateLogEnabled: [{ ret: true }],
    stateLogAutoDownload: [{ ret: true }],
    stateLogInterval: [{ ret: 5 }],
  },
  triggers: [],
  stateLogSettingsCollapsed: false,
  stateLogEnabled: true,
  stateLogAutoDownload: true,
  stateLogInterval: 7,
};
stored.set("settings", JSON.stringify(settingsRaw));

const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  confirm(message) {
    trace.push(`confirm:${message}`);
    return true;
  },
  document,
  localStorage: {
    getItem: (key) => stored.get(key) ?? null,
    setItem(key, value) {
      stored.set(key, value);
      trace.push(`store:${key}`);
    },
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

assert.deepEqual(Object.keys(hooks.stateLogSettings), [
  "buildStateLogSettings",
  "updateStateLogSettingsContent",
]);
assert.equal(typeof hooks.setStateLogSettingsTestContext, "function");
hooks.setStateLogSettingsTestContext({ settingsRaw });

trace = [];
document.documentElement.scrollTop = 37;
document.body.scrollTop = 11;
hooks.stateLogSettings.updateStateLogSettingsContent();
assert.deepEqual(trace, [
  "select:#script_stateLogContent",
  "empty:#script_stateLogContent",
  "off:#script_stateLogContent:*",
  "select:control:stateLogEnabled",
  "toggleClass:control:stateLogEnabled:inactive-row:true",
  "on:control:stateLogEnabled:change:input",
  "on:control:stateLogEnabled:click:-",
  "appendTo:control:stateLogEnabled:#script_stateLogContent",
  "select:control:stateLogAutoDownload",
  "toggleClass:control:stateLogAutoDownload:inactive-row:true",
  "on:control:stateLogAutoDownload:change:input",
  "on:control:stateLogAutoDownload:click:-",
  "appendTo:control:stateLogAutoDownload:#script_stateLogContent",
  "select:control:stateLogInterval",
  "toggleClass:control:stateLogInterval:inactive-row:true",
  "on:control:stateLogInterval:change:input",
  "on:control:stateLogInterval:click:-",
  "appendTo:control:stateLogInterval:#script_stateLogContent",
]);
assert.equal(document.documentElement.scrollTop, 37);
assert.equal(document.body.scrollTop, 37);

trace = [];
document.documentElement.scrollTop = 80;
document.body.scrollTop = 20;
hooks.stateLogSettings.buildStateLogSettings();
assert.deepEqual(trace, [
  "select:#script_settings",
  "select:section:stateLog",
  "append:#script_settings:section:stateLog",
  "select:#script_stateLogContent",
  "empty:#script_stateLogContent",
  "off:#script_stateLogContent:*",
  "select:control:stateLogEnabled",
  "toggleClass:control:stateLogEnabled:inactive-row:true",
  "on:control:stateLogEnabled:change:input",
  "on:control:stateLogEnabled:click:-",
  "appendTo:control:stateLogEnabled:#script_stateLogContent",
  "select:control:stateLogAutoDownload",
  "toggleClass:control:stateLogAutoDownload:inactive-row:true",
  "on:control:stateLogAutoDownload:change:input",
  "on:control:stateLogAutoDownload:click:-",
  "appendTo:control:stateLogAutoDownload:#script_stateLogContent",
  "select:control:stateLogInterval",
  "toggleClass:control:stateLogInterval:inactive-row:true",
  "on:control:stateLogInterval:change:input",
  "on:control:stateLogInterval:click:-",
  "appendTo:control:stateLogInterval:#script_stateLogContent",
  "getElementById:stateLogSettingsCollapsed",
  "classToggle:stateLog:script-contentactive",
  "find:section:stateLog:#script_resetstateLog",
  "select:section:stateLog #script_resetstateLog",
  "on:section:stateLog #script_resetstateLog:click:-",
]);
assert.equal(triggerElement.nextElementSibling.style.display, "block");
assert.equal(document.documentElement.scrollTop, 80);
assert.equal(document.body.scrollTop, 80);

trace = [];
handlers.get("section:stateLog #script_resetstateLog:click")();
assert.deepEqual(
  {
    stateLogEnabled: settingsRaw.stateLogEnabled,
    stateLogAutoDownload: settingsRaw.stateLogAutoDownload,
    stateLogInterval: settingsRaw.stateLogInterval,
    overrideKeys: Object.keys(settingsRaw.overrides),
  },
  {
    stateLogEnabled: false,
    stateLogAutoDownload: false,
    stateLogInterval: 20,
    overrideKeys: [],
  },
);
assert.equal(
  trace[0],
  "confirm:Are you sure you wish to reset State Log Settings?",
);
assert.equal(trace[1], "store:settings");
assert.deepEqual(trace.slice(2), [
  "select:#script_stateLogContent",
  "empty:#script_stateLogContent",
  "off:#script_stateLogContent:*",
  "select:control:stateLogEnabled",
  "toggleClass:control:stateLogEnabled:inactive-row:false",
  "on:control:stateLogEnabled:change:input",
  "on:control:stateLogEnabled:click:-",
  "appendTo:control:stateLogEnabled:#script_stateLogContent",
  "select:control:stateLogAutoDownload",
  "toggleClass:control:stateLogAutoDownload:inactive-row:false",
  "on:control:stateLogAutoDownload:change:input",
  "on:control:stateLogAutoDownload:click:-",
  "appendTo:control:stateLogAutoDownload:#script_stateLogContent",
  "select:control:stateLogInterval",
  "toggleClass:control:stateLogInterval:inactive-row:false",
  "on:control:stateLogInterval:change:input",
  "on:control:stateLogInterval:click:-",
  "appendTo:control:stateLogInterval:#script_stateLogContent",
]);

console.log("State Log settings bundled characterization tests passed");
