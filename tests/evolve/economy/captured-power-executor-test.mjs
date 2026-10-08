import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { installCapturedGameMechanics } from "../../../src/adapters/evolve/captured-game-mechanics.ts";
import { createCapturedPowerExecutor } from "../../../src/adapters/evolve/economy/production/captured-power-executor.ts";

function powerExecutorFixture(
  region = "city",
  structId = "coal_power",
  additionalStructIds = [],
) {
  const page = runInNewContext("({ Map, Object, Array, Function, Number })");
  let period;
  const install = installCapturedGameMechanics(page, {
    subscribe(callback) {
      period = callback;
      return () => {};
    },
  });
  let root = {
    race: {},
    tech: { high_tech: 2 },
    city: { coal_power: { count: 8, on: 1 } },
    resource: { Coal: { diff: 12 } },
    settings: { showCity: true },
  };
  root.settings.showPortal = true;
  const buildingSpecs = [
    { region, structId },
    ...additionalStructIds.map((additionalStructId) => ({
      region: "city",
      structId: additionalStructId,
    })),
  ];
  const actions = [];
  const entries = new page.Map();
  for (const spec of buildingSpecs) {
    root[spec.region] = root[spec.region] ?? {};
    root[spec.region][spec.structId] = { count: 8, on: 1 };
    const currentAction = {
      id: `${spec.region}-${spec.structId}`,
      reqs: {},
      powered: () => -5,
      title: spec.structId,
      on_cap: () => 5,
      postPower: () => false,
    };
    actions.push(currentAction);
    const key = `${spec.region}:${spec.structId}`;
    entries.set(key, {
      key,
      region: spec.region,
      sector: spec.region,
      struct: spec.structId,
      c_action: currentAction,
      info: false,
    });
  }
  for (const struct of ["unused1", "unused2"]) {
    const key = `${region}:${struct}`;
    entries.set(key, {
      key,
      region,
      sector: region,
      struct,
      c_action: { id: `${region}-${struct}`, reqs: {} },
      info: false,
    });
  }
  const callbacks = new page.Map();
  const callbackRepeat = new page.Map();
  const runCallbacks = () => {
    for (const [[owner, method], args] of callbacks) {
      if (owner[method](...args)) callbackRepeat.set([owner, method], args);
    }
    callbacks.clear();
    for (const [[owner, method], args] of callbackRepeat)
      callbacks.set([owner, method], args);
    callbackRepeat.clear();
  };
  let replaced;
  let saveSupply = false;
  const logs = [];
  const phases = new Map();
  const counts = new Map();
  let clock = 0;
  const diagnostics = {
    readPerformanceEnabled: () => true,
    nowMs: () => ++clock,
    recordPerformance(phase) {
      phases.set(phase, (phases.get(phase) ?? 0) + 1);
    },
    recordCount(name, amount) {
      counts.set(name, (counts.get(name) ?? 0) + amount);
    },
  };
  const nativeMechanics = install.mechanics;
  let readStructureEntries = () => nativeMechanics.readStructures();
  let semanticScanCount = 0;
  const mechanics = {
    ...nativeMechanics,
    readStructures() {
      semanticScanCount++;
      return readStructureEntries();
    },
  };
  const session = createCapturedPowerExecutor({
    rootState: {
      readRoot: () => root,
      subscribeRootReplaced(callback) {
        replaced = callback;
        return () => {};
      },
    },
    controls: { capturedElementIds: () => [], resolve: () => undefined },
    mechanics,
    readMechSaveSupply: () => saveSupply,
    setMechSaveSupply(expected, value) {
      if (expected !== saveSupply) return false;
      saveSupply = value;
      return true;
    },
    log: (message) => logs.push(message),
    diagnostics,
  });
  const adjust = (expectedStateOn, amount, index = 0) => {
    const spec = buildingSpecs[index];
    return {
      kind: "adjust-building",
      buildingId: spec.structId,
      binding: `${spec.region}-${spec.structId}`,
      expectedStateOn,
      amount,
    };
  };
  const execute = (...operations) =>
    session.executor.execute({
      kind: "apply-power-cycle",
      expectedBuildings: buildingSpecs.map((spec) => ({
        id: spec.structId,
        binding: `${spec.region}-${spec.structId}`,
      })),
      operations,
    });
  return {
    runCallbacks,
    page,
    root,
    action: actions[0],
    actions,
    callbacks,
    entries,
    session,
    adjust,
    execute,
    counts,
    phases,
    semanticScanCount: () => semanticScanCount,
    setStructureReader: (reader) => {
      readStructureEntries = reader;
    },
    period: () => period(),
    replaced: () => replaced(),
    replaceRoot: (replacement) => {
      root = replacement;
      replaced();
    },
    saveSupply: () => saveSupply,
    logs,
    primeCallbackQueue() {
      callbacks.set([actions[0], "postPower"], [true]);
      callbacks.clear();
      runCallbacks();
      period();
    },
    install,
  };
}

