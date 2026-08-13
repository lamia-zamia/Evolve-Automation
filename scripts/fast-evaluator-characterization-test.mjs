import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

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
  $: () => ({ ready() {} }),
});

const settings = { answer: 40 };
const state = { delta: 2 };
hooks.setFastEvaluatorTestContext({ settings, state });
const { fastEval, cacheSize } = hooks.fastEvaluator;

assert.equal(cacheSize(), 0);
assert.equal(fastEval("settings.answer + state.delta"), 42);
assert.equal(cacheSize(), 1);
settings.answer = 50;
state.delta = -3;
assert.equal(fastEval("settings.answer + state.delta"), 47);
assert.equal(cacheSize(), 1);
assert.equal(fastEval("(() => settings.answer * 2)()"), 100);
assert.equal(cacheSize(), 2);

console.log("Fast evaluator bundled characterization tests passed");
