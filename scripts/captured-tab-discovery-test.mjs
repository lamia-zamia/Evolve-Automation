import assert from "node:assert/strict";

import {
  createCapturedTabDiscovery,
  MAIN_TAB_CONTROL,
  MAIN_TAB_SETTING,
  SUB_TAB_CONTROLS,
} from "../src/adapters/evolve/captured-tab-discovery.ts";

/** A main-tab step, the way every discovery path starts. */
function mainTab(index) {
  return [{ setting: MAIN_TAB_SETTING, control: MAIN_TAB_CONTROL, index }];
}

/** A main tab followed by one of its sub-tabs. */
function subTab(index, setting, subIndex) {
  return [
    ...mainTab(index),
    { setting, control: SUB_TAB_CONTROLS[setting], index: subIndex },
  ];
}

const PANELS = {
  1: ["mTabCivil"],
  2: ["mTabCivic", "civ-farmer", "foundry"],
  4: ["mTabResource", "resTrade"],
};

/** Which main tab each sub-tab group lives on. */
const SUB_TAB_OWNER = { mTabCivil: 1, mTabCivic: 2, mTabResource: 4 };

/** What a sub-tab group draws, by the index its own setting holds. */
const SUB_PANELS = {
  mTabCivil: {
    0: ["city-basic_housing", "city-farm"],
    1: ["space-spaceport", "space-moon_base"],
  },
};

/**
 * A stand-in for the page. `swapTab` draws the way the game does: a main tab builds its own panels
 * plus whichever sub-panel its setting currently selects, a sub-tab group builds only the
 * sub-panel it is given, and the outgoing panels come down synchronously when `animated` is off
 * and behind a timer when it is on.
 */
function makePage({
  civTabs = 4,
  spaceTabs = 0,
  animated = true,
  tabLoad = false,
  panels = PANELS,
  subPanels = SUB_PANELS,
} = {}) {
  const settings = { civTabs, spaceTabs, animated, tabLoad };
  // Scoped mount suppression, the way the capture provides it: nesting counted, and always
  // unwound, so a draw can report whether it happened inside a scope.
  const suppression = {
    available: true,
    depth: 0,
    scopes: 0,
    withoutMounting(draw) {
      suppression.depth += 1;
      suppression.scopes += 1;
      try {
        return draw();
      } finally {
        suppression.depth -= 1;
      }
    },
  };
  const root = { settings };
  const controls = new Map();
  const mounted = new Set();
  const pendingClears = [];
  const swaps = [];

  function register(elementId) {
    const existing = controls.get(elementId);
    if (existing === undefined) {
      controls.set(elementId, { elementId, generation: 1 });
    } else {
      existing.generation += 1;
    }
  }

  function mount(ids) {
    for (const id of ids ?? []) {
      mounted.add(id);
      register(id);
    }
  }

  /** Only the sub-tab group that lives on the main tab being drawn, as `loadTab` does. */
  function selectedSubPanels(mainIndex) {
    const ids = [];
    for (const [setting, control] of Object.entries(SUB_TAB_CONTROLS)) {
      if (SUB_TAB_OWNER[control] !== mainIndex) continue;
      const group = subPanels[control];
      if (group !== undefined) ids.push(...(group[settings[setting]] ?? []));
    }
    return ids;
  }

  function drawTab(control, index) {
    swaps.push([control, index, suppression.depth > 0]);
    for (const id of [...mounted]) {
      if (settings.animated) {
        // The game retains the outgoing panel behind a timer for the slide.
        pendingClears.push(id);
      } else {
        mounted.delete(id);
      }
    }
    if (control === MAIN_TAB_CONTROL) {
      mount(panels[index]);
      mount(selectedSubPanels(index));
    } else {
      mount(subPanels[control]?.[index]);
    }
  }

  register(MAIN_TAB_CONTROL);
  mount(panels[civTabs]);
  mount(selectedSubPanels(civTabs));

  const registry = {
    resolve(elementId) {
      const control = controls.get(elementId);
      return control === undefined
        ? undefined
        : { elementId, generation: control.generation };
    },
    capturedElementIds: () => [...controls.keys()],
    invoke(handle, method, args = []) {
      const control = controls.get(handle.elementId);
      if (control === undefined)
        return { ok: false, reason: "unknown-control" };
      if (control.generation !== handle.generation) {
        return { ok: false, reason: "stale-control", detail: "superseded" };
      }
      if (method !== "swapTab") return { ok: false, reason: "unknown-method" };
      if (!settings.tabLoad) drawTab(handle.elementId, args[0]);
      return { ok: true, value: args[0] };
    },
  };

  return {
    root,
    settings,
    controls,
    registry,
    suppression,
    mounted,
    pendingClears,
    swaps,
    suppressedDraws: () =>
      swaps.filter(([, , suppressed]) => suppressed).length,
    mainSwaps: () =>
      swaps
        .filter(([control]) => control === MAIN_TAB_CONTROL)
        .map(([, i]) => i),
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
  };
}