const fixture = powerExecutorFixture();
assert.equal(
  fixture.execute(fixture.adjust(1, 2)).status,
  "stale",
  "missing postPower queue fails before mutation",
);
assert.equal(fixture.root.city.coal_power.on, 1);
fixture.callbacks.set([fixture.action, "postPower"], [true]);
fixture.callbacks.clear();
fixture.runCallbacks();
fixture.period();
assert.equal(fixture.execute(fixture.adjust(1, 3)).status, "succeeded");
assert.equal(fixture.root.city.coal_power.on, 4);
assert.deepEqual([...fixture.callbacks.values()], [[true]]);
assert.equal(fixture.execute(fixture.adjust(1, 1)).status, "stale");
assert.equal(
  fixture.execute(fixture.adjust(4, 2)).status,
  "stale",
  "game-owned on_cap is respected",
);
fixture.callbacks.clear();
assert.equal(fixture.execute(fixture.adjust(4, -3)).status, "succeeded");
assert.equal(fixture.root.city.coal_power.on, 1);
assert.deepEqual([...fixture.callbacks.values()], [[false]]);
const before = JSON.stringify(fixture.root);
fixture.root.city.coal_power.on = 5;
fixture.action.on_cap = () => 3;
assert.equal(
  fixture.execute(fixture.adjust(5, -2), fixture.adjust(3, 1)).status,
  "stale",
  "projected repeated-binding increase must respect cap before any effect",
);
assert.equal(fixture.root.city.coal_power.on, 5);
fixture.action.on_cap = () => 5;
fixture.root.city.coal_power.on = 1;
assert.equal(
  fixture.execute(fixture.adjust(1, 1), {
    kind: "set-mech-save-supply",
    expected: true,
    value: false,
  }).status,
  "stale",
  "Mech state is preflighted before switching",
);
assert.equal(fixture.root.city.coal_power.on, 1);
assert.equal(
  fixture.execute(
    { kind: "set-resource-rate", resourceId: "Coal", expected: 12, value: -99 },
    {
      kind: "set-power-model",
      resourceId: "Power",
      expectedCurrent: 0,
      expectedRate: 0,
      value: 999,
    },
    {
      kind: "set-description",
      buildingId: "coal_power",
      binding: "city-coal_power",
      expected: "Coal",
      value: "Model description",
    },
    { kind: "set-mech-save-supply", expected: false, value: true },
    { kind: "log", message: "Power changed" },
  ).status,
  "succeeded",
);
assert.equal(
  JSON.stringify(fixture.root),
  before,
  "bookkeeping never changes game production",
);
assert.equal(
  fixture.session.readDescription("city-coal_power"),
  "Model description",
);
assert.equal(fixture.action.desc, undefined);
assert.equal(fixture.saveSupply(), true);
assert.deepEqual(fixture.logs, ["Power changed"]);
assert.equal(
  fixture.execute({
    kind: "set-mech-save-supply",
    expected: false,
    value: false,
  }).status,
  "stale",
);
let changingOn = 1;
Object.defineProperty(fixture.root.city.coal_power, "on", {
  configurable: true,
  get: () => changingOn,
  set(value) {
    changingOn = value;
    fixture.replaced();
  },
});
assert.equal(
  fixture.execute(fixture.adjust(1, 3)).status,
  "stale",
  "generation changes during mutation cannot report success",
);
assert.equal(changingOn, 2, "stop immediately when the generation changes");
assert.equal(fixture.session.readDescription("city-coal_power"), undefined);
fixture.install.uninstall();
const diverted = powerExecutorFixture();
diverted.callbacks.set([diverted.action, "postPower"], [true]);
diverted.runCallbacks();
diverted.period();
let divertedOn = 1;
Object.defineProperty(diverted.root.city.coal_power, "on", {
  get: () => divertedOn,
  set(value) {
    divertedOn = value + 1;
  },
});
assert.equal(
  diverted.execute(diverted.adjust(1, 3)).status,
  "stale",
  "a returned mutation does not prove the transition",
);
assert.equal(divertedOn, 3, "stop after observing an unexpected transition");
diverted.install.uninstall();
for (const struct of [
  "bireme",
  "transport",
  "purifier",
  "mechbay",
  "port",
  "base_camp",
]) {
  const special = powerExecutorFixture("portal", struct);
  special.callbacks.set([special.action, "postPower"], [true]);
  special.callbacks.clear();
  special.runCallbacks();
  special.period();
  assert.equal(
    special.execute(special.adjust(1, 2)).status,
    "succeeded",
    `${struct} uses the same semantic executor`,
  );
  assert.equal(special.root.portal[struct].on, 3);
  special.install.uninstall();
}
const emptyStartup = powerExecutorFixture();
const iteratorBeforeRestore = emptyStartup.page.Map.prototype[Symbol.iterator];
emptyStartup.runCallbacks();
emptyStartup.period();
assert.notEqual(
  emptyStartup.page.Map.prototype[Symbol.iterator],
  iteratorBeforeRestore,
  "startup iterator hook is restored",
);
assert.equal(
  emptyStartup.execute(emptyStartup.adjust(1, 2)).status,
  "succeeded",
  "empty startup callback pass captures queue for later progression",
);
emptyStartup.install.uninstall();

