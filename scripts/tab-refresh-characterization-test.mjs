import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const { hooks } = await loadCharacterizationBundle({
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  document: { querySelector: () => null },
  $: Object.assign(() => ({ ready() {}, each() {} }), {
    isEmptyObject: (object) => Object.keys(object).length === 0,
  }),
});

assert.equal(typeof hooks.updateTabs, "function");
assert.equal(typeof hooks.setTabRefreshTestContext, "function");

function makeContext({
  race = {},
  gameSettings = {},
  tech = {},
  galaxy = {},
  space = {},
  tauceti = {},
  buildings = {},
  unlockedStorage = [],
  techLevels = {},
  tabHash = 0,
} = {}) {
  const mainVue = {
    s: { civTabs: 1, tabLoad: true },
    toggleTabLoads: 0,
    trace: [],
    toggleTabLoad() {
      this.toggleTabLoads += 1;
      this.trace.push(
        `toggleTabLoad:${this.s.tabLoad}:civTabs${this.s.civTabs}:animated${this.s.animated}`,
      );
    },
  };
  const state = { tabHash };

  return {
    mainVue,
    state,
    context: {
      state,
      game: {
        global: {
          race,
          settings: { civTabs: 3, ...gameSettings },
          galaxy,
          space,
          tauceti,
          tech,
        },
      },
      buildings: {
        RockQuarry: { count: 0 },
        TitanQuarters: { count: 0 },
        TauStarRingworld: { count: 0 },
        ...buildings,
      },
      resources: {
        Crates: { isUnlocked: () => unlockedStorage.includes("Crates") },
        Containers: {
          isUnlocked: () => unlockedStorage.includes("Containers"),
        },
      },
      // haveTech(name, level) mirrors the main-script signature: a bare name means level 1.
      haveTech: (name, level = 1) => (techLevels[name] ?? 0) >= level,
      win: {
        document: {
          querySelector: () => ({ __vue_proxy__: mainVue }),
        },
      },
    },
  };
}

/** Runs updateTabs against a fresh context and reports everything the caller can observe. */
function run(options = {}, update = false) {
  const { mainVue, state, context } = makeContext(options);
  hooks.setTabRefreshTestContext(context);
  const redrawn = hooks.updateTabs(update);
  return {
    redrawn,
    tabHash: state.tabHash,
    civTabs: mainVue.s.civTabs,
    tabLoad: mainVue.s.tabLoad,
    toggleTabLoads: mainVue.toggleTabLoads,
    trace: [...mainVue.trace],
  };
}

// An empty game contributes nothing, and a first pass with update=false only seeds the hash.
const empty = run();
assert.equal(empty.tabHash, 0);
assert.equal(empty.redrawn, false);
assert.equal(empty.toggleTabLoads, 0);

// The hash is a monotonic unlock counter, not a real hash: each unlock adds a fixed amount.
// Market is weighted at 1000 so a Terrifying market mutation can never be cancelled out.
const contributions = [
  ["market tab", { gameSettings: { showMarket: true } }, 1000],
  ["shapeshifter UI", { race: { shapeshifter: true, ss_genus: "" } }, 1],
  ["servants UI", { race: { servants: true } }, 1],
  ["galaxy trade", { galaxy: { trade: {} } }, 1],
  ["ejector tab", { gameSettings: { showEjector: true } }, 1],
  ["supply tab", { gameSettings: { showCargo: true } }, 1],
  ["transmutation tiers", { tech: { alchemy: 2 } }, 2],
  ["build queue", { tech: { queue: 1 } }, 1],
  ["research queue", { tech: { r_queue: 1 } }, 1],
  ["government", { tech: { govern: 1 } }, 1],
  ["spy ops", { tech: { spy: 2 } }, 1],
  ["trade routes", { tech: { trade: 1 } }, 1],
  ["crates", { unlockedStorage: ["Crates"] }, 1],
  ["containers", { unlockedStorage: ["Containers"] }, 1],
  ["TP iridium smelting", { tech: { m_smelting: 2 } }, 1],
  ["iridium smelting", { tech: { irid_smelting: 1 } }, 1],
  ["titan mine", { buildings: { TitanQuarters: { count: 1 } } }, 1],
  ["orbit decay", { race: { orbit_decayed: true } }, 1],
  ["womling techs", { tech: { womling_tech: 3 } }, 3],
  ["cure techs", { tech: { focus_cure: 2 } }, 2],
  ["isolation", { tech: { isolation: 1 } }, 1],
  ["ignition device", { tech: { m_ignite: 1 } }, 1],
  ["ringworld", { buildings: { TauStarRingworld: { count: 1000 } } }, 1],
  ["alien space station", { tech: { tau_gas2: 5 } }, 1],
  ["matter replicator", { tech: { replicator: 1 } }, 1],
  ["lone survivor factory", { tauceti: { tau_factory: { count: 1 } } }, 1],
  ["lone survivor graphene", { space: { g_factory: { count: 1 } } }, 1],
  ["extractor ship", { tauceti: { mining_ship: { count: 1 } } }, 1],
  ["psychic thralls", { tech: { psychicthrall: 2 } }, 2],
  ["psychic powers", { tech: { psychic: 3 } }, 3],
  ["eden access", { tech: { edenic: 1 } }, 1],
  ["edenic piers", { tech: { isle: 3 } }, 1],
  ["sealed tomb", { tech: { palace: 4 } }, 1],
];
for (const [label, options, expected] of contributions) {
  assert.equal(run(options).tabHash, expected, `${label} hash contribution`);
}

