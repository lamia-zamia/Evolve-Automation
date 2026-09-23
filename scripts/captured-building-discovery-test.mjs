import assert from "node:assert/strict";

import { createCapturedProgressionControl } from "../src/bootstrap/captured-progression-control.ts";
import { createGameDrawnActionsReader } from "../src/adapters/browser/game-drawn-actions.ts";
import { MIN_SAMPLE_AGE_MS } from "../src/adapters/evolve/discovery-scope-cache.ts";
import { CAPTURED_MECH_BUILDINGS } from "../src/adapters/evolve/progression/build/captured-building-metadata.ts";
import {
  MAIN_TAB_CONTROL,
  SPACE_TAB_INDEX,
  SPACE_TAB_PANELS,
  SPACE_TAB_SWEEP,
} from "../src/adapters/evolve/captured-tab-discovery.ts";

/**
 * A game small enough to count draws against.
 *
 * `swapTab` on the civilization sub-tab component does what `loadTab` does: it clears every region
 * container and refills the selected one from whatever that region currently offers. Each region's
 * rows are a function of live state, so unlocking one later is a change to this fixture's data and
 * not to the harness.
 */
function makeGame({
  regions,
  tech = { primitive: 1 },
  scriptSettings = {},
  costs,
  capturedBuildPolicy = false,
} = {}) {
  const root = {
    // The player is looking at Research, so every civilization panel this reads has to be drawn
    // for it. A path the player is already on is answered from what the game keeps current itself,
    // which would hide the draw counts this file exists to assert on.
    settings: { civTabs: 3, spaceTabs: 0, govTabs: 0, animated: true },
    tech,
    race: { species: "human", universe: "standard" },
    stats: { achieve: {} },
    civic: { govern: { type: "anarchy" } },
    resource: {},
    city: {},
    space: {},
    interstellar: {},
    galaxy: {},
    portal: {},
    tauceti: {},
    eden: {},
    arpa: {},
  };
  // Element id to the rendered row, keyed by container. Only what the reader looks at.
  const containers = new Map();
  const draws = [];
  const rootListeners = new Set();

  const renderRow = (id, state) => ({
    id,
    attributes: [],
    querySelectorAll(selector) {
      if (state === undefined) return [];
      const text =
        selector === ":scope > span.on"
          ? String(state.on)
          : selector === ":scope > span.off"
            ? String(state.count - state.on)
            : undefined;
      return text === undefined ? [] : [{ textContent: text }];
    },
  });

  const drawSpaceTab = (index) => {
    draws.push(index);
    for (const container of Object.values(SPACE_TAB_PANELS)) {
      containers.delete(container);
    }
    const container = SPACE_TAB_PANELS[index];
    const offered = regions[index];
    if (container === undefined || offered === undefined) return;
    containers.set(
      container,
      offered().map(([id, region, type]) => {
        if (type === undefined) return renderRow(id);
        const state = root[region][type];
        controlGenerations.set(id, (controlGenerations.get(id) ?? 0) + 1);
        bindings.set(id, state);
        return renderRow(id, state);
      }),
    );
  };

  const controlGenerations = new Map([
    [MAIN_TAB_CONTROL, 1],
    ["mTabCivil", 1],
    ["mTabCivic", 1],
  ]);
  const bindings = new Map();

  const controls = {
    resolve(elementId) {
      const generation = controlGenerations.get(elementId);
      if (generation === undefined) return undefined;
      return {
        elementId,
        generation,
        methods: ["swapTab", "on_cap"],
        data: bindings.has(elementId)
          ? { act: bindings.get(elementId) }
          : undefined,
      };
    },
    invoke(handle, method, args = []) {
      const current = controlGenerations.get(handle.elementId);
      if (current === undefined) {
        return { ok: false, reason: "unknown-control" };
      }
      if (current !== handle.generation) {
        return { ok: false, reason: "stale-control" };
      }
      if (method === "swapTab") {
        if (handle.elementId === "mTabCivil") drawSpaceTab(args[0]);
        return { ok: true, value: undefined };
      }
      if (method === "on_cap") {
        const act = bindings.get(handle.elementId);
        return act === undefined
          ? { ok: false, reason: "unknown-control" }
          : { ok: true, value: act.count };
      }
      return { ok: false, reason: "unknown-method" };
    },
    capturedElementIds: () => [...controlGenerations.keys()],
  };

  const page = {
    querySelectorAll(selector) {
      if (selector.endsWith(" .action")) {
        return containers.get(selector.slice(0, -" .action".length)) ?? [];
      }
      return containers.has(selector) ? [{ id: selector.slice(1) }] : [];
    },
  };

  let now = 0;
  const control = createCapturedProgressionControl({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: (listener) => {
        rootListeners.add(listener);
        return () => rootListeners.delete(listener);
      },
    },
    controls,
    mountSuppression: {
      available: true,
      withoutMounting: (draw) => draw(),
    },
    panels: {
      open: () => ({
        discard: () => true,
        release: () => {},
        isIntact: () => true,
      }),
    },
    drawnActions: createGameDrawnActionsReader({ getDocument: () => page }),
    drawnProjects: { read: () => undefined, exists: () => false },
    costs,
    ...(capturedBuildPolicy
      ? {}
      : {
          getBuildingManager: () => {
            throw new Error("must not read the manager");
          },
        }),
    readSettings: () => scriptSettings,
    getState: () => ({}),
    getResources: () => ({}),
    nowMs: () => now,
  });

  return {
    root,
    control,
    readCanExpandMechBay: () => control.readCanExpandMechBay(),
    draws,
    capturedElementIds: () => controls.capturedElementIds(),
    replaceRoot: () => {
      for (const listener of rootListeners) listener();
    },
    advance: (ms) => {
      now += ms;
    },
    /** One automation cycle's building read, with the per-cycle memo cleared like `runCycle` does. */
    cycle: (...regionKeys) => {
      control.resetBuildingUnlockSample();
      return control.readBuildingUnlocks(new Set(regionKeys));
    },
  };
}

