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

assert.equal(typeof hooks.automate, "function");
assert.equal(typeof hooks.setTickTestContext, "function");

// Every controller automate() can call. Each records its own name so a run produces the exact
// ordered sequence of automation the tick performed.
const CONTROLLERS = [
  "updateScriptData",
  "updateOverrides",
  "finalizeScriptData",
  "updateTabs",
  "updateState",
  "updateUI",
  "autoEvolution",
  "autoGatherResources",
  "autoMarket",
  "autoHell",
  "autoGalaxyMarket",
  "autoMiningDroid",
  "autoGraphenePlant",
  "autoAlchemy",
  "autoPylon",
  "autoQuarry",
  "autoMine",
  "autoExtractor",
  "autoSmelter",
  "autoStorage",
  "autoReplicator",
  "autoTrigger",
  "autoResearch",
  "autoBuild",
  "autoFactory",
  "autoJobs",
  "autoFleetOuter",
  "autoFleet",
  "autoMech",
  "autoGenetics",
  "autoMinorTrait",
  "autoCraft",
  "autoMerc",
  "autoSpy",
  "autoBattle",
  "autoTax",
  "autoGovernment",
  "autoConsume",
  "autoPower",
  "isPrestigeAllowed",
  "autoPrestige",
  "autoShapeshift",
  "autoPsychic",
  "autoOcularPowers",
  "autoWish",
  "autoMutateTrait",
  "updateBuildPlanner",
  "recordStateSnapshot",
];

// Everything the master toggle unlocks, so a single run exercises the full order.
const ALL_AUTOMATION = {
  masterScriptToggle: true,
  tickRate: 1,
  buildingAlwaysClick: false,
  autoEvolution: true,
  autoBuild: true,
  autoARPA: true,
  autoMarket: true,
  autoHell: true,
  autoGalaxyMarket: true,
  autoMiningDroid: true,
  autoGraphenePlant: true,
  autoAlchemy: true,
  autoPylon: true,
  autoQuarry: true,
  autoMine: true,
  autoExtractor: true,
  autoSmelter: true,
  autoStorage: true,
  autoReplicator: true,
  autoTrigger: true,
  autoResearch: true,
  autoFactory: true,
  autoJobs: true,
  autoCraftsmen: true,
  autoFleet: true,
  autoMech: true,
  autoGenetics: true,
  autoMinorTrait: true,
  autoCraft: true,
  autoFight: true,
  autoTax: true,
  autoGovernment: true,
  autoNanite: true,
  autoSupply: true,
  autoEject: true,
  autoPower: true,
  autoMutateTraits: true,
  stateLogEnabled: false,
  stateLogInterval: 1,
};

const NaniteManager = { id: "Nanite" };
const SupplyManager = { id: "Supply" };
const EjectManager = { id: "Eject" };

/**
 * Drives one automate() call with recording controllers.
 * `results` overrides what a controller returns (updateTabs and autoTrigger both gate the rest
 * of the tick, isPrestigeAllowed gates autoPrestige).
 */
function runTick({
  settings = {},
  state = {},
  race = {},
  gameSettings = {},
  results = {},
  soulGem = 0,
} = {}) {
  const calls = [];
  const controllers = {};
  for (const name of CONTROLLERS) {
    controllers[name] = (...args) => {
      calls.push(args.length > 0 ? `${name}(${describe(args[0])})` : name);
      return results[name];
    };
  }

  const keyManagerCalls = [];
  const tickState = {
    scriptTick: 0,
    gameTicked: true,
    ...state,
  };

  hooks.setTickTestContext({
    settings: { ...ALL_AUTOMATION, ...settings },
    state: tickState,
    game: { global: { race, settings: gameSettings } },
    resources: { Soul_Gem: { currentQuantity: soulGem } },
    KeyManager: {
      reset: () => keyManagerCalls.push("reset"),
      finish: () => keyManagerCalls.push("finish"),
    },
    NaniteManager,
    SupplyManager,
    EjectManager,
    controllers,
  });

  hooks.automate();

  return { calls, keyManagerCalls, state: tickState };
}

function describe(argument) {
  if (argument === true) {
    return "true";
  }
  return argument?.id ?? String(argument);
}

