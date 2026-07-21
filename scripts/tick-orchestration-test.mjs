import assert from "node:assert/strict";

import { createTickOrchestration } from "./test-support/legacy-tick.ts";
import { runTick } from "../src/application/tick.ts";
import {
  createTickReader,
  createTickControls,
} from "../src/adapters/evolve/tick.ts";
import {
  shouldStartTick,
  advanceScriptTick,
  isThrottledTick,
  advanceStateLog,
} from "../src/domain/tick.ts";

// Every controller the tick can call. Each records its own invocation so a run produces the exact
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

function describe(argument) {
  if (typeof argument === "boolean") {
    return String(argument);
  }
  return argument?.id ?? String(argument);
}

/** Builds one instrumented fixture. `results` overrides gating controller returns; `updateStateEffect`
 * lets a scenario mutate state during updateState (e.g. an evolution transition). */
function makeFixture(options) {
  const {
    settings = {},
    state = {},
    race = {},
    gameSettings = {},
    results = {},
    soulGem = 0,
    updateStateEffect,
  } = options;

  const trace = [];
  const keyManagerCalls = [];
  const controllers = {};
  for (const name of CONTROLLERS) {
    controllers[name] = (...args) => {
      // Record exact call arity so a stray autoJobs(undefined) vs autoJobs() would be caught.
      trace.push(
        args.length ? `${name}(${args.map(describe).join(",")})` : name,
      );
      if (name === "updateState" && updateStateEffect) {
        updateStateEffect(fixture.state);
      }
      return results[name];
    };
  }

  const fixture = {
    trace,
    keyManagerCalls,
    settings: { ...ALL_AUTOMATION, ...settings },
    state: { scriptTick: 0, gameTicked: true, ...state },
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
  };
  return fixture;
}

function runLegacy(fixture) {
  const { automate } = createTickOrchestration({
    getSettings: () => fixture.settings,
    getState: () => fixture.state,
    getGame: () => fixture.game,
    getResources: () => fixture.resources,
    getKeyManager: () => fixture.KeyManager,
    getNaniteManager: () => fixture.NaniteManager,
    getSupplyManager: () => fixture.SupplyManager,
    getEjectManager: () => fixture.EjectManager,
    getControllers: () => fixture.controllers,
  });
  automate();
}

function runNew(fixture) {
  const reader = createTickReader({
    getSettings: () => fixture.settings,
    getState: () => fixture.state,
    getGame: () => fixture.game,
  });
  const controls = createTickControls({
    getControllers: () => fixture.controllers,
    getKeyManager: () => fixture.KeyManager,
    getState: () => fixture.state,
    getResources: () => fixture.resources,
    getNaniteManager: () => fixture.NaniteManager,
    getSupplyManager: () => fixture.SupplyManager,
    getEjectManager: () => fixture.EjectManager,
  });
  runTick({ reader, controls });
}

function snapshot(fixture) {
  const { state } = fixture;
  return {
    trace: fixture.trace,
    keyManagerCalls: fixture.keyManagerCalls,
    scriptTick: state.scriptTick,
    gameTicked: state.gameTicked,
    goal: state.goal,
    plannerFreshTick: state.plannerFreshTick,
    stateLogTick: state.stateLogTick,
    soulGemLast: state.soulGemLast,
  };
}

let scenarioCount = 0;
function dualRun(label, options = {}) {
  const legacy = makeFixture(options);
  const migrated = makeFixture(options);
  runLegacy(legacy);
  runNew(migrated);
  assert.deepEqual(snapshot(migrated), snapshot(legacy), label);
  scenarioCount += 1;
}

// --- Dual-run equivalence across the tick's branches --------------------------------------------

// A pending prestige, a forced settings refresh, or a tick the game has not run yet all abandon the
// tick before any bookkeeping happens.
dualRun("skip: game over", { state: { goal: "GameOverMan" } });
dualRun("skip: forced update", { state: { forcedUpdate: true } });
dualRun("skip: game not ticked", { state: { gameTicked: false } });

// Throttling: only every Nth accepted game tick does work; accelerated time doubles the divisor.
for (const scriptTick of [0, 1, 2]) {
  dualRun(`throttle tickRate 3 @${scriptTick}`, {
    settings: { tickRate: 3 },
    state: { scriptTick },
  });
}
dualRun("accelerated throttled", {
  settings: { tickRate: 3 },
  state: { scriptTick: 2 },
  gameSettings: { at: 1 },
});
dualRun("accelerated working", {
  settings: { tickRate: 3 },
  state: { scriptTick: 5 },
  gameSettings: { at: 1 },
});
dualRun("counter wrap", { state: { scriptTick: Number.MAX_SAFE_INTEGER } });

// A tab redraw abandons the rest of the tick before KeyManager is even reset.
dualRun("tab redraw", { results: { updateTabs: true } });
// Master toggle off still refreshes data and UI but takes no player action.
dualRun("master toggle off", { settings: { masterScriptToggle: false } });

