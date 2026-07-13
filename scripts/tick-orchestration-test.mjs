import assert from "node:assert/strict";
import { createTickOrchestration } from "../src/automation/tick.ts";

const calls = [];

function makeControllers(label, overrides = {}) {
  const record =
    (name) =>
    (...args) => {
      calls.push(args.length > 0 ? `${label}:${name}(${args[0]})` : name);
      return overrides[name];
    };
  return new Proxy({}, { get: (_target, name) => record(name) });
}

function makeContext(overrides = {}) {
  return {
    settings: {
      masterScriptToggle: true,
      tickRate: 1,
      autoPower: true,
      stateLogEnabled: false,
      stateLogInterval: 1,
    },
    state: { scriptTick: 0, gameTicked: true },
    game: { global: { race: {}, settings: {} } },
    resources: { Soul_Gem: { currentQuantity: 7 } },
    KeyManager: {
      reset: () => calls.push("KeyManager.reset"),
      finish: () => calls.push("KeyManager.finish"),
    },
    NaniteManager: "nanite",
    SupplyManager: "supply",
    EjectManager: "eject",
    controllers: makeControllers("a"),
    ...overrides,
  };
}

// A single mutable context, replaced wholesale between runs, proves every runtime dependency is
// resolved through live getters rather than captured at factory time.
let context = makeContext();

const { automate } = createTickOrchestration({
  getSettings: () => context.settings,
  getState: () => context.state,
  getGame: () => context.game,
  getResources: () => context.resources,
  getKeyManager: () => context.KeyManager,
  getNaniteManager: () => context.NaniteManager,
  getSupplyManager: () => context.SupplyManager,
  getEjectManager: () => context.EjectManager,
  getControllers: () => context.controllers,
});

automate();
assert.deepEqual(calls, [
  "updateScriptData",
  "updateOverrides",
  "finalizeScriptData",
  "a:updateTabs(true)",
  "updateState",
  "updateUI",
  "KeyManager.reset",
  "autoPower",
  "isPrestigeAllowed",
  "updateBuildPlanner",
  "KeyManager.finish",
]);
assert.equal(context.state.soulGemLast, 7);

// The controller set is resolved per call, not captured, so the script can swap it (and the game
// can reload) without rewiring the tick.
calls.length = 0;
context = makeContext({ controllers: makeControllers("b") });
automate();
assert.equal(calls.includes("b:updateTabs(true)"), true);

// Consumption managers are resolved per call and handed to the shared autoConsume controller in a
// fixed order.
calls.length = 0;
context = makeContext({
  settings: {
    masterScriptToggle: true,
    tickRate: 1,
    autoNanite: true,
    autoSupply: true,
    autoEject: true,
    stateLogEnabled: false,
    stateLogInterval: 1,
  },
  NaniteManager: "nanite2",
  SupplyManager: "supply2",
  EjectManager: "eject2",
});
automate();
assert.deepEqual(
  calls.filter((call) => call.includes("autoConsume")),
  ["a:autoConsume(nanite2)", "a:autoConsume(supply2)", "a:autoConsume(eject2)"],
);

// A tab redraw abandons the tick before KeyManager is even reset: the DOM the automation would have
// clicked has just been replaced.
calls.length = 0;
context = makeContext({ controllers: makeControllers("a", { updateTabs: 1 }) });
automate();
assert.deepEqual(calls, [
  "updateScriptData",
  "updateOverrides",
  "finalizeScriptData",
  "a:updateTabs(true)",
]);

console.log("Tick orchestration module tests passed");