// A pending prestige, a forced settings refresh, or a tick the game has not actually run yet all
// abandon the tick before any bookkeeping happens.
for (const state of [
  { goal: "GameOverMan" },
  { forcedUpdate: true },
  { gameTicked: false },
]) {
  const skipped = runTick({ state });
  assert.deepEqual(skipped.calls, [], JSON.stringify(state));
  assert.deepEqual(skipped.keyManagerCalls, []);
  // scriptTick only advances on ticks the script accepts.
  assert.equal(skipped.state.scriptTick, 0);
}

// The game-ticked flag is consumed by the run, so one game tick drives at most one automation pass.
const consumed = runTick({});
assert.equal(consumed.state.gameTicked, false);
assert.equal(consumed.state.scriptTick, 1);

// tickRate throttles automation: with tickRate 3 only every third game tick does any work.
for (const [scriptTick, worked] of [
  [0, false],
  [1, false],
  [2, true],
]) {
  const throttled = runTick({
    settings: { tickRate: 3 },
    state: { scriptTick },
  });
  assert.equal(throttled.calls.length > 0, worked, `scriptTick ${scriptTick}`);
  assert.equal(throttled.state.scriptTick, scriptTick + 1);
}

// Under the game's accelerated time (settings.at) the tick rate is doubled, so the same tickRate
// runs half as often.
assert.deepEqual(
  runTick({
    settings: { tickRate: 3 },
    state: { scriptTick: 2 },
    gameSettings: { at: 1 },
  }).calls,
  [],
);
assert.equal(
  runTick({
    settings: { tickRate: 3 },
    state: { scriptTick: 5 },
    gameSettings: { at: 1 },
  }).calls.length > 0,
  true,
);

// The tick counter wraps instead of losing precision at the top of the safe integer range.
assert.equal(
  runTick({ state: { scriptTick: Number.MAX_SAFE_INTEGER } }).state.scriptTick,
  1,
);

// Data is refreshed before anything reads it, and settings overrides land between the two halves
// of the refresh. A tab redraw abandons the rest of the tick: the freshly rebuilt tabs replace the
// DOM nodes the automation would have clicked.
const redrawn = runTick({ results: { updateTabs: true } });
assert.deepEqual(redrawn.calls, [
  "updateScriptData",
  "updateOverrides",
  "finalizeScriptData",
  "updateTabs(true)",
]);
assert.deepEqual(redrawn.keyManagerCalls, []);

// With the master toggle off the script still refreshes its data and redraws its own UI, but takes
// no action on the player's behalf. KeyManager is reset but never finished, so no keys are released.
const observing = runTick({ settings: { masterScriptToggle: false } });
assert.deepEqual(observing.calls, [
  "updateScriptData",
  "updateOverrides",
  "finalizeScriptData",
  "updateTabs(true)",
  "updateState",
  "updateUI",
]);
assert.deepEqual(observing.keyManagerCalls, ["reset"]);

// During evolution the only automation that runs is autoEvolution, and only when it is enabled.
const evolving = runTick({ state: { goal: "Evolution" } });
assert.deepEqual(evolving.calls.slice(-1), ["autoEvolution"]);
assert.deepEqual(evolving.keyManagerCalls, ["reset"]);
const evolvingOff = runTick({
  state: { goal: "Evolution" },
  settings: { autoEvolution: false },
});
assert.deepEqual(evolvingOff.calls.slice(-1), ["updateUI"]);

