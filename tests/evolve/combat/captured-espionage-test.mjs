import assert from "node:assert/strict";

import {
  runCapturedEspionage,
  shouldRunCapturedBattleAfterEspionage,
} from "../../../src/application/captured-espionage.ts";
import { createCapturedEspionage } from "../../../src/adapters/evolve/combat/captured-espionage.ts";
import { planCapturedEspionage } from "../../../src/domain/combat/captured-espionage.ts";

const OPERATION_METHODS = [
  "influence",
  "sabotage",
  "incite",
  "annex",
  "purchase",
];

function makeGovernment(overrides = {}) {
  return {
    mil: 80,
    spy: 3,
    sab: 0,
    act: "none",
    hstl: 30,
    unrest: 20,
    eco: 1,
    occ: false,
    anx: false,
    buy: false,
    ...overrides,
  };
}

function makeRoot(policy, overrides = {}) {
  const { gov1, ...gov0Overrides } = overrides;
  return {
    tech: { spy: 2 },
    city: { morale: { current: 250 } },
    resource: { Money: { amount: 20_000 } },
    civic: {
      foreign: {
        gov0: makeGovernment(gov0Overrides),
        ...(gov1 === undefined ? {} : { gov1: makeGovernment(gov1) }),
      },
    },
    policy,
  };
}

/**
 * The captured-control registry, plus the operation capture the adapter buys its `#espModal`
 * control from. The capture records the control exactly as the real synthetic bootstrap does — a
 * fresh generation bound to the requested government — so a test that reuses one control for
 * another government cannot pass.
 */
function makeOperations(root, operationMethods, controls) {
  const captures = [];
  let generation = 0;
  let playerModalOpen = false;
  let unavailable = false;
  let scopeOverride;
  return {
    captures,
    get generation() {
      return generation;
    },
    setPlayerModalOpen(value) {
      playerModalOpen = value;
    },
    setUnavailable(value) {
      unavailable = value;
    },
    setScopeOverride(governmentId) {
      scopeOverride = governmentId;
    },
    get port() {
      return {
        blockedByPlayerModal: () => playerModalOpen,
        capture(governmentId) {
          if (unavailable) return undefined;
          generation += 1;
          const control = {
            elementId: "espModal",
            generation,
            methods: [...OPERATION_METHODS],
            data: root.civic.foreign[`gov${scopeOverride ?? governmentId}`],
          };
          captures.push(governmentId);
          controls.current.set("espModal", control);
          controls.operations = operationMethods;
          return control;
        },
      };
    },
  };
}

function makeControls(
  root,
  operationMethods,
  { visibleGovernmentIds = [0] } = {},
) {
  let invokeCalls = 0;
  const methods = {
    vis: () => true,
    gvis: (index) => visibleGovernmentIds.includes(index),
    trigModal: () => {
      throw new Error(
        "trigModal belongs to the capture boundary, not to invoke()",
      );
    },
    spy_disabled: () => false,
    spy: () => {},
  };
  const foreign = {
    elementId: "foreign",
    generation: 1,
    methods: Object.keys(methods),
  };
  const current = new Map([[foreign.elementId, foreign]]);
  const registry = {
    operations: operationMethods,
    failOperations: false,
    resolve(elementId) {
      return current.get(elementId);
    },
    invoke(control, method, args = []) {
      invokeCalls += 1;
      if (current.get(control.elementId)?.generation !== control.generation) {
        return { ok: false, reason: "stale-control" };
      }
      if (control.elementId === "foreign") {
        const value = methods[method]?.(...args);
        return { ok: true, value };
      }
      if (registry.failOperations) {
        return { ok: false, reason: "threw" };
      }
      if (!control.methods.includes(method)) {
        return { ok: false, reason: "unknown-method" };
      }
      const scopedGovernmentId =
        Object.entries(root.civic.foreign)
          .find(([, government]) => government === control.data)?.[0]
          ?.replace("gov", "") ?? undefined;
      const value = registry.operations[method]?.(
        root,
        scopedGovernmentId === undefined
          ? undefined
          : Number(scopedGovernmentId),
        ...args,
      );
      return { ok: true, value };
    },
    current,
    get invokeCalls() {
      return invokeCalls;
    },
  };
  return registry;
}

