import assert from "node:assert/strict";
import { createCapturedCraftingControls } from "../src/adapters/evolve/civic/captured-crafting-controls.ts";

const calls = [];
const controls = createCapturedCraftingControls({
  controls: {
    resolve: (elementId) =>
      elementId === "resIron"
        ? { elementId, generation: 3, methods: ["craft"] }
        : undefined,
    invoke: (handle, method, args = []) => {
      calls.push({ elementId: handle.elementId, method, args });
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => ["resIron"],
  },
});

assert.equal(
  controls.craft({ elementId: "resIron", resourceId: "Iron", count: 5 }),
  true,
);
assert.deepEqual(calls, [
  { elementId: "resIron", method: "craft", args: ["Iron", 5] },
]);

calls.length = 0;
assert.equal(
  controls.craft({ elementId: "resIron", resourceId: "Species", count: 0 }),
  true,
);
assert.deepEqual(calls, [
  { elementId: "resIron", method: "craft", args: ["Species", 0] },
]);

assert.equal(
  controls.craft({ elementId: "missing", resourceId: "Iron", count: 1 }),
  false,
);
assert.equal(
  controls.craft({ elementId: "resIron", resourceId: "Iron", count: NaN }),
  false,
);

console.log("captured-crafting-controls ok");
