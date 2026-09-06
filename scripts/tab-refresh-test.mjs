import assert from "node:assert/strict";
import { createTabRefresh } from "../src/ui/tab-refresh.ts";

function makeContext(overrides = {}) {
  return {
    state: { tabHash: 0 },
    game: {
      global: {
        race: {},
        settings: { civTabs: 2 },
        galaxy: {},
        space: {},
        tauceti: {},
        tech: {},
      },
    },
    buildings: {
      RockQuarry: { count: 0 },
      TitanQuarters: { count: 0 },
      TauStarRingworld: { count: 0 },
    },
    resources: {
      Crates: { isUnlocked: () => false },
      Containers: { isUnlocked: () => false },
    },
    haveTech: () => false,
    isPageVisible: () => true,
    ...overrides,
  };
}

// A single mutable context, replaced wholesale between runs, proves every runtime dependency is
// resolved through live getters rather than captured at factory time.
let context = makeContext();
let mainVueLookups = 0;
const mainVue = {
  s: { civTabs: 9, tabLoad: true, animated: true },
  toggles: [],
  seen: [],
  toggleTabLoad() {
    this.toggles.push(this.s.tabLoad);
    this.seen.push({ ...this.s });
  },
};

const { updateTabs } = createTabRefresh({
  getState: () => context.state,
  getGame: () => context.game,
  getBuildings: () => context.buildings,
  getResources: () => context.resources,
  getHaveTech: () => context.haveTech,
  isPageVisible: () => context.isPageVisible(),
  getMainVue: () => {
    mainVueLookups += 1;
    return mainVue;
  },
});

// The Vue instance is only looked up when a redraw actually happens. The script's first call comes
// from initialiseState(), before the game window has been resolved, so an eager lookup would throw.
assert.equal(updateTabs(false), false);
assert.equal(mainVueLookups, 0);

context = makeContext({
  game: {
    global: {
      race: {},
      settings: { civTabs: 2, showMarket: true },
      galaxy: {},
      space: {},
      tauceti: {},
      tech: {},
    },
  },
});
assert.equal(updateTabs(false), false);
assert.equal(context.state.tabHash, 1000);
assert.equal(mainVueLookups, 0);

// A changed hash under update=true redraws: the clear pass runs parked on the panel-less tab 7 with
// preloading and animation off, and the redraw pass runs with every borrowed setting already back
// at its entry value, so the render those writes trigger cannot discard the freshly drawn panels.
context.state.tabHash = 0;
assert.equal(updateTabs(true), true);
assert.equal(mainVueLookups, 1);
assert.deepEqual(mainVue.toggles, [false, true]);
assert.deepEqual(mainVue.seen, [
  { civTabs: 7, tabLoad: false, animated: false },
  { civTabs: 9, tabLoad: true, animated: true },
]);
assert.equal(mainVue.s.tabLoad, true);
// Restored from the live Vue instance, not from the game snapshot's civTabs (2): the snapshot is a
// per-tick clone, and the game moves the tab itself - sentience() switches to tab 1 mid-tick.
assert.equal(mainVue.s.civTabs, 9);
assert.equal(mainVue.s.animated, true);

// A delayed animated teardown from the first toggle must not be able to erase the rebuilt panels.
let panelContent = "existing";
const animatedRedraw = {
  s: { civTabs: 9, tabLoad: true, animated: true },
  toggleTabLoad() {
    if (!this.s.tabLoad && this.s.animated) {
      setTimeout(() => {
        panelContent = "";
      }, 300);
    } else {
      panelContent = "rebuilt";
    }
  },
};
const animatedContext = makeContext({
  state: { tabHash: 0 },
  game: {
    global: {
      race: {},
      settings: { civTabs: 2, showMarket: true },
      galaxy: {},
      space: {},
      tauceti: {},
      tech: {},
    },
  },
});
const { updateTabs: updateAnimatedTabs } = createTabRefresh({
  getState: () => animatedContext.state,
  getGame: () => animatedContext.game,
  getBuildings: () => animatedContext.buildings,
  getResources: () => animatedContext.resources,
  getHaveTech: () => animatedContext.haveTech,
  isPageVisible: () => animatedContext.isPageVisible(),
  getMainVue: () => animatedRedraw,
});
assert.equal(updateAnimatedTabs(true), true);
assert.equal(animatedRedraw.s.animated, true);
await new Promise((resolve) => setTimeout(resolve, 350));
assert.equal(panelContent, "rebuilt");

