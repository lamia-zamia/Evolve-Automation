import assert from "node:assert/strict";

import { createGameDrawnActionsReader } from "../src/adapters/browser/game-drawn-actions.ts";
import { createCapturedBuildingUnlocks } from "../src/adapters/evolve/progression/build/captured-building-unlocks.ts";
import {
  MAIN_TAB_CONTROL,
  MAIN_TAB_SETTING,
} from "../src/adapters/evolve/captured-tab-discovery.ts";

/**
 * One drawn row. A plain id is a row with no power switch; `[id, on, off]` is one the game drew a
 * `span.on`/`span.off` pair onto, with the text it rendered into each.
 */
function makeRow(row) {
  const [id, on, off] = Array.isArray(row) ? row : [row];
  const spans = {
    ":scope > span.on": on,
    ":scope > span.off": off,
  };
  return {
    id,
    attributes: [],
    querySelectorAll(selector) {
      const text = spans[selector];
      return text === undefined ? [] : [{ textContent: String(text) }];
    },
  };
}

/** A page whose region containers hold the given action ids, keyed by container selector. */
function makePage(containers) {
  return {
    querySelectorAll(selector) {
      const rows = containers[selector];
      if (rows !== undefined) return rows.map(makeRow);
      // A bare container selector answers whether that panel is present at all.
      const bare = Object.hasOwn(containers, `${selector} .action`);
      return bare ? [{ id: selector.slice(1), attributes: [] }] : [];
    },
  };
}

