import assert from "node:assert/strict";
import { createGameClickMultipliers } from "../src/adapters/browser/game-click-multipliers.ts";

let keyManager;
const multipliers = createGameClickMultipliers({
  getKeyManager: () => keyManager,
});

function recordingKeyManager(calls) {
  return {
    set(...args) {
      calls.push(["set", args, this === keyManager]);
    },
    *click(count) {
      calls.push(["click", count, this === keyManager]);
      while (count > 0) {
        yield (count -= 1);
      }
    },
  };
}

// Steps come back one per remaining unit, and the manager's own methods are
// called on the manager itself rather than free functions.
{
  const calls = [];
  keyManager = recordingKeyManager(calls);
  assert.deepEqual([...multipliers.steps(3)], [2, 1, 0]);
  multipliers.clear();
  assert.deepEqual(calls, [
    ["click", 3, true],
    ["set", [false, false, false], true],
  ]);
}

// Nothing is pressed until the caller starts iterating: a sequence the caller
// abandons before its first step leaves the modifier keys alone.
{
  const calls = [];
  keyManager = recordingKeyManager(calls);
  const sequence = multipliers.steps(5);
  assert.deepEqual(calls, []);
  const iterator = sequence[Symbol.iterator]();
  assert.deepEqual(iterator.next(), { value: 4, done: false });
  assert.deepEqual(calls, [["click", 5, true]]);
}

// A count of zero yields nothing, and the manager still decides that: the port
// asks it rather than short-circuiting on the caller's number.
{
  const calls = [];
  keyManager = recordingKeyManager(calls);
  assert.deepEqual([...multipliers.steps(0)], []);
  assert.deepEqual(calls, [["click", 0, true]]);
}

// The manager is read per call, so a runtime that swaps it mid-session is
// followed rather than captured at construction.
{
  const first = [];
  const second = [];
  keyManager = recordingKeyManager(first);
  multipliers.clear();
  keyManager = recordingKeyManager(second);
  multipliers.clear();
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
}

// A missing or malformed manager is a defect in the read, not a silent no-op.
{
  keyManager = undefined;
  assert.throws(() => multipliers.clear(), /KeyManager must be an object/);
  assert.throws(
    () => [...multipliers.steps(1)],
    /KeyManager must be an object/,
  );

  keyManager = { click: 4, set: 4 };
  assert.throws(() => multipliers.clear(), /KeyManager.set must be a function/);
  assert.throws(
    () => [...multipliers.steps(1)],
    /KeyManager.click must be a function/,
  );

  keyManager = { click: () => 7 };
  assert.throws(
    () => [...multipliers.steps(1)],
    /KeyManager.click\(\) result must be an object/,
  );

  keyManager = { click: () => ({}) };
  assert.throws(
    () => [...multipliers.steps(1)],
    /KeyManager.click\(\) result\[Symbol.iterator\] must be a function/,
  );

  keyManager = { click: () => ({ [Symbol.iterator]: () => ({}) }) };
  assert.throws(
    () => [...multipliers.steps(1)],
    /KeyManager.click\(\) iterator.next must be a function/,
  );

  keyManager = {
    click: () => ({ [Symbol.iterator]: () => ({ next: () => undefined }) }),
  };
  assert.throws(
    () => [...multipliers.steps(1)],
    /KeyManager.click\(\) iterator result must be an object/,
  );
}
