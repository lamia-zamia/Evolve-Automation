import assert from "node:assert/strict";

import { createGameDrawnActionsReader } from "../src/adapters/browser/game-drawn-actions.ts";
import {
  createCapturedBuildingUnlocks,
  sameBuildingUnlockCatalog,
} from "../src/adapters/evolve/progression/build/captured-building-unlocks.ts";
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

/**
 * Every drawn row's element id, with the state record the game would have bound to it.
 *
 * `stateAt` overrides where a row's record lives, which is what `setAction`'s region normalization
 * and a definition's own `region` do upstream; the default is the id's own two halves.
 */
function makeGame(containers, stateAt, settings) {
  const root = { settings };
  const bindings = new Map();
  for (const rows of Object.values(containers)) {
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const [id, on] = row;
      const separator = id.indexOf("-");
      const [region, type] = stateAt[id] ?? [
        id.slice(0, separator),
        id.slice(separator + 1),
      ];
      root[region] ??= {};
      const record = { count: 1, on: typeof on === "number" ? on : 0 };
      root[region][type] = record;
      bindings.set(id, record);
    }
  }
  return { root, bindings };
}

function makeReader(
  containers,
  { failFor = new Set(), settings = {}, stateAt = {}, bindData } = {},
) {
  const page = makePage(containers);
  const { root, bindings } = makeGame(containers, stateAt, settings);
  const paths = [];
  const mounted = [];
  const skipped = [];
  const unlocated = [];
  const reader = createCapturedBuildingUnlocks({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    discovery: {
      discover(path, options = {}) {
        const subTab = path[path.length - 1]?.index;
        paths.push(
          path.map((step) => [step.setting, step.control, step.index]),
        );
        mounted.push(options.mount);
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
    controls: {
      resolve(elementId) {
        const act = bindings.get(elementId);
        if (act === undefined) return undefined;
        return {
          elementId,
          generation: 1,
          methods: ["on_cap"],
          data: bindData === undefined ? { act } : bindData(elementId, act),
        };
      },
      invoke: () => ({ ok: false, reason: "unknown-control" }),
      capturedElementIds: () => [],
    },
    onSkipped: (region, reason) => skipped.push([region, reason]),
    onUnlocatedSwitch: (elementId, detail) =>
      unlocated.push([elementId, detail]),
  });
  return { reader, paths, mounted, skipped, unlocated, root };
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
  const catalog = reader.read(new Set(["city"]));
  assert.deepEqual(paths, [
    [
      [MAIN_TAB_SETTING, MAIN_TAB_CONTROL, 1],
      ["spaceTabs", "mTabCivil", 0],
    ],
  ]);
  assert.deepEqual([...catalog.unlocked].sort(), ["city-farm", "city-mine"]);
  assert.deepEqual([...catalog.regions], ["city"]);
}

// The `space` region needs both of its panels: `setAction` remaps the outer tab back to `space`
// before taking the id, so `space-titan_spaceport` sits in `#outerSol` under the same prefix.
{
  const { reader, paths } = makeReader({
    "#space .action": ["space-moon_base"],
    "#outerSol .action": ["space-titan_spaceport"],
  });
  const catalog = reader.read(new Set(["space"]));
  assert.deepEqual(
    paths.map((path) => path[1][2]),
    [1, 5],
  );
  assert.deepEqual([...catalog.unlocked].sort(), [
    "space-moon_base",
    "space-titan_spaceport",
  ]);
  assert.deepEqual([...catalog.regions], ["space"]);
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
  const catalog = reader.read(new Set(["city", "portal"]));
  assert.deepEqual([...catalog.regions], ["city"]);
  assert.deepEqual([...catalog.unlocked], ["city-farm"]);
}

// A region whose panel drew nothing is still a sampled region: that is a real "none offered".
{
  const { reader } = makeReader({ "#eden .action": [] });
  const catalog = reader.read(new Set(["eden"]));
  assert.deepEqual([...catalog.regions], ["eden"]);
  assert.equal(catalog.unlocked.size, 0);
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
    controls: {
      resolve: () => undefined,
      invoke: () => ({ ok: false, reason: "unknown-control" }),
      capturedElementIds: () => [],
    },
  });
  assert.equal(reader.read(new Set(["city"])), undefined);
}