function makeSettings(policy, overrides = {}) {
  return {
    foreignPolicyInferior: policy,
    foreignPolicySuperior: policy,
    foreignPolicyRival: policy,
    foreignForceSabotage: false,
    foreignUnification: false,
    foreignOccupyLast: false,
    ...overrides,
  };
}

function countCapturedCalls(adapter) {
  let readerCalls = 0;
  let executorCalls = 0;
  return {
    adapter: {
      ...adapter,
      reader: {
        read() {
          readerCalls += 1;
          return adapter.reader.read();
        },
      },
      executor: {
        execute(decision) {
          executorCalls += 1;
          return adapter.executor.execute(decision);
        },
      },
    },
    calls: {
      get reader() {
        return readerCalls;
      },
      get executor() {
        return executorCalls;
      },
    },
  };
}

function governorTasks(activeTask) {
  return { t0: activeTask, t1: "none", t2: "none" };
}

/** One adapter over a root, a registry, and the operation capture that serves it. */
function makeCase(
  root,
  operationMethods,
  settingsOverrides = {},
  options = {},
) {
  const controls = makeControls(root, operationMethods ?? {}, {
    visibleGovernmentIds: options.visibleGovernmentIds ?? [0],
  });
  const operations = makeOperations(root, operationMethods, controls);
  const activities = [];
  let liveRoot = root;
  let settings = makeSettings(options.policy ?? "Influence", settingsOverrides);
  const adapter = createCapturedEspionage({
    rootState: {
      readRoot: () => liveRoot,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => settings,
    operations: operations.port,
    onActivity: (activity) => activities.push(activity),
  });
  return {
    adapter,
    activities,
    controls,
    operations,
    root,
    setPolicy(value) {
      settings = makeSettings(value, settingsOverrides);
    },
    updateSettings(patch) {
      settings = { ...settings, ...patch };
    },
    setRoot(value) {
      liveRoot = value;
    },
  };
}

// --- governor ownership ends the phase before anything is sampled -------------------------------

for (const activeTask of ["combo_spy", "spyop"]) {
  const root = makeRoot("Influence", { hstl: 30 });
  root.race = { governor: { tasks: governorTasks(activeTask) } };
  const testCase = makeCase(root, { influence() {} });
  assert.equal(testCase.adapter.isGovernorEspionageOwned(), true);
  const counted = countCapturedCalls(testCase.adapter);
  const outcome = runCapturedEspionage(counted.adapter);
  assert.equal(outcome.status, "succeeded");
  assert.equal(shouldRunCapturedBattleAfterEspionage(outcome), true);
  assert.equal(counted.calls.reader, 0);
  assert.equal(counted.calls.executor, 0);
  assert.equal(testCase.controls.invokeCalls, 0);
  assert.deepEqual(testCase.operations.captures, []);
  assert.equal(testCase.adapter.isBusy(), false);
}

// A pending native espionage timer does not own the garrison campaign control. Battle may use the
// freshly resampled government and garrison state in the same working cycle.
assert.equal(
  shouldRunCapturedBattleAfterEspionage({
    status: "stale",
    failure: {
      code: "captured-espionage-postcondition-pending",
      message: "native operation is still running",
    },
  }),
  true,
);
assert.equal(
  shouldRunCapturedBattleAfterEspionage({
    status: "stale",
    failure: {
      code: "captured-espionage-modal-conflict",
      message: "player modal is open",
    },
  }),
  false,
);
assert.equal(
  shouldRunCapturedBattleAfterEspionage({
    status: "stale",
    failure: {
      code: "captured-espionage-state-changed",
      message: "the foreign state changed",
    },
  }),
  false,
);
assert.equal(shouldRunCapturedBattleAfterEspionage(undefined), false);
assert.equal(
  shouldRunCapturedBattleAfterEspionage({
    status: "succeeded",
  }),
  true,
);
assert.equal(
  shouldRunCapturedBattleAfterEspionage({
    status: "rejected",
    failure: { code: "captured-espionage-rejected", message: "rejected" },
  }),
  false,
);
// --- one capture, one invocation, no waiting ----------------------------------------------------

{
  const root = makeRoot("Influence", { hstl: 30 });
  let influenceCalls = 0;
  const testCase = makeCase(root, {
    influence(currentRoot) {
      influenceCalls += 1;
      currentRoot.civic.foreign.gov0.hstl -= 5;
    },
  });
  const counted = countCapturedCalls(testCase.adapter);
  const outcome = runCapturedEspionage(counted.adapter);
  assert.equal(outcome.status, "succeeded");
  assert.equal(counted.calls.reader, 1);
  assert.equal(counted.calls.executor, 1);
  assert.deepEqual(testCase.operations.captures, [0]);
  assert.equal(root.civic.foreign.gov0.hstl, 25);
  assert.equal(influenceCalls, 1);
  assert.equal(testCase.activities.length, 1);
  assert.equal(testCase.adapter.isBusy(), false);
}

{
  const root = makeRoot("Influence", { hstl: 30 });
  const testCase = makeCase(root, {
    influence(currentRoot) {
      currentRoot.civic.foreign.gov0.sab = 300;
      currentRoot.civic.foreign.gov0.act = "influence";
    },
  });
  const queued = runCapturedEspionage(testCase.adapter);
  assert.equal(queued.status, "stale");
  assert.equal(queued.failure.code, "captured-espionage-postcondition-pending");
  assert.equal(testCase.activities.length, 0);
  assert.equal(
    testCase.adapter.isBusy(),
    true,
    "the game's timer is the pending work",
  );

  root.race = { governor: { tasks: governorTasks("spyop") } };
  const stoodDown = runCapturedEspionage(testCase.adapter);
  assert.equal(stoodDown.status, "succeeded");
  assert.deepEqual(testCase.operations.captures, [0]);
  assert.equal(testCase.adapter.isBusy(), false);
}

// --- every game-owned operation, one per policy --------------------------------------------------

function runOne(policy, overrides) {
  const root = makeRoot(policy, overrides);
  const testCase = makeCase(
    root,
    {
      influence(currentRoot) {
        currentRoot.civic.foreign.gov0.hstl -= 5;
      },
      sabotage(currentRoot) {
        currentRoot.civic.foreign.gov0.mil -= 5;
      },
      incite(currentRoot) {
        currentRoot.civic.foreign.gov0.unrest += 5;
      },
      annex(currentRoot) {
        currentRoot.civic.foreign.gov0.anx = true;
      },
      purchase(currentRoot) {
        currentRoot.civic.foreign.gov0.buy = true;
      },
    },
    // These standalone operation cases exercise the configured mission on its own. The old
    // SpyManager leaves per-government missions intact under pacifism, without a farm target.
    { foreignPacifist: policy === "Annex" || policy === "Purchase" },
    { policy },
  );
  const outcome = runCapturedEspionage(testCase.adapter);
  assert.equal(outcome.status, "succeeded", `outcome for ${policy}`);
  assert.equal(testCase.activities.length, 1, `activity for ${policy}`);
  assert.equal(testCase.activities[0].tags[0], "combat");
  assert.deepEqual(testCase.operations.captures, [0]);
  return testCase;
}

runOne("Influence", { hstl: 30 });
runOne("Sabotage", { mil: 80 });
runOne("Incite", { unrest: 20 });
runOne("Annex", { hstl: 20, unrest: 60 });
runOne("Purchase", { hstl: 0, unrest: 0, spy: 3 });

{
  const root = makeRoot("Influence", { hstl: 30 });
  const testCase = makeCase(root, { influence() {} });
  const outcome = runCapturedEspionage(testCase.adapter);
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "captured-espionage-not-applied");
}