const ambiguousStartup = powerExecutorFixture();
ambiguousStartup.runCallbacks();
const otherQueue = new ambiguousStartup.page.Map();
const otherRepeat = new ambiguousStartup.page.Map();
for (const ignored of otherQueue) void ignored;
otherQueue.clear();
for (const ignored of otherRepeat) void ignored;
otherRepeat.clear();
ambiguousStartup.period();
assert.equal(
  ambiguousStartup.execute(ambiguousStartup.adjust(1, 2)).status,
  "stale",
  "ambiguous callback ownership fails closed",
);
assert.equal(ambiguousStartup.root.city.coal_power.on, 1);
ambiguousStartup.install.uninstall();

const multiple = powerExecutorFixture("city", "coal_power", [
  "oil_power",
  "fission_power",
]);
multiple.primeCallbackQueue();
assert.equal(
  multiple.execute(
    multiple.adjust(1, 2, 0),
    multiple.adjust(1, -1, 1),
    multiple.adjust(1, 1, 2),
  ).status,
  "succeeded",
  "distinct switches use the initial catalog and verify each target",
);
assert.equal(multiple.root.city.coal_power.on, 3);
assert.equal(multiple.root.city.oil_power.on, 0);
assert.equal(multiple.root.city.fission_power.on, 2);
assert.equal(multiple.semanticScanCount(), 1);
assert.equal(
  multiple.counts.get("autoPower.execute.fullSemanticBuildingScans"),
  1,
);
assert.equal(
  multiple.counts.get("autoPower.execute.cycleSemanticBuildingScans"),
  1,
);
assert.equal(multiple.counts.get("autoPower.execute.targetRereads"), 6);
assert.equal(
  multiple.counts.get("autoPower.execute.buildingSwitchOperations"),
  3,
);
assert.equal(multiple.phases.get("autoPower.execute.initialBuildingSample"), 1);
assert.equal(multiple.phases.get("autoPower.execute.targetRead"), 6);

const repeatedBinding = powerExecutorFixture();
repeatedBinding.primeCallbackQueue();
assert.equal(
  repeatedBinding.execute(
    repeatedBinding.adjust(1, 2),
    repeatedBinding.adjust(3, -1),
  ).status,
  "succeeded",
  "sequential operations against one binding chain through planned state",
);
assert.equal(repeatedBinding.root.city.coal_power.on, 2);
assert.equal(repeatedBinding.semanticScanCount(), 1);

