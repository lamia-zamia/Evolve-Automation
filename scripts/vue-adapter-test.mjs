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

const methodView = {
  prefix: "method",
  value(input) {
    assert.equal(this, methodView);
    return `${this.prefix}:${input}`;
  },
};
assert.equal(
  adapter.callVueMethod(methodView, "value", ["result"]),
  "method:result",
);
assert.equal(
  adapter.resolveVueMethod(methodView, "value")("result"),
  "method:result",
);

const appProxy = { id: "app-proxy" };
elements.set("app", { __vue_app__: { _instance: { proxy: appProxy } } });
assert.equal(adapter.getVueById("app"), appProxy);

const filters = {
  tactics(value) {
    assert.equal(this, filters);
    return `legacy:${value}`;
  },
};
const legacyView = { $options: { filters } };
assert.equal(adapter.callVueMethod(legacyView, "tactics", [2]), "legacy:2");

const vueElement = {};
assert.equal(adapter.getVueElement({ $el: vueElement }), vueElement);

const vue2Instance = { id: "vue2" };
elements.set("vue2", { __vue__: vue2Instance });
assert.equal(adapter.getVueById("vue2"), vue2Instance);

elements.set("plain", {});
assert.equal(adapter.getVueById("plain"), undefined);
assert.equal(adapter.getVueById("missing"), undefined);
assert.equal(adapter.getMainVue(), mainVue);

console.log("Vue adapter tests passed");