const cityOnly = {
  [SPACE_TAB_INDEX.city]: () => [
    ["city-farm"],
    ["city-factory", "city", "factory"],
  ],
};

// --- the offer set is drawn once; power state is restated every cycle for free ----------------
{
  const game = makeGame({ regions: cityOnly });
  game.root.city.factory = { count: 5, on: 2 };

  const first = game.cycle("city");
  assert.deepEqual([...first.unlocked].sort(), ["city-factory", "city-farm"]);
  assert.deepEqual(first.states.get("city-factory"), { on: 2, off: 3 });
  assert.equal(first.states.has("city-farm"), false);
  const afterFirst = game.draws.length;
  assert.ok(afterFirst > 0, "the first sample has to draw");

  // The steady state this whole split exists for: a configured building trigger costs no draw.
  for (let cycle = 0; cycle < 5; cycle += 1) {
    game.advance(100);
    assert.deepEqual(game.cycle("city").states.get("city-factory"), {
      on: 2,
      off: 3,
    });
  }
  assert.equal(game.draws.length, afterFirst);

  // Power moving is not a reason to draw, and neither is the built count moving.
  game.root.city.factory.on = 5;
  game.advance(100);
  assert.deepEqual(game.cycle("city").states.get("city-factory"), {
    on: 5,
    off: 0,
  });
  game.root.city.factory.count = 9;
  game.advance(100);
  assert.deepEqual(game.cycle("city").states.get("city-factory"), {
    on: 5,
    off: 4,
  });
  assert.equal(game.draws.length, afterFirst);

  // The epoch is deliberately not a complete account of what a region draw reads, so the sample
  // still ages out. One resample that finds the same offer set doubles the interval before the
  // next, which is what keeps an idle run's draw rate falling instead of settling at the floor.
  game.advance(MIN_SAMPLE_AGE_MS);
  game.cycle("city");
  const afterAging = game.draws.length;
  assert.ok(afterAging > afterFirst, "the sample ages out on its own");
  game.advance(MIN_SAMPLE_AGE_MS);
  game.cycle("city");
  assert.equal(game.draws.length, afterAging);
  game.advance(MIN_SAMPLE_AGE_MS);
  game.cycle("city");
  assert.ok(game.draws.length > afterAging);
}