// The panels are redrawn only once the borrowed settings are back, so the render Vue runs for those
// writes sees the tab tree it already had. A panel that re-renders whenever it observes a setting
// still in its borrowed state must not be able to drop what the redraw put in it.
let renderContent = "existing";
const queuedRedraw = {
  s: { civTabs: 9, tabLoad: true, animated: true },
  toggleTabLoad() {
    if (!this.s.tabLoad) {
      renderContent = "";
      return;
    }
    renderContent = "rebuilt";
    // The panels the redraw pass mounts render against the settings as they stand at that moment.
    // Vue patches them again on the next flush; if anything the script borrowed has moved since,
    // Buefy replaces the panel elements and their contents go with them.
    const mounted = { ...this.s };
    queueMicrotask(() => {
      if (
        mounted.civTabs !== this.s.civTabs ||
        mounted.tabLoad !== this.s.tabLoad ||
        mounted.animated !== this.s.animated
      ) {
        renderContent = "";
      }
    });
  },
};
const queuedContext = makeContext({
  state: { tabHash: 0 },
  game: {
    global: {
      race: {},
      settings: { civTabs: 2, showMarket: true },
      galaxy: {},
      space: {},
      tauceti: {},
      tech: {},
    },
  },
});
const { updateTabs: updateQueuedTabs } = createTabRefresh({
  getState: () => queuedContext.state,
  getGame: () => queuedContext.game,
  getBuildings: () => queuedContext.buildings,
  getResources: () => queuedContext.resources,
  getHaveTech: () => queuedContext.haveTech,
  isPageVisible: () => queuedContext.isPageVisible(),
  getMainVue: () => queuedRedraw,
});
assert.equal(updateQueuedTabs(true), true);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(renderContent, "rebuilt");

// A hidden-page redraw is deferred without advancing the hash, so the first visible tick retries
// the rebuild instead of leaving the game panels empty after Firefox resumes the tab.
let hiddenPageVisible = false;
const hiddenContext = makeContext({
  state: { tabHash: 0 },
  game: {
    global: {
      race: {},
      settings: { civTabs: 2, showMarket: true },
      galaxy: {},
      space: {},
      tauceti: {},
      tech: {},
    },
  },
  isPageVisible: () => hiddenPageVisible,
});
const hiddenMainVue = {
  s: { civTabs: 2, tabLoad: true, animated: true },
  toggles: [],
  toggleTabLoad() {
    this.toggles.push(this.s.tabLoad);
  },
};
const { updateTabs: updateHiddenTabs } = createTabRefresh({
  getState: () => hiddenContext.state,
  getGame: () => hiddenContext.game,
  getBuildings: () => hiddenContext.buildings,
  getResources: () => hiddenContext.resources,
  getHaveTech: () => hiddenContext.haveTech,
  isPageVisible: () => hiddenContext.isPageVisible(),
  getMainVue: () => hiddenMainVue,
});
assert.equal(updateHiddenTabs(true), false);
assert.equal(hiddenContext.state.tabHash, 0);
assert.deepEqual(hiddenMainVue.toggles, []);
hiddenPageVisible = true;
assert.equal(updateHiddenTabs(true), true);
assert.equal(hiddenContext.state.tabHash, 1000);
assert.deepEqual(hiddenMainVue.toggles, [false, true]);

// An unchanged hash is the common case: no lookup, no redraw.
mainVue.toggles.length = 0;
assert.equal(updateTabs(true), false);
assert.equal(mainVueLookups, 1);
assert.deepEqual(mainVue.toggles, []);

// haveTech is resolved through the getter too, so a late rebind (the script destructures it from a
// factory) is still observed.
context = makeContext({
  game: {
    global: {
      race: {},
      settings: { civTabs: 2, showShipYard: true },
      galaxy: {},
      space: {},
      tauceti: {},
      tech: {},
    },
  },
  haveTech: (tech, level = 1) => tech === "makemake" && level === 1,
});
assert.equal(updateTabs(false), false);
assert.equal(context.state.tabHash, 2);

console.log("Tab refresh module tests passed");
