import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { capturedCitySoldiersForRating } from "../src/adapters/evolve/combat/captured-city-garrison.ts";

function ratingFixture({
  curve = (n) => n * n,
  onInvoke = () => {},
  answer,
} = {}) {
  const original = {};
  let root = original;
  let generation = 1;
  const calls = [];
  const handles = {
    garrison: { elementId: "garrison", generation: 1, methods: ["rating"] },
    c_garrison: { elementId: "c_garrison", generation: 1, methods: ["rating"] },
  };
  const rootState = { readRoot: () => root };
  const controls = {
    resolve: (id) =>
      id === "garrison" ? { ...handles.garrison, generation } : handles[id],
    invoke: (handle, method, args) => {
      calls.push([handle.elementId, method, ...args]);
      onInvoke({
        replaceRoot: () => {
          root = {};
        },
        replaceGeneration: () => {
          generation += 1;
        },
      });
      return answer ?? { ok: true, value: curve(args[0]) };
    },
  };
  const read = (targetRating, capacity = 10) =>
    capturedCitySoldiersForRating({
      rootState,
      controls,
      control: handles.garrison,
      expectedRoot: original,
      targetRating,
      capacity,
    });
  return { read, calls };
}

// Native full-contingent results are nonlinear; a rounded per-soldier display is insufficient.
{
  const fixture = ratingFixture();
  assert.equal(fixture.read(35), 6);
  assert.equal(fixture.read(36), 6);
  assert.equal(fixture.read(37), 7);
  assert.equal(fixture.read(101), 11);
  assert.equal(fixture.read(-1), 0);
  assert.equal(fixture.read(1, 0), 1);
  assert.ok(
    fixture.calls.every(
      ([id, method, , scale]) =>
        id === "garrison" && method === "rating" && scale === false,
    ),
  );
}
{
  const fixture = ratingFixture({ curve: (n) => (n < 4 ? n : 100 + n) });
  assert.equal(fixture.read(104), 4);
}
for (const answer of [
  { ok: false, reason: "stale-control" },
  { ok: true, value: "bad" },
  { ok: true, value: NaN },
]) {
  assert.equal(ratingFixture({ answer }).read(10), undefined);
}
assert.equal(
  ratingFixture({
    onInvoke: () => {
      throw Error("native failure");
    },
  }).read(10),
  undefined,
);
for (const onInvoke of [
  ({ replaceRoot }) => replaceRoot(),
  ({ replaceGeneration }) => replaceGeneration(),
]) {
  const fixture = ratingFixture({ onInvoke });
  assert.equal(fixture.read(35), undefined);
  assert.equal(fixture.calls.length, 1);
}
assert.equal(ratingFixture().read(Infinity), undefined);
assert.equal(ratingFixture().read(10, 1.5), undefined);

const hellSource = readFileSync(
  new URL("../src/adapters/evolve/combat/captured-hell.ts", import.meta.url),
  "utf8",
);
const battleSource = readFileSync(
  new URL("../src/adapters/evolve/combat/battle.ts", import.meta.url),
  "utf8",
);
const sharedSource = readFileSync(
  new URL(
    "../src/adapters/evolve/combat/captured-city-garrison.ts",
    import.meta.url,
  ),
  "utf8",
);
assert.doesNotMatch(
  hellSource,
  /hellSoldiers\s*-\s*hellPatrols\s*\*\s*hellPatrolSize|rating\(10,\s*true\)|targetRating\s*\/\s*perSoldier|armyRating/,
);
assert.doesNotMatch(
  battleSource,
  /capturedBattleSoldiersForRating|armyRating\(/,
);
assert.match(hellSource, /capturedCitySoldiersForRating/);
assert.match(battleSource, /capturedCitySoldiersForRating/);
assert.equal(
  (
    [hellSource, battleSource, sharedSource]
      .join("\n")
      .match(/while \(low < high\)/g) ?? []
  ).length,
  1,
);
assert.doesNotMatch(sharedSource, /armyRating\(|traitTable|race\./);

console.log("Captured city rating tests passed");