// --- the captured control is scoped to the government the game bound it to -------------------------

{
  // The government's own closure governs which governments the game offers Annex for, so gov0
  // staying untouched here is the scope proof: the control was built for gov1, not for gov0.
  const root = makeRoot("Annex", {
    hstl: 90,
    anx: true,
    gov1: { mil: 60, spy: 3, hstl: 20, unrest: 60 },
  });
  root.tech.unify = 1;
  root.civic.foreign.gov2 = makeGovernment({ mil: 90, anx: true });
  const annexes = [];
  const testCase = makeCase(
    root,
    {
      annex(currentRoot, scopedGovernmentId, requestedGovernmentId) {
        annexes.push([scopedGovernmentId, requestedGovernmentId]);
        // Upstream `annex(g)` gates on the government its own closure was built with, then applies
        // to the requested one.
        const scoped = currentRoot.civic.foreign[`gov${scopedGovernmentId}`];
        if (
          scoped.hstl <= 50 &&
          scoped.unrest >= 50 &&
          currentRoot.civic.foreign[`gov${requestedGovernmentId}`].spy >= 1
        ) {
          currentRoot.civic.foreign[`gov${requestedGovernmentId}`].sab = 300;
          currentRoot.civic.foreign[`gov${requestedGovernmentId}`].act =
            "annex";
        }
      },
    },
    { foreignUnification: true },
    { policy: "Annex", visibleGovernmentIds: [0, 1, 2] },
  );
  const queued = runCapturedEspionage(testCase.adapter);
  assert.equal(queued.status, "stale");
  assert.equal(queued.failure.code, "captured-espionage-postcondition-pending");
  assert.deepEqual(testCase.operations.captures, [1]);
  assert.deepEqual(annexes, [[1, 1]]);
  assert.equal(root.civic.foreign.gov0.sab, 0, "gov0 was never annexed");
  assert.equal(
    root.civic.foreign.gov0.anx,
    true,
    "gov0 is still the control it was",
  );
  assert.equal(root.civic.foreign.gov1.act, "annex");
  root.civic.foreign.gov1.sab = 0;
  root.civic.foreign.gov1.act = "none";
  root.civic.foreign.gov1.anx = true;
  const completed = runCapturedEspionage(testCase.adapter);
  assert.equal(completed.status, "succeeded");
  assert.equal(testCase.activities.length, 1);
}

