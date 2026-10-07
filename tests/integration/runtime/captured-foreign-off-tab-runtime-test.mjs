/**
 * The Foreign consumers, on a save whose Government sub-tab has never been rendered.
 *
 * This is the production regression for the off-tab defect: `foreign` is absent from the control
 * registry, the player is on another Civic sub-tab, and mount suppression is active. Every consumer
 * is then asked to do its job against a Government draw that has to be spent once to establish the
 * Foreign authority.
 *
 * The harness is the composition the runtime performs — `createCapturedTabDiscovery` over a stub
 * registry, `createDiscoveryAttempts` for the retry policy, and `planForeignPanelDraw` for the pass —
 * with the game's own draw transcribed rather than a real page. The transcription level is the one
 * `captured-foreign-discovery-test.mjs` covers against the real capture; what is new here is the
 * consumers and the demand prerequisite on top of it.
 */
import assert from "node:assert/strict";
import { installVueCapture } from "../../../src/adapters/evolve/vue-capture.ts";

import { createCapturedTabDiscovery } from "../../../src/adapters/evolve/captured-tab-discovery.ts";
import { createCapturedBattle } from "../../../src/adapters/evolve/combat/battle.ts";
import { capturedForeignGarrisonEstablished } from "../../../src/adapters/evolve/combat/captured-foreign-state.ts";
import { createCapturedEspionage } from "../../../src/adapters/evolve/combat/captured-espionage.ts";
import { createCapturedEspionageOperationCapture } from "../../../src/adapters/evolve/combat/captured-espionage-capture.ts";
import { createCapturedSpyTraining } from "../../../src/adapters/evolve/combat/captured-spy-training.ts";
import {
  FOREIGN_PANEL_DRAW_KEY,
  planForeignPanelDraw,
} from "../../../src/adapters/evolve/combat/foreign-panel-draw.ts";
import { ensureDemandPrerequisiteControls } from "../../../src/adapters/evolve/economy/resources/captured-demand-prerequisites.ts";
import { runBattleAutomation } from "../../../src/application/battle.ts";
import { runCapturedEspionage } from "../../../src/application/captured-espionage.ts";
import { runCapturedSpyTraining } from "../../../src/application/captured-spy-training.ts";
import { createDiscoveryAttempts } from "../../../src/bootstrap/discovery-attempts.ts";
import {
  createTestDocument,
  element,
} from "../../support/fixtures/dom-fixture.mjs";

/**
 * A registry over the game's own draw. The only thing it models is what the real capture records:
 * a control appears when the game binds the element, and its methods are the game's own closures.
 */
function makeRegistry() {
  const vue = { createApp: () => ({}) };
  const capture = installVueCapture({ Vue: vue });
  const controls = new Map();
  const usage = [];
  return {
    usage,
    registry: {
      checkpoint: capture.controls.checkpoint,
      rejectChanges: capture.controls.rejectChanges,
      resolve(elementId) {
        return capture.controls.resolve(elementId);
      },
      invoke(handle, method, args = []) {
        const result = capture.controls.invoke(handle, method, args);
        if (result.ok) usage.push(`${handle.elementId}.${method}`);
        return result;
      },
      capturedElementIds: () => [...controls.keys()],
    },
    register(elementId, methods, { receiver = {}, data } = {}) {
      const existing = controls.get(elementId);
      controls.set(elementId, {
        generation: (existing?.generation ?? 0) + 1,
        names: Object.keys(methods),
        data,
        calls: Object.fromEntries(
          Object.entries(methods).map(([name, value]) => [
            name,
            typeof value === "function" ? value : () => value,
          ]),
        ),
        receiver,
      });
      vue.createApp({
        el: elementId.startsWith("#") ? elementId : `#${elementId}`,
        data,
        methods: Object.fromEntries(
          Object.entries(methods).map(([name, value]) => [
            name,
            typeof value === "function"
              ? (...args) => Reflect.apply(value, receiver, args)
              : () => value,
          ]),
        ),
      });
      return { elementId, generation: controls.get(elementId).generation };
    },
    has(elementId) {
      return capture.controls.resolve(elementId) !== undefined;
    },
  };
}