function makeReader(containers, { failFor = new Set(), settings = {} } = {}) {
  const page = makePage(containers);
  const paths = [];
  const skipped = [];
  const reader = createCapturedBuildingUnlocks({
    rootState: {
      readRoot: () => ({ settings }),
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    discovery: {
      discover(path, options = {}) {
        const subTab = path[path.length - 1]?.index;
        paths.push(
          path.map((step) => [step.setting, step.control, step.index]),
        );
        if (failFor.has(subTab)) {
          return {
            outcome: {
              status: "rejected",
              failure: { message: "no such tab" },
            },
            discovered: [],
          };
        }
        options.isPanelDrawn?.();
        options.whileDrawn?.();
        return { outcome: { status: "succeeded" }, discovered: [] };
      },
    },
    drawnActions: createGameDrawnActionsReader({ getDocument: () => page }),
    onSkipped: (region, reason) => skipped.push([region, reason]),
  });
  return { reader, paths, skipped };
}

// Every region is drawn under main tab 1 at its own `spaceTabs` selection, verified against
// DeadSpace 1.5.0: city 0, inner space 1, interstellar 2, galaxy 3, portal 4, outer space 5,
// tauceti 6, eden 7.
for (const [region, container, subTab] of [
  ["city", "#city", 0],
  ["space", "#space", 1],
  ["interstellar", "#interstellar", 2],
  ["galaxy", "#galaxy", 3],
  ["portal", "#portal", 4],
  ["tauceti", "#tauceti", 6],
  ["eden", "#eden", 7],
]) {
  const { reader, paths } = makeReader({ [`${container} .action`]: [] });
  // `space` also draws `#outerSol`, which this fixture does not hold, so only its first path is
  // compared here; the union has its own case below.
  reader.read(new Set([region]));
  assert.deepEqual(paths[0], [
    [MAIN_TAB_SETTING, MAIN_TAB_CONTROL, 1],
    ["spaceTabs", "mTabCivil", subTab],
  ]);
}

// The drawn rows of a region are its whole answer.
{
  const { reader, paths } = makeReader({
    "#city .action": ["city-farm", "city-mine"],
  });
  const sample = reader.read(new Set(["city"]));
  assert.deepEqual(paths, [
    [
      [MAIN_TAB_SETTING, MAIN_TAB_CONTROL, 1],
      ["spaceTabs", "mTabCivil", 0],
    ],
  ]);
  assert.deepEqual([...sample.unlocked].sort(), ["city-farm", "city-mine"]);
  assert.deepEqual([...sample.regions], ["city"]);
}

// The `space` region needs both of its panels: `setAction` remaps the outer tab back to `space`
// before taking the id, so `space-titan_spaceport` sits in `#outerSol` under the same prefix.
{
  const { reader, paths } = makeReader({
    "#space .action": ["space-moon_base"],
    "#outerSol .action": ["space-titan_spaceport"],
  });
  const sample = reader.read(new Set(["space"]));
  assert.deepEqual(
    paths.map((path) => path[1][2]),
    [1, 5],
  );
  assert.deepEqual([...sample.unlocked].sort(), [
    "space-moon_base",
    "space-titan_spaceport",
  ]);
  assert.deepEqual([...sample.regions], ["space"]);
}

// A region is only answered when every panel holding its rows was read. Missing the outer half
// would report every outer building as not offered, so the whole region is withheld instead.
{
  const { reader, skipped } = makeReader(
    {
      "#space .action": ["space-moon_base"],
      "#outerSol .action": ["space-titan_spaceport"],
    },
    { failFor: new Set([5]) },
  );
  assert.equal(reader.read(new Set(["space"])), undefined);
  assert.deepEqual(skipped, [["space", "no such tab"]]);
}

// One failed region does not cost the others their answer.
{
  const { reader } = makeReader(
    {
      "#city .action": ["city-farm"],
      "#portal .action": ["portal-carport"],
    },
    { failFor: new Set([4]) },
  );
  const sample = reader.read(new Set(["city", "portal"]));
  assert.deepEqual([...sample.regions], ["city"]);
  assert.deepEqual([...sample.unlocked], ["city-farm"]);
}

// A region whose panel drew nothing is still a sampled region: that is a real "none offered".
{
  const { reader } = makeReader({ "#eden .action": [] });
  const sample = reader.read(new Set(["eden"]));
  assert.deepEqual([...sample.regions], ["eden"]);
  assert.equal(sample.unlocked.size, 0);
}

// A container that never materialized is not an empty panel. Reading zero rows from a panel
// nobody drew would report every building in the region as locked, so the region is withheld.
{
  const { reader, skipped } = makeReader({ "#city .action": ["city-farm"] });
  assert.equal(reader.read(new Set(["portal"])), undefined);
  assert.deepEqual(skipped, [["portal", "#portal was not drawn"]]);
}
// The same distinction inside a multi-panel region: the inner half drew, the outer container is
// not there, so `space` is unanswerable rather than reporting only the inner buildings.
{
  const { reader } = makeReader({ "#space .action": ["space-moon_base"] });
  assert.equal(reader.read(new Set(["space"])), undefined);
}

// An unknown region names no panel, and an empty request draws nothing.
{
  const { reader, paths, skipped } = makeReader({
    "#city .action": ["city-farm"],
  });
  assert.equal(reader.read(new Set(["nowhere"])), undefined);
  assert.deepEqual(skipped, [["nowhere", "not a building region"]]);
  assert.deepEqual(paths, []);
  assert.equal(reader.read(new Set()), undefined);
}

// Without a captured root there is nothing to read.
{
  const reader = createCapturedBuildingUnlocks({
    rootState: {
      readRoot: () => undefined,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    discovery: { discover: () => assert.fail("must not draw without a root") },
    drawnActions: { read: () => [], exists: () => false },
  });
  assert.equal(reader.read(new Set(["city"])), undefined);
}

// The power switch rides along on the same draw. `setAction` appends the on/off pair only to a
// row whose own gate passed, so a row carrying the spans reports its counts and a row without
// them reports no state at all — the two cases the operands read as a number and as zero.
{
  const { reader } = makeReader({
    "#city .action": [["city-factory", 3, 2], "city-farm"],
  });
  const sample = reader.read(new Set(["city"]));
  assert.deepEqual(sample.states.get("city-factory"), { on: 3, off: 2 });
  assert.equal(sample.states.has("city-farm"), false);
  // The row is still an ordinary drawn row for the unlock operand.
  assert.equal(sample.unlocked.has("city-farm"), true);
}

// The counts are taken whole. A casino or lab row substitutes a holiday string for a zero, and a
// half-read pair would report one span's number against the other's absence, so either one
// unreadable leaves the row with no state rather than a guessed one.
{
  const { reader } = makeReader({
    "#city .action": [
      ["city-casino", 1, "\u{1F95A}"],
      ["city-biolab", "trick", 0],
      ["city-wardenclyffe", 4],
    ],
  });
  const sample = reader.read(new Set(["city"]));
  assert.equal(sample.states.has("city-casino"), false);
  assert.equal(sample.states.has("city-biolab"), false);
  assert.equal(sample.states.has("city-wardenclyffe"), false);
}

// A multi-panel region reports the switches from every panel it had to read.
{
  const { reader } = makeReader({
    "#space .action": [["space-moon_base", 1, 0]],
    "#outerSol .action": [["space-titan_spaceport", 2, 1]],
  });
  const sample = reader.read(new Set(["space"]));
  assert.deepEqual(sample.states.get("space-moon_base"), { on: 1, off: 0 });
  assert.deepEqual(sample.states.get("space-titan_spaceport"), {
    on: 2,
    off: 1,
  });
}

// --- the two 1.5.0 regions that gate before they clear ---

// `renderSurface` returns on `global.settings.showSurface` before clearing `#surface`, so a hidden
// tab can still hold rows from before it was hidden. The flag answers the region instead: the tab
// is not shown, nothing in it is offered, and no pass is spent on it.
{
  const { reader, paths } = makeReader({
    "#surface .action": ["surface-woodcutter"],
  });
  const sample = reader.read(new Set(["surface"]));
  assert.deepEqual([...sample.regions], ["surface"]);
  assert.equal(sample.unlocked.has("surface-woodcutter"), false);
  assert.deepEqual(paths, []);
}
// With the flag on, the panel is drawn and read like any other.
{
  const { reader, paths } = makeReader(
    { "#surface .action": ["surface-woodcutter"] },
    { settings: { showSurface: true } },
  );
  const sample = reader.read(new Set(["surface"]));
  assert.equal(sample.unlocked.has("surface-woodcutter"), true);
  assert.deepEqual(paths, [
    [
      ["civTabs", MAIN_TAB_CONTROL, 1],
      ["spaceTabs", "mTabCivil", 9],
    ],
  ]);
}

// `underground` spans two panels under two different main tabs: `#underground` is a civilization
// sub-tab and `#perkUnderground` is a civics one, and the cave perks drawn into the second carry
// the same `underground-` prefix. Reading only the first would report every perk as not offered.
{
  const { reader, paths } = makeReader(
    {
      "#underground .action": ["underground-pylon"],
      "#perkUnderground .action": ["underground-core_tap_perk"],
    },
    { settings: { showUnderground: true } },
  );
  const sample = reader.read(new Set(["underground"]));
  assert.equal(sample.unlocked.has("underground-pylon"), true);
  assert.equal(sample.unlocked.has("underground-core_tap_perk"), true);
  assert.deepEqual(paths, [
    [
      ["civTabs", MAIN_TAB_CONTROL, 1],
      ["spaceTabs", "mTabCivil", 8],
    ],
    [
      ["civTabs", MAIN_TAB_CONTROL, 2],
      ["govTabs", "mTabCivic", 4],
    ],
  ]);
}
// `drawPerkUnderground` clears before it decides, so the perk half is answered by drawing it even
// while the main underground tab is hidden.
{
  const { reader, paths } = makeReader({
    "#perkUnderground .action": ["underground-core_tap_perk"],
  });
  const sample = reader.read(new Set(["underground"]));
  assert.deepEqual([...sample.regions], ["underground"]);
  assert.equal(sample.unlocked.has("underground-core_tap_perk"), true);
  assert.deepEqual(paths, [
    [
      ["civTabs", MAIN_TAB_CONTROL, 2],
      ["govTabs", "mTabCivic", 4],
    ],
  ]);
}

console.log("captured-building-unlocks ok");