// --- progression is what reopens the panel ------------------------------------------------------
{
  let bankOffered = false;
  const game = makeGame({
    regions: {
      [SPACE_TAB_INDEX.city]: () =>
        bankOffered ? [["city-farm"], ["city-bank"]] : [["city-farm"]],
    },
  });
  assert.deepEqual([...game.cycle("city").unlocked], ["city-farm"]);
  const beforeProgress = game.draws.length;

  // Nothing has moved, so nothing is drawn however many cycles run.
  game.advance(300);
  game.cycle("city");
  assert.equal(game.draws.length, beforeProgress);

  // A tech lands and the offer set is resampled on the next read, without waiting out any age.
  bankOffered = true;
  game.root.tech.currency = 1;
  game.advance(10);
  assert.deepEqual([...game.cycle("city").unlocked].sort(), [
    "city-bank",
    "city-farm",
  ]);
  assert.ok(game.draws.length > beforeProgress);
}

// --- the build-control sweep follows the game's own tab visibility ------------------------------
{
  let bankOffered = false;
  const regions = { ...cityOnly };
  for (const index of SPACE_TAB_SWEEP) regions[index] = () => [];
  regions[SPACE_TAB_INDEX.city] = () =>
    bankOffered
      ? [
          ["city-farm"],
          ["city-factory", "city", "factory"],
          ["city-bank", "city", "bank"],
        ]
      : cityOnly[SPACE_TAB_INDEX.city]();
  regions[SPACE_TAB_INDEX.space] = () => [["space-moon_base"]];
  regions[SPACE_TAB_INDEX.eden] = () => [["eden-rune_gate"]];

  const game = makeGame({ regions });
  // The game shows the inner system and nothing beyond it, which is its own answer to which
  // regions exist. A run that has never left the city must not pay a pass for Eden.
  game.root.settings.showCity = true;
  game.root.settings.showSpace = true;

  game.control.ensureBuildControls();
  assert.deepEqual(
    game.draws.sort((left, right) => left - right),
    [SPACE_TAB_INDEX.city, SPACE_TAB_INDEX.space],
  );
  assert.equal(game.capturedElementIds().includes("city-factory"), true);

  // An unchanged attempt is held by the per-tab scope.
  game.draws.length = 0;
  game.control.ensureBuildControls();
  assert.deepEqual(game.draws, []);

  // Progression reopens every shown scope. The newly offered City control is captured even though
  // the player remains parked on Research.
  bankOffered = true;
  game.root.tech.dimensional_tear = 1;
  game.draws.length = 0;
  game.control.ensureBuildControls();
  assert.deepEqual(
    game.draws.sort((left, right) => left - right),
    [SPACE_TAB_INDEX.city, SPACE_TAB_INDEX.space],
  );
  assert.equal(game.capturedElementIds().includes("city-bank"), true);

  // Eden unlocks: the game starts showing its tab, and the sweep picks up that one tab on the very
  // next call rather than waiting out an interval widened by earlier attempts.
  game.root.settings.showEden = true;
  game.draws.length = 0;
  game.control.ensureBuildControls();
  assert.deepEqual(game.draws, [SPACE_TAB_INDEX.eden]);
  assert.deepEqual([...game.cycle("eden").unlocked], ["eden-rune_gate"]);

  // An unchanged attempt after the new offer is still held.
  game.draws.length = 0;
  game.control.ensureBuildControls();
  assert.deepEqual(game.draws, []);

  // A prestige drops the cached scopes, so the shown panels from the fresh run are sampled again.
  game.replaceRoot();
  game.draws.length = 0;
  game.control.ensureBuildControls();
  assert.deepEqual(
    game.draws.sort((left, right) => left - right),
    [SPACE_TAB_INDEX.city, SPACE_TAB_INDEX.space, SPACE_TAB_INDEX.eden].sort(
      (l, r) => l - r,
    ),
  );
}