/** `civics.js:spyActive` */
function spyActive(root) {
  if (root.race.cataclysm === true || root.tech.isolation === true)
    return false;
  if (!root.tech.world_control) return true;
  return root.race.truepath === true && (root.tech.shadow ?? 0) < 3;
}

/**
 * The Civic sub-tab draw, at the level the stub registry sees it. `defineGovernment()` creates
 * `#government`, and only a really mounted component produces `#r_govern0` — the container
 * `foreignGov()` and the compact `buildGarrison` append into. So `foreign` appears only on a pass
 * that named `#government` in `mount`, which is the whole defect.
 */
function drawGovernment(root, captured, governContainer) {
  if (root.settings.govTabs !== 0) return;
  if (governContainer() === null) return;
  if (root.race.species === "protoplasm" || root.race.start_cataclysm === true)
    return;
  if (root.civic.garrison.display !== true || !spyActive(root)) return;
  captured.register("govType", { vis: () => true });
  // `buildGarrison`'s own closures: the same set of methods the full panel binds.
  captured.register("c_garrison", {
    campaign: () => {
      root.stats.attacks += 1;
    },
    next: () => {
      root.civic.garrison.tactic += 1;
    },
    last: () => {
      root.civic.garrison.tactic -= 1;
    },
    aNext: () => {
      root.civic.garrison.raid += 1;
    },
    aLast: () => {
      root.civic.garrison.raid -= 1;
    },
    rating: (value) => value,
    hell: () => root.civic.garrison.cityGarrison,
    s_max: () => root.civic.garrison.maxCityGarrison,
  });
  captured.register("foreign", {
    vis: () => root.civic.garrison.display && spyActive(root),
    gvis: (g) => root.civic.foreign[`gov${g}`] !== undefined,
    spy_disabled: (g) => root.civic.foreign[`gov${g}`].trn > 0,
    spy(g) {
      root.civic.foreign[`gov${g}`].trn = 300;
    },
    trigModal(g) {
      captured.trigModalGovernment = g;
    },
  });
}

/**
 * The runtime's Foreign slice: the shared tab draw, the attempt policy, and the owner built from the
 * same plan the composition root builds. The player starts off Civic on another sub-tab, so the
 * draw has to go out and come back.
 */
