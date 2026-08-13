import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const actions = [];
const vue = {
  boostVal: () => actions.push(["power", "boost"]),
};
const document = {
  getElementById: (id) => (id === "psychicBoost" ? { __vue__: vue } : null),
};
const jquery = (selector) => ({
  ready() {},
  click: () => actions.push(["selector", selector]),
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
  document,
  $: jquery,
});

assert.equal(typeof hooks.autoPsychic, "function");
hooks.setAutomationTestContext({
  game: {
    global: {
      race: { psychic: true, psychicPowers: {} },
      tech: { psychic: 2 },
      settings: { at: false },
    },
  },
  win: { document },
});
Object.assign(hooks.automationSettings, {
  psychicPower: "boost",
  psychicBoostRes: "MissingResource",
});
Object.assign(hooks.automationResources.Energy, {
  currentQuantity: 75,
  maxQuantity: 75,
});

hooks.autoPsychic();
assert.deepEqual(actions, [
  [
    "selector",
    '#psychicBoost #psyhscrolltarget input[value="MissingResource"]',
  ],
  ["power", "boost"],
]);

console.log("Psychic bundled characterization tests passed");