// Evolution: only autoEvolution runs, and only when enabled.
dualRun("evolution goal", { state: { goal: "Evolution" } });
dualRun("evolution goal, automation off", {
  state: { goal: "Evolution" },
  settings: { autoEvolution: false },
});
// updateState can flip the goal to Evolution; both implementations re-read it after that pass.
dualRun("updateState flips goal to evolution", {
  updateStateEffect: (state) => {
    state.goal = "Evolution";
  },
});

// The full normal tick order plus its gating branches.
dualRun("full normal tick", { soulGem: 42 });
dualRun("trigger blocks research/build", { results: { autoTrigger: true } });
dualRun("autoTrigger setting off", { settings: { autoTrigger: false } });
dualRun("ARPA-only build", { settings: { autoBuild: false } });
dualRun("no build, no ARPA", {
  settings: { autoBuild: false, autoARPA: false },
});
dualRun("gather via always-click", {
  settings: { autoBuild: false, buildingAlwaysClick: true },
});
dualRun("no gather", {
  settings: { autoBuild: false, buildingAlwaysClick: false },
});
dualRun("craftsmen-only jobs", { settings: { autoJobs: false } });
dualRun("no jobs at all", {
  settings: { autoJobs: false, autoCraftsmen: false },
});
dualRun("true path fleet", { race: { truepath: true } });
dualRun("prestige allowed", { results: { isPrestigeAllowed: true } });
dualRun("state log not due", {
  settings: { stateLogEnabled: true, stateLogInterval: 2 },
});
dualRun("state log due", {
  settings: { stateLogEnabled: true, stateLogInterval: 2 },
  state: { stateLogTick: 1 },
});

console.log(
  `Tick orchestration dual-run parity: ${scenarioCount} scenarios matched`,
);

// --- Pure domain unit tests ---------------------------------------------------------------------

assert.equal(
  shouldStartTick({ goal: "Standard", forcedUpdate: false, gameTicked: true }),
  true,
);
assert.equal(
  shouldStartTick({
    goal: "GameOverMan",
    forcedUpdate: false,
    gameTicked: true,
  }),
  false,
);
assert.equal(
  shouldStartTick({ goal: "Standard", forcedUpdate: true, gameTicked: true }),
  false,
);
assert.equal(
  shouldStartTick({ goal: "Standard", forcedUpdate: false, gameTicked: false }),
  false,
);

assert.equal(advanceScriptTick(0), 1);
assert.equal(advanceScriptTick(41), 42);
assert.equal(advanceScriptTick(Number.MAX_SAFE_INTEGER), 1);

assert.equal(isThrottledTick(3, 3, false), false);
assert.equal(isThrottledTick(4, 3, false), true);
assert.equal(isThrottledTick(3, 3, true), true); // divisor doubled to 6
assert.equal(isThrottledTick(6, 3, true), false);

assert.deepEqual(advanceStateLog(0, 2), { next: 1, record: false });
assert.deepEqual(advanceStateLog(1, 2), { next: 2, record: true });

// --- Adapter contract tests ---------------------------------------------------------------------

function makeReader(overrides = {}) {
  return createTickReader({
    getSettings: () =>
      overrides.settings ?? { tickRate: 2, stateLogInterval: 5 },
    getState: () =>
      overrides.state ?? { goal: "Standard", scriptTick: 4, gameTicked: true },
    getGame: () =>
      overrides.game ?? {
        global: { race: {}, settings: {} },
      },
  });
}

const preamble = makeReader().samplePreamble();
assert.equal(preamble.goal, "Standard");
assert.equal(preamble.gameTicked, true);
assert.equal(preamble.scriptTick, 4);
assert.equal(preamble.tickRate, 2);
assert.equal(preamble.accelerated, false);

// Lenient coercions: non-string goal -> "", truthy accelerated flag, boolean gating fields.
const odd = makeReader({
  state: { goal: 7, scriptTick: "9", gameTicked: 1, forcedUpdate: 0 },
  game: { global: { race: {}, settings: { at: "yes" } } },
}).samplePreamble();
assert.equal(odd.goal, "");
assert.equal(odd.scriptTick, 9);
assert.equal(odd.gameTicked, true);
assert.equal(odd.forcedUpdate, false);
assert.equal(odd.accelerated, true);

const automation = makeReader({
  settings: {
    masterScriptToggle: 1,
    autoBuild: true,
    autoFight: 0,
    stateLogInterval: "3",
  },
  state: { goal: "Standard" },
  game: { global: { race: { truepath: 1 }, settings: {} } },
}).sampleAutomation();
assert.equal(automation.masterScriptToggle, true);
assert.equal(automation.autoBuild, true);
assert.equal(automation.autoFight, false);
assert.equal(automation.truepath, true);
assert.equal(automation.stateLogInterval, 3);
// An absent state-log counter defaults to 0 (legacy `?? 0`).
assert.equal(automation.stateLogTick, 0);

// Malformed game/state containers are rejected.
assert.throws(() =>
  createTickReader({
    getSettings: () => ({}),
    getState: () => null,
    getGame: () => ({ global: { race: {}, settings: {} } }),
  }).samplePreamble(),
);

console.log("Tick orchestration slice tests passed");
