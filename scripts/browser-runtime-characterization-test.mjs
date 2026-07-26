import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const trace = [];
let scheduled;
class FakeBlob {
  constructor(parts) {
    this.parts = parts;
  }
}
const anchor = {
  download: "",
  href: "",
  click: () => trace.push(["click", anchor.download, anchor.href]),
};
const document = {
  createElement: (name) => {
    trace.push(["create", name]);
    return anchor;
  },
};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  document,
  URL: {
    createObjectURL(blob) {
      trace.push(["url", Array.from(blob.parts)]);
      return "blob:test";
    },
    revokeObjectURL(url) {
      trace.push(["revoke", url]);
    },
  },
  Blob: FakeBlob,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout: (callback, delay) => {
    scheduled = { callback, delay };
    return 1;
  },
  clearTimeout,
  structuredClone,
  $: () => ({ ready() {} }),
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.setBrowserRuntimeTestContext, "function");
assert.equal(typeof hooks.browserRuntime?.getVueById, "function");
assert.equal(typeof hooks.browserRuntime?.getMainVue, "function");
assert.equal(typeof hooks.browserRuntime?.triggerFileDownload, "function");

const vue = { id: "vue" };
const mainVue = { id: "main" };
hooks.setBrowserRuntimeTestContext({
  win: {
    document: {
      getElementById: (id) =>
        id === "present"
          ? { __vue_proxy__: vue }
          : id === "legacy"
            ? { __vue__: vue }
            : id === "app"
              ? { __vue_app__: { _instance: { proxy: vue } } }
              : id === "plain"
                ? {}
                : null,
      querySelector: () => ({ __vue_proxy__: mainVue }),
    },
  },
});
assert.equal(hooks.browserRuntime.getVueById("present"), vue);
assert.equal(hooks.browserRuntime.getVueById("legacy"), vue);
assert.equal(hooks.browserRuntime.getVueById("app"), vue);
assert.equal(hooks.browserRuntime.getVueById("plain"), undefined);
assert.equal(hooks.browserRuntime.getVueById("missing"), undefined);
assert.equal(hooks.browserRuntime.getMainVue(), mainVue);

hooks.browserRuntime.triggerFileDownload("contents", "save.json");
assert.deepEqual(trace, [
  ["url", ["contents"]],
  ["create", "a"],
  ["click", "save.json", "blob:test"],
]);
assert.equal(scheduled.delay, 60_000);
scheduled.callback();
assert.deepEqual(trace.at(-1), ["revoke", "blob:test"]);

console.log("Browser runtime bundled characterization tests passed");
