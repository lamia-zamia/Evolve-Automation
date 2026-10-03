import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { readCapturedCurrentCityGarrison } from "../src/adapters/evolve/combat/captured-city-garrison.ts";

function fixture({
  id = "garrison",
  answer = 63,
  methods = ["hell"],
  invoke,
} = {}) {
  const root = {};
  const state = { root, generation: 1 };
  const control = { elementId: id, generation: 1, methods };
  const controls = {
    resolve: (elementId) =>
      elementId === id
        ? { ...control, generation: state.generation }
        : undefined,
    invoke: (handle, method, args) => {
      assert.equal(handle.elementId, id);
      assert.equal(method, "hell");
      assert.deepEqual(args, [undefined]);
      return invoke ? invoke(state) : { ok: true, value: answer };
    },
  };
  return { root, state, controls, source: { readRoot: () => state.root } };
}

for (const id of ["garrison", "c_garrison"]) {
  for (const answer of [64, 0, -3]) {
    const { root, source, controls } = fixture({ id, answer });
    assert.equal(
      readCapturedCurrentCityGarrison(source, controls, root),
      answer,
    );
  }
}
{
  const root = {};
  const controls = {
    resolve: (elementId) => ({ elementId, generation: 1, methods: ["hell"] }),
    invoke: (control) =>
      control.elementId === "garrison"
        ? { ok: false, reason: "threw" }
        : { ok: true, value: 64 },
  };
  assert.equal(
    readCapturedCurrentCityGarrison({ readRoot: () => root }, controls, root),
    64,
  );
}
{
  const root = {};
  assert.equal(
    readCapturedCurrentCityGarrison(
      { readRoot: () => root },
      {
        resolve: () => undefined,
        invoke: () => {
          throw new Error("unreachable");
        },
      },
      root,
    ),
    undefined,
  );
}
for (const answer of ["63", null, NaN, Infinity, -Infinity, {}]) {
  const { root, source, controls } = fixture({ answer });
  assert.equal(
    readCapturedCurrentCityGarrison(source, controls, root),
    undefined,
  );
}
for (const options of [
  { methods: [] },
  { invoke: () => ({ ok: false, reason: "threw" }) },
  {
    invoke: () => {
      throw new Error("native refusal");
    },
  },
  {
    invoke: (state) => {
      state.generation++;
      return { ok: true, value: 64 };
    },
  },
  {
    invoke: (state) => {
      state.root = {};
      return { ok: true, value: 64 };
    },
  },
]) {
  const { root, source, controls } = fixture(options);
  assert.equal(
    readCapturedCurrentCityGarrison(source, controls, root),
    undefined,
  );
}

const source = readFileSync(
  fileURLToPath(
    new URL(
      "../src/adapters/evolve/combat/captured-fleet-outer.ts",
      import.meta.url,
    ),
  ),
  "utf8",
);
assert.doesNotMatch(source, /capturedOuterFleetCurrentGarrison/);
assert.doesNotMatch(
  source,
  /\b(?:workers|fortress|fob|pillbox|soulForgeSoldiers|warlord)\b/i,
);
assert.doesNotMatch(source, /readProperty\([^\n]*["']crew["']/);