{
  // A capture the game bound to another government is refused rather than applied to this one.
  const root = makeRoot("Influence", { hstl: 30 });
  let influenceCalls = 0;
  const testCase = makeCase(root, {
    influence() {
      influenceCalls += 1;
    },
  });
  testCase.operations.setScopeOverride(1);
  const outcome = runCapturedEspionage(testCase.adapter);
  assert.equal(outcome.status, "stale");
  assert.equal(
    outcome.failure.code,
    "captured-espionage-operation-scope-changed",
  );
  assert.equal(influenceCalls, 0);
}

{
  // The synthetic control must still be the current build when it is invoked.
  const root = makeRoot("Influence", { hstl: 30 });
  let influenceCalls = 0;
  const controls = makeControls(root, {
    influence() {
      influenceCalls += 1;
    },
  });
  const operations = makeOperations(root, {}, controls);
  const adapter = createCapturedEspionage({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => makeSettings("Influence"),
    operations: {
      blockedByPlayerModal: () => false,
      capture(governmentId) {
        const control = operations.port.capture(governmentId);
        controls.current.set("espModal", { ...control, generation: 99 });
        return control;
      },
    },
  });
  const outcome = runCapturedEspionage(adapter);
  assert.equal(outcome.status, "stale");
  assert.equal(
    outcome.failure.code,
    "captured-espionage-operation-control-changed",
  );
  assert.equal(influenceCalls, 0);
}

// --- the operation itself -------------------------------------------------------------------------

