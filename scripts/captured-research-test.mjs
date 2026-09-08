import assert from "node:assert/strict";

import { createCapturedResearchControl } from "../src/bootstrap/captured-research-control.ts";

/**
 * A stand-in for the captured page: a game root, a research panel the game draws on demand with
 * the technologies it currently offers, and one `action()` per technology that pays and grants
 * exactly as `runAction` does.
 */
function makePage({ offered, resources, tech = { primitive: 3 }, queue = [] }) {
  const root = {
    settings: { civTabs: 4, animated: true, qAny: false },
    race: { species: "human" },
    tech,
    resource: {},
    city: {},
    queue: { display: queue.length > 0, queue: [...queue] },
  };
  for (const [id, resource] of Object.entries(resources)) {
    root.resource[id] = { display: true, max: -1, diff: 0, ...resource };
  }

  const clicks = [];
  const controls = new Map();
  // The main-tab component the discovery pass starts from.
  controls.set("#mainColumn div.content", {
    generation: 1,
    methods: { swapTab: (index) => index },
  });

  /** Only the technologies the game still offers: a granted one leaves the panel. */
  function drawn() {
    return offered.filter((entry) => root.tech[entry.grant] === undefined);
  }

  for (const entry of offered) {
    controls.set(entry.id, {
      generation: 1,
      methods: {
        action() {
          clicks.push(entry.id);
          for (const [res, amount] of Object.entries(entry.cost)) {
            if ((root.resource[res]?.amount ?? 0) < amount) return false;
          }
          for (const [res, amount] of Object.entries(entry.cost)) {
            root.resource[res].amount -= amount;
          }
          root.tech[entry.grant] = 1;
          return true;
        },
      },
    });
  }

  const registry = {
    resolve(elementId) {
      const control = controls.get(elementId);
      return control === undefined
        ? undefined
        : {
            elementId,
            generation: control.generation,
            methods: Object.keys(control.methods),
          };
    },
    capturedElementIds: () => [...controls.keys()],
    invoke(handle, method, args = []) {
      const control = controls.get(handle.elementId);
      if (control === undefined)
        return { ok: false, reason: "unknown-control" };
      if (control.generation !== handle.generation) {
        return { ok: false, reason: "stale-control", detail: "superseded" };
      }
      const target = control.methods[method];
      if (target === undefined) return { ok: false, reason: "unknown-method" };
      try {
        return { ok: true, value: target(...args) };
      } catch (error) {
        return { ok: false, reason: "threw", detail: String(error) };
      }
    },
  };

  /** The markup `setAction` writes: prices as a case-preserving class and a lower-cased attribute. */
  const drawnActions = {
    read: () =>
      drawn().map((entry) => ({
        id: entry.id,
        cost: Object.freeze({ ...entry.cost }),
      })),
    exists: () => root.settings.civTabs === 3,
  };

  /** The scope the discovery draw runs in; the page never mounts a temporary component. */
  const mountSuppression = {
    available: true,
    withoutMounting: (draw) => draw(),
  };

  /** The document half: this page has no panels to move, so the draw runs the ordinary way. */
  const panels = { open: () => undefined };

  const unavailable = [];
  return {
    root,
    clicks,
    controls,
    registry,
    unavailable,
    control: createCapturedResearchControl({
      rootState: {
        readRoot: () => root,
        isReactivitySuppressed: () => false,
        subscribeRootReplaced: () => () => {},
      },
      controls: registry,
      drawnActions,
      mountSuppression,
      panels,
      onUnavailable: (reason) => unavailable.push(reason),
    }),
  };
}

const THEOLOGY = {
  id: "tech-theology",
  grant: "theology",
  cost: { Knowledge: 900 },
};
const MINING = {
  id: "tech-mining",
  grant: "mining",
  cost: { Knowledge: 6600 },
};
const SMELTING = {
  id: "tech-smelting",
  grant: "smelting",
  cost: { Knowledge: 9000, Iron: 500 },
};

// --- a real research, with the Research tab never rendered by the player ----

