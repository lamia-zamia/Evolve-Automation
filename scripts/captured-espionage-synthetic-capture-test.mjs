/**
 * The synthetic espionage capture, against a faithful stand-in for the game's own draw.
 *
 * `foreign.trigModal(gov)` and the private `drawEspModal(gov)` it reaches are reproduced here from
 * DeadSpace's `civics.js` at the recorded tip, over the real `installVueCapture`, the real
 * operation-capture adapter, and the real espionage adapter. The reproduction exists so the
 * bootstrap is exercised against the shape it has to survive: two `setInterval` registrations, a
 * poll that must run synchronously, a `$buefy.modal.open()` that must build nothing, and operation
 * methods that close themselves with a global `.modal-background` click.
 */
import assert from "node:assert/strict";

import { createCapturedEspionage } from "../src/adapters/evolve/combat/captured-espionage.ts";
import { createCapturedEspionageOperationCapture } from "../src/adapters/evolve/combat/captured-espionage-capture.ts";
import {
  DISPOSABLE_APP_MARKER,
  installVueCapture,
} from "../src/adapters/evolve/vue-capture.ts";
import { runCapturedEspionage } from "../src/application/captured-espionage.ts";
import { createTestDocument, element } from "./dom-fixture.mjs";

const OPERATION_METHODS = [
  "influence",
  "sabotage",
  "incite",
  "annex",
  "purchase",
];

/** Enough Vue 3 for the three methods the capture drives the game through. */
function makeVue() {
  const proxies = new WeakMap();
  return {
    reactive(target) {
      const existing = proxies.get(target);
      if (existing !== undefined) return existing;
      const proxy = new Proxy(target, {});
      proxies.set(target, proxy);
      return proxy;
    },
    toRaw(value) {
      return value;
    },
    createApp(options) {
      const app = {
        options,
        mounted: [],
        disposable: false,
        use: () => app,
        mount(target) {
          app.mounted.push(target?.id ?? target);
          return { $forceUpdate: () => {} };
        },
        unmount: () => {},
      };
      if (options.el === "#espModal") {
        const marker = Symbol.for("evolve-automation.disposable-vue-app");
        const disposable = app[marker];
        app.disposable = disposable === true;
        lastEspModalApps.push(app);
      }
      return app;
    },
  };
}

const lastEspModalApps = [];

/**
 * A jQuery of the size `trigModal` and `drawEspModal` use. Every effect is recorded, so a test can
 * prove the wrappers' own cleanup selectors reached nothing.
 */ function makeJquery(document, trace) {
  const resolve = (input) => {
    if (input !== null && typeof input === "object") {
      return input.__element ?? null;
    }
    if (typeof input !== "string") return input ?? null;
    const markup = /^<(\w+)([^>]*)>[\s\S]*<\/\1>$/.exec(input);
    if (markup !== null) {
      const created = document.createElement(markup[1]);
      const id = /id="([^"]+)"/.exec(markup[2]);
      if (id !== null) created.id = id[1];
      return created;
    }
    return document.querySelector(input);
  };
  const wrap = (element) => {
    const api = {
      __element: element,
      0: element,
      length: element === null ? 0 : 1,
      append(...nodes) {
        for (const node of nodes) {
          const target = resolve(node);
          if (target !== null) element?.append(target);
        }
        return api;
      },
      appendTo(host) {
        const target = resolve(host);
        if (element !== null) target?.append(element);
        return api;
      },
      addClass() {
        return api;
      },
      css() {
        return api;
      },
      hide() {
        trace.push({ kind: "hide", of: element?.id });
        if (element !== null) element.style.display = "none";
        return api;
      },
      closest() {
        return wrap(null);
      },
      find() {
        return wrap(null);
      },
      click() {
        trace.push({ kind: "click", on: element?.id ?? null });
        return api;
      },
    };
    return api;
  };
  return (input) => wrap(resolve(input));
}