// --- which rows have a switch, and where its state lives ---

// Every row the game bound a state object to gets an address, whether or not it rendered a power
// switch: the spans are `v-html` and stay empty on a panel the script drew for itself, so
// switchability is decided live from the record's own `on` instead. A row with no state object at
// all — a mission, a one-shot — is still an ordinary drawn row for the unlock operand.
{
  const { reader } = makeReader({
    "#city .action": [
      ["city-factory", 3, 2],
      ["city-farm", 0, 0],
      "city-mission",
    ],
  });
  const catalog = reader.read(new Set(["city"]));
  assert.deepEqual(catalog.switches.get("city-factory"), {
    region: "city",
    type: "factory",
  });
  assert.deepEqual(catalog.switches.get("city-farm"), {
    region: "city",
    type: "farm",
  });
  assert.equal(catalog.switches.has("city-mission"), false);
  assert.equal(catalog.unlocked.has("city-mission"), true);
}
// A row whose spans the draw left empty is addressed just the same. This is the case that matters:
// it is every building on every panel the player is not looking at.
{
  const { reader } = makeReader({
    "#city .action": [["city-factory", "", ""]],
  });
  const catalog = reader.read(new Set(["city"]));
  assert.deepEqual(catalog.switches.get("city-factory"), {
    region: "city",
    type: "factory",
  });
}

// A definition carrying its own `region` keeps the element id it was defined with and moves the
// record: under a cataclysm start the nanite factory is drawn as `space-nanite_factory` out of
// `global.city`. Splitting the id would address `global.space.nanite_factory`, which is not there.
{
  const { reader } = makeReader(
    {
      "#space .action": [["space-nanite_factory", 1, 0]],
      "#outerSol .action": [],
    },
    { stateAt: { "space-nanite_factory": ["city", "nanite_factory"] } },
  );
  const catalog = reader.read(new Set(["space"]));
  assert.deepEqual(catalog.switches.get("space-nanite_factory"), {
    region: "city",
    type: "nanite_factory",
  });
}

// Neither half of the id has to match. The binding the game gave the row is the ground truth, so
// the record is found by identity when nothing about the id leads to it.
{
  const { reader } = makeReader(
    { "#city .action": [["city-shrine", 2, 0]] },
    { stateAt: { "city-shrine": ["portal", "sacred_smelter"] } },
  );
  const catalog = reader.read(new Set(["city"]));
  assert.deepEqual(catalog.switches.get("city-shrine"), {
    region: "portal",
    type: "sacred_smelter",
  });
}

// A row whose binding names nothing in the root keeps its place in the offer set and loses only
// its power counts: it is reported, never guessed at.
{
  const { reader, unlocated } = makeReader(
    { "#city .action": [["city-factory", 3, 2]] },
    { bindData: () => ({ act: { on: 3, count: 5 } }) },
  );
  const catalog = reader.read(new Set(["city"]));
  assert.equal(catalog.switches.size, 0);
  assert.equal(catalog.unlocked.has("city-factory"), true);
  assert.deepEqual(unlocated, [
    ["city-factory", "no record in the current root is that binding"],
  ]);
}

// A multi-panel region reports the switches from every panel it had to read.
{
  const { reader } = makeReader({
    "#space .action": [["space-moon_base", 1, 0]],
    "#outerSol .action": [["space-titan_spaceport", 2, 1]],
  });
  const catalog = reader.read(new Set(["space"]));
  assert.deepEqual(catalog.switches.get("space-moon_base"), {
    region: "space",
    type: "moon_base",
  });
  assert.deepEqual(catalog.switches.get("space-titan_spaceport"), {
    region: "space",
    type: "titan_spaceport",
  });
}

