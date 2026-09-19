import assert from "node:assert/strict";

import { createCapturedResearchControl } from "../src/bootstrap/captured-research-control.ts";

/**
 * A stand-in for the captured page: a game root, a research panel the game draws on demand with
 * the technologies it currently offers, and one `action()` per technology that pays and grants
 * exactly as `runAction` does.
 */
function makePage({
  offered,
  resources,
  tech = { primitive: 3 },
  queue = [],
  actionModes = {},
  settings = {},
  race = {},
  stats = {},
}) {
  const root = {
    settings: { civTabs: 4, animated: true, qAny: false },
    race: { species: "human", gods: "none", ...race },
    stats: { attacks: 0, achieve: {}, ...stats },
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
      title: entry.title,
      methods: {
        action() {
          clicks.push(entry.id);
          if (actionModes[entry.id] === "no-op") return undefined;
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
            data: { title: control.title ?? elementId },
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
  const activity = [];
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
      readSettings: () => ({ ...DEFAULT_CONFLICT_SETTINGS, ...settings }),
      onUnavailable: (reason) => unavailable.push(reason),
      onActivity: (activityEntry) => activity.push(activityEntry.message),
    }),
    activity,
  };
}

/**
 * The settings every research exclusion reads, at the record's own defaults. A page that wants a
 * particular exclusion to fire overrides only the keys that rule names.
 */
const DEFAULT_CONFLICT_SETTINGS = Object.freeze({
  researchIgnore: [],
  prestigeType: "none",
  prestigeWhiteholeSaveGems: true,
  prestigeVaxStrat: "none",
  prestigeDemonicBomb: false,
  foreignUnification: true,
  prestigeWhiteholeStabiliseMass: true,
  prestigeWhiteholeStabiliseCooldown: 120,
  userResearchTheology_1: "auto",
  userResearchTheology_2: "auto",
  fleetAlienGiftKnowledge: 6500000,
  achievementGuards: false,
  guardPacifist: true,
  guardCultOfPersonality: true,
  guardSecondEvolution: true,
  retirementChallengeAssist: true,
});

const THEOLOGY = {
  id: "tech-theology",
  title: "Theology",
  grant: "theology",
  cost: { Knowledge: 900 },
};
const MINING = {
  id: "tech-mining",
  title: "Mining",
  grant: "mining",
  cost: { Knowledge: 6600 },
};
const SMELTING = {
  id: "tech-smelting",
  title: "Smelting",
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
  assert.deepEqual(page.activity, ["Researched Theology"]);
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

{
  // An invoked action that leaves the game's research state unchanged is not a safe skip. The
  // lower-ranked technology is eligible, but must wait for a later automation cycle.
  const page = makePage({
    offered: [THEOLOGY, MINING],
    resources: { Knowledge: { amount: 100000 } },
    actionModes: { "tech-theology": "no-op" },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, ["tech-theology"]);
  assert.equal(page.root.tech.theology, undefined);
  assert.equal(page.root.tech.mining, undefined);
  assert.equal(page.root.resource.Knowledge.amount, 100000);
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
    methods: {
      setData: (_index, prefix) => ({ [`${prefix}-Knowledge`]: 800 }),
    },
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
    methods: {
      setData: (_index, prefix) => ({ [`${prefix}-Knowledge`]: 800 }),
    },
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
    readSettings: () => ({}),
  });
  const outcome = control.runCycle();
  assert.equal(outcome.status, "rejected");
  assert.equal(outcome.failure.code, "game-state-not-captured");
}

// --- research exclusions decide candidates before anything is invoked ---------

const ANTHROPOLOGY = {
  id: "tech-anthropology",
  title: "Anthropology",
  grant: "anthropology",
  cost: { Knowledge: 900 },
};
const FANATICISM = {
  id: "tech-fanaticism",
  title: "Fanaticism",
  grant: "fanaticism",
  cost: { Knowledge: 900 },
};
const STABILIZE = {
  id: "tech-stabilize_blackhole",
  title: "Stabilize Blackhole",
  grant: "stabilize_blackhole",
  cost: { Knowledge: 900 },
};
const DARK_BOMB = {
  id: "tech-dark_bomb",
  title: "Dark Bomb",
  grant: "dark_bomb",
  cost: { Knowledge: 900 },
};
const XENO_GIFT = {
  id: "tech-xeno_gift",
  title: "Xenoarchaeology",
  grant: "xeno_gift",
  cost: { Knowledge: 900 },
};