{
  const page = makePage({
    offered: [THEOLOGY, MINING],
    resources: { Knowledge: { amount: 1000 } },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, ["tech-theology"]);
  assert.equal(page.root.resource.Knowledge.amount, 100);
  assert.equal(page.root.tech.theology, 1);
  // The player's tab is where it was.
  assert.equal(page.root.settings.civTabs, 4);
  assert.equal(page.root.settings.animated, true);
}

{
  // Knowledge only covers the second technology: the first is skipped as unaffordable, not
  // clicked and failed.
  const page = makePage({
    offered: [MINING, THEOLOGY],
    resources: { Knowledge: { amount: 1000 } },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, ["tech-theology"]);
}

{
  // Nothing affordable is a decision that researched nothing, not an error.
  const page = makePage({
    offered: [THEOLOGY, MINING],
    resources: { Knowledge: { amount: 10 } },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
}

{
  // A cost naming a resource the run does not have is unaffordable, never assumed.
  const page = makePage({
    offered: [SMELTING],
    resources: { Knowledge: { amount: 100000 } },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
}

{
  // Successive cycles walk the offer list as the game re-draws it.
  const page = makePage({
    offered: [THEOLOGY, MINING],
    resources: { Knowledge: { amount: 100000 } },
  });
  page.control.runCycle();
  page.control.runCycle();
  assert.deepEqual(page.clicks, ["tech-theology", "tech-mining"]);
  assert.equal(page.root.tech.mining, 1);
  // Both granted: the panel now offers nothing and the next cycle does nothing.
  page.control.runCycle();
  assert.deepEqual(page.clicks, ["tech-theology", "tech-mining"]);
}

// --- what the queue is saving for ------------------------------------------

{
  // A queued structure reserves Knowledge, so the research that would spend it below the
  // reservation is skipped.
  const page = makePage({
    offered: [THEOLOGY],
    resources: { Knowledge: { amount: 1000, max: 5000 } },
    queue: [{ id: "city-library", label: "Library", type: "library" }],
  });
  page.controls.set("buildQueue", {
    generation: 1,
    methods: { setData: () => ({ "res-Knowledge": 800 }) },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
  assert.equal(page.root.resource.Knowledge.amount, 1000);
}

{
  // The same page with room for both spends.
  const page = makePage({
    offered: [THEOLOGY],
    resources: { Knowledge: { amount: 2000, max: 5000 } },
    queue: [{ id: "city-library", label: "Library", type: "library" }],
  });
  page.controls.set("buildQueue", {
    generation: 1,
    methods: { setData: () => ({ "res-Knowledge": 800 }) },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, ["tech-theology"]);
}

// --- failures are reported, never mistaken for a locked feature -------------

{
  const page = makePage({
    offered: [THEOLOGY],
    resources: { Knowledge: { amount: 1000 } },
  });
  page.controls.delete("tech-theology");
  const outcome = page.control.runCycle();
  assert.equal(outcome.status, "rejected");
  assert.equal(outcome.failure.code, "research-control-missing");
}

{
  // A handle the game superseded between resolving it and using it. The adapter resolves
  // immediately before invoking, so this is the registry reporting it rather than a race the
  // adapter can create — and it must still be a stale outcome, not a research that did not happen.
  const page = makePage({
    offered: [THEOLOGY],
    resources: { Knowledge: { amount: 1000 } },
  });
  const inner = page.registry.invoke;
  page.registry.invoke = (handle, method, args) =>
    handle.elementId === "tech-theology"
      ? { ok: false, reason: "stale-control", detail: "superseded" }
      : inner(handle, method, args);
  const outcome = page.control.runCycle();
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "stale-research-control");
  assert.deepEqual(page.clicks, []);
}

{
  // The game redrew the action between the snapshot and the click. The old closure would still
  // run, and it belongs to an offer decided by predicates this cycle never saw.
  const page = makePage({
    offered: [THEOLOGY],
    resources: { Knowledge: { amount: 1000 } },
  });
  const innerResolve = page.registry.resolve;
  let resolved = 0;
  page.registry.resolve = (elementId) => {
    const handle = innerResolve(elementId);
    if (elementId !== "tech-theology" || resolved++ === 0) return handle;
    return { ...handle, generation: handle.generation + 1 };
  };
  const outcome = page.control.runCycle();
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "stale-research-control");
  assert.deepEqual(page.clicks, []);
  assert.equal(page.root.resource.Knowledge.amount, 1000);
}

{
  // Without the main-tab control there is no way to draw the panel, so there is no catalog — and
  // the reason is reported rather than read as "nothing to research".
  const page = makePage({
    offered: [THEOLOGY],
    resources: { Knowledge: { amount: 1000 } },
  });
  page.controls.delete("#mainColumn div.content");
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
  assert.equal(page.unavailable.length > 0, true);
}

{
  // Before the game has created its state.
  const control = createCapturedResearchControl({
    rootState: {
      readRoot: () => undefined,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls: {
      resolve: () => undefined,
      capturedElementIds: () => [],
      invoke: () => ({ ok: false, reason: "unknown-control" }),
    },
    drawnActions: { read: () => [], exists: () => false },
    mountSuppression: { available: true, withoutMounting: (draw) => draw() },
    panels: { open: () => undefined },
  });
  const outcome = control.runCycle();
  assert.equal(outcome.status, "rejected");
  assert.equal(outcome.failure.code, "game-state-not-captured");
}

console.log("captured-research ok");