// --- a redrawn row is rebound, and the next state read resolves the newest generation -----------
{
  const game = makeGame({ regions: cityOnly });
  game.root.city.factory = { count: 4, on: 1 };
  assert.deepEqual(game.cycle("city").states.get("city-factory"), {
    on: 1,
    off: 3,
  });
  const drawn = game.draws.length;
  // The player opens the tab: the game rebinds the row and the capture bumps its generation. The
  // cached catalog still holds the handle it was taken at, and nothing about that forces a draw.
  game.control.ensureBuildControls();
  game.draws.length = 0;
  game.advance(200);
  assert.deepEqual(game.cycle("city").states.get("city-factory"), {
    on: 1,
    off: 3,
  });
  assert.deepEqual(
    game.draws,
    [],
    "a stale generation is not a reason to draw",
  );
  assert.ok(drawn > 0);
}

// Mech scrap protection asks captured managed targets, the portal's drawn offer, game-owned
// adjusted prices, purifier capacity and the purifier's switch state as one question.
{
  const portalRegions = {
    [SPACE_TAB_INDEX.portal]: () => [
      [CAPTURED_MECH_BUILDINGS.bay, "portal", "mechbay"],
      [CAPTURED_MECH_BUILDINGS.purifier, "portal", "purifier"],
    ],
  };
  const prices = new Map([
    [CAPTURED_MECH_BUILDINGS.bay, { cost: { Money: 100, Supply: 50 } }],
    [CAPTURED_MECH_BUILDINGS.purifier, { cost: { Money: 50, Supply: 20 } }],
  ]);
  const costs = { readCost: (id) => prices.get(id) };
  const createExpansionSample = () =>
    makeGame({
      regions: portalRegions,
      scriptSettings: { autoBuild: true, mechBaysFirst: true },
      costs,
      capturedBuildPolicy: true,
    });
  const setupPortal = (game) => {
    game.root.settings.showPortal = true;
    game.root.portal.mechbay = { count: 0, on: 0 };
    game.root.portal.purifier = { count: 1, on: 1, supply: 0, sup_max: 100 };
    game.root.resource.Money = { amount: 0, max: 100, display: true };
  };

  // The MechBay cost fits the game's captured storage ceilings, regardless of present holdings.
  {
    const game = createExpansionSample();
    setupPortal(game);
    assert.equal(game.readCanExpandMechBay(), true);
  }

  // When the bay price cannot fit, an affordable purifier protects the team only while every
  // purifier is on.
  {
    const game = createExpansionSample();
    setupPortal(game);
    game.root.resource.Money.max = 60;
    game.root.portal.purifier.sup_max = 25;
    assert.equal(game.readCanExpandMechBay(), true);
    game.root.portal.purifier.on = 0;
    game.control.resetBuildingUnlockSample();
    assert.equal(game.readCanExpandMechBay(), false);
  }

  // When neither expansion's stored cost fits, the scrap planner receives the unblocked answer.
  {
    const game = createExpansionSample();
    setupPortal(game);
    game.root.resource.Money.max = 10;
    game.root.portal.purifier.sup_max = 10;
    assert.equal(game.readCanExpandMechBay(), false);
  }

  // An expected bay target whose game price is unreadable stays unknown so scrap stands down.
  {
    const game = makeGame({
      regions: portalRegions,
      scriptSettings: { autoBuild: true, mechBaysFirst: true },
      costs: { readCost: () => undefined },
      capturedBuildPolicy: true,
    });
    setupPortal(game);
    assert.equal(game.readCanExpandMechBay(), undefined);
  }
}

console.log("captured-building-discovery ok");
