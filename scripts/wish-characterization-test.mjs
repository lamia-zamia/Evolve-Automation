import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const clicks = [];
const panels = { minorWish: {}, majorWish: {} };
const jquery = (selector) => ({
  ready() {},
  click: () => clicks.push(selector),
});
const { hooks } = await loadCharacterizationBundle({
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