function makePage() {
  const body = element("div", { id: "page" });
  const document = createTestDocument(body);
  const trace = [];
  const timers = new Map();
  let nextTimer = 0;
  const page = {
    document,
    trace,
    timers,
    realSetInterval(callback, delay) {
      const handle = ++nextTimer;
      timers.set(handle, { callback, delay });
      return handle;
    },
    realClearInterval(handle) {
      timers.delete(handle);
    },
  };
  page.$ = makeJquery(document, trace);
  page.Vue = makeVue();
  page.setInterval = page.realSetInterval;
  page.clearInterval = page.realClearInterval;
  return page;
}

function makeGovernment(overrides = {}) {
  return {
    mil: 60,
    spy: 3,
    sab: 0,
    act: "none",
    hstl: 20,
    unrest: 60,
    eco: 1,
    occ: false,
    anx: false,
    buy: false,
    ...overrides,
  };
}

/** gov0 is the Inferior target and the only government ready for Annex; gov1 is neither. */
function makeRoot() {
  return {
    tech: { spy: 2, unify: 0 },
    city: { morale: { current: 250 } },
    resource: { Money: { amount: 5_000_000 } },
    civic: {
      foreign: {
        gov0: makeGovernment(),
        gov1: makeGovernment({ mil: 90, hstl: 90, unrest: 5 }),
      },
    },
  };
}

/**
 * The parts of the game the capture has to survive, transcribed from `civics.js` at the recorded
 * `DeadSpace` tip: `trigModal` opens a Buefy modal and polls for the `#modalBox` its own content
 * promises; `drawEspModal` appends `#espModal` to it and binds the five operations, each of which
 * ends with the game's own teardown.
 */
