import assert from "node:assert/strict";

import { createCapturedBuildingUnlocks } from "../../../src/adapters/evolve/progression/build/captured-building-unlocks.ts";
import { createCapturedBuildingSwitchStates } from "../../../src/adapters/evolve/progression/build/captured-building-switch-states.ts";
import { readCapturedActionAvailability } from "../../../src/adapters/evolve/progression/build/captured-building-availability.ts";
import { readCapturedBuildingEntries } from "../../../src/adapters/evolve/progression/build/captured-building-catalog.ts";
import {
  CAPTURED_BUILD_REGIONS,
  bindingForBuildingElement,
} from "../../../src/adapters/evolve/progression/build/captured-building-metadata.ts";
import { CAPTURED_AUTOMATION_BUILDING_BINDINGS } from "../../../src/adapters/evolve/progression/build/captured-building-bindings.generated.ts";
import { readCapturedBuildingState } from "../../../src/adapters/evolve/progression/build/captured-building-state.ts";
import {
  makeCapturedBuildingMechanics,
  availableWhenBindings,
} from "../../support/fixtures/captured-building-test-fixtures.mjs";

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
  readRoot = () => currentRoot,
  mechanics,
  onSkipped,
} = {}) {
  return createCapturedBuildingUnlocks({
    rootState: {
      readRoot,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    mechanics,
    ...(onSkipped === undefined ? {} : { onSkipped }),
  });
}

// Differential oracle for the former empty-control route: derive state identities through the
// generic settings catalog, then apply the unchanged availability and Building-state semantics.
function readGenericCatalogReference(root, regions, mechanics) {
  let structures;
  try {
    structures = mechanics.readStructures();
  } catch {
    return undefined;
  }
  if (structures === undefined) return undefined;
  const structuresByBinding = new Map();
  for (const structure of structures) {
    const binding = bindingForBuildingElement(structure.actionId);
    if (!CAPTURED_AUTOMATION_BUILDING_BINDINGS.has(binding)) continue;
    const group = structuresByBinding.get(binding) ?? [];
    group.push(structure);
    structuresByBinding.set(binding, group);
  }
  let entries;
  try {
    entries = readCapturedBuildingEntries(
      root,
      controls(),
      structures,
      structuresByBinding,
    );
  } catch {
    return undefined;
  }
  const entriesByBinding = new Map();
  for (const entry of entries) {
    const group = entriesByBinding.get(entry.binding) ?? [];
    group.push(entry);
    entriesByBinding.set(entry.binding, group);
  }
  const bindingsByRegion = new Map();
  for (const binding of CAPTURED_AUTOMATION_BUILDING_BINDINGS) {
    const region = binding.slice(0, binding.indexOf("-"));
    const group = bindingsByRegion.get(region) ?? [];
    group.push(binding);
    bindingsByRegion.set(region, group);
  }
  const unlocked = new Set();
  const sampled = new Set();
  const switches = new Map();
  for (const region of regions) {
    if (!CAPTURED_BUILD_REGIONS.has(region)) continue;
    const regionUnlocked = new Set();
    const regionSwitches = new Map();
    let complete = true;
    for (const binding of bindingsByRegion.get(region) ?? []) {
      const candidates = structuresByBinding.get(binding) ?? [];
      const candidateEntries = (entriesByBinding.get(binding) ?? []).filter(
        (entry) => entry.entryKey !== undefined,
      );
      const joined =
        candidates.length === 1
          ? candidates
          : candidates.filter((structure) =>
              candidateEntries.some(
                (entry) => entry.entryKey === structure.entryKey,
              ),
            );
      if (joined.length !== 1) {
        complete = false;
        break;
      }
      const structure = joined[0];
      const entry = candidateEntries.find(
        (candidate) => candidate.entryKey === structure.entryKey,
      );
      if (
        candidateEntries.length > 0 &&
        (entry === undefined || candidateEntries.length !== 1)
      ) {
        complete = false;
        break;
      }
      let availability;
      try {
        availability = structure.readAvailability(root);
      } catch {
        availability = { kind: "invalid" };
      }
      if (availability.kind !== "value") {
        complete = false;
        break;
      }
      if (!availability.value) continue;
      regionUnlocked.add(binding);
      if (entry === undefined) continue;
      let state;
      try {
        state = readCapturedBuildingState(root, entry, structure, true);
      } catch {
        state = undefined;
      }
      if (state?.hasState === true) {
        regionSwitches.set(
          binding,
          Object.freeze({ region: structure.region, type: structure.struct }),
        );
      }
    }
    if (!complete) continue;
    for (const binding of regionUnlocked) unlocked.add(binding);
    for (const [binding, address] of regionSwitches)
      switches.set(binding, address);
    sampled.add(region);
  }
  if (sampled.size === 0) return undefined;
  return Object.freeze({ unlocked, regions: sampled, switches });
}

function assertUnlockMatchesGenericCatalog(root, regions, mechanics, reader) {
  assert.deepEqual(
    reader.read(regions),
    readGenericCatalogReference(root, regions, mechanics),
  );
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

// Requested regions scope the returned catalog; every managed region can also be sampled.
{
  const mechanics = makeCapturedBuildingMechanics(root);
  const reader = makeUnlockReader({ mechanics });
  const all = reader.read(new Set(["city", "space", "portal"]));
  assertUnlockMatchesGenericCatalog(
    root,
    new Set(["city", "space", "portal"]),
    mechanics,
    reader,
  );
  assert.deepEqual([...all.regions], ["city", "space", "portal"]);
  const partial = reader.read(new Set(["space"]));
  assertUnlockMatchesGenericCatalog(
    root,
    new Set(["space"]),
    mechanics,
    reader,
  );
  assert.deepEqual([...partial.regions], ["space"]);
  assert.equal(partial.unlocked.has("city-farm"), false);
}

// Root replacement, temporarily missing roots, and native root-state records are observed fresh.
{
  let currentRoot = { ...root, city: { farm: { count: 0, on: 0 } } };
  let suppressed = false;
  const mechanics = makeCapturedBuildingMechanics(root, {
    availability: (_liveRoot, binding) => ({
      kind: "value",
      value: binding === "city-farm",
    }),
  });
  const reader = makeUnlockReader({
    mechanics,
    readRoot: () => (suppressed ? undefined : currentRoot),
  });
  assertUnlockMatchesGenericCatalog(
    currentRoot,
    new Set(["city"]),
    mechanics,
    reader,
  );
  assert.equal(reader.read(new Set(["city"])).switches.has("city-farm"), true);
  suppressed = true;
  assert.equal(reader.read(new Set(["city"])), undefined);
  suppressed = false;
  currentRoot = { ...root, city: {} };
  assertUnlockMatchesGenericCatalog(
    currentRoot,
    new Set(["city"]),
    mechanics,
    reader,
  );
  const missingState = reader.read(new Set(["city"]));
  assert.equal(missingState.unlocked.has("city-farm"), true);
  assert.equal(missingState.switches.has("city-farm"), false);
  currentRoot = { ...root, city: { farm: { count: 4, on: 2 } } };
  assertUnlockMatchesGenericCatalog(
    currentRoot,
    new Set(["city"]),
    mechanics,
    reader,
  );
  const replacedState = reader.read(new Set(["city"]));
  assert.equal(replacedState.switches.has("city-farm"), true);
}

// Native structure-reader failures remain unavailable and recover on a later read.
{
  let fail = true;
  const mechanics = makeCapturedBuildingMechanics(root, {
    availability: availableWhenBindings("city-farm"),
    structureSnapshot: (structures) => {
      if (fail) throw new Error("native reader unavailable");
      return structures;
    },
  });
  const reader = makeUnlockReader({ mechanics });
  assert.equal(reader.read(new Set(["city"])), undefined);
  fail = false;
  assert.equal(reader.read(new Set(["city"])).unlocked.has("city-farm"), true);
}

// Unlock sampling never localizes a native-only settings label; that lazy reader is not part of
// BuildingUnlockCatalog and can fail independently without invalidating the observation.
{
  const currentRoot = { ...root, city: { farm: { count: 0, on: 0 } } };
  const mechanics = makeCapturedBuildingMechanics(currentRoot, {
    availability: availableWhenBindings("city-farm"),
    overrides: new Map([
      [
        "city-farm",
        {
          readTitle: () => {
            throw new Error("localization must not run");
          },
        },
      ],
    ]),
  });
  const catalog = makeUnlockReader({ currentRoot, mechanics }).read(
    new Set(["city"]),
  );
  assert.deepEqual([...catalog.regions], ["city"]);
  assert.equal(catalog.unlocked.has("city-farm"), true);
  assert.deepEqual(catalog.switches.get("city-farm"), {
    region: "city",
    type: "farm",
  });
}

// Keep the original state evaluator's fail-closed validation even though unlock membership is
// already known. Invalid counts or native requirements suppress only the switch address.
{
  const currentRoot = {
    ...root,
    city: { farm: { count: Number.NaN, on: 0 } },
  };
  const invalidRequirements = makeCapturedBuildingMechanics(currentRoot, {
    availability: availableWhenBindings("city-farm"),
    overrides: new Map([
      ["city-farm", { readPowerRequirements: () => ({ kind: "invalid" }) }],
    ]),
  });
  const catalog = makeUnlockReader({
    currentRoot,
    mechanics: invalidRequirements,
  }).read(new Set(["city"]));
  assert.equal(catalog.unlocked.has("city-farm"), true);
  assert.equal(catalog.switches.has("city-farm"), false);
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
  assertUnlockMatchesGenericCatalog(
    currentRoot,
    new Set(["city"]),
    mechanics,
    reader,
  );
  assert.equal(reader.read(new Set(["city"])).unlocked.has("city-bank"), false);
  currentRoot.tech.currency = 1;
  assertUnlockMatchesGenericCatalog(
    currentRoot,
    new Set(["city"]),
    mechanics,
    reader,
  );
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
