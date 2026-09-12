import assert from "node:assert/strict";

import { createCapturedCraftToggleReader } from "../src/adapters/evolve/economy/production/captured-craft-toggles.ts";

const root = {
  resource: {
    Plywood: { max: -1 },
    Brick: { max: -1 },
  },
};
const capturedIds = new Set(["resPlywood"]);
const reader = createCapturedCraftToggleReader({
  rootState: { readRoot: () => root },
  controls: {
    resolve: (id) => (capturedIds.has(id) ? { elementId: id } : undefined),
  },
  getDocument: () => ({
    getElementById: (id) => (id === "incPlywoodA" ? {} : null),
  }),
  getSettingsRaw: () => ({ craftPlywood: true, craftBrick: true }),
});

assert.deepEqual(reader.readItems(), [
  { craftableId: "Plywood", settingKey: "craftPlywood", enabled: true },
]);

const disabled = createCapturedCraftToggleReader({
  rootState: { readRoot: () => root },
  controls: {
    resolve: (id) => (capturedIds.has(id) ? { elementId: id } : undefined),
  },
  getDocument: () => ({ getElementById: () => ({}) }),
  getSettingsRaw: () => ({}),
});
assert.equal(disabled.readItems()[0].enabled, false);

console.log("captured craft toggle tests passed");