{
  const root = makeRoot("Influence", { hstl: 30 });
  const controls = makeControls(root, {});
  const operations = makeOperations(root, {}, controls);
  operations.setUnavailable(true);
  const adapter = createCapturedEspionage({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => makeSettings("Influence"),
    operations: operations.port,
  });
  const outcome = runCapturedEspionage(adapter);
  assert.equal(outcome.status, "stale");
  assert.equal(
    outcome.failure.code,
    "captured-espionage-operation-capture-unavailable",
    "a capture that produced nothing is a closed door, not a hand-coded operation",
  );
  assert.deepEqual(operations.captures, []);
  assert.equal(root.civic.foreign.gov0.hstl, 30);
}

{
  const root = makeRoot("Influence", { hstl: 30 });
  let influenceCalls = 0;
  const testCase = makeCase(root, {
    influence() {
      influenceCalls += 1;
    },
  });
  testCase.controls.failOperations = true;
  const outcome = runCapturedEspionage(testCase.adapter);
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "captured-espionage-operation-failed");
  assert.equal(influenceCalls, 0);
}

{
  const root = makeRoot("Influence", { hstl: 30 });
  const testCase = makeCase(root, {
    influence(currentRoot) {
      currentRoot.civic.foreign.gov0.hstl -= 5;
    },
  });
  const input = testCase.adapter.reader.read();
  const decision = planCapturedEspionage(input);
  const rejected = testCase.adapter.executor.execute({
    ...decision,
    expectedMilitary: decision.expectedMilitary + 1,
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.failure.code, "invalid-captured-espionage-decision");
  assert.deepEqual(testCase.operations.captures, []);
}

// --- a modal the player owns is never touched ------------------------------------------------------

{
  const root = makeRoot("Influence", { hstl: 30 });
  let influenceCalls = 0;
  const testCase = makeCase(root, {
    influence(currentRoot) {
      influenceCalls += 1;
      currentRoot.civic.foreign.gov0.hstl -= 5;
    },
  });
  testCase.operations.setPlayerModalOpen(true);
  const deferred = runCapturedEspionage(testCase.adapter);
  assert.equal(deferred.status, "stale");
  assert.equal(deferred.failure.code, "captured-espionage-modal-conflict");
  assert.deepEqual(
    testCase.operations.captures,
    [],
    "nothing is captured beside a player modal",
  );
  assert.equal(influenceCalls, 0);
  assert.equal(root.civic.foreign.gov0.hstl, 30);
  assert.equal(testCase.adapter.isBusy(), false);

  testCase.operations.setPlayerModalOpen(false);
  const retried = runCapturedEspionage(testCase.adapter);
  assert.equal(retried.status, "succeeded");
  assert.equal(influenceCalls, 1);
  assert.equal(root.civic.foreign.gov0.hstl, 25);
}

// --- pending completion, and what is not a completion ----------------------------------------------

{
  const root = makeRoot("Sabotage", { mil: 80, sab: 0 });
  const testCase = makeCase(
    root,
    {
      sabotage(currentRoot) {
        currentRoot.civic.foreign.gov0.sab = 300;
        currentRoot.civic.foreign.gov0.act = "sabotage";
      },
    },
    {},
    { policy: "Sabotage" },
  );
  const queued = runCapturedEspionage(testCase.adapter);
  assert.equal(queued.status, "stale");
  assert.equal(queued.failure.code, "captured-espionage-postcondition-pending");
  assert.equal(testCase.activities.length, 0);
  root.civic.foreign.gov0.mil = 75;
  const unrelated = runCapturedEspionage(testCase.adapter);
  assert.equal(unrelated.status, "succeeded");
  assert.equal(
    testCase.activities.length,
    0,
    "a battle change is not this operation landing",
  );
  assert.equal(testCase.adapter.isBusy(), true);
  root.civic.foreign.gov0.sab = 0;
  root.civic.foreign.gov0.act = "none";
  const completed = runCapturedEspionage(testCase.adapter);
  assert.equal(completed.status, "succeeded");
  assert.equal(testCase.activities.length, 1);
  assert.equal(testCase.adapter.isBusy(), false);
}

{
  const root = makeRoot("Influence", { hstl: 30 });
  const testCase = makeCase(root, {
    influence(currentRoot) {
      currentRoot.civic.foreign.gov0.sab = 300;
      currentRoot.civic.foreign.gov0.act = "influence";
    },
  });
  const queued = runCapturedEspionage(testCase.adapter);
  assert.equal(queued.failure.code, "captured-espionage-postcondition-pending");
  testCase.setPolicy("Ignore");
  root.civic.foreign.gov0.hstl = 34;
  root.civic.foreign.gov0.sab = 0;
  root.civic.foreign.gov0.act = "none";
  const changed = runCapturedEspionage(testCase.adapter);
  assert.equal(changed.status, "succeeded");
  assert.equal(
    testCase.activities.length,
    0,
    "a policy change ends the pending operation quietly",
  );
}

{
  const root = makeRoot("Influence", { hstl: 30 });
  const testCase = makeCase(root, {
    influence(currentRoot) {
      currentRoot.civic.foreign.gov0.sab = 300;
      currentRoot.civic.foreign.gov0.act = "influence";
    },
  });
  const queued = runCapturedEspionage(testCase.adapter);
  assert.equal(queued.failure.code, "captured-espionage-postcondition-pending");
  root.race = { governor: { tasks: governorTasks("combo_spy") } };
  const takeover = runCapturedEspionage(testCase.adapter);
  assert.equal(takeover.status, "succeeded");
  assert.equal(testCase.activities.length, 0);
  assert.equal(testCase.adapter.isBusy(), false);
  testCase.adapter.standDown();
  assert.equal(testCase.adapter.isBusy(), false);
}

// --- stale authorities ------------------------------------------------------------------------------

{
  const root = makeRoot("Influence", { hstl: 30 });
  const testCase = makeCase(root, {
    influence(currentRoot) {
      currentRoot.civic.foreign.gov0.hstl -= 5;
    },
  });
  const rootInput = testCase.adapter.reader.read();
  testCase.setRoot(makeRoot("Influence", { hstl: 30 }));
  const rootChanged = testCase.adapter.executor.execute(
    planCapturedEspionage(rootInput),
  );
  assert.equal(rootChanged.status, "stale");
  assert.equal(rootChanged.failure.code, "captured-espionage-root-changed");
  assert.deepEqual(testCase.operations.captures, []);
}

{
  const root = makeRoot("Influence", { hstl: 30 });
  const testCase = makeCase(root, {
    influence(currentRoot) {
      currentRoot.civic.foreign.gov0.hstl -= 5;
    },
  });
  const generationInput = testCase.adapter.reader.read();
  testCase.controls.current.set("foreign", {
    ...testCase.controls.current.get("foreign"),
    generation: 2,
  });
  const generationChanged = testCase.adapter.executor.execute(
    planCapturedEspionage(generationInput),
  );
  assert.equal(generationChanged.status, "stale");
  assert.equal(
    generationChanged.failure.code,
    "captured-espionage-foreign-changed",
  );
  assert.deepEqual(testCase.operations.captures, []);
}

{
  const root = makeRoot("Influence", { hstl: 30 });
  const testCase = makeCase(root, {
    influence(currentRoot) {
      currentRoot.civic.foreign.gov0.hstl -= 5;
    },
  });
  const stateInput = testCase.adapter.reader.read();
  root.civic.foreign.gov0.hstl += 1;
  const stale = testCase.adapter.executor.execute(
    planCapturedEspionage(stateInput),
  );
  assert.equal(stale.status, "stale");
  assert.equal(stale.failure.code, "captured-espionage-state-changed");
  assert.deepEqual(testCase.operations.captures, []);
}

{
  const root = makeRoot("Influence", { hstl: 30 });
  const testCase = makeCase(root, {
    influence(currentRoot) {
      currentRoot.civic.foreign.gov0.hstl -= 5;
    },
  });
  const input = testCase.adapter.reader.read();
  const decision = planCapturedEspionage(input);
  const rejected = testCase.adapter.executor.execute({
    ...decision,
    expectedMilitary: decision.expectedMilitary + 1,
  });
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.failure.code, "invalid-captured-espionage-decision");
  assert.deepEqual(testCase.operations.captures, []);
}

