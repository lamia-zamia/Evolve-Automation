import assert from "node:assert/strict";

import { runCapturedEspionage } from "../src/application/captured-espionage.ts";
import { createCapturedEspionage } from "../src/adapters/evolve/combat/captured-espionage.ts";
import { planCapturedEspionage } from "../src/domain/combat/captured-espionage.ts";

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

function makeControls(
  root,
  modalMethods,
  { visibleGovernmentIds = [0], initialModalGovernmentId = 0 } = {},
) {
  const methods = {
    vis: () => true,
    gvis: (index) => visibleGovernmentIds.includes(index),
    trigModal: () => {
      throw new Error("synthetic trigModal receiver used");
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
  function installModal(governmentId) {
    const previous = current.get("espModal");
    current.set("espModal", {
      elementId: "espModal",
      generation: (previous?.generation ?? 0) + 1,
      methods: ["influence", "sabotage", "incite", "annex", "purchase"],
      data: root.civic.foreign[`gov${governmentId}`],
    });
  }
  if (initialModalGovernmentId !== null) {
    installModal(initialModalGovernmentId);
  }
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
      const modalGovernmentId = Object.entries(root.civic.foreign)
        .find(([, government]) => government === control.data)?.[0]
        ?.replace("gov", "");
      const value = modalMethods[method]?.(
        root,
        modalGovernmentId === undefined ? undefined : Number(modalGovernmentId),
        ...args,
      );
      return { ok: true, value };
    },
    current,
    installModal,
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

function makeModalFixture(activeModals) {
  let modal;
  const remove = () => {
    const index = activeModals.indexOf(modal);
    if (index >= 0) activeModals.splice(index, 1);
  };
  const modalBackground = {
    click() {
      modal.closed = true;
      remove();
    },
  };
  modal = {
    style: { visibility: "visible" },
    querySelector(selector) {
      assert.equal(selector, ".modal-background");
      return modalBackground;
    },
    remove,
  };
  return modal;
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
  const root = makeRoot("Sabotage", { mil: 80, sab: 0 });
  const activities = [];
  const controls = makeControls(root, {
    sabotage(currentRoot) {
      currentRoot.civic.foreign.gov0.sab = 300;
      currentRoot.civic.foreign.gov0.act = "sabotage";
    },
  });
  const adapter = createCapturedEspionage({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => makeSettings("Sabotage"),
    onActivity: (activity) => activities.push(activity),
  });
  const queued = runCapturedEspionage(adapter);
  assert.equal(queued.status, "stale");
  assert.equal(queued.failure.code, "captured-espionage-postcondition-pending");
  assert.equal(activities.length, 0);
  root.civic.foreign.gov0.mil = 75;
  const unrelated = runCapturedEspionage(adapter);
  assert.equal(unrelated.status, "succeeded");
  assert.equal(activities.length, 0);
  assert.equal(adapter.isBusy(), true);
  root.civic.foreign.gov0.sab = 0;
  root.civic.foreign.gov0.act = "none";
  const completed = runCapturedEspionage(adapter);
  assert.equal(completed.status, "succeeded");
  assert.equal(activities.length, 1);
}

{
  const root = makeRoot("Influence", { hstl: 30 });
  const activities = [];
  let policy = "Influence";
  const controls = makeControls(root, {
    influence(currentRoot) {
      currentRoot.civic.foreign.gov0.sab = 300;
      currentRoot.civic.foreign.gov0.act = "influence";
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
  const queued = runCapturedEspionage(adapter);
  assert.equal(queued.status, "stale");
  assert.equal(queued.failure.code, "captured-espionage-postcondition-pending");
  policy = "Ignore";
  root.civic.foreign.gov0.hstl = 34;
  root.civic.foreign.gov0.sab = 0;
  const failed = runCapturedEspionage(adapter);
  assert.equal(failed.status, "succeeded");
  assert.equal(activities.length, 0);
}

{
  const root = makeRoot("Influence", { hstl: 30 });
  const activities = [];
  const controls = makeControls(
    root,
    {
      influence(currentRoot) {
        currentRoot.civic.foreign.gov0.hstl -= 5;
      },
    },
    { initialModalGovernmentId: null },
  );
  let ensureCalls = 0;
  const adapter = createCapturedEspionage({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => makeSettings("Influence"),
    getDocument: () => ({ querySelector: () => null }),
    ensureForeignModal: (governmentId) => {
      ensureCalls += 1;
      controls.installModal(governmentId);
      return true;
    },
    onActivity: (activity) => activities.push(activity),
  });
  const opened = runCapturedEspionage(adapter);
  assert.equal(opened.status, "stale");
  assert.equal(opened.failure.code, "captured-espionage-modal-pending");
  assert.equal(ensureCalls, 1);
  assert.equal(activities.length, 0);
  const completed = runCapturedEspionage(adapter);
  assert.equal(completed.status, "succeeded");
  assert.equal(root.civic.foreign.gov0.hstl, 25);
  assert.equal(activities.length, 1);
}

{
  const root = makeRoot("Influence", { hstl: 30 });
  const controls = makeControls(
    root,
    {
      influence() {},
    },
    { initialModalGovernmentId: null },
  );
  const activeModals = [];
  const createdModal = makeModalFixture(activeModals);
  const adapter = createCapturedEspionage({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => makeSettings("Influence"),
    getDocument: () => ({
      querySelector: () => null,
      querySelectorAll: (selector) => {
        assert.equal(selector, ".modal.is-active");
        return activeModals;
      },
    }),
    ensureForeignModal: () => {
      activeModals.push(createdModal);
      return true;
    },
  });
  const opened = runCapturedEspionage(adapter);
  assert.equal(opened.status, "stale");
  assert.equal(opened.failure.code, "captured-espionage-modal-pending");
  assert.equal(createdModal.style.visibility, "hidden");
  assert.equal(activeModals.length, 1);
  runCapturedEspionage(adapter);
  runCapturedEspionage(adapter);
  const expired = runCapturedEspionage(adapter);
  assert.equal(expired.status, "succeeded");
  assert.equal(createdModal.closed, true);
  assert.equal(activeModals.length, 0);
  assert.equal(adapter.isBusy(), true);
  adapter.reader.read();
  assert.equal(adapter.isBusy(), false);
}

{
  const root = makeRoot("Influence", { hstl: 30 });
  const controls = makeControls(
    root,
    {
      influence() {},
    },
    { initialModalGovernmentId: null },
  );
  const activeModals = [];
  const createdModal = makeModalFixture(activeModals);
  const adapter = createCapturedEspionage({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => makeSettings("Influence"),
    getDocument: () => ({
      querySelector: () => null,
      querySelectorAll: () => activeModals,
    }),
    ensureForeignModal: () => {
      activeModals.push(createdModal);
      controls.installModal(0);
      return true;
    },
  });
  const opened = runCapturedEspionage(adapter);
  assert.equal(opened.status, "stale");
  assert.equal(opened.failure.code, "captured-espionage-modal-pending");
  root.tech.spy = 1;
  const eligibilityChanged = runCapturedEspionage(adapter);
  assert.equal(eligibilityChanged.status, "succeeded");
  assert.equal(createdModal.closed, true);
  assert.equal(activeModals.length, 0);
  assert.equal(adapter.isBusy(), false);
}

{
  const root = makeRoot("Influence", { hstl: 30 });
  const controls = makeControls(
    root,
    {
      influence() {},
    },
    { initialModalGovernmentId: null },
  );
  const playerModal = { style: { visibility: "visible" } };
  const activeModals = [playerModal];
  let ensureCalls = 0;
  const adapter = createCapturedEspionage({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => makeSettings("Influence"),
    getDocument: () => ({
      querySelector: () => null,
      querySelectorAll: () => activeModals,
    }),
    ensureForeignModal: () => {
      ensureCalls += 1;
      return true;
    },
  });
  const deferred = runCapturedEspionage(adapter);
  assert.equal(deferred.status, "stale");
  assert.equal(deferred.failure.code, "captured-espionage-modal-conflict");
  assert.equal(ensureCalls, 0);
  assert.equal(playerModal.style.visibility, "visible");
  activeModals.length = 0;
  const retried = runCapturedEspionage(adapter);
  assert.equal(retried.status, "stale");
  assert.equal(retried.failure.code, "captured-espionage-modal-pending");
  assert.equal(ensureCalls, 1);
}

{
  const root = makeRoot("Influence", { hstl: 30 });
  let influenceCalls = 0;
  const controls = makeControls(root, {
    influence() {
      influenceCalls += 1;
    },
  });
  const playerModal = { style: { visibility: "visible" } };
  const adapter = createCapturedEspionage({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => makeSettings("Influence"),
    getDocument: () => ({
      querySelectorAll: () => [playerModal],
    }),
  });
  const deferred = runCapturedEspionage(adapter);
  assert.equal(deferred.status, "stale");
  assert.equal(deferred.failure.code, "captured-espionage-modal-conflict");
  assert.equal(influenceCalls, 0);
  assert.equal(playerModal.style.visibility, "visible");
}

{
  const root = makeRoot("Influence", { hstl: 30 });
  let influenceCalls = 0;
  const controls = makeControls(
    root,
    {
      influence() {
        influenceCalls += 1;
      },
    },
    { initialModalGovernmentId: null },
  );
  const activeModals = [];
  const automationModal = makeModalFixture(activeModals);
  const playerModal = { style: { visibility: "visible" } };
  const adapter = createCapturedEspionage({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => makeSettings("Influence"),
    getDocument: () => ({
      querySelector: () => null,
      querySelectorAll: () => activeModals,
    }),
    ensureForeignModal: () => {
      activeModals.push(automationModal);
      controls.installModal(0);
      return true;
    },
  });
  const opened = runCapturedEspionage(adapter);
  assert.equal(opened.status, "stale");
  assert.equal(opened.failure.code, "captured-espionage-modal-pending");
  assert.equal(automationModal.style.visibility, "hidden");
  activeModals.push(playerModal);
  const deferred = runCapturedEspionage(adapter);
  assert.equal(deferred.status, "stale");
  assert.equal(deferred.failure.code, "captured-espionage-modal-conflict");
  assert.equal(influenceCalls, 0);
  assert.equal(automationModal.closed, true);
  assert.deepEqual(activeModals, [playerModal]);
  assert.equal(playerModal.style.visibility, "visible");
}

{
  const root = makeRoot("Influence", {
    hstl: 90,
    gov1: { mil: 60, spy: 3, hstl: 20, unrest: 60 },
  });
  const activities = [];
  let policy = "Influence";
  const visibleGovernmentIds = [0];
  const controls = makeControls(
    root,
    {
      annex(currentRoot, modalGovernmentId, requestedGovernmentId) {
        const modalGovernment =
          currentRoot.civic.foreign[`gov${modalGovernmentId}`];
        const requestedGovernment =
          currentRoot.civic.foreign[`gov${requestedGovernmentId}`];
        if (
          modalGovernment.hstl <= 50 &&
          modalGovernment.unrest >= 50 &&
          requestedGovernment.spy >= 1 &&
          requestedGovernment.sab === 0
        ) {
          requestedGovernment.sab = 300;
          requestedGovernment.act = "annex";
        }
      },
    },
    { visibleGovernmentIds, initialModalGovernmentId: 0 },
  );
  const adapter = createCapturedEspionage({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => makeSettings(policy),
    getDocument: () => ({
      querySelector(selector) {
        assert.equal(selector, "#gov1 div span:nth-child(3) button");
        return { click: () => controls.installModal(1) };
      },
    }),
    onActivity: (activity) => activities.push(activity),
  });
  const firstInput = adapter.reader.read();
  assert.equal(firstInput.governmentId, 0);
  root.civic.foreign.gov0.anx = true;
  visibleGovernmentIds.push(1);
  policy = "Annex";
  const secondInput = adapter.reader.read();
  assert.equal(secondInput.governmentId, 1);
  const opened = runCapturedEspionage(adapter);
  assert.equal(opened.status, "stale");
  assert.equal(opened.failure.code, "captured-espionage-modal-pending");
  const queued = runCapturedEspionage(adapter);
  assert.equal(queued.status, "stale");
  assert.equal(queued.failure.code, "captured-espionage-postcondition-pending");
  root.civic.foreign.gov1.sab = 0;
  root.civic.foreign.gov1.act = "none";
  root.civic.foreign.gov1.anx = true;
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
