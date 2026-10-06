import assert from "node:assert/strict";

import { createCapturedBuildingUnlocks } from "../src/adapters/evolve/progression/build/captured-building-unlocks.ts";
import { createCapturedBuildingSwitchStates } from "../src/adapters/evolve/progression/build/captured-building-switch-states.ts";
import { readCapturedActionAvailability } from "../src/adapters/evolve/progression/build/captured-building-availability.ts";
import { readCapturedBuildingEntries } from "../src/adapters/evolve/progression/build/captured-building-catalog.ts";
import {
  makeCapturedBuildingMechanics,
  availableWhenBindings,
} from "./captured-building-test-fixtures.mjs";

const root = {
  settings: { showCity: true, showSpace: true, showPortal: true },
  race: {},
  genes: {},
  tech: {},
  city: {},
  space: {},
  portal: {},
};

function controls({ capturedElementIds = [], resolve = () => undefined } = {}) {
  return {
    resolve,
    invoke: () => ({ ok: false, reason: "unknown-control" }),
    capturedElementIds: () => capturedElementIds,
  };
}

function makeUnlockReader({
  currentRoot = root,
  mechanics,
  gameControls = controls(),
  onSkipped,
} = {}) {
  return createCapturedBuildingUnlocks({
    rootState: {
      readRoot: () => currentRoot,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    mechanics,
    controls: gameControls,
    ...(onSkipped === undefined ? {} : { onSkipped }),
  });
}

// A native true is an offer before the action has ever acquired a rendered control or DOM row.
{
  const currentRoot = { ...root, city: { farm: { count: 0, on: 0 } } };
  const mechanics = makeCapturedBuildingMechanics(currentRoot, {
    availability: availableWhenBindings("city-farm"),
  });
  const reader = makeUnlockReader({ currentRoot, mechanics });
  const catalog = reader.read(new Set(["city"]));
  assert.equal(catalog.unlocked.has("city-farm"), true);
  assert.deepEqual([...catalog.regions], ["city"]);
}

// A valid native false is unavailable; it is not an offer that happens to lack a row.
{
  const mechanics = makeCapturedBuildingMechanics(root);
  const catalog = makeUnlockReader({ mechanics }).read(new Set(["city"]));
  assert.equal(catalog.unlocked.has("city-farm"), false);
  assert.deepEqual([...catalog.regions], ["city"]);
}

// One invalid managed native answer makes the requested region catalog fail closed.
{
  const skipped = [];
  const mechanics = makeCapturedBuildingMechanics(root, {
    availability: (_root, binding) =>
      binding === "city-farm"
        ? { kind: "invalid" }
        : { kind: "value", value: true },
  });
  const catalog = makeUnlockReader({
    mechanics,
    onSkipped: (...args) => skipped.push(args),
  }).read(new Set(["city"]));
  assert.equal(catalog, undefined);
  assert.ok(
    skipped.some(
      ([region, reason]) => region === "city" && reason.includes("city-farm"),
    ),
  );
}

// A control cannot cover a genuinely missing native action in the requested region.
{
  const currentRoot = { ...root, city: { farm: { count: 0, on: 0 } } };
  const skipped = [];
  const mechanics = makeCapturedBuildingMechanics(currentRoot, {
    omitBindings: new Set(["city-farm"]),
    availability: availableWhenBindings("city-farm"),
  });
  const catalog = makeUnlockReader({
    currentRoot,
    mechanics,
    gameControls: controls({ capturedElementIds: ["city-farm"] }),
    onSkipped: (...args) => skipped.push(args),
  }).read(new Set(["city"]));
  assert.equal(catalog, undefined);
  assert.ok(
    skipped.some(
      ([region, reason]) =>
        region === "city" &&
        reason === "no captured native action for city-farm",
    ),
  );
}

// Two native definitions for one binding remain ambiguous even when each joins to a root state.
{
  const currentRoot = { ...root, city: { farm: { count: 0, on: 0 } } };
  const base = makeCapturedBuildingMechanics(currentRoot, {
    availability: availableWhenBindings("city-farm"),
  });
  const farm = base
    .readStructures()
    .find((structure) => structure.actionId === "city-farm");
  assert.ok(farm);
  const duplicate = Object.freeze({ ...farm });
  const mechanics = Object.freeze({
    readStructures: () => Object.freeze([...base.readStructures(), duplicate]),
  });
  const skipped = [];
  const catalog = makeUnlockReader({
    currentRoot,
    mechanics,
    onSkipped: (...args) => skipped.push(args),
  }).read(new Set(["city"]));
  assert.equal(catalog, undefined);
  assert.ok(
    skipped.some(
      ([region, reason]) =>
        region === "city" &&
        reason === "the captured native identity for city-farm is ambiguous",
    ),
  );
}

// A fresh semantic read observes progression facts directly, without relying on a panel redraw.
{
  const currentRoot = { ...root, tech: { currency: 0 } };
  const mechanics = makeCapturedBuildingMechanics(currentRoot, {
    availability: (liveRoot, binding) => ({
      kind: "value",
      value: binding === "city-bank" && liveRoot.tech.currency >= 1,
    }),
  });
  const reader = makeUnlockReader({ currentRoot, mechanics });
  assert.equal(reader.read(new Set(["city"])).unlocked.has("city-bank"), false);
  currentRoot.tech.currency = 1;
  assert.equal(reader.read(new Set(["city"])).unlocked.has("city-bank"), true);
}

// DeadSpace at db38e2af keeps all three undefined-prefixed gather actions in the City grid.
{
  const currentRoot = {
    ...root,
    city: {
      food: { count: 0 },
      stone: { count: 0 },
      chrysotile: { count: 0 },
    },
  };
  let chrysotileOffered = true;
  const mechanics = makeCapturedBuildingMechanics(currentRoot, {
    availability: (_liveRoot, binding) => ({
      kind: "value",
      value: binding !== "city-chrysotile" || chrysotileOffered,
    }),
    overrides: new Map([
      [
        "city-food",
        {
          entryKey: "city:food",
          region: "city",
          sector: "city",
          struct: "food",
          actionId: "undefined-food",
        },
      ],
      [
        "city-stone",
        {
          entryKey: "city:stone",
          region: "city",
          sector: "city",
          struct: "stone",
          actionId: "undefined-stone",
        },
      ],
      [
        "city-chrysotile",
        {
          entryKey: "city:chrysotile",
          region: "city",
          sector: "city",
          struct: "chrysotile",
          actionId: "undefined-chrysotile",
        },
      ],
    ]),
  });
  const catalog = makeUnlockReader({
    currentRoot,
    mechanics,
    gameControls: controls(),
  }).read(new Set(["city"]));
  assert.ok(
    catalog,
    "native City availability should complete without Building controls or DOM rows",
  );
  assert.deepEqual([...catalog.regions], ["city"]);
  for (const [entryKey, actionId] of [
    ["city:food", "undefined-food"],
    ["city:stone", "undefined-stone"],
    ["city:chrysotile", "undefined-chrysotile"],
  ]) {
    assert.equal(
      mechanics
        .readStructures()
        .find((structure) => structure.entryKey === entryKey).actionId,
      actionId,
      "normalization leaves the captured native action id unchanged",
    );
  }
  for (const binding of ["city-food", "city-stone", "city-chrysotile"]) {
    assert.equal(catalog.unlocked.has(binding), true);
  }
  const entries = readCapturedBuildingEntries(
    currentRoot,
    controls(),
    mechanics.readStructures(),
  )
    .filter((entry) =>
      ["city-food", "city-stone", "city-chrysotile"].includes(entry.binding),
    )
    .map(({ binding, entryKey }) => [binding, entryKey])
    .sort(([left], [right]) => left.localeCompare(right));
  assert.deepEqual(entries, [
    ["city-chrysotile", "city:chrysotile"],
    ["city-food", "city:food"],
    ["city-stone", "city:stone"],
  ]);

  chrysotileOffered = false;
  assert.equal(
    makeUnlockReader({ currentRoot, mechanics, gameControls: controls() })
      .read(new Set(["city"]))
      .unlocked.has("city-chrysotile"),
    false,
    "the native availability closure remains the offer authority",
  );
}

// Offer membership survives a missing control. Its narrower switch/on_cap read stays unavailable.
{
  const currentRoot = {
    ...root,
    city: { factory: { count: 3, on: 1 } },
  };
  const mechanics = makeCapturedBuildingMechanics(currentRoot, {
    availability: availableWhenBindings("city-factory"),
  });
  const catalog = makeUnlockReader({ currentRoot, mechanics }).read(
    new Set(["city"]),
  );
  assert.equal(catalog.unlocked.has("city-factory"), true);
  const switchStates = createCapturedBuildingSwitchStates({
    rootState: { readRoot: () => currentRoot },
    controls: controls(),
  }).read(catalog);
  assert.deepEqual([...switchStates], []);
}

// Native region/state identity survives a binding whose prefix does not name its root address.
{
  const currentRoot = {
    ...root,
    city: { nanite_factory: { count: 2, on: 1 } },
  };
  const mechanics = makeCapturedBuildingMechanics(currentRoot, {
    availability: availableWhenBindings("space-nanite_factory"),
    overrides: new Map([
      [
        "space-nanite_factory",
        {
          entryKey: "city:nanite_factory",
          region: "city",
          sector: "city",
          struct: "nanite_factory",
        },
      ],
    ]),
  });
  const catalog = makeUnlockReader({ currentRoot, mechanics }).read(
    new Set(["space"]),
  );
  assert.deepEqual(catalog.switches.get("space-nanite_factory"), {
    region: "city",
    type: "nanite_factory",
  });
}

// Full native entry identity selects the address when the short structure name exists elsewhere.
{
  const currentRoot = {
    ...root,
    city: { farm: { count: 1, on: 0 } },
    space: { farm: { count: 7, on: 7 } },
    portal: { farm: { count: 4, on: 2 } },
  };
  const mechanics = makeCapturedBuildingMechanics(currentRoot, {
    availability: availableWhenBindings("city-farm"),
    overrides: new Map([
      [
        "city-farm",
        {
          entryKey: "portal:unique-farm-entry",
          region: "portal",
          sector: "portal",
          struct: "farm",
        },
      ],
    ]),
  });
  const catalog = makeUnlockReader({ currentRoot, mechanics }).read(
    new Set(["city"]),
  );
  assert.deepEqual(catalog.switches.get("city-farm"), {
    region: "portal",
    type: "farm",
  });
}

// A native mission grant remains offered until its completion level, despite having no building state.
{
  const currentRoot = {
    ...root,
    settings: { ...root.settings, showSpace: true },
    tech: { space: 2 },
  };
  const grantAction = { reqs: {}, grant: ["space", 3] };
  const mechanics = makeCapturedBuildingMechanics(currentRoot, {
    overrides: new Map([
      [
        "space-moon_mission",
        {
          readAvailability: (liveRoot) =>
            readCapturedActionAvailability(
              liveRoot,
              grantAction,
              "space",
              "space",
              "moon_mission",
              false,
            ),
        },
      ],
    ]),
  });
  const reader = makeUnlockReader({ currentRoot, mechanics });
  assert.equal(
    reader.read(new Set(["space"])).unlocked.has("space-moon_mission"),
    true,
  );
  currentRoot.tech.space = 3;
  assert.equal(
    reader.read(new Set(["space"])).unlocked.has("space-moon_mission"),
    false,
  );
}

console.log("captured-building-unlocks: passed");