// --- Purchase preparation and its reservation -------------------------------------------------------

{
  const root = makeRoot("Purchase", { hstl: 30, unrest: 20, spy: 3 });
  root.resource.Money.amount = 0;
  const testCase = makeCase(
    root,
    {
      influence(currentRoot) {
        currentRoot.civic.foreign.gov0.hstl -= 5;
      },
    },
    { foreignPacifist: true },
    { policy: "Purchase" },
  );
  const input = testCase.adapter.reader.read();
  assert.equal(input.spyCount, 3);
  assert.equal(input.requestedOperationUseful, false);
  assert.equal(input.influenceUseful, true);
  assert.equal(input.inciteUseful, true);
  assert.equal(input.influenceAllowed, true);
  assert.equal(
    planCapturedEspionage(input)?.operation,
    "influence",
    "Purchase below current Money still prepares with Influence at three spies",
  );
  const outcome = runCapturedEspionage(testCase.adapter);
  assert.equal(outcome.status, "succeeded");
  assert.equal(root.civic.foreign.gov0.hstl, 25);
}

{
  const root = makeRoot("Purchase", { hstl: 30, unrest: 20, spy: 3 });
  root.resource.Money.amount = 0;
  const testCase = makeCase(
    root,
    { influence() {}, purchase() {} },
    { foreignPacifist: true },
    { policy: "Purchase" },
  );
  const input = testCase.adapter.reader.read();
  const decision = planCapturedEspionage(input);
  assert.equal(decision?.operation, "influence");
  root.resource.Money.amount = 100_000;
  const changed = testCase.adapter.executor.execute(decision);
  assert.equal(changed.status, "stale");
  assert.equal(
    changed.failure.code,
    "captured-espionage-state-changed",
    "the executor rechecks whether Purchase replaced the preparation fallback",
  );
}

