import assert from "node:assert/strict";

import { createCapturedBuildingSwitchStates } from "../src/adapters/evolve/progression/build/captured-building-switch-states.ts";

/**
 * A game whose row components behave the way `setAction` builds them: `on_cap` reads the built
 * count out of the live root unless the definition overrode it, and every read of `on` goes
 * through the current root rather than a reference taken when the row was drawn.
 */
function makeGame({ root, onCap = {} } = {}) {
  const state = { root, generations: new Map(), invoked: [] };
  const controls = {
    resolve(elementId) {
      if (state.root === undefined) return undefined;
      const known = state.generations.get(elementId);
      if (known === undefined) return undefined;
      return { elementId, generation: known, methods: ["on_cap"] };
    },
    invoke(handle, method) {
      const current = state.generations.get(handle.elementId);
      if (current === undefined) {
        return { ok: false, reason: "unknown-control" };
      }
      if (current !== handle.generation) {
        return { ok: false, reason: "stale-control" };
      }
      if (method !== "on_cap") return { ok: false, reason: "unknown-method" };
      state.invoked.push(handle.elementId);
      const override = onCap[handle.elementId];
      if (override !== undefined) return { ok: true, value: override() };
      // The upstream default: `global[action][type].count`, read live.
      const address = state.addresses.get(handle.elementId);
      return {
        ok: true,
        value: state.root[address.region][address.type].count,
      };
    },
    capturedElementIds: () => [...state.generations.keys()],
  };
  const rootState = {
    readRoot: () => state.root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
  const reader = createCapturedBuildingSwitchStates({ rootState, controls });
  return { state, reader };
}

/** A catalog naming exactly the switchable rows, the way a discovery draw would have. */
function makeCatalog(switches) {
  return Object.freeze({
    unlocked: new Set(switches.map(([id]) => id)),
    regions: new Set(["city"]),
    switches: new Map(
      switches.map(([id, region, type]) => [id, { region, type }]),
    ),
  });
}

// A normal powered building: the switch shows what is on, and the rest of the built count off.
{
  const { state, reader } = makeGame({
    root: { city: { factory: { count: 7, on: 3 } } },
  });
  state.addresses = new Map([
    ["city-factory", { region: "city", type: "factory" }],
  ]);
  state.generations.set("city-factory", 1);
  const catalog = makeCatalog([["city-factory", "city", "factory"]]);
  assert.deepEqual(reader.read(catalog).get("city-factory"), { on: 3, off: 4 });

  // Power moves every tick. The catalog is untouched and nothing is redrawn: the next read is a
  // fresh `on` and a fresh `on_cap`, off the same cached identity.
  state.root.city.factory.on = 6;
  assert.deepEqual(reader.read(catalog).get("city-factory"), { on: 6, off: 1 });
  state.root.city.factory.count = 9;
  assert.deepEqual(reader.read(catalog).get("city-factory"), { on: 6, off: 3 });
}

// Upstream overrides `on_cap` for a structure assembled out of segments — the descender, the Tau
// Ceti server farm, the detector — which is one machine however many segments it took. The
// component's own method answers that, and nothing here restates the rule: a reader that assumed
// `count` would report 99 copies switched off.
{
  const { state, reader } = makeGame({
    root: { space: { descender: { count: 100, on: 1 } } },
    onCap: {
      "space-descender": () =>
        state.root.space.descender.count >= 100 ? 1 : 0,
    },
  });
  state.addresses = new Map([
    ["space-descender", { region: "space", type: "descender" }],
  ]);
  state.generations.set("space-descender", 1);
  const catalog = makeCatalog([["space-descender", "space", "descender"]]);
  assert.deepEqual(reader.read(catalog).get("space-descender"), {
    on: 1,
    off: 0,
  });
  assert.deepEqual(state.invoked, ["space-descender"]);
  // Below its segment count the same method says the machine is not there at all.
  state.root.space.descender.count = 40;
  state.root.space.descender.on = 0;
  assert.deepEqual(reader.read(catalog).get("space-descender"), {
    on: 0,
    off: 0,
  });
}

// A building with no power switch has no `on` of its own, and must stay absent rather than being
// reported as its whole count switched off.
{
  const { state, reader } = makeGame({
    root: { city: { farm: { count: 12 } } },
  });
  state.addresses = new Map([["city-farm", { region: "city", type: "farm" }]]);
  state.generations.set("city-farm", 1);
  const states = reader.read(makeCatalog([["city-farm", "city", "farm"]]));
  assert.equal(states.has("city-farm"), false);
  assert.equal(states.size, 0);
  // The cap was never asked for: there is no switch to size.
  assert.deepEqual(state.invoked, []);
}
// An inherited `on` is not the game's own field either.
{
  const { state, reader } = makeGame({
    root: { city: { farm: Object.create({ on: 4 }) } },
  });
  state.root.city.farm.count = 12;
  state.addresses = new Map([["city-farm", { region: "city", type: "farm" }]]);
  state.generations.set("city-farm", 1);
  assert.equal(
    reader.read(makeCatalog([["city-farm", "city", "farm"]])).size,
    0,
  );
}

// The game rebinds a row whenever it redraws the panel, and the capture records that on its own.
// The handle is re-resolved on every read, so a generation that moved between cycles is answered
// by the newest one — never by a forced discovery and never by a dropped row.
{
  const { state, reader } = makeGame({
    root: { city: { factory: { count: 4, on: 2 } } },
  });
  state.addresses = new Map([
    ["city-factory", { region: "city", type: "factory" }],
  ]);
  state.generations.set("city-factory", 1);
  const catalog = makeCatalog([["city-factory", "city", "factory"]]);
  assert.deepEqual(reader.read(catalog).get("city-factory"), { on: 2, off: 2 });
  state.generations.set("city-factory", 7);
  assert.deepEqual(reader.read(catalog).get("city-factory"), { on: 2, off: 2 });
}

// The game replaces its root on a save load, a prestige and a reactivity restore. The cached
// identity is two plain keys, so it resolves into whatever root is current; a reader holding the
// binding object the draw handed it would still be reading the old one.
{
  const stale = { count: 4, on: 2 };
  const { state, reader } = makeGame({ root: { city: { factory: stale } } });
  state.addresses = new Map([
    ["city-factory", { region: "city", type: "factory" }],
  ]);
  state.generations.set("city-factory", 1);
  const catalog = makeCatalog([["city-factory", "city", "factory"]]);
  assert.deepEqual(reader.read(catalog).get("city-factory"), { on: 2, off: 2 });
  state.root = { city: { factory: { count: 10, on: 9 } } };
  assert.deepEqual(reader.read(catalog).get("city-factory"), { on: 9, off: 1 });
  assert.deepEqual(stale, { count: 4, on: 2 });
}
// A root the new run no longer carries that record in leaves the row unreported, not zeroed.
{
  const { state, reader } = makeGame({
    root: { city: { factory: { count: 4, on: 2 } } },
  });
  state.addresses = new Map([
    ["city-factory", { region: "city", type: "factory" }],
  ]);
  state.generations.set("city-factory", 1);
  const catalog = makeCatalog([["city-factory", "city", "factory"]]);
  state.root = { city: {} };
  assert.equal(reader.read(catalog).size, 0);
}

// A control the registry cannot answer for leaves that one row unreported. Nothing about it forces
// a draw, and every other row is still read.
{
  const { state, reader } = makeGame({
    root: {
      city: { factory: { count: 4, on: 2 }, wardenclyffe: { count: 3, on: 1 } },
    },
  });
  state.addresses = new Map([
    ["city-factory", { region: "city", type: "factory" }],
    ["city-wardenclyffe", { region: "city", type: "wardenclyffe" }],
  ]);
  state.generations.set("city-wardenclyffe", 1);
  const states = reader.read(
    makeCatalog([
      ["city-factory", "city", "factory"],
      ["city-wardenclyffe", "city", "wardenclyffe"],
    ]),
  );
  assert.equal(states.has("city-factory"), false);
  assert.deepEqual(states.get("city-wardenclyffe"), { on: 1, off: 2 });
}
// So does one whose `on_cap` refuses, or answers with something that is not a count.
{
  const { state, reader } = makeGame({
    root: { city: { factory: { count: 4, on: 2 } } },
    onCap: { "city-factory": () => "🥚" },
  });
  state.addresses = new Map([
    ["city-factory", { region: "city", type: "factory" }],
  ]);
  state.generations.set("city-factory", 1);
  assert.equal(
    reader.read(makeCatalog([["city-factory", "city", "factory"]])).size,
    0,
  );
}
// A cap below what is already switched on is not a shape the rendered spans could show either.
{
  const { state, reader } = makeGame({
    root: { city: { factory: { count: 1, on: 5 } } },
  });
  state.addresses = new Map([
    ["city-factory", { region: "city", type: "factory" }],
  ]);
  state.generations.set("city-factory", 1);
  assert.equal(
    reader.read(makeCatalog([["city-factory", "city", "factory"]])).size,
    0,
  );
}

// Nothing to read before the game has a root, and nothing asked of the registry.
{
  const { state, reader } = makeGame({ root: undefined });
  state.addresses = new Map();
  assert.equal(
    reader.read(makeCatalog([["city-factory", "city", "factory"]])).size,
    0,
  );
  assert.deepEqual(state.invoked, []);
}

// A catalog with no switchable row asks the game nothing at all.
{
  const { state, reader } = makeGame({ root: { city: {} } });
  state.addresses = new Map();
  assert.equal(reader.read(makeCatalog([])).size, 0);
  assert.deepEqual(state.invoked, []);
}

console.log("captured-building-switch-states ok");