function makeOffTabRuntime({ root = makeRoot() } = {}) {
  const page = {
    document: createTestDocument(element("div", { id: "page" })),
    draws: [],
    modalOpenedFor: undefined,
    allowedGovernment: false,
  };
  const captured = makeRegistry();
  const rootState = {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
  // The attempt clock. Held still here: these cases are about what one eligible draw establishes,
  // and `captured-discovery-retry-test.mjs` owns the back-off schedule.
  let cycle = 0;
  const attempts = createDiscoveryAttempts({ readCycle: () => cycle });
  const settings = () => root.settings;
  // The main-tab component, bound at startup outside any scope.
  captured.register("#mainColumn div.content", {
    swapTab(tab) {
      page.draws.push(["civTabs", tab]);
      settings().civTabs = tab;
      if (tab !== 2) return tab;
      captured.register("mTabCivic", {
        swapTab(next) {
          settings().govTabs = next;
          // The Civic sub-tab's own draw, at the point where the scope decides what may mount.
          drawGovernment(
            root,
            captured,
            page.allowedGovernment ? () => "#r_govern0" : () => null,
          );
          return next;
        },
      });
      return tab;
    },
  });
  const discovery = createCapturedTabDiscovery({
    rootState,
    controls: captured.registry,
    mountSuppression: {
      available: true,
      withoutMounting(draw, scope = {}) {
        // The one component the Government draw needs built for real.
        page.allowedGovernment = scope.shouldMount?.("#government") === true;
        try {
          return draw();
        } finally {
          page.allowedGovernment = false;
        }
      },
      withMountingEnabled: (draw) => draw(),
    },
    // Nothing to protect here: the stub has no player's panel of its own.
    panels: { open: () => undefined },
  });
  const errors = [];
  const ensureForeignControls = () => {
    if (captured.has("foreign")) return true;
    const draw = planForeignPanelDraw(root, captured.registry);
    if (draw === undefined) return false;
    if (!attempts.shouldAttempt(FOREIGN_PANEL_DRAW_KEY)) return false;
    const result = discovery.discover(draw.path, draw.options);
    if (result.outcome.status !== "succeeded") {
      attempts.recordFailure(FOREIGN_PANEL_DRAW_KEY);
      errors.push(result.outcome.failure?.message ?? result.outcome.status);
      return false;
    }
    if (!captured.has("foreign")) {
      attempts.recordFailure(FOREIGN_PANEL_DRAW_KEY);
      errors.push("the Government draw did not capture foreign");
      return false;
    }
    attempts.recordSuccess(FOREIGN_PANEL_DRAW_KEY);
    return true;
  };
  return {
    page,
    root,
    captured,
    rootState,
    attempts,
    discovery,
    ensureForeignControls,
    errors,
  };
}

function makeRoot(overrides = {}) {
  const government = (id) => ({
    mil: 60,
    spy: 1,
    trn: 0,
    sab: 0,
    act: "none",
    hstl: 20,
    unrest: 60,
    eco: 1,
    occ: false,
    anx: false,
    buy: false,
    id,
    ...overrides.government,
  });
  return {
    tech: { govern: 1, spy: 3, unify: 1, shadow: 0, ...overrides.tech },
    race: { species: "human", truepath: false, ...overrides.race },
    stats: { attacks: 0, achieve: {} },
    city: { morale: { current: 250 } },
    resource: { Money: { amount: 10_000_000, max: 10_000_000, display: true } },
    civic: {
      garrison: {
        display: true,
        mercs: false,
        workers: 20,
        max: 20,
        crew: 4,
        wounded: 0,
        raid: 0,
        tactic: 0,
        cityGarrison: 20,
        maxCityGarrison: 20,
        ...overrides.garrison,
      },
      foreign: {
        gov0: government(0),
        gov1: government(1),
        gov2: government(2),
      },
    },
    settings: {
      civTabs: 3,
      govTabs: 7,
      govTabs2: 1,
      animated: false,
      ...overrides.settings,
    },
  };
}

// --- Spy Training, off-tab ------------------------------------------------------

{
  const harness = makeOffTabRuntime();
  const { captured, root, ensureForeignControls } = harness;
  const spyTraining = createCapturedSpyTraining({
    rootState: harness.rootState,
    controls: captured.registry,
    readSettings: () => ({
      foreignTrainSpy: true,
      foreignSpyMax: 5,
      foreignPowerRequired: 75,
      foreignPolicyInferior: "Ignore",
      foreignPolicySuperior: "Ignore",
      foreignPolicyRival: "Ignore",
      foreignForceSabotage: false,
      foreignUnification: false,
      foreignOccupyLast: false,
      achievementGuards: false,
    }),
    keyState: { readPressed: () => false },
  });
  assert.equal(
    captured.has("foreign"),
    false,
    "Foreign has never been rendered",
  );
  assert.equal(
    spyTraining.reader.readCycle().available,
    false,
    "nothing to act on yet",
  );
  ensureForeignControls();
  assert.equal(captured.has("foreign"), true);
  const outcome = runCapturedSpyTraining(spyTraining);
  assert.equal(outcome.status, "succeeded", JSON.stringify(outcome));
  // The game-owned `spy()` closure, invoked through the recorded control.
  assert.ok(
    captured.usage.some((entry) => entry === "foreign.spy"),
    JSON.stringify(captured.usage),
  );
  const trained = [0, 1, 2].filter(
    (index) => root.civic.foreign[`gov${index}`].trn > 0,
  );
  assert.deepEqual(
    trained,
    [0, 1, 2],
    "every visible government trains under the configured cap",
  );
}

// --- Espionage, off-tab ---------------------------------------------------------

{
  const harness = makeOffTabRuntime();
  const { captured, root, page, ensureForeignControls } = harness;
  const faults = [];
  const operations = createCapturedEspionageOperationCapture({
    controls: captured.registry,
    // The game's own `drawEspModal(gov)`, reached through the closure `trigModal` closes over.
    synthesis: {
      available: true,
      invoke(request) {
        if (request.method !== "trigModal") {
          return { ok: false, reason: "unknown-method" };
        }
        const foreign = captured.registry.resolve("foreign");
        // The real synthesis resolves the current build of the control and calls the game's own
        // closure; that closure is what reaches `drawEspModal(gov)`.
        const result = captured.registry.invoke(
          foreign,
          request.method,
          request.args,
        );
        if (!result.ok) return result;
        const governmentId = request.args[0];
        const government = root.civic.foreign[`gov${governmentId}`];
        captured.register(
          "espModal",
          {
            influence(g) {
              government.sab = 300;
              government.act = "influence";
              return g;
            },
            sabotage() {},
            incite() {},
            annex() {},
            purchase(g) {
              government.sab = 300;
              government.act = "purchase";
              return g;
            },
          },
          // `drawEspModal(gov)` closes over the government it was called for, and the real capture
          // exposes the bound data so a caller can prove the scope.
          { data: government },
        );
        return { ok: true, value: undefined };
      },
    },
    mountSuppression: {
      available: true,
      withoutMounting: (draw) => draw(),
    },
    getDocument: () => page.document,
    getPageWindow: () => ({}),
    onCaptureError: (detail) => faults.push(detail),
  });
  const espionage = createCapturedEspionage({
    rootState: harness.rootState,
    controls: captured.registry,
    readSettings: () => ({
      foreignPowerRequired: 75,
      foreignPolicyInferior: "Influence",
      foreignPolicySuperior: "Ignore",
      foreignPolicyRival: "Ignore",
      foreignForceSabotage: false,
      foreignUnification: false,
      foreignOccupyLast: false,
      achievementGuards: false,
    }),
    readPurchaseReservation: () => 0,
    operations,
    onActivity: () => {},
  });
  assert.equal(captured.has("foreign"), false);
  assert.equal(espionage.isGovernorEspionageOwned(), false);
  ensureForeignControls();
  const cycle = espionage.reader.read();
  assert.ok(
    cycle.governmentId >= 0,
    "Espionage must plan against the established Foreign panel",
  );
  const outcome = runCapturedEspionage(espionage);
  // The game queued the operation and its own timer has not reached zero, which is the pending
  // outcome the runtime treats as normal rather than as a failure.
  assert.equal(outcome.status, "stale", JSON.stringify(outcome));
  assert.equal(
    outcome.failure.code,
    "captured-espionage-postcondition-pending",
  );
  assert.equal(espionage.isBusy(), true);
  assert.deepEqual(faults, [], JSON.stringify(faults));
  // The game's own state moved, through the closure `trigModal` closes over...
  assert.ok(
    captured.usage.includes("foreign.trigModal"),
    JSON.stringify(captured.usage),
  );
  const operated = [0, 1, 2].filter(
    (index) => root.civic.foreign[`gov${index}`].act === "influence",
  );
  assert.deepEqual(
    operated.length,
    1,
    "exactly one government was operated on",
  );
  assert.equal(root.civic.foreign[`gov${operated[0]}`].sab, 300);
  // ...and no modal of any kind was built.
  assert.equal(page.document.querySelectorAll(".modal.is-active").length, 0);
  assert.equal(page.document.querySelectorAll(".modal-background").length, 0);
  assert.equal(page.document.querySelector("#espModal"), null);
  assert.equal(page.document.querySelector("#modalBox"), null);
}

// --- Battle, off-tab ------------------------------------------------------------

{
  const harness = makeOffTabRuntime();
  const { captured, root, ensureForeignControls } = harness;
  const battle = createCapturedBattle({
    rootState: harness.rootState,
    controls: captured.registry,
    keyState: { readPressed: () => false },
    readSettings: () => ({
      foreignProtect: "never",
      foreignPacifist: false,
      foreignPolicyInferior: "Influence",
      foreignPolicySuperior: "Ignore",
      foreignPolicyRival: "Ignore",
      achievementGuards: false,
    }),
    onActivity: () => {},
  });
  assert.equal(
    battle.reader.readCycle().available,
    false,
    "Battle is dark before the discovery",
  );
  ensureForeignControls();
  assert.equal(captured.has("foreign"), true);
  assert.equal(
    captured.has("c_garrison"),
    true,
    "the compact Garrison is the same draw",
  );
  assert.equal(capturedForeignGarrisonEstablished(captured.registry), true);
  assert.equal(
    battle.reader.readCycle().available,
    true,
    "Battle must plan off-tab",
  );
  const outcome = runBattleAutomation(battle);
  assert.equal(outcome.status, "succeeded", JSON.stringify(outcome));
  assert.ok(
    root.stats.attacks > 0,
    "Battle acted through the captured campaign authority",
  );
  // One Government draw served both authorities; the military tab was never needed.
  assert.equal(
    captured.has("garrison"),
    false,
    "the full panel must not have been drawn",
  );
}

// --- the spy-purchase demand prerequisite ---------------------------------------

{
  const harness = makeOffTabRuntime();
  const report = () =>
    ensureDemandPrerequisiteControls({
      root: harness.root,
      settings: {
        autoFight: true,
        foreignUnification: true,
        achievementGuards: false,
      },
      controls: harness.captured.registry,
      ensureForeignControls: harness.ensureForeignControls,
      ensureBuildControls: () => {},
    });
  assert.equal(harness.captured.has("foreign"), false);
  assert.equal(
    report().spy,
    "ready",
    "an eligible panel must not stay unavailable",
  );
  assert.equal(harness.captured.has("foreign"), true);
  // And the exact Power demand no longer fails closed on a panel the player never visited.
  assert.equal(report().spy, "ready");
  assert.deepEqual(harness.errors, []);
}

{
  // A panel upstream would not create is `not-needed`, not `ready`, and costs no Government draw.
  const harness = makeOffTabRuntime({
    root: makeRoot({ garrison: { display: false } }),
  });
  const report = ensureDemandPrerequisiteControls({
    root: harness.root,
    settings: {
      autoFight: true,
      foreignUnification: true,
      achievementGuards: false,
    },
    controls: harness.captured.registry,
    ensureForeignControls: harness.ensureForeignControls,
    ensureBuildControls: () => {},
  });
  assert.equal(report.spy, "not-needed");
  assert.equal(
    harness.captured.has("foreign"),
    false,
    "Auto Fight must not manufacture a panel",
  );
  assert.deepEqual(harness.page.draws, [], "no Government draw may be spent");
  assert.deepEqual(harness.errors, []);
  // ...and repeating it stays free, so a long cycle does not retry.
  assert.equal(harness.ensureForeignControls(), false);
  assert.deepEqual(harness.page.draws, []);
}

{
  // An eligible panel whose capture fails stays `unavailable` and fails closed rather than
  // reporting the reserve as free.
  const harness = makeOffTabRuntime();
  const failing = ensureDemandPrerequisiteControls({
    root: harness.root,
    settings: {
      autoFight: true,
      foreignUnification: true,
      achievementGuards: false,
    },
    controls: harness.captured.registry,
    ensureForeignControls: () => {},
    ensureBuildControls: () => {},
  });
  assert.equal(failing.spy, "unavailable");
}

console.log("captured-foreign-off-tab-runtime ok");