function discoveryFor(page) {
  return createCapturedTabDiscovery({
    rootState: page.rootState,
    controls: page.registry,
    mountSuppression: page.suppression,
  });
}

// --- one pass captures a panel and puts the player back ---------------------

{
  const page = makePage({ civTabs: 4 });
  const result = discoveryFor(page).discover(mainTab(2));

  assert.equal(result.outcome.status, "succeeded");
  assert.deepEqual(
    [...result.discovered],
    ["mTabCivic", "civ-farmer", "foundry"],
  );
  // Out to the discovered tab and straight back to the player's own.
  assert.deepEqual(page.mainSwaps(), [2, 4]);
  assert.equal(page.settings.civTabs, 4);
  // Only the player's tab is left mounted; the discovered controls stay captured regardless.
  assert.deepEqual([...page.mounted].sort(), ["mTabResource", "resTrade"]);
  assert.equal(page.controls.has("civ-farmer"), true);
}

{
  // A panel gated on its sub-tab needs the second step; the main tab alone does not reach it.
  const page = makePage({ civTabs: 4, spaceTabs: 0 });
  const discovery = discoveryFor(page);

  const mainOnly = discovery.discover(mainTab(1));
  assert.deepEqual(
    [...mainOnly.discovered],
    ["mTabCivil", "city-basic_housing", "city-farm"],
  );

  const withSubTab = discovery.discover(subTab(1, "spaceTabs", 1));
  assert.equal(withSubTab.outcome.status, "succeeded");
  assert.deepEqual(
    [...withSubTab.discovered],
    ["space-spaceport", "space-moon_base"],
  );
  // Both levels are back where the player left them.
  assert.equal(page.settings.civTabs, 4);
  assert.equal(page.settings.spaceTabs, 0);
  assert.deepEqual([...page.mounted].sort(), ["mTabResource", "resTrade"]);
}

{
  // The sub-tab control does not exist until its main tab has been drawn, so it is resolved at
  // its own turn rather than up front.
  const page = makePage({ civTabs: 4 });
  assert.equal(page.controls.has("mTabCivil"), false);
  const result = discoveryFor(page).discover(subTab(1, "spaceTabs", 1));
  assert.equal(result.outcome.status, "succeeded");
  assert.equal(result.discovered.includes("space-spaceport"), true);
}

{
  // The player's animation setting is restored, and no teardown was deferred behind a timer.
  const page = makePage({ civTabs: 4, animated: true });
  discoveryFor(page).discover(mainTab(2));
  assert.equal(page.settings.animated, true);
  assert.deepEqual(page.pendingClears, []);
}

{
  // A player who had animation off keeps it off.
  const page = makePage({ civTabs: 4, animated: false });
  discoveryFor(page).discover(mainTab(2));
  assert.equal(page.settings.animated, false);
}

{
  // The panel the player is already looking at is observed where it stands. Drawing it to put
  // them back on the tab they never left is two redraws that produce what was there anyway.
  const page = makePage({ civTabs: 2 });
  let mountedWhenSeen;
  const result = discoveryFor(page).discover(mainTab(2), {
    whileDrawn: () => {
      mountedWhenSeen = [...page.mounted].sort();
    },
  });
  assert.equal(result.outcome.status, "succeeded");
  assert.deepEqual(page.swaps, []);
  assert.equal(page.suppression.scopes, 0);
  assert.equal(page.settings.civTabs, 2);
  assert.equal(page.settings.animated, true);
  assert.deepEqual(mountedWhenSeen, ["civ-farmer", "foundry", "mTabCivic"]);
  // The game bound those controls when it drew them, so the pass makes nothing newly available.
  assert.deepEqual([...result.discovered], []);
}

{
  // Every step has to match: the main tab alone being right is not the panel being right.
  const page = makePage({ civTabs: 1, spaceTabs: 0 });
  const result = discoveryFor(page).discover(subTab(1, "spaceTabs", 1));
  assert.equal(result.outcome.status, "succeeded");
  assert.equal(page.swaps.length > 0, true);
  assert.equal(page.settings.spaceTabs, 0);
}

{
  // The player is on the tab but the panel is not there. A redraw is exactly the recovery, so the
  // pass runs after all.
  const page = makePage({ civTabs: 2 });
  page.mounted.clear();
  let seen = 0;
  const result = discoveryFor(page).discover(mainTab(2), {
    isPanelDrawn: () => page.mounted.has("civ-farmer"),
    whileDrawn: () => {
      seen += 1;
    },
  });
  assert.equal(result.outcome.status, "succeeded");
  assert.equal(seen, 1);
  assert.deepEqual(page.mainSwaps(), [2, 2]);
  assert.equal(page.mounted.has("civ-farmer"), true);
}

