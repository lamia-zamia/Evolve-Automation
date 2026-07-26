import assert from "node:assert/strict";

import { createVueAdapter } from "../src/adapters/browser/vue.ts";

const elements = new Map();
const mainVue = { id: "main" };
const document = {
  getElementById: (id) => elements.get(id) ?? null,
  querySelector(selector) {
    assert.equal(
      this,
      document,
      "querySelector must retain its Document receiver",
    );
    return selector === "#mainColumn > div:first-child"
      ? { __vue_proxy__: mainVue }
      : null;
  },
};
const adapter = createVueAdapter({ getWin: () => ({ document }) });

const vue3Proxy = { id: "vue3" };
elements.set("vue3", { __vue_proxy__: vue3Proxy });
assert.equal(adapter.getVueById("vue3"), vue3Proxy);

const appProxy = { id: "app-proxy" };
elements.set("app", { __vue_app__: { _instance: { proxy: appProxy } } });
assert.equal(adapter.getVueById("app"), appProxy);

const vue2Instance = { id: "vue2" };
elements.set("vue2", { __vue__: vue2Instance });
assert.equal(adapter.getVueById("vue2"), vue2Instance);

elements.set("plain", {});
assert.equal(adapter.getVueById("plain"), undefined);
assert.equal(adapter.getVueById("missing"), undefined);
assert.equal(adapter.getMainVue(), mainVue);

console.log("Vue adapter tests passed");