function installGame(page, root) {
  const $ = page.$;
  const Vue = page.Vue;

  function vBind(bind, action = "create") {
    const target = page.document.querySelector(bind.el);
    if (target === null) return;
    if (action === "destroy") {
      // Upstream tears down an existing app first. Nothing mounted, so there is nothing to tear
      // down and the operation's own cleanup is a no-op.
      if (target.__vue_app__ !== undefined) target.__vue_app__.unmount();
      return;
    }
    const app = Vue.createApp({ ...bind });
    app.use({ name: "Buefy" }).mount(target);
    target.__vue_app__ = app;
  }

  function clearPopper() {
    page.trace.push({ kind: "clearPopper" });
  }

  function govPrice(gov) {
    const government = root.civic.foreign[`gov${gov}`];
    const price =
      government.eco *
      15384 *
      (1 + (government.hstl * 1.6) / 100) *
      (1 - (government.unrest * 0.25) / 100);
    return +price.toFixed(0);
  }

  function spyAction(sa, g) {
    const government = root.civic.foreign[`gov${g}`];
    if (root.tech.spy < 2 || government.spy < 1 || government.sab !== 0) return;
    let timer;
    if (sa === "influence") timer = 300;
    else if (sa === "sabotage") timer = 600;
    else if (sa === "incite") {
      if (g >= 3) return;
      timer = 900;
    } else return;
    government.sab = timer;
    government.act = sa;
  }

  function drawEspModal(gov) {
    // The two ways this draw can fail before it binds, so a recapture's failure is exercised rather
    // than assumed: `before-bind` throws out of the poll callback the capture flushes, and `trigger`
    // makes `trigModal` itself throw. Neither binds a control, so neither may look like a capture.
    if (page.failEspionageCapture === "before-bind") {
      throw new Error("the game threw before vBind");
    }
    const box = $("#modalBox");
    box.append($('<p id="modalBoxTitle"></p>'));
    box.append($('<div id="espModal" class="modalBody"></div>'));
    page.trace.push({ kind: "drawEspModal", gov });
    // `vBind` is the game's only route to `Vue.createApp`, and the capture records the operation
    // methods from the binding options rather than from a mounted instance.
    const app = Vue.createApp({
      el: "#espModal",
      data: root.civic.foreign[`gov${gov}`],
      methods: {
        influence(g) {
          if (root.tech.spy >= 2 && root.civic.foreign[`gov${g}`].spy >= 1) {
            spyAction("influence", g);
            vBind({ el: "#espModal" }, "destroy");
            $(".modal-background").click();
            clearPopper();
          }
        },
        sabotage(g) {
          if (root.tech.spy >= 2 && root.civic.foreign[`gov${g}`].spy >= 1) {
            spyAction("sabotage", g);
            vBind({ el: "#espModal" }, "destroy");
            $(".modal-background").click();
            $("#popGov").hide();
            clearPopper();
          }
        },
        incite(g) {
          if (g >= 3) return;
          if (root.tech.spy >= 2 && root.civic.foreign[`gov${g}`].spy >= 1) {
            spyAction("incite", g);
            vBind({ el: "#espModal" }, "destroy");
            $(".modal-background").click();
            clearPopper();
          }
        },
        annex(g) {
          if (g >= 3) return;
          const closure = root.civic.foreign[`gov${gov}`];
          if (
            closure.hstl <= 50 &&
            closure.unrest >= 50 &&
            root.city.morale.current >= 200 + closure.hstl - closure.unrest &&
            root.tech.spy >= 2 &&
            root.civic.foreign[`gov${g}`].spy >= 1 &&
            root.civic.foreign[`gov${g}`].sab === 0
          ) {
            root.civic.foreign[`gov${g}`].sab = 300;
            root.civic.foreign[`gov${g}`].act = "annex";
            vBind({ el: "#espModal" }, "destroy");
            $(".modal-background").click();
            clearPopper();
          }
        },
        purchase(g) {
          if (g >= 3) return;
          const price = govPrice(g);
          if (price <= root.resource.Money.amount) {
            if (
              root.tech.spy >= 2 &&
              root.civic.foreign[`gov${g}`].spy >= 3 &&
              root.civic.foreign[`gov${g}`].sab === 0
            ) {
              root.resource.Money.amount -= price;
              root.civic.foreign[`gov${g}`].sab = 300;
              root.civic.foreign[`gov${g}`].act = "purchase";
              vBind({ el: "#espModal" }, "destroy");
              $(".modal-background").click();
              clearPopper();
            }
          }
        },
      },
    });
    page.trace.push({
      kind: "bind",
      disposable: app[DISPOSABLE_APP_MARKER] === true,
    });
    app.use({ name: "Buefy" }).mount(page.document.querySelector("#espModal"));
  }

  function modalCloseButton() {
    let waited = 0;
    const attach = page.setInterval(function () {
      const box = $("#modalBox");
      if (box.length === 0) {
        if ((waited += 50) > 3000) page.clearInterval(attach);
        return;
      }
      page.clearInterval(attach);
      box.css("position", "relative");
      box.append(
        $('<input type="button" class="modalClose" value="x"></input>'),
      );
    }, 50);
  }

  const foreignMethods = {
    vis: () => true,
    gvis: (g) => g < 3,
    spy_disabled: () => false,
    spy: () => {},
    trigModal(i) {
      if (page.failEspionageCapture === "trigger") {
        throw new Error("the game threw before opening the modal");
      }
      this.$buefy.modal.open({
        hasModalCard: false,
        customClass: "evolve-modal",
        content: '<div id="modalBox" class="modalBox"></div>',
        onCancel: () => {},
      });
      modalCloseButton();
      const checkExist = page.setInterval(function () {
        if ($("#modalBox").length > 0) {
          page.clearInterval(checkExist);
          drawEspModal(i);
        }
      }, 50);
    },
  };

  return { foreignMethods, govPrice };
}

const BASE_SETTINGS = {
  foreignPowerRequired: 75,
  foreignPolicyInferior: "Annex",
  foreignPolicySuperior: "Ignore",
  foreignPolicyRival: "Ignore",
  foreignForceSabotage: false,
  foreignUnification: false,
  foreignOccupyLast: false,
  achievementGuards: false,
};

