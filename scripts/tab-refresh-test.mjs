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
  toggleTabLoad() {
    this.toggles.push(this.s.tabLoad);
  },
};

const { updateTabs } = createTabRefresh({
  getState: () => context.state,
  getGame: () => context.game,
  getBuildings: () => context.buildings,
  getResources: () => context.resources,
  getHaveTech: () => context.haveTech,
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

// A changed hash under update=true redraws: the game is parked on the hidden tab 7, tab preloading
// is cycled off and on to rebuild the DOM, then the player's own tab is restored from settings.
context.state.tabHash = 0;
assert.equal(updateTabs(true), true);
assert.equal(mainVueLookups, 1);
assert.deepEqual(mainVue.toggles, [false, true]);
assert.equal(mainVue.s.tabLoad, true);
assert.equal(mainVue.s.civTabs, 2);
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
  getMainVue: () => animatedRedraw,
});
assert.equal(updateAnimatedTabs(true), true);
assert.equal(animatedRedraw.s.animated, true);
await new Promise((resolve) => setTimeout(resolve, 350));
assert.equal(panelContent, "rebuilt");

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
