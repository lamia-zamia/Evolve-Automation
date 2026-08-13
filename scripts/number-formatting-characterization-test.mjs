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

const formatting = hooks.numberFormatting;
assert.equal(typeof formatting?.getRealNumber, "function");
assert.equal(typeof formatting?.getNumberString, "function");
assert.equal(typeof formatting?.getNiceNumber, "function");

assert.deepEqual(
  ["", "42", "1.5K", "2M", "-3K"].map(formatting.getRealNumber),
  [0, 42, 1500, 2_000_000, -3000],
);
assert.deepEqual(
  [0, 1000, 1001, 1_500_000, -1.2].map(formatting.getNumberString),
  [0, 1000, "1.0K", "1.5M", -1],
);
assert.deepEqual(
  [0.00456, 0.999, 1.234, 12.999].map(formatting.getNiceNumber),
  [0.0046, 1, 1.23, 13],
);

console.log("Number formatting bundled characterization tests passed");