function makeHarness({ root = makeRoot(), settings = {} } = {}) {
  const page = makePage();
  const game = installGame(page, root);
  const capture = installVueCapture(page);
  capture.mountSuppression.withMountingEnabled(() =>
    page.Vue.createApp({ el: "#foreign", methods: game.foreignMethods })
      .use({ name: "Buefy" })
      .mount({ id: "foreign" }),
  );
  const faults = [];
  const activities = [];
  const operations = createCapturedEspionageOperationCapture({
    controls: capture.controls,
    synthesis: capture.synthesis,
    mountSuppression: capture.mountSuppression,
    getDocument: () => page.document,
    getPageWindow: () => page,
    onCaptureError: (detail) => faults.push(detail),
  });
  const espionage = createCapturedEspionage({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: capture.controls,
    readSettings: () => ({ ...BASE_SETTINGS, ...settings }),
    operations,
    onActivity: (activity) => activities.push(activity),
  });
  return { page, capture, operations, espionage, root, activities, faults };
}

// --- the capture itself ---------------------------------------------------------------------------

{
  const { page, capture, operations, faults, root } = makeHarness();
  lastEspModalApps.length = 0;
  const control = operations.capture(0);
  assert.notEqual(
    control,
    undefined,
    "trigModal reached the private drawEspModal",
  );
  assert.deepEqual(control.methods, OPERATION_METHODS);
  assert.equal(
    control.data,
    root.civic.foreign.gov0,
    "the game bound the control to the government it was asked about",
  );
  assert.deepEqual(
    page.document.querySelectorAll(".modal.is-active"),
    [],
    "no Buefy modal was opened",
  );
  assert.equal(
    page.document.querySelector(".modal-background"),
    null,
    "no modal background was faked in its place",
  );
  assert.equal(
    page.document.querySelector("#modalBox"),
    null,
    "the host is gone",
  );
  assert.equal(
    page.document.querySelector("#espModal"),
    null,
    "no espionage component remains mounted",
  );
  assert.equal(page.setInterval, page.realSetInterval);
  assert.equal(page.clearInterval, page.realClearInterval);
  assert.equal(page.timers.size, 0, "no page timer was left registered");
  assert.deepEqual(faults, []);
  const binds = page.trace.filter((record) => record.kind === "bind");
  assert.equal(binds.length, 1, "the draw bound #espModal once");
  assert.equal(
    binds[0].disposable,
    true,
    "mounting stayed suppressed, so the component was recorded and never rendered",
  );
  assert.equal(
    lastEspModalApps.length,
    0,
    "the game's own Vue.createApp was never reached for #espModal",
  );
  capture.uninstall();
}

// --- an operation runs through the game's own wrappers, and nothing else ----------------------------

for (const [policy, operation, land] of [
  ["Influence", "influence", (root) => (root.civic.foreign.gov0.hstl = 0)],
  ["Sabotage", "sabotage", (root) => (root.civic.foreign.gov0.mil = 50)],
  ["Incite", "incite", (root) => (root.civic.foreign.gov0.unrest = 90)],
]) {
  const harness = makeHarness({
    settings: { foreignPolicyInferior: policy },
  });
  const outcome = runCapturedEspionage(harness.espionage);
  assert.equal(outcome.status, "stale", `${operation} is queued by the game`);
  assert.equal(
    outcome.failure.code,
    "captured-espionage-postcondition-pending",
  );
  assert.equal(harness.root.civic.foreign.gov0.act, operation);
  assert.ok(harness.root.civic.foreign.gov0.sab > 0, `${operation} set sab`);
  assert.equal(
    harness.activities.length,
    0,
    "starting an operation is not completing it",
  );
  assert.deepEqual(harness.faults, []);
  assert.deepEqual(
    harness.page.trace
      .filter((record) => record.kind === "click")
      .map((record) => record.on),
    [null],
    `${operation}'s own .modal-background click reached nothing`,
  );
  assert.equal(
    harness.page.document.querySelectorAll(".modal.is-active").length,
    0,
  );
  assert.equal(harness.page.document.querySelector("#espModal"), null);
  assert.equal(harness.page.setInterval, harness.page.realSetInterval);

  // The later completion is the game's own, and only then is it reported.
  harness.root.civic.foreign.gov0.sab = 0;
  harness.root.civic.foreign.gov0.act = "none";
  land(harness.root);
  const completed = runCapturedEspionage(harness.espionage);
  assert.equal(completed.status, "succeeded");
  assert.equal(harness.activities.length, 1);
  assert.equal(harness.espionage.isBusy(), false);
  harness.capture.uninstall();
}