for (const fallbackPolicy of ["Annex", "Purchase"]) {
  const root = makeRoot("Ignore", {
    mil: 90,
    gov1: makeGovernment({ mil: 10 }),
  });
  root.civic.foreign.gov2 = makeGovernment({ mil: 90 });
  const testCase = makeCase(
    root,
    {},
    {
      foreignPowerRequired: 75,
      foreignPolicyInferior: "Influence",
      foreignPolicySuperior: fallbackPolicy,
    },
    { visibleGovernmentIds: [0, 1, 2] },
  );
  const preparedTargets = testCase.adapter.reader
    .readAll()
    .filter((candidate) => candidate.policy === fallbackPolicy);
  assert.deepEqual(
    preparedTargets.map((candidate) => candidate.governmentId),
    [0, 2],
  );
  for (const candidate of preparedTargets) {
    assert.equal(candidate.influenceAllowed, true);
    assert.equal(
      planCapturedEspionage(candidate)?.operation,
      "influence",
      `${fallbackPolicy} target ${candidate.governmentId} is secondary when strategy battle target is null`,
    );
  }
}

{
  const root = makeRoot("Annex", {
    hstl: 30,
    unrest: 20,
    spy: 3,
    gov1: makeGovernment({ mil: 10, hstl: 30, unrest: 20, spy: 3 }),
  });
  const testCase = makeCase(
    root,
    { incite() {}, influence() {} },
    {},
    { policy: "Annex", visibleGovernmentIds: [0, 1] },
  );
  const primaryInput = testCase.adapter.reader.read();
  const primaryDecision = planCapturedEspionage(primaryInput);
  assert.equal(primaryInput.influenceAllowed, false);
  assert.equal(primaryDecision?.operation, "incite");
  testCase.updateSettings({ foreignPacifist: true });
  const primaryStatusChanged =
    testCase.adapter.executor.execute(primaryDecision);
  assert.equal(primaryStatusChanged.status, "stale");
  assert.equal(
    primaryStatusChanged.failure.code,
    "captured-espionage-state-changed",
    "the executor rejects an operation when the old primary becomes secondary",
  );
}

console.log("captured espionage checks passed");
