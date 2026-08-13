import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";
import vm from "node:vm";

const { context, hooks, sandbox } = await loadCharacterizationBundle(
  {
    console,
    localStorage: { getItem: () => null },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    navigator: { platform: "Win32" },
    setTimeout,
    clearTimeout,
    structuredClone,
    $: () => ({ ready() {} }),
  },
  { useContext: true },
);

assert.equal(typeof hooks.setPropertyHelperTestContext, "function");
const helpers = hooks.propertyHelpers;
assert.equal(typeof helpers?.normalizeProperties, "function");
assert.equal(typeof helpers?.addProps, "function");

vm.runInContext(
  `
    class Allowed {
      constructor() {
        this.base = 5;
        this.calc = function () { return this.base + 1; };
      }
    }
    class Blocked {
      constructor() {
        this.base = 7;
        this.calc = function () { return this.base + 1; };
      }
    }
    globalThis.Allowed = Allowed;
    globalThis.normalizationTarget = {
      base: 2,
      calc() { return this.base * 3; },
      nested: { base: 4, calc() { return this.base * 2; } },
      list: [{ base: 3, calc() { return this.base + 2; } }],
      allowed: new Allowed(),
      blocked: new Blocked(),
    };
  `,
  context,
);

const target = sandbox.normalizationTarget;
assert.equal(helpers.normalizeProperties(target, [sandbox.Allowed]), target);
assert.equal(target.calc, 6);
assert.equal(target.nested.calc, 8);
assert.equal(target.list[0].calc, 5);
assert.equal(target.allowed.calc, 6);
assert.equal(typeof target.blocked.calc, "function");

target.base = 10;
target.nested.base = 6;
assert.equal(target.calc, 30);
assert.equal(target.nested.calc, 12);
assert.deepEqual(
  Object.fromEntries(
    ["calc", "nested"].map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      return [
        key,
        {
          configurable: descriptor.configurable,
          enumerable: descriptor.enumerable,
          getter: typeof descriptor.get === "function",
        },
      ];
    }),
  ),
  {
    calc: { configurable: true, enumerable: true, getter: true },
    nested: { configurable: true, enumerable: true, getter: false },
  },
);

let settings = { build_A: true, weight_A: 2 };
hooks.setPropertyHelperTestContext({ settings });
const list = { A: { id: "A" } };
assert.equal(
  helpers.addProps(list, (item) => item.id, [
    { s: "build_", p: "enabled" },
    { s: "weight_", p: "weight" },
  ]),
  list,
);
assert.equal(list.A.enabled, true);
assert.equal(list.A.weight, 2);
settings.build_A = false;
assert.equal(list.A.enabled, false);
settings = { build_A: "replacement", weight_A: 9 };
hooks.setPropertyHelperTestContext({ settings });
assert.equal(list.A.enabled, "replacement");
assert.equal(list.A.weight, 9);

console.log("Property helper bundled characterization tests passed");