// --- Purchase spends what the game calculated ---------------------------------------------------------

{
  // Two already-controlled governments and the unify tech are what keep the strategy's Purchase
  // policy on gov0 instead of demoting it to preparation.
  const root = makeRoot();
  root.tech.unify = 1;
  root.civic.foreign.gov1.anx = true;
  root.civic.foreign.gov2 = makeGovernment({
    mil: 90,
    hstl: 90,
    unrest: 5,
    anx: true,
  });
  const harness = makeHarness({
    root,
    settings: {
      foreignPolicyInferior: "Purchase",
      foreignPolicySuperior: "Annex",
      foreignUnification: true,
    },
  });
  const before = root.resource.Money.amount;
  const outcome = runCapturedEspionage(harness.espionage);
  assert.equal(
    outcome.failure.code,
    "captured-espionage-postcondition-pending",
  );
  assert.equal(root.civic.foreign.gov0.act, "purchase");
  assert.ok(root.civic.foreign.gov0.sab > 0);
  // The price is gov0's own: eco 1, hstl 20, unrest 60.
  const price = +(
    1 *
    15384 *
    (1 + (20 * 1.6) / 100) *
    (1 - (60 * 0.25) / 100)
  ).toFixed(0);
  assert.equal(before - root.resource.Money.amount, price);
  assert.deepEqual(harness.faults, []);
  harness.capture.uninstall();
}

// --- the per-government closure -----------------------------------------------------------------------

{
  // gov0 is Annex-ready and gov1 is not, so the two controls differ in exactly the way the closure
  // does: the gov0 capture may annex gov1, and the gov1 capture may not annex gov0.
  const harness = makeHarness();
  const forGov0 = harness.operations.capture(0);
  assert.equal(
    forGov0.data,
    harness.root.civic.foreign.gov0,
    "the gov0 capture is bound to gov0",
  );
  const forGov1 = harness.operations.capture(1);
  assert.equal(forGov1.data, harness.root.civic.foreign.gov1);
  assert.notEqual(
    forGov0,
    forGov1,
    "each capture is a fresh build of the control",
  );
  assert.equal(forGov1.generation, forGov0.generation + 1);
  assert.equal(
    harness.capture.controls.invoke(forGov0, "annex", [1]).ok,
    false,
    "a control carried past a rebuild is refused, which is why one is never carried",
  );
  assert.equal(harness.capture.controls.invoke(forGov1, "annex", [0]).ok, true);
  assert.equal(
    harness.root.civic.foreign.gov0.act,
    "none",
    "the gov1 closure refuses, because gov1 is not Annex-ready",
  );
  const gov0Again = harness.operations.capture(0);
  harness.capture.controls.invoke(gov0Again, "annex", [1]);
  assert.equal(
    harness.root.civic.foreign.gov1.act,
    "annex",
    "the gov0 closure gates on gov0 and applies to the requested government",
  );
  assert.deepEqual(harness.faults, []);
  harness.capture.uninstall();
}

// --- a player-owned modal is neither closed nor changed -------------------------------------------------

