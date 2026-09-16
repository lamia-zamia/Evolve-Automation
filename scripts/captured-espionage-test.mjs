import assert from "node:assert/strict";

import { runCapturedEspionage } from "../src/application/captured-espionage.ts";
import { createCapturedEspionage } from "../src/adapters/evolve/combat/captured-espionage.ts";
import { planCapturedEspionage } from "../src/domain/combat/captured-espionage.ts";

function makeRoot(policy, overrides = {}) {
  return {
    tech: { spy: 2 },
    city: { morale: { current: 250 } },
    resource: { Money: { amount: 20_000 } },
    civic: {
      foreign: {
        gov0: {
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
        },
      },
    },
    policy,
  };
}

function makeControls(root, modalMethods) {
  const methods = {
    vis: () => true,
    gvis: (index) => index === 0,
    trigModal: () => {},
    spy_disabled: () => false,
    spy: () => {},
  };
  const foreign = {
    elementId: "foreign",
    generation: 1,
    methods: Object.keys(methods),
  };
  const modal = {
    elementId: "espModal",
    generation: 1,
    methods: ["influence", "sabotage", "incite", "annex", "purchase"],
  };
  const current = new Map([
    [foreign.elementId, foreign],
    [modal.elementId, modal],
  ]);
  return {
    resolve(elementId) {
      return current.get(elementId);
    },
    invoke(control, method, args = []) {
      if (current.get(control.elementId)?.generation !== control.generation) {
        return { ok: false, reason: "stale-control" };
      }
      if (control.elementId === "foreign") {
        const value = methods[method]?.(...args);
        return { ok: true, value };
      }
      if (!control.methods.includes(method)) {
        return { ok: false, reason: "unknown-method" };
      }
      const value = modalMethods[method]?.(root, ...args);
      return { ok: true, value };
    },
    current,
  };
}

function makeSettings(policy) {
  return {
    foreignPolicyInferior: policy,
    foreignPolicySuperior: policy,
    foreignPolicyRival: policy,
    foreignForceSabotage: false,
    foreignUnification: false,
    foreignOccupyLast: false,
  };
}

function runOne(policy, overrides, mutate) {
  const root = makeRoot(policy, overrides);
  const activities = [];
  const controls = makeControls(root, {
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
  });
  const adapter = createCapturedEspionage({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => makeSettings(policy),
    onActivity: (activity) => activities.push(activity),
  });
  const outcome = runCapturedEspionage(adapter);
  assert.equal(outcome.status, "succeeded");
  assert.equal(activities.length, 1);
  assert.equal(activities[0].tags[0], "combat");
  mutate?.(root);
  return { adapter, root, activities };
}

runOne("Influence", { hstl: 30 }, undefined);
runOne("Sabotage", { mil: 80 }, undefined);
runOne("Incite", { unrest: 20 }, undefined);
runOne("Annex", { hstl: 20, unrest: 60 }, undefined);
runOne("Purchase", { hstl: 0, unrest: 0, spy: 3 }, undefined);

{
  const root = makeRoot("Annex", { hstl: 20, unrest: 60, sab: 0 });
  const activities = [];
  const controls = makeControls(root, {
    annex(currentRoot) {
      currentRoot.civic.foreign.gov0.sab = 300;
      currentRoot.civic.foreign.gov0.act = "annex";
    },
  });
  const adapter = createCapturedEspionage({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => makeSettings("Annex"),
    onActivity: (activity) => activities.push(activity),
  });
  const queued = runCapturedEspionage(adapter);
  assert.equal(queued.status, "stale");
  assert.equal(queued.failure.code, "captured-espionage-postcondition-pending");
  assert.equal(activities.length, 0);
  root.civic.foreign.gov0.sab = 0;
  root.civic.foreign.gov0.act = "none";
  root.civic.foreign.gov0.anx = true;
  const completed = runCapturedEspionage(adapter);
  assert.equal(completed.status, "succeeded");
  assert.equal(activities.length, 1);
}

{
  const root = makeRoot("Influence", { hstl: 30 });
  const controls = makeControls(root, {
    influence() {},
  });
  const adapter = createCapturedEspionage({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => makeSettings("Influence"),
  });
  const input = adapter.reader.read();
  assert.equal(input.enabled, true);
  const outcome = runCapturedEspionage(adapter);
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "captured-espionage-not-applied");
}

{
  let root = makeRoot("Influence", { hstl: 30 });
  const controls = makeControls(root, {
    influence(currentRoot) {
      currentRoot.civic.foreign.gov0.hstl -= 5;
    },
  });
  let liveRoot = root;
  const adapter = createCapturedEspionage({
    rootState: {
      readRoot: () => liveRoot,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => makeSettings("Influence"),
  });
  const rootInput = adapter.reader.read();
  liveRoot = { ...root };
  const rootChanged = adapter.executor.execute(
    planCapturedEspionage(rootInput),
  );
  assert.equal(rootChanged.status, "stale");
  assert.equal(rootChanged.failure.code, "captured-espionage-root-changed");

  root = makeRoot("Influence", { hstl: 30 });
  liveRoot = root;
  const generationAdapter = createCapturedEspionage({
    rootState: {
      readRoot: () => liveRoot,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => makeSettings("Influence"),
  });
  const generationInput = generationAdapter.reader.read();
  controls.current.set("foreign", {
    ...controls.current.get("foreign"),
    generation: 2,
  });
  const generationChanged = generationAdapter.executor.execute(
    planCapturedEspionage(generationInput),
  );
  assert.equal(generationChanged.status, "stale");
  assert.equal(
    generationChanged.failure.code,
    "captured-espionage-foreign-changed",
  );
}

console.log("captured espionage checks passed");
