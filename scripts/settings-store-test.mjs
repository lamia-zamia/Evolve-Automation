import assert from "node:assert/strict";

import { createSettingsStore } from "../src/adapters/storage/settings-store.ts";

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  };
}

// load: absent key falls back to {} (legacy `?? {}` over the null parse).
{
  const store = createSettingsStore(fakeStorage());
  assert.deepEqual(store.load(), {});
}

// load: stored JSON literal null also falls back to {}.
{
  const store = createSettingsStore(fakeStorage({ settings: "null" }));
  assert.deepEqual(store.load(), {});
}

// load: a stored record round-trips.
{
  const store = createSettingsStore(
    fakeStorage({ settings: JSON.stringify({ a: 1, triggers: [] }) }),
  );
  assert.deepEqual(store.load(), { a: 1, triggers: [] });
}

// load: corrupt JSON throws, matching the legacy unprotected boundary.
{
  const store = createSettingsStore(fakeStorage({ settings: "{not json" }));
  assert.throws(() => store.load(), SyntaxError);
}

// save: serializes to the "settings" key.
{
  const storage = fakeStorage();
  const store = createSettingsStore(storage);
  store.save({ b: 2, triggers: [{ id: "x" }] });
  assert.equal(storage.map.get("settings"), '{"b":2,"triggers":[{"id":"x"}]}');
}

// save then load round-trips through the same storage.
{
  const storage = fakeStorage();
  const store = createSettingsStore(storage);
  store.save({ c: 3 });
  assert.deepEqual(store.load(), { c: 3 });
}

console.log("Settings store adapter tests passed");