{
  const harness = makeHarness({
    settings: { foreignPolicyInferior: "Influence" },
  });
  const body = harness.page.document.body;
  const playerModal = element("div", { id: "playerModal" });
  playerModal.classList.add("modal", "is-active");
  playerModal.append(element("div", { id: "playerBody" }));
  const background = element("div", { id: "playerBackground" });
  background.classList.add("modal-background");
  let backgroundClicks = 0;
  background.click = () => {
    backgroundClicks += 1;
  };
  body.append(playerModal);
  body.append(background);
  const displayBefore = playerModal.style.display;
  const contentsBefore = playerModal.children.length;

  const outcome = runCapturedEspionage(harness.espionage);
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "captured-espionage-modal-conflict");
  assert.equal(backgroundClicks, 0, "the player's background is never clicked");
  assert.equal(playerModal.style.display, displayBefore, "never hidden");
  assert.equal(playerModal.isConnected, true, "still on screen");
  assert.equal(
    playerModal.children.length,
    contentsBefore,
    "contents untouched",
  );
  assert.deepEqual(
    harness.page.trace.filter((record) => record.kind === "drawEspModal"),
    [],
    "nothing is even captured beside a modal the player owns",
  );
  assert.equal(harness.root.civic.foreign.gov0.act, "none");
  assert.deepEqual(harness.faults, []);

  // Once the player closes it, the same plan runs.
  body.removeChild(playerModal);
  body.removeChild(background);
  const retried = runCapturedEspionage(harness.espionage);
  assert.equal(
    retried.failure.code,
    "captured-espionage-postcondition-pending",
  );
  assert.equal(harness.root.civic.foreign.gov0.act, "influence");
  assert.equal(
    backgroundClicks,
    0,
    "still nothing of the player's was clicked",
  );
  harness.capture.uninstall();
}

// --- no capture available is a closed door, not a substitute --------------------------------------------

{
  const page = makePage();
  const root = makeRoot();
  installGame(page, root);
  const capture = installVueCapture(page);
  const operations = createCapturedEspionageOperationCapture({
    controls: capture.controls,
    synthesis: capture.synthesis,
    // A capture installed before Vue arrived cannot suppress mounting, so it can bind nothing.
    mountSuppression: {
      available: false,
      withoutMounting: () => {
        throw new Error("mounting cannot be suppressed");
      },
    },
    getDocument: () => page.document,
    getPageWindow: () => page,
  });
  assert.equal(operations.capture(0), undefined);
  assert.equal(
    page.document.querySelectorAll(".modal.is-active").length,
    0,
    "a refused capture opens no modal either",
  );
  capture.uninstall();
  assert.equal(
    operations.capture(0),
    undefined,
    "an uninstalled capture is closed too",
  );
}

{
  const page = makePage();
  const root = makeRoot();
  installGame(page, root);
  const capture = installVueCapture(page);
  const operations = createCapturedEspionageOperationCapture({
    controls: capture.controls,
    synthesis: capture.synthesis,
    mountSuppression: capture.mountSuppression,
    getDocument: () => page.document,
    getPageWindow: () => page,
  });
  // A real modal already owns the id a capture host would take.
  const owner = element("div", { id: "modalBox" });
  page.document.body.append(owner);
  assert.equal(operations.capture(0), undefined);
  assert.equal(
    page.document.querySelector("#modalBox"),
    owner,
    "the existing host is untouched",
  );
  assert.equal(page.document.querySelector("#espModal"), null);
  assert.equal(page.setInterval, page.realSetInterval);
  assert.equal(page.timers.size, 0);
  capture.uninstall();
}

// --- a capture succeeds only when it rebound the control ----------------------------------------------
//
// `vue-capture` never forgets a control, so a recapture of the *same* government finds the previous
// `espModal` still in the registry with a current generation and a `data` that still matches the
// government the decision named. Neither the executor's scope check nor its generation check can
// tell that from a genuine capture; only the capture itself can, by proving this invocation
// produced the binding.

/** Every game field an operation would change, for the "nothing happened" assertion. */
function governmentSnapshot(root) {
  return JSON.stringify({
    gov0: root.civic.foreign.gov0,
    gov1: root.civic.foreign.gov1,
    gov2: root.civic.foreign.gov2,
    money: root.resource.Money.amount,
  });
}

