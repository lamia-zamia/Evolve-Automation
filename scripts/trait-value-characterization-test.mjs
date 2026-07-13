import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
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
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.traitVal, "function");
assert.equal(typeof hooks.setTraitValueTestContext, "function");

hooks.setTraitValueTestContext({
  game: {
    global: { race: { strong: true, weak: false } },
    traits: { strong: { vars: () => [25, 40] } },
  },
});
assert.equal(hooks.traitVal("strong", 0), 25);
assert.equal(hooks.traitVal("strong", 1, "+"), 1.4);
assert.equal(hooks.traitVal("strong", 0, "-"), 0.75);
assert.equal(hooks.traitVal("strong", 0, "="), 0.25);
assert.equal(hooks.traitVal("weak", 0, "+"), 1);
assert.equal(hooks.traitVal("weak", 0, "-"), 1);
assert.equal(hooks.traitVal("weak", 0, "="), 1);
assert.equal(hooks.traitVal("weak", 0), 0);
assert.equal(hooks.traitVal("weak", 0, 7), 7);

console.log("Trait value bundled characterization tests passed");