const changedBeforeSwitch = powerExecutorFixture();
changedBeforeSwitch.root.city.coal_power.on = 2;
assert.equal(
  changedBeforeSwitch.execute(changedBeforeSwitch.adjust(1, 1)).status,
  "stale",
);
assert.equal(changedBeforeSwitch.root.city.coal_power.on, 2);
assert.equal(changedBeforeSwitch.semanticScanCount(), 1);

const preflightFailure = powerExecutorFixture("city", "coal_power", [
  "oil_power",
]);
preflightFailure.primeCallbackQueue();
preflightFailure.actions[1].on_cap = () => Number.NaN;
assert.equal(
  preflightFailure.execute(
    preflightFailure.adjust(1, 1, 0),
    preflightFailure.adjust(1, 1, 1),
  ).status,
  "stale",
  "a later native preflight failure prevents earlier planned switches",
);
assert.equal(preflightFailure.root.city.coal_power.on, 1);
assert.equal(preflightFailure.root.city.oil_power.on, 1);

const ambiguousIdentity = powerExecutorFixture();
ambiguousIdentity.primeCallbackQueue();
const uniqueStructures = ambiguousIdentity.install.mechanics.readStructures();
const coalStructure = uniqueStructures.find(
  (structure) => structure.entryKey === "city:coal_power",
);
ambiguousIdentity.setStructureReader(() => [
  ...uniqueStructures,
  coalStructure,
]);
assert.equal(
  ambiguousIdentity.execute(ambiguousIdentity.adjust(1, 1)).status,
  "stale",
  "a non-unique initial structure identity fails closed",
);
assert.equal(ambiguousIdentity.root.city.coal_power.on, 1);
assert.equal(ambiguousIdentity.semanticScanCount(), 1);

const driftingIdentity = powerExecutorFixture();
driftingIdentity.primeCallbackQueue();
let availabilityReads = 0;
driftingIdentity.action.condition = () => {
  availabilityReads++;
  if (availabilityReads === 2)
    driftingIdentity.entries.delete("city:coal_power");
  return true;
};
assert.equal(
  driftingIdentity.execute(driftingIdentity.adjust(1, 1)).status,
  "stale",
  "a target structure that disappears during execution is not reused",
);
assert.equal(driftingIdentity.root.city.coal_power.on, 1);
assert.equal(driftingIdentity.semanticScanCount(), 1);

const replacedStructureIdentity = powerExecutorFixture();
replacedStructureIdentity.primeCallbackQueue();
replacedStructureIdentity.root.portal = {
  coal_power: { count: 8, on: 1 },
};
replacedStructureIdentity.action.condition = () => {
  const entry = replacedStructureIdentity.entries.get("city:coal_power");
  replacedStructureIdentity.entries.set("city:coal_power", {
    ...entry,
    region: "portal",
  });
  return true;
};
assert.equal(
  replacedStructureIdentity.execute(replacedStructureIdentity.adjust(1, 1))
    .status,
  "stale",
  "same-key structure coordinate drift fails before native mutation",
);
assert.equal(replacedStructureIdentity.root.city.coal_power.on, 1);
assert.equal(
  replacedStructureIdentity.root.portal.coal_power.on,
  1,
  "the replacement structure is never switched through a stale snapshot",
);

const replacedRoot = powerExecutorFixture();
replacedRoot.primeCallbackQueue();
const newRoot = {
  ...replacedRoot.root,
  city: {
    ...replacedRoot.root.city,
    coal_power: { ...replacedRoot.root.city.coal_power },
  },
};
let rootAvailabilityReads = 0;
replacedRoot.action.condition = () => {
  rootAvailabilityReads++;
  if (rootAvailabilityReads === 2) replacedRoot.replaceRoot(newRoot);
  return true;
};
assert.equal(
  replacedRoot.execute(replacedRoot.adjust(1, 1)).status,
  "stale",
  "root replacement during a target read aborts the execution",
);
assert.equal(replacedRoot.root.city.coal_power.on, 1);
assert.equal(newRoot.city.coal_power.on, 1);

console.log("captured Power executor tests passed");