{
  // The game's own draw throws inside the flushed poll callback, before `vBind`. The control from
  // the first capture stays in the registry untouched, and must not be handed back.
  const harness = makeHarness();
  const first = harness.operations.capture(0);
  assert.notEqual(
    first,
    undefined,
    "the first capture establishes the control",
  );
  assert.equal(first.data, harness.root.civic.foreign.gov0);
  const generationBefore =
    harness.capture.controls.resolve("espModal").generation;

  harness.page.failEspionageCapture = "before-bind";
  assert.equal(
    harness.operations.capture(0),
    undefined,
    "the previous generation must not masquerade as this capture",
  );
  // Nothing was deleted or mutated to achieve that: the old control is still a correct answer for
  // the government it was drawn for.
  const survivor = harness.capture.controls.resolve("espModal");
  assert.equal(
    survivor.generation,
    generationBefore,
    "the old control was left alone",
  );
  assert.equal(survivor.data, harness.root.civic.foreign.gov0);
  // Both failures are reported: the game's own callback throw, and the capture's refusal.
  assert.ok(
    harness.faults.some((fault) => /timer callback threw/.test(fault)),
    JSON.stringify(harness.faults),
  );
  assert.ok(
    harness.faults.some((fault) =>
      /espModal was not rebound by this capture/.test(fault),
    ),
    JSON.stringify(harness.faults),
  );
  // Every other guarantee of the call is unchanged: no modal, no mounted component, the host gone,
  // and the page's own timers handed back.
  assert.equal(
    harness.page.document.querySelectorAll(".modal.is-active").length,
    0,
  );
  assert.equal(harness.page.document.querySelector(".modal-background"), null);
  assert.equal(harness.page.document.querySelector("#modalBox"), null);
  assert.equal(harness.page.document.querySelector("#espModal"), null);
  assert.equal(harness.page.setInterval, harness.page.realSetInterval);
  assert.equal(harness.page.clearInterval, harness.page.realClearInterval);
  harness.capture.uninstall();
}

{
  // The trigger itself throwing: `synthesis.invoke` fails, so nothing was captured whatever the
  // registry holds.
  const harness = makeHarness();
  assert.notEqual(harness.operations.capture(0), undefined);
  harness.page.failEspionageCapture = "trigger";
  assert.equal(harness.operations.capture(0), undefined);
  assert.ok(
    harness.faults.some((fault) => /trigModal failed: threw/.test(fault)),
    JSON.stringify(harness.faults),
  );
  assert.ok(
    harness.faults.some((fault) =>
      /trigModal invocation did not complete/.test(fault),
    ),
    JSON.stringify(harness.faults),
  );
  assert.equal(
    harness.page.document.querySelectorAll(".modal.is-active").length,
    0,
  );
  assert.equal(harness.page.document.querySelector("#modalBox"), null);
  assert.equal(harness.page.setInterval, harness.page.realSetInterval);
  harness.capture.uninstall();
}

{
  // The executor's own view. An earlier successful capture for gov0 leaves a plausible handle in
  // the registry; the next recapture fails, and the phase must stand down rather than invoke a
  // closure from the earlier draw.
  const harness = makeHarness({
    settings: { foreignPolicyInferior: "Influence" },
  });
  assert.notEqual(
    harness.operations.capture(0),
    undefined,
    "an earlier capture for the same government",
  );
  const before = governmentSnapshot(harness.root);
  harness.page.failEspionageCapture = "before-bind";

  const outcome = runCapturedEspionage(harness.espionage);
  assert.equal(outcome.status, "stale");
  assert.equal(
    outcome.failure.code,
    "captured-espionage-operation-capture-unavailable",
    "the refused capture is a closed door, not an old closure",
  );
  assert.equal(
    governmentSnapshot(harness.root),
    before,
    "no sab, act, Money, hostility, military, unrest, annex or purchase moved",
  );
  assert.deepEqual(
    harness.capture.controlUsage
      .readUsage()
      .filter((record) => record.elementId === "espModal"),
    [],
    "no captured operation was invoked",
  );
  assert.equal(harness.activities.length, 0);
  assert.equal(
    harness.page.document.querySelectorAll(".modal.is-active").length,
    0,
  );
  assert.equal(harness.page.document.querySelector("#espModal"), null);
  assert.equal(harness.page.document.querySelector("#modalBox"), null);
  harness.capture.uninstall();
}