{
  // A second pass over the same tab rebinds rather than registering something new.
  const page = makePage({ civTabs: 4 });
  const discovery = discoveryFor(page);
  discovery.discover(mainTab(2));
  const again = discovery.discover(mainTab(2));
  assert.deepEqual([...again.discovered], []);
  assert.equal(page.controls.get("civ-farmer").generation, 2);
}

// --- when the pass must not run ---------------------------------------------

{
  // Preload Tab Content on: every panel is already mounted, so the observer reads the one it
  // wants where it stands and the player's view is never touched.
  const page = makePage({ civTabs: 4, tabLoad: true });
  let seen = 0;
  const result = discoveryFor(page).discover(mainTab(2), {
    whileDrawn: () => {
      seen += 1;
    },
  });
  assert.equal(result.outcome.status, "succeeded");
  assert.equal(seen, 1);
  assert.deepEqual([...result.discovered], []);
  assert.deepEqual(page.swaps, []);
  assert.equal(page.settings.civTabs, 4);
}

{
  // Preloaded, and the panel is still not there: `swapTab` redraws nothing under that setting, so
  // there is no pass that could recover it.
  const page = makePage({ civTabs: 4, tabLoad: true });
  const result = discoveryFor(page).discover(mainTab(2), {
    isPanelDrawn: () => false,
  });
  assert.equal(result.outcome.failure.code, "panel-not-drawn");
  assert.deepEqual(page.swaps, []);
}

{
  const page = makePage({ civTabs: 4 });
  const discovery = discoveryFor(page);
  assert.equal(discovery.discover([]).outcome.failure.code, "empty-tab-path");
  for (const index of [-1, 1.5, Number.NaN]) {
    const result = discovery.discover(mainTab(index));
    assert.equal(result.outcome.failure.code, "invalid-tab-step");
  }
  assert.equal(
    discovery.discover([{ setting: "civTabs", index: 1 }]).outcome.failure.code,
    "invalid-tab-step",
  );
  assert.deepEqual(page.swaps, []);
}

{
  // No captured root yet.
  const result = createCapturedTabDiscovery({
    rootState: {
      readRoot: () => undefined,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: {
      resolve: () => undefined,
      capturedElementIds: () => [],
      invoke: () => ({ ok: false }),
    },
    mountSuppression: {
      available: true,
      withoutMounting: (draw) => draw(),
    },
  }).discover(mainTab(1));
  assert.equal(result.outcome.failure.code, "game-state-not-captured");
}

{
  // No recorded tab to go back to: the pass does not start rather than stranding the player.
  const page = makePage({ civTabs: 4 });
  delete page.settings.spaceTabs;
  const result = discoveryFor(page).discover(subTab(1, "spaceTabs", 1));
  assert.equal(result.outcome.failure.code, "unknown-player-tab");
  assert.deepEqual(page.swaps, []);
}

{
  // The main-tab component itself was never captured.
  const page = makePage({ civTabs: 4 });
  page.controls.delete(MAIN_TAB_CONTROL);
  const result = discoveryFor(page).discover(mainTab(2));
  assert.equal(result.outcome.failure.code, "tab-control-missing");
  assert.deepEqual(page.swaps, []);
}

// --- a pass that fails still leaves the player where it found them ----------

{
  const page = makePage({ civTabs: 4 });
  const inner = page.registry.invoke;
  page.registry.invoke = (handle, method, args) =>
    args[0] === 2
      ? { ok: false, reason: "threw", detail: "loadTab exploded" }
      : inner(handle, method, args);
  const result = discoveryFor(page).discover(mainTab(2));
  assert.equal(result.outcome.status, "rejected");
  assert.equal(result.outcome.failure.code, "tab-draw-failed");
  assert.equal(page.settings.civTabs, 4);
  assert.equal(page.settings.animated, true);
  assert.deepEqual(page.mainSwaps(), [4]);
}

{
  // The draw worked and the way back did not: the controls are real and the report says so.
  const page = makePage({ civTabs: 4 });
  const inner = page.registry.invoke;
  page.registry.invoke = (handle, method, args) =>
    args[0] === 4
      ? { ok: false, reason: "threw", detail: "loadTab exploded" }
      : inner(handle, method, args);
  const result = discoveryFor(page).discover(mainTab(2));
  assert.equal(result.outcome.status, "rejected");
  assert.equal(result.outcome.failure.code, "tab-restore-failed");
  assert.deepEqual(
    [...result.discovered],
    ["mTabCivic", "civ-farmer", "foundry"],
  );
  assert.equal(page.settings.animated, true);
}

// --- observing the panel while it is drawn ----------------------------------

{
  // The observer runs once, with the panel mounted, before anything is restored.
  const page = makePage({ civTabs: 4 });
  const seen = [];
  const result = discoveryFor(page).discover(mainTab(2), {
    whileDrawn: () => {
      seen.push({
        mounted: [...page.mounted].sort(),
        civTabs: page.settings.civTabs,
        animated: page.settings.animated,
      });
    },
  });
  assert.equal(result.outcome.status, "succeeded");
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].mounted, ["civ-farmer", "foundry", "mTabCivic"]);
  assert.equal(seen[0].civTabs, 2);
  assert.equal(seen[0].animated, false);
  // And afterwards the player is back with only their own tab.
  assert.deepEqual([...page.mounted].sort(), ["mTabResource", "resTrade"]);
  assert.equal(page.settings.animated, true);
}

