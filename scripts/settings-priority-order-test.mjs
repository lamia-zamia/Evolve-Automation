// The ordering mechanics every priority table shares. Each section keeps its own key naming;
// these cases pin the behaviour those five call sites used to each re-implement.

import assert from "node:assert/strict";
import {
  sortByStoredPriority,
  writeDefaultPriorityOrder,
  writeExplicitPriorityOrder,
} from "../src/domain/settings-priority-order.ts";

const entries = [{ id: "a" }, { id: "b" }, { id: "c" }];
const keyFor = (entry) => `p_${entry.id}`;
const idKeyFor = (id) => `p_${id}`;
const ids = (list) => list.map((entry) => entry.id);

// 1. Stored finite priorities order the entries.
assert.deepEqual(
  ids(sortByStoredPriority(entries, { p_a: 2, p_b: 1, p_c: 0 }, keyFor)),
  ["c", "b", "a"],
);

// 2. A missing priority falls back to the entry's position in the source catalog, so `c` with a
// stored 0 ties with `a`'s fallback 0 and the catalog order breaks the tie.
assert.deepEqual(ids(sortByStoredPriority(entries, { p_c: 0 }, keyFor)), [
  "a",
  "c",
  "b",
]);
assert.deepEqual(ids(sortByStoredPriority(entries, { p_c: -1 }, keyFor)), [
  "c",
  "a",
  "b",
]);

// 3. Malformed and non-finite priorities fall back the same way rather than poisoning the sort.
for (const bad of ["1", null, undefined, Number.NaN, Infinity, {}, true]) {
  assert.deepEqual(
    ids(sortByStoredPriority(entries, { p_a: bad, p_b: 5 }, keyFor)),
    ["a", "c", "b"],
    `a priority of ${String(bad)} should behave as absent`,
  );
}

// 4. Ties preserve source order.
assert.deepEqual(
  ids(sortByStoredPriority(entries, { p_a: 1, p_b: 1, p_c: 1 }, keyFor)),
  ["a", "b", "c"],
);

// The result is frozen; callers hand it straight to a read model.
assert.equal(Object.isFrozen(sortByStoredPriority(entries, {}, keyFor)), true);

// An empty catalog is an empty order, not a throw.
assert.deepEqual(ids(sortByStoredPriority([], { p_a: 0 }, keyFor)), []);

// 5. Reset writes sequential priorities in catalog order, over whatever was stored.
{
  const raw = { p_a: 99, unrelated: 1 };
  writeDefaultPriorityOrder(raw, ["a", "b", "c"], idKeyFor);
  assert.deepEqual(raw, { p_a: 0, p_b: 1, p_c: 2, unrelated: 1 });
}

// 6. Reorder writes the requested order and ignores ids the catalog does not know.
{
  const raw = {};
  writeExplicitPriorityOrder(
    raw,
    ["c", "a", "ghost"],
    ["a", "b", "c"],
    idKeyFor,
  );
  assert.deepEqual(raw, { p_c: 0, p_a: 1 });
  assert.equal(raw.p_ghost, undefined);
}

// A Set of known ids is accepted as-is, which is how the adapters already hold theirs.
{
  const raw = {};
  writeExplicitPriorityOrder(raw, ["b"], new Set(["a", "b"]), idKeyFor);
  assert.deepEqual(raw, { p_b: 0 });
}
