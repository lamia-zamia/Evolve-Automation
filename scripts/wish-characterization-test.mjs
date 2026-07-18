import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const clicks = [];
const panels = { minorWish: {}, majorWish: {} };
const jquery = (selector) => ({
  ready() {},
  click: () => clicks.push(selector),
});
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
  $: jquery,
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.autoWish, "function");
const game = {
  global: {
    race: { wish: true, wishStats: { minor: 0, major: 0 } },
    tech: { wish: 2 },
    settings: { at: false },
  },
};
hooks.setAutomationTestContext({
  game,
  win: {
    document: {
      getElementById: (id) =>
        panels[id] === undefined ? null : { __vue__: panels[id] },
    },
  },
});
Object.assign(hooks.automationSettings, {
  wishMinor: "Know",
  wishMajor: "Power",
});

hooks.autoWish();
assert.deepEqual(clicks, ["#wishKnow", "#wishPower"]);

clicks.length = 0;
delete panels.minorWish;
hooks.autoWish();
assert.deepEqual(clicks, []);

console.log("Wish bundled characterization tests passed");
