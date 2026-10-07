import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  readCapturedCurrentCityGarrison,
  readCapturedCityGarrisonSnapshot,
} from "../../../src/adapters/evolve/combat/captured-city-garrison.ts";

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
      "../../../src/adapters/evolve/combat/captured-fleet-outer.ts",
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

function nativeSnapshotFixture({
  primaryMethods = ["hell", "s_max"],
  compactMethods = [],
  answers = { hell: 7, s_max: 13 },
  afterInvoke = () => {},
} = {}) {
  const root = {};
  const state = { root, generations: { garrison: 1, c_garrison: 1 } };
  const calls = [];
  const controls = {
    resolve(id) {
      const methods = id === "garrison" ? primaryMethods : compactMethods;
      return methods.length
        ? { elementId: id, generation: state.generations[id], methods }
        : undefined;
    },
    invoke(handle, method) {
      calls.push([handle.elementId, method]);
      afterInvoke(state, handle, method);
      const answer = answers[method];
      if (answer instanceof Error) throw answer;
      return answer?.ok === false ? answer : { ok: true, value: answer };
    },
  };
  return {
    root,
    state,
    calls,
    read: () =>
      readCapturedCityGarrisonSnapshot(
        { readRoot: () => state.root },
        controls,
        root,
      ),
  };
}

for (const fixture of [
  nativeSnapshotFixture(),
  nativeSnapshotFixture({
    primaryMethods: [],
    compactMethods: ["hell", "s_max"],
  }),
  nativeSnapshotFixture({
    primaryMethods: ["hell"],
    compactMethods: ["hell", "s_max"],
  }),
]) {
  const snapshot = fixture.read();
  assert.deepEqual(
    { current: snapshot.current, maximum: snapshot.maximum },
    { current: 7, maximum: 13 },
  );
  assert.equal(snapshot.control.elementId, fixture.calls[0][0]);
  assert.deepEqual(fixture.calls, [
    [fixture.calls[0][0], "hell"],
    [fixture.calls[0][0], "s_max"],
  ]);
}
for (const answers of [
  { hell: 0, s_max: -4 },
  { hell: -3, s_max: 0 },
]) {
  const snapshot = nativeSnapshotFixture({ answers }).read();
  assert.deepEqual(
    { current: snapshot.current, maximum: snapshot.maximum },
    {
      current: answers.hell,
      maximum: answers.s_max,
    },
  );
}
for (const method of ["hell", "s_max"]) {
  for (const bad of [
    NaN,
    Infinity,
    "7",
    new Error("refused"),
    { ok: false, reason: "threw" },
  ]) {
    const fixture = nativeSnapshotFixture({
      compactMethods: ["hell", "s_max"],
      answers: { hell: 7, s_max: 13, [method]: bad },
    });
    assert.equal(fixture.read(), undefined);
    assert.equal(
      fixture.calls.some(([id]) => id === "c_garrison"),
      false,
    );
  }
}
for (const changedAfter of ["hell", "s_max"]) {
  for (const transition of [
    (state) => {
      state.root = {};
    },
    (state) => {
      state.generations.garrison++;
    },
  ]) {
    const fixture = nativeSnapshotFixture({
      compactMethods: ["hell", "s_max"],
      afterInvoke: (state, _handle, method) => {
        if (method === changedAfter) transition(state);
      },
    });
    assert.equal(fixture.read(), undefined);
    assert.equal(
      fixture.calls.some(([id]) => id === "c_garrison"),
      false,
    );
  }
}