// --- what counts as the same answer, which is what widens the interval between draws ---
{
  const catalog = (unlocked, switches) =>
    Object.freeze({
      unlocked: new Set(unlocked),
      regions: new Set(["city"]),
      switches: new Map(switches),
    });
  const base = catalog(
    ["city-farm", "city-factory"],
    [["city-factory", { region: "city", type: "factory" }]],
  );
  assert.equal(
    sameBuildingUnlockCatalog(
      base,
      catalog(
        ["city-factory", "city-farm"],
        [["city-factory", { region: "city", type: "factory" }]],
      ),
    ),
    true,
  );
  // A newly offered building is a changed answer.
  assert.equal(
    sameBuildingUnlockCatalog(
      base,
      catalog(
        ["city-farm", "city-factory", "city-bank"],
        [["city-factory", { region: "city", type: "factory" }]],
      ),
    ),
    false,
  );
  // So is a building that has just become switchable, or one whose record moved.
  assert.equal(
    sameBuildingUnlockCatalog(base, catalog(["city-farm", "city-factory"], [])),
    false,
  );
  assert.equal(
    sameBuildingUnlockCatalog(
      base,
      catalog(
        ["city-farm", "city-factory"],
        [["city-factory", { region: "space", type: "factory" }]],
      ),
    ),
    false,
  );
}

// --- the two 1.5.0 regions that gate before they clear ---

// `renderSurface` returns on `global.settings.showSurface` before clearing `#surface`, so a hidden
// tab can still hold rows from before it was hidden. The flag answers the region instead: the tab
// is not shown, nothing in it is offered, and no pass is spent on it.
{
  const { reader, paths } = makeReader({
    "#surface .action": ["surface-woodcutter"],
  });
  const catalog = reader.read(new Set(["surface"]));
  assert.deepEqual([...catalog.regions], ["surface"]);
  assert.equal(catalog.unlocked.has("surface-woodcutter"), false);
  assert.deepEqual(paths, []);
}
// With the flag on, the panel is drawn and read like any other.
{
  const { reader, paths } = makeReader(
    { "#surface .action": ["surface-woodcutter"] },
    { settings: { showSurface: true } },
  );
  const catalog = reader.read(new Set(["surface"]));
  assert.equal(catalog.unlocked.has("surface-woodcutter"), true);
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
  const catalog = reader.read(new Set(["underground"]));
  assert.equal(catalog.unlocked.has("underground-pylon"), true);
  assert.equal(catalog.unlocked.has("underground-core_tap_perk"), true);
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
  const catalog = reader.read(new Set(["underground"]));
  assert.deepEqual([...catalog.regions], ["underground"]);
  assert.equal(catalog.unlocked.has("underground-core_tap_perk"), true);
  assert.deepEqual(paths, [
    [
      ["civTabs", MAIN_TAB_CONTROL, 2],
      ["govTabs", "mTabCivic", 4],
    ],
  ]);
}

// Each pass asks for the one component whose render creates the container it is about to read.
// The civilization panels come from `mTabCivil`; the cave perks are a civics sub-tab, so theirs
// come from `mTabCivic`. Without that render the region draw appends into nothing at all.
{
  const { reader, mounted } = makeReader({
    "#space .action": ["space-moon_base"],
    "#outerSol .action": ["space-titan_spaceport"],
  });
  reader.read(new Set(["space"]));
  assert.deepEqual(mounted, [["#mTabCivil"], ["#mTabCivil"]]);
}
{
  const { reader, mounted } = makeReader({
    "#perkUnderground .action": ["underground-core_tap_perk"],
  });
  reader.read(new Set(["underground"]));
  assert.deepEqual(mounted, [["#mTabCivic"]]);
}

console.log("captured-building-unlocks ok");