// The full automation order for a normal tick. This sequence is load-bearing: several controllers
// invalidate data the later ones would otherwise misread, which is why they are ordered this way.
const full = runTick({ soulGem: 42 });
assert.deepEqual(full.calls, [
  "updateScriptData",
  "updateOverrides",
  "finalizeScriptData",
  "updateTabs(true)",
  "updateState",
  "updateUI",
  "autoGatherResources",
  "autoMarket",
  "autoHell",
  "autoGalaxyMarket",
  "autoMiningDroid",
  "autoGraphenePlant",
  "autoAlchemy",
  "autoPylon",
  "autoQuarry",
  "autoMine",
  "autoExtractor",
  "autoSmelter",
  "autoStorage",
  "autoReplicator",
  "autoTrigger",
  "autoResearch",
  "autoBuild",
  "autoFactory",
  "autoJobs",
  "autoFleet",
  "autoMech",
  "autoGenetics",
  "autoMinorTrait",
  "autoCraft",
  "autoMerc",
  "autoSpy",
  "autoBattle",
  "autoTax",
  "autoGovernment",
  "autoConsume(Nanite)",
  "autoConsume(Supply)",
  "autoConsume(Eject)",
  "autoPower",
  "isPrestigeAllowed",
  "autoShapeshift",
  "autoPsychic",
  "autoOcularPowers",
  "autoWish",
  "autoMutateTrait",
  "updateBuildPlanner",
]);
assert.deepEqual(full.keyManagerCalls, ["reset", "finish"]);
// The planner records the tick its data came from, and the soul gem count is carried to the next
// tick so gains can be attributed.
assert.equal(full.state.plannerFreshTick, full.state.scriptTick);
assert.equal(full.state.soulGemLast, 42);

// A trigger that started construction this tick blocks research and building, so they cannot steal
// the resources the trigger is saving for. The planner data is then stale, and is not marked fresh.
const triggered = runTick({ results: { autoTrigger: true } });
assert.equal(triggered.calls.includes("autoResearch"), false);
assert.equal(triggered.calls.includes("autoBuild"), false);
assert.equal(triggered.state.plannerFreshTick, undefined);

// Disabling autoTrigger does not disable research and building; the trigger check is simply skipped.
const untriggered = runTick({ settings: { autoTrigger: false } });
assert.equal(untriggered.calls.includes("autoTrigger"), false);
assert.equal(untriggered.calls.includes("autoResearch"), true);
assert.equal(untriggered.calls.includes("autoBuild"), true);

// autoBuild also runs for ARPA-only configurations, and resource gathering follows either
// autoBuild or the always-click setting.
assert.equal(
  runTick({ settings: { autoBuild: false } }).calls.includes("autoBuild"),
  true,
);
assert.equal(
  runTick({ settings: { autoBuild: false, autoARPA: false } }).calls.includes(
    "autoBuild",
  ),
  false,
);
assert.equal(
  runTick({
    settings: { autoBuild: false, buildingAlwaysClick: false },
  }).calls.includes("autoGatherResources"),
  false,
);
assert.equal(
  runTick({
    settings: { autoBuild: false, buildingAlwaysClick: true },
  }).calls.includes("autoGatherResources"),
  true,
);

// With full job automation off, Auto Craftsmen still runs autoJobs in craftsmen-only mode.
assert.deepEqual(
  runTick({ settings: { autoJobs: false } }).calls.filter((call) =>
    call.startsWith("autoJobs"),
  ),
  ["autoJobs(true)"],
);
assert.deepEqual(
  runTick({
    settings: { autoJobs: false, autoCraftsmen: false },
  }).calls.filter((call) => call.startsWith("autoJobs")),
  [],
);

// True Path has its own fleet automation and never runs the standard one.
const truepath = runTick({ race: { truepath: true } });
assert.equal(truepath.calls.includes("autoFleetOuter"), true);
assert.equal(truepath.calls.includes("autoFleet"), false);

// Prestige is gated by the shared eligibility policy, not by a setting on its own.
assert.equal(
  runTick({ results: { isPrestigeAllowed: true } }).calls.includes(
    "autoPrestige",
  ),
  true,
);

// The state log samples on its own counter, so its interval is in processed ticks and does not
// drift with tickRate.
const logging = runTick({
  settings: { stateLogEnabled: true, stateLogInterval: 2 },
});
assert.equal(logging.state.stateLogTick, 1);
assert.equal(logging.calls.includes("recordStateSnapshot"), false);
const loggingDue = runTick({
  settings: { stateLogEnabled: true, stateLogInterval: 2 },
  state: { stateLogTick: 1 },
});
assert.equal(loggingDue.state.stateLogTick, 2);
assert.equal(loggingDue.calls.includes("recordStateSnapshot"), true);

console.log("Tick orchestration bundled characterization tests passed");