{
  // The refusal is per attempt, not latched: once the game draws again, the same government is
  // captured afresh, the generation advances, and the executor runs the operation normally.
  const harness = makeHarness({
    settings: { foreignPolicyInferior: "Influence" },
  });
  const first = harness.operations.capture(0);
  harness.page.failEspionageCapture = "before-bind";
  assert.equal(harness.operations.capture(0), undefined);
  harness.page.failEspionageCapture = undefined;

  const again = harness.operations.capture(0);
  assert.notEqual(again, undefined, "a genuine redraw is still a capture");
  assert.equal(
    again.generation,
    first.generation + 1,
    "the generation advanced",
  );
  assert.equal(again.data, harness.root.civic.foreign.gov0);
  const outcome = runCapturedEspionage(harness.espionage);
  assert.equal(
    outcome.failure.code,
    "captured-espionage-postcondition-pending",
  );
  assert.equal(harness.root.civic.foreign.gov0.act, "influence");
  assert.ok(harness.root.civic.foreign.gov0.sab > 0);
  harness.capture.uninstall();
}

// --- the synthesized receiver is ephemeral ---------------------------------------------------------------

{
  const page = makePage();
  const receivers = [];
  const capture = installVueCapture(page);
  page.Vue.createApp({
    el: "#probe",
    methods: {
      probe() {
        receivers.push(this);
        this.$buefy.modal.open("x");
        return typeof this.$buefy.modal.open;
      },
      plain() {
        receivers.push(this);
        return this.$buefy === undefined;
      },
    },
  })
    .use({ name: "Buefy" })
    .mount({ id: "probe" });
  const before = capture.controls.resolve("probe");
  const answer = capture.synthesis.invoke({
    elementId: "probe",
    method: "probe",
    receiver: { noOpMethods: ["$buefy.modal.open"] },
  });
  assert.equal(answer.ok, true);
  assert.equal(
    answer.value,
    "function",
    "the named path answers a no-op callable",
  );
  const plain = capture.synthesis.invoke({
    elementId: "probe",
    method: "plain",
  });
  assert.equal(
    plain.value,
    true,
    "an ordinary invoke has no synthetic receiver",
  );
  assert.notEqual(
    receivers[0],
    receivers[1],
    "each call gets its own receiver",
  );
  const after = capture.controls.resolve("probe");
  assert.equal(
    after.generation,
    before.generation,
    "the captured control is untouched",
  );
  assert.equal(
    receivers[1].$buefy,
    undefined,
    "the synthetic extra does not persist past its invocation",
  );
  const ordinary = capture.controls.invoke(after, "plain");
  assert.equal(
    ordinary.ok && ordinary.value,
    true,
    "an ordinary invoke still has no synthetic receiver",
  );
  assert.deepEqual(
    capture.controlUsage
      .readUsage()
      .filter((record) => record.elementId === "probe")
      .map((record) => [record.method, record.returned]),
    [
      ["probe", 1],
      ["plain", 2],
    ],
  );
  const rejected = capture.synthesis.invoke({
    elementId: "probe",
    method: "probe",
    receiver: { noOpMethods: ["__proto__", "a..b", "1bad"] },
  });
  assert.equal(rejected.ok, false, "no malformed path is ever applied");
  assert.equal(receivers.length, 4);
  assert.equal(
    receivers[3].$buefy,
    undefined,
    "the call failed on the missing service rather than writing through a rejected path",
  );
  const missing = capture.synthesis.invoke({
    elementId: "nope",
    method: "probe",
  });
  assert.deepEqual(missing, { ok: false, reason: "unknown-control" });
  capture.uninstall();
  assert.equal(
    capture.synthesis.available,
    false,
    "an uninstalled capture synthesizes nothing",
  );
}

console.log("captured espionage synthetic capture checks passed");