{
  // A throwing observer is reported and still does not cost the player their tab.
  const page = makePage({ civTabs: 4 });
  const result = discoveryFor(page).discover(mainTab(2), {
    whileDrawn: () => {
      throw new Error("reader exploded");
    },
  });
  assert.equal(result.outcome.status, "rejected");
  assert.equal(result.outcome.failure.code, "tab-observer-failed");
  assert.equal(page.settings.civTabs, 4);
  assert.equal(page.settings.animated, true);
  assert.deepEqual([...page.mounted].sort(), ["mTabResource", "resTrade"]);
  // The controls it did bind are still reported.
  assert.deepEqual(
    [...result.discovered],
    ["mTabCivic", "civ-farmer", "foundry"],
  );
}

{
  // An observer that throws on the fast path is reported the same way, and nothing was moved.
  const page = makePage({ civTabs: 2 });
  const result = discoveryFor(page).discover(mainTab(2), {
    whileDrawn: () => {
      throw new Error("reader exploded");
    },
  });
  assert.equal(result.outcome.failure.code, "tab-observer-failed");
  assert.deepEqual(page.swaps, []);
  assert.equal(page.settings.animated, true);
}

// --- the draw does not mount what it draws ----------------------------------

{
  // One scope, covering every step of the draw and the observer, and closed before the player's
  // own view is rebuilt: that restore is a real render and must not be suppressed.
  const page = makePage({ civTabs: 4, spaceTabs: 0 });
  let depthWhileDrawn;
  const result = discoveryFor(page).discover(subTab(1, "spaceTabs", 1), {
    whileDrawn: () => {
      depthWhileDrawn = page.suppression.depth;
    },
  });
  assert.equal(result.outcome.status, "succeeded");
  assert.equal(page.suppression.scopes, 1);
  assert.equal(depthWhileDrawn, 1);
  assert.equal(page.suppression.depth, 0);
  // Two drawing steps inside the scope; the restoring swap outside it.
  assert.equal(page.suppressedDraws(), 2);
  assert.deepEqual(page.swaps.at(-1).slice(1), [4, false]);
}

{
  // A draw that fails still leaves mounting restored.
  const page = makePage({ civTabs: 4 });
  const inner = page.registry.invoke;
  page.registry.invoke = (handle, method, args) =>
    args[0] === 2
      ? { ok: false, reason: "threw", detail: "loadTab exploded" }
      : inner(handle, method, args);
  discoveryFor(page).discover(mainTab(2));
  assert.equal(page.suppression.depth, 0);
}

{
  // An observer that throws leaves mounting restored too.
  const page = makePage({ civTabs: 4 });
  discoveryFor(page).discover(mainTab(2), {
    whileDrawn: () => {
      throw new Error("reader exploded");
    },
  });
  assert.equal(page.suppression.depth, 0);
}

{
  // Nothing to suppress with: the pass reports it rather than paying for a full off-tab render on
  // an automation tick.
  const page = makePage({ civTabs: 4 });
  page.suppression.available = false;
  const result = discoveryFor(page).discover(mainTab(2));
  assert.equal(result.outcome.failure.code, "mount-suppression-unavailable");
  assert.deepEqual(page.swaps, []);
  assert.equal(page.settings.civTabs, 4);
}

{
  // The panel already in front of the player needs no suppression, so it is still observed.
  const page = makePage({ civTabs: 2 });
  page.suppression.available = false;
  let seen = 0;
  const result = discoveryFor(page).discover(mainTab(2), {
    whileDrawn: () => {
      seen += 1;
    },
  });
  assert.equal(result.outcome.status, "succeeded");
  assert.equal(seen, 1);
}

console.log("captured-tab-discovery ok");
