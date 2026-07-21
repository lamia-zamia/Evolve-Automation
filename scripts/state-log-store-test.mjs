import assert from "node:assert/strict";

import { createStateLogStore } from "../src/adapters/storage/state-log-store.ts";

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
  };
}

// load: absent key returns null (legacy null parse), which loadStateLog treats
// as "no saved log" and falls back to a fresh log.
{
  const store = createStateLogStore(fakeStorage());
  assert.equal(store.load(), null);
}

// load: stored JSON literal null also returns null.
{
  const store = createStateLogStore(fakeStorage({ ea_state_log: "null" }));
  assert.equal(store.load(), null);
}

// load: a stored record round-trips.
{
  const store = createStateLogStore(
    fakeStorage({
      ea_state_log: JSON.stringify({ v: 2, reset: 7, samples: [] }),
    }),
  );
  assert.deepEqual(store.load(), { v: 2, reset: 7, samples: [] });
}

// load: corrupt JSON throws, matching the legacy inline parse. loadStateLog's
// try/catch turns this into a fresh log.
{
  const store = createStateLogStore(fakeStorage({ ea_state_log: "invalid" }));
  assert.throws(() => store.load(), SyntaxError);
}

// save: serializes to the "ea_state_log" key.
{
  const storage = fakeStorage();
  const store = createStateLogStore(storage);
  store.save({ v: 2, reset: 1, samples: [{ t: 0 }] });
  assert.equal(
    storage.map.get("ea_state_log"),
    '{"v":2,"reset":1,"samples":[{"t":0}]}',
  );
}

// save then load round-trips through the same storage.
{
  const storage = fakeStorage();
  const store = createStateLogStore(storage);
  store.save({ v: 2, reset: 3 });
  assert.deepEqual(store.load(), { v: 2, reset: 3 });
}

console.log("State log store adapter tests passed");