{
  // Nothing any rule names: the cycle behaves exactly as it did before the exclusions existed.
  const page = makePage({
    offered: [THEOLOGY, MINING],
    resources: { Knowledge: { amount: 1000 } },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, ["tech-theology"]);
  assert.deepEqual(page.unavailable, []);
}

{
  // The ignore list rejects the first candidate before invocation, so the second may be considered.
  // The rejected technology is never clicked, and the reason is reported once.
  const page = makePage({
    offered: [THEOLOGY, MINING],
    resources: { Knowledge: { amount: 10000 } },
    settings: { researchIgnore: ["tech-theology"] },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, ["tech-mining"]);
  assert.equal(page.root.tech.theology, undefined);
  assert.equal(page.root.tech.mining, 1);
  assert.deepEqual(page.unavailable, [
    "tech-theology: research excluded (ignored-research)",
  ]);
}

{
  // An excluded technology is not researched even when it is the only candidate: an exclusion is a
  // rejection, not a preference.
  const page = makePage({
    offered: [THEOLOGY],
    resources: { Knowledge: { amount: 10000 } },
    settings: { researchIgnore: ["tech-theology"] },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
  assert.equal(page.root.tech.theology, undefined);
}

// --- one real mutually exclusive fork, decided both ways ----------------------

for (const [choice, offered, taken, reported] of [
  // The chosen branch is offered first, is accepted, and ends the read before the other is looked
  // at; reversing the offer order shows the other branch being rejected before invocation.
  ["tech-anthropology", [ANTHROPOLOGY, FANATICISM], "tech-anthropology", []],
  [
    "tech-anthropology",
    [FANATICISM, ANTHROPOLOGY],
    "tech-anthropology",
    ["tech-fanaticism: research excluded (theology-path)"],
  ],
  ["tech-fanaticism", [FANATICISM, ANTHROPOLOGY], "tech-fanaticism", []],
  [
    "tech-fanaticism",
    [ANTHROPOLOGY, FANATICISM],
    "tech-fanaticism",
    ["tech-anthropology: research excluded (theology-path)"],
  ],
]) {
  const page = makePage({
    offered,
    resources: { Knowledge: { amount: 10000 } },
    settings: { userResearchTheology_1: choice },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(
    page.clicks,
    [taken],
    `theology choice ${choice} must take exactly its own branch`,
  );
  assert.deepEqual(page.unavailable, reported);
}

{
  // The Demonic Bomb is offered only for a demonic run with the setting on. Both halves of the
  // gate are the player's, and neither is guessed.
  const page = makePage({
    offered: [DARK_BOMB],
    resources: { Knowledge: { amount: 10000 } },
    settings: { prestigeDemonicBomb: false, prestigeType: "demonic" },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
  assert.deepEqual(page.unavailable, [
    "tech-dark_bomb: research excluded (dark-bomb-disabled)",
  ]);

  const enabled = makePage({
    offered: [DARK_BOMB],
    resources: { Knowledge: { amount: 10000 } },
    settings: { prestigeDemonicBomb: true, prestigeType: "demonic" },
  });
  assert.equal(enabled.control.runCycle().status, "succeeded");
  assert.deepEqual(enabled.clicks, ["tech-dark_bomb"]);
  assert.equal(enabled.root.tech.dark_bomb, 1);
}

{
  // The Knowledge ceiling gate reads the live captured maximum, not the snapshot price.
  const page = makePage({
    offered: [XENO_GIFT],
    resources: { Knowledge: { amount: 10000, max: 1000 } },
    settings: { fleetAlienGiftKnowledge: 6500000 },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
  assert.deepEqual(page.unavailable, [
    "tech-xeno_gift: research excluded (maximum-knowledge)",
  ]);

  const ready = makePage({
    offered: [XENO_GIFT],
    resources: { Knowledge: { amount: 10000, max: 7000000 } },
    settings: { fleetAlienGiftKnowledge: 6500000 },
  });
  assert.equal(ready.control.runCycle().status, "succeeded");
  assert.deepEqual(ready.clicks, ["tech-xeno_gift"]);
}

// --- an exclusion fact the capture cannot establish rejects, never guesses ----

{
  // Stabilizing depends on script state the captured runtime does not keep. Failing closed means
  // the technology is left alone and the reason is named.
  const page = makePage({
    offered: [STABILIZE, MINING],
    resources: { Knowledge: { amount: 10000 } },
    settings: { prestigeWhiteholeStabiliseMass: true },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, ["tech-mining"]);
  assert.equal(page.root.tech.stabilize_blackhole, undefined);
  assert.deepEqual(page.unavailable, [
    "tech-stabilize_blackhole: research excluded " +
      "(unavailable: stabilization-state (whiteholeLastStabilise))",
  ]);
}

{
  // A settings record missing a key an exclusion reads is the same kind of uncertainty: no
  // candidate is researched on an undecided rule.
  const page = makePage({
    offered: [THEOLOGY],
    resources: { Knowledge: { amount: 10000 } },
    settings: { prestigeType: undefined },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
  assert.equal(
    page.unavailable.some((reason) =>
      reason.includes("unavailable: invalid-settings"),
    ),
    true,
  );
}

// --- an accepted candidate that shows no mutation still stops the cycle -------

{
  // The exclusions may reject before invocation; they must never turn an unverified click into a
  // reason to try the next technology.
  const page = makePage({
    offered: [THEOLOGY, MINING],
    resources: { Knowledge: { amount: 10000 } },
    actionModes: { "tech-theology": "no-op" },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, ["tech-theology"]);
  assert.equal(page.root.tech.mining, undefined);
}

// --- the guard-backed and fail-closed exclusions, over captured facts alone ---

const UNIFICATION = {
  id: "tech-unification2",
  title: "Unification",
  grant: "unification2",
  cost: { Knowledge: 900 },
};
const ISOLATION = {
  id: "tech-isolation_protocol",
  title: "Isolation Protocol",
  grant: "isolation_protocol",
  cost: { Knowledge: 900 },
};

{
  // Unification is the player's call, and a run that has not enabled it does not get it.
  const page = makePage({
    offered: [UNIFICATION],
    resources: { Knowledge: { amount: 10000 } },
    settings: { foreignUnification: false },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
  assert.deepEqual(page.unavailable, [
    "tech-unification2: research excluded (unification-disabled)",
  ]);
}

{
  // With the Cult of Personality guard on and its achievement unearned, unification would spend the
  // run's eligibility, so the guard rejects it.
  const page = makePage({
    offered: [UNIFICATION],
    resources: { Knowledge: { amount: 10000 } },
    race: { universe: "standard" },
    stats: { attacks: 3, achieve: {} },
    settings: { achievementGuards: true, guardCultOfPersonality: true },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
  assert.deepEqual(page.unavailable, [
    "tech-unification2: research excluded (cult-of-personality-guard)",
  ]);
}

{
  // A banana run needs the objective progress the capture cannot read, so unification is rejected
  // rather than taken on a guess. Outside a banana run the same settings research it.
  const banana = makePage({
    offered: [UNIFICATION],
    resources: { Knowledge: { amount: 10000 } },
    race: { banana: true },
  });
  assert.equal(banana.control.runCycle().status, "succeeded");
  assert.deepEqual(banana.clicks, []);
  assert.deepEqual(banana.unavailable, [
    "tech-unification2: research excluded " +
      "(unavailable: banana-republic-progress (race.banana))",
  ]);

  const ordinary = makePage({
    offered: [UNIFICATION],
    resources: { Knowledge: { amount: 10000 } },
  });
  assert.equal(ordinary.control.runCycle().status, "succeeded");
  assert.deepEqual(ordinary.clicks, ["tech-unification2"]);
}

{
  // Second Evolution keeps Anthropology off the table for a race whose gods are its own species.
  const page = makePage({
    offered: [ANTHROPOLOGY],
    resources: { Knowledge: { amount: 10000 } },
    race: { species: "human", gods: "human", universe: "standard" },
    settings: { achievementGuards: true, guardSecondEvolution: true },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
  assert.deepEqual(page.unavailable, [
    "tech-anthropology: research excluded (second-evolution-guard)",
  ]);
}

{
  // Isolation Protocol commits the run to retirement, so a run aimed anywhere else never takes it.
  const page = makePage({
    offered: [ISOLATION],
    resources: { Knowledge: { amount: 10000 } },
    settings: { prestigeType: "none" },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
  assert.deepEqual(page.unavailable, [
    "tech-isolation_protocol: research excluded (retirement-fork)",
  ]);
}

{
  // A retirement run with the challenge assist on still owes its Tau build-out, and the shortfall
  // list needs facts the capture does not sample: retiring early is irreversible, so it is rejected.
  const page = makePage({
    offered: [ISOLATION],
    resources: { Knowledge: { amount: 10000 } },
    race: { truepath: true },
    settings: { prestigeType: "retire", retirementChallengeAssist: true },
  });
  assert.equal(page.control.runCycle().status, "succeeded");
  assert.deepEqual(page.clicks, []);
  assert.deepEqual(page.unavailable, [
    "tech-isolation_protocol: research excluded " +
      "(unavailable: retirement-preparation (TauFusionGenerator))",
  ]);

  // With the assist off, the same run researches it: the rule the capture cannot feed is the
  // preparation check, not the fork.
  const unassisted = makePage({
    offered: [ISOLATION],
    resources: { Knowledge: { amount: 10000 } },
    race: { truepath: true },
    settings: { prestigeType: "retire", retirementChallengeAssist: false },
  });
  assert.equal(unassisted.control.runCycle().status, "succeeded");
  assert.deepEqual(unassisted.clicks, ["tech-isolation_protocol"]);
}

console.log("captured-research ok");
