import assert from "node:assert/strict";

import {
  HELL_FORTRESS_CONTROL,
  HELL_GARRISON_CONTROLS,
  readCapturedHellGarrison,
} from "../src/adapters/evolve/combat/captured-hell-garrison.ts";

function makeHellGarrisonRoot() {
  return {
    race: {},
    portal: { fortress: { garrison: 40, patrols: 2, patrol_size: 5 } },
  };
}

function makeHellGarrisonReader({
  root = makeHellGarrisonRoot(),
  elementId = HELL_FORTRESS_CONTROL,
  methods = ["patrolling"],
  result = { ok: true, value: 17 },
  afterInvoke = () => {},
} = {}) {
  const invocations = [];
  let currentRoot = root;
  let currentControl = { elementId, generation: 1, methods };
  const rootState = { readRoot: () => currentRoot };
  const controls = {
    resolve: (id) => (id === elementId ? currentControl : undefined),
    invoke: (handle, method, args) => {
      invocations.push({ elementId: handle.elementId, method, args });
      afterInvoke({
        replaceRoot: () => {
          currentRoot = makeHellGarrisonRoot();
        },
        replaceControl: () => {
          currentControl = { ...currentControl, generation: 2 };
        },
      });
      return result;
    },
    capturedElementIds: () => [elementId],
  };
  return {
    read: () => readCapturedHellGarrison(rootState, controls),
    invocations,
  };
}

// The upstream answer includes operating assignments private to the game. It must be
// passed through, not reconstructed as the visible 40 - 2 * 5 fortress counts.
for (const elementId of HELL_GARRISON_CONTROLS) {
  const reader = makeHellGarrisonReader({ elementId });
  assert.equal(reader.read(), 17);
  assert.deepEqual(reader.invocations, [
    { elementId, method: "patrolling", args: [40] },
  ]);
}
for (const value of [0, -1, 2.5]) {
  const reader = makeHellGarrisonReader({ result: { ok: true, value } });
  assert.equal(reader.read(), value);
}

// A newly initialized ordinary fortress has no stationed troops. An absent fortress
// also reads as zero without asking for a panel the game cannot draw yet.
{
  const root = makeHellGarrisonRoot();
  root.portal.fortress = { garrison: 0, patrols: 0, patrol_size: 10 };
  const reader = makeHellGarrisonReader({
    root,
    result: { ok: true, value: 0 },
  });
  assert.equal(reader.read(), 0);
  assert.deepEqual(reader.invocations[0].args, [0]);
}
{
  const reader = makeHellGarrisonReader({ root: { race: {}, portal: {} } });
  assert.equal(reader.read(), 0);
  assert.deepEqual(reader.invocations, []);
}

// Warlord's `fort` is a throne with enemy attacks, not the ordinary fortress. Even a
// leftover ordinary control must not supply a count for that run.
for (const warlord of [true, 1]) {
  const root = makeHellGarrisonRoot();
  root.race.warlord = warlord;
  const reader = makeHellGarrisonReader({ root });
  assert.equal(reader.read(), undefined);
  assert.deepEqual(reader.invocations, []);
}
for (const root of [
  null,
  [],
  {},
  { race: null, portal: {} },
  { race: [], portal: {} },
  { race: {}, portal: null },
  { race: {}, portal: [] },
  { race: {}, portal: { fortress: null } },
  { race: {}, portal: { fortress: [] } },
  { race: {}, portal: { fortress: {} } },
]) {
  const reader = makeHellGarrisonReader({ root });
  assert.equal(reader.read(), undefined);
  assert.deepEqual(reader.invocations, []);
}
assert.equal(
  readCapturedHellGarrison({ readRoot: () => undefined }, {}),
  undefined,
);
for (const field of ["garrison", "patrols", "patrol_size"]) {
  for (const value of [undefined, NaN, Infinity, "5"]) {
    const root = makeHellGarrisonRoot();
    root.portal.fortress[field] = value;
    const reader = makeHellGarrisonReader({ root });
    assert.equal(reader.read(), undefined);
    assert.deepEqual(reader.invocations, []);
  }
}

for (const options of [
  { elementId: "missing" },
  { methods: ["attack"] },
  { methods: [] },
]) {
  const reader = makeHellGarrisonReader(options);
  assert.equal(reader.read(), undefined);
  assert.deepEqual(reader.invocations, []);
}

for (const value of [undefined, null, NaN, Infinity, "17", {}]) {
  const reader = makeHellGarrisonReader({ result: { ok: true, value } });
  assert.equal(reader.read(), undefined);
}
for (const reason of [
  "unknown-control",
  "unknown-method",
  "stale-control",
  "threw",
]) {
  const reader = makeHellGarrisonReader({ result: { ok: false, reason } });
  assert.equal(reader.read(), undefined);
}

// A successful query belongs only to the root and control generation it sampled.
for (const afterInvoke of [
  ({ replaceRoot }) => replaceRoot(),
  ({ replaceControl }) => replaceControl(),
]) {
  const reader = makeHellGarrisonReader({ afterInvoke });
  assert.equal(reader.read(), undefined);
}

console.log("Captured Hell garrison tests passed");