// Chrysotile production only shows up once a Rock Quarry exists to produce it.
assert.equal(run({ race: { smoldering: true } }).tabHash, 0);
assert.equal(
  run({ race: { smoldering: true }, buildings: { RockQuarry: { count: 1 } } })
    .tabHash,
  1,
);

// The Ship Yard block is gated on the tab being shown, then adds one per component tier and
// one per syndicate/scanning unlock discovered through haveTech.
assert.equal(run({ gameSettings: { showShipYard: true } }).tabHash, 1);
assert.equal(
  run({
    gameSettings: { showShipYard: true },
    tech: {
      syard_class: 2,
      syard_power: 1,
      syard_weapon: 3,
      syard_armor: 1,
      syard_engine: 1,
      syard_sensor: 2,
    },
    techLevels: {
      titan: 3,
      enceladus: 2,
      triton: 2,
      makemake: 1,
      eris: 2,
      titan_ai_core: 1,
      tauceti: 1,
    },
  }).tabHash,
  // 1 (tab) + 10 (component tiers)
  // + 7 (enceladus, triton, makemake, eris, eris scanning, ai core, tauceti)
  1 + 10 + 7,
);
// Enceladus syndicate needs both titan 3 and enceladus 2.
assert.equal(
  run({
    gameSettings: { showShipYard: true },
    techLevels: { enceladus: 2 },
  }).tabHash,
  1,
);

// A shapeshifter's current genus is folded in as a string hash, so shifting genus is an unlock
// event even though nothing was added.
const noGenus = run({ race: { shapeshifter: true } }).tabHash;
const heat = run({ race: { shapeshifter: true, ss_genus: "heat" } }).tabHash;
const carnivore = run({
  race: { shapeshifter: true, ss_genus: "carnivore" },
}).tabHash;
assert.equal(noGenus, run({ race: { shapeshifter: true } }).tabHash);
assert.notEqual(heat, noGenus);
assert.notEqual(heat, carnivore);

// update=false observes unlocks without ever touching the game's Vue instance.
const observed = run({ gameSettings: { showMarket: true }, tabHash: 5 }, false);
assert.equal(observed.redrawn, false);
assert.equal(observed.tabHash, 1000);
assert.equal(observed.toggleTabLoads, 0);

// update=true with a changed hash forces the game to redraw every tab. The clear pass is parked on
// the panel-less tab 7 with preloading and animation off; the redraw pass runs with all three back
// where they started, so the render Vue queues for those writes redraws the same tab tree.
// civTabs comes back as the live Vue instance's 1, not the game snapshot's 3 - the snapshot is a
// per-tick clone and the game moves the tab itself.
const redraw = run({ gameSettings: { showMarket: true }, tabHash: 5 }, true);
assert.equal(redraw.redrawn, true);
assert.equal(redraw.toggleTabLoads, 2);
assert.deepEqual(redraw.trace, [
  "toggleTabLoad:false:civTabs7:animatedfalse",
  "toggleTabLoad:true:civTabs1:animatedundefined",
]);
assert.equal(redraw.tabLoad, true);
assert.equal(redraw.civTabs, 1);

// An unchanged hash is the common case and must not redraw anything.
const unchanged = run(
  { gameSettings: { showMarket: true }, tabHash: 1000 },
  true,
);
assert.equal(unchanged.redrawn, false);
assert.equal(unchanged.toggleTabLoads, 0);

console.log("Tab refresh bundled characterization tests passed");
