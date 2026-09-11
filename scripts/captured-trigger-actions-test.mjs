import assert from "node:assert/strict";

import { createCapturedTriggerActions } from "../src/adapters/evolve/progression/build/captured-trigger-actions.ts";
import {
  runTriggerAutomation,
  triggerPhaseActive,
} from "../src/application/trigger.ts";

const MINE = Object.freeze({
  actionId: "city-mine",
  actionType: "build",
  cost: { Money: 60, Lumber: 175 },
});
const MAD = Object.freeze({
  actionId: "tech-mad",
  actionType: "research",
  cost: { Knowledge: 600 },
});

function makeRoot(overrides = {}) {
  return {
    race: { species: "human" },
    city: { mine: { count: 2 } },
    tech: { mining: 1 },
    resource: {
      Money: { amount: 500, max: 100000, diff: 1, display: true },
      Lumber: { amount: 900, max: 5000, diff: 1, display: true },
      Knowledge: { amount: 900, max: 5000, diff: 1, display: true },
    },
    stats: { achieve: {} },
    ...overrides,
  };
}

/** A root that is one purchase away from finishing the Inflation challenge. */
function inflationRoot() {
  return makeRoot({
    race: { species: "human", inflation: 120, universe: "standard" },
    resource: {
      Money: { amount: 25e10, max: 3e11, diff: 1, display: true },
      Lumber: { amount: 900, max: 5000, diff: 1, display: true },
      Knowledge: { amount: 900, max: 5000, diff: 1, display: true },
    },
    stats: { achieve: { wheelbarrow: {} } },
  });
}

function actions({
  root = makeRoot(),
  targets = [MINE],
  settings = {},
  generations = { "city-mine": 1, "tech-mad": 1 },
  offered = [
    { elementId: "tech-mad", cost: { Knowledge: 600 }, generation: 1 },
  ],
  onInvoke = () => {},
} = {}) {
  const invoked = [];
  const adapter = createCapturedTriggerActions({
    rootState: { readRoot: () => root },
    resources: {
      readResources: (ids) =>
        Object.freeze({
          resources: new Map(
            [...ids].map((id) => {
              const resource = root.resource[id];
              return [
                id,
                {
                  id,
                  amount: resource?.amount ?? 0,
                  max: resource?.max ?? 0,
                  rateOfChange: resource?.diff ?? 0,
                  display: resource?.display === true,
                },
              ];
            }),
          ),
        }),
    },
    controls: {
      resolve: (elementId) =>
        elementId in generations
          ? { elementId, generation: generations[elementId], methods: [] }
          : undefined,
      invoke: (handle, method) => {
        invoked.push(handle.elementId + "." + method);
        return onInvoke(handle, method, root) ?? { ok: true, value: undefined };
      },
      capturedElementIds: () => Object.keys(generations),
    },
    readTargets: () => targets,
    readSettings: () => settings,
    readOfferedTechs: () => (offered === null ? undefined : offered),
  });
  return { ...adapter, invoked, root };
}

// The reader walks the cycle's own target list and stops at its end.
{
  const { reader } = actions({ targets: [MINE, MAD] });
  assert.deepEqual(reader.read(0), {
    target: {
      index: 0,
      id: "city-mine",
      shouldSaveMoney: false,
      hasPositiveMoneyCost: false,
    },
  });
  assert.equal(reader.read(1).target.id, "tech-mad");
  assert.deepEqual(reader.read(2), { target: null });
}

// An index that is not a list position is a programming error, not a missing target.
assert.throws(() => actions().reader.read(-1), TypeError);
assert.throws(() => actions().reader.read(1.5), TypeError);

// While the Inflation assist is saving, a Money-priced trigger is reported as one to skip, and a
// trigger the challenge does not compete with is not.
{
  const { reader } = actions({
    root: inflationRoot(),
    targets: [MINE, MAD],
    settings: {
      inflationChallengeAssist: true,
      inflationChallengeSaveMinutes: 5,
    },
  });
  assert.deepEqual(reader.read(0).target, {
    index: 0,
    id: "city-mine",
    shouldSaveMoney: true,
    hasPositiveMoneyCost: true,
  });
  assert.equal(reader.read(1).target.hasPositiveMoneyCost, false);
}

// A build trigger presses the game's own action, and the count it moved is the proof.
{
  const { executor, invoked, root } = actions({
    onInvoke: (_handle, _method, current) => {
      current.city.mine.count += 1;
    },
  });
  const result = executor.execute({
    kind: "click",
    index: 0,
    targetId: "city-mine",
  });
  assert.deepEqual(invoked, ["city-mine.action"]);
  assert.equal(result.outcome.status, "succeeded");
  assert.equal(result.clicked, true);
  assert.equal(root.city.mine.count, 3);
}

// A press the game declined bought nothing; it is a decision, not a failure.
{
  const { executor } = actions();
  const result = executor.execute({
    kind: "click",
    index: 0,
    targetId: "city-mine",
  });
  assert.equal(result.outcome.status, "succeeded");
  assert.equal(result.clicked, false);
}

// A decision that names a different target than the list now holds is stale, and nothing is
// pressed on its behalf.
{
  const { executor, invoked } = actions();
  const result = executor.execute({
    kind: "click",
    index: 0,
    targetId: "city-farm",
  });
  assert.equal(result.outcome.status, "stale");
  assert.equal(result.outcome.failure.code, "stale-trigger-target");
  assert.deepEqual(invoked, []);
  assert.equal(
    actions({ targets: [] }).executor.execute({
      kind: "click",
      index: 0,
      targetId: "city-mine",
    }).outcome.status,
    "stale",
  );
}

// Upstream enqueues an action it cannot pay for instead of declining it, so a target the cycle is
// still saving for is never pressed.
{
  const poor = makeRoot();
  poor.resource.Lumber.amount = 10;
  poor.resource.Knowledge.amount = 10;
  const adapter = actions({ root: poor, targets: [MINE, MAD] });
  const result = adapter.executor.execute({
    kind: "click",
    index: 0,
    targetId: "city-mine",
  });
  assert.equal(result.outcome.status, "succeeded");
  assert.equal(result.clicked, false);
  assert.deepEqual(adapter.invoked, []);

  runTriggerAutomation(adapter);
  assert.deepEqual(adapter.invoked, []);
}

// A control that has gone missing since the sample is reported, never treated as a locked feature.
{
  const result = actions({ generations: {} }).executor.execute({
    kind: "click",
    index: 0,
    targetId: "city-mine",
  });
  assert.equal(result.outcome.status, "rejected");
  assert.equal(result.outcome.failure.code, "trigger-control-missing");
}

// The game's own refusal is reported as a rejection rather than a silent no-click.
{
  const result = actions({
    onInvoke: () => ({ ok: false, reason: "threw", detail: "boom" }),
  }).executor.execute({ kind: "click", index: 0, targetId: "city-mine" });
  assert.equal(result.outcome.status, "rejected");
  assert.equal(result.outcome.failure.code, "trigger-click-failed");
  assert.equal(
    actions({
      onInvoke: () => ({ ok: false, reason: "stale-control" }),
    }).executor.execute({ kind: "click", index: 0, targetId: "city-mine" })
      .outcome.status,
    "stale",
  );
}

// A research trigger is confirmed by the technology bag moving.
{
  const { executor, invoked } = actions({
    targets: [MAD],
    onInvoke: (_handle, _method, current) => {
      current.tech.mad = 1;
    },
  });
  const result = executor.execute({
    kind: "click",
    index: 0,
    targetId: "tech-mad",
  });
  assert.deepEqual(invoked, ["tech-mad.action"]);
  assert.equal(result.clicked, true);
}
{
  const result = actions({ targets: [MAD] }).executor.execute({
    kind: "click",
    index: 0,
    targetId: "tech-mad",
  });
  assert.equal(result.outcome.status, "succeeded");
  assert.equal(result.clicked, false);
}

// A research offer the game has redrawn, or withdrawn, is not clicked through the old closure.
{
  const redrawn = actions({
    targets: [MAD],
    generations: { "tech-mad": 2 },
  }).executor.execute({ kind: "click", index: 0, targetId: "tech-mad" });
  assert.equal(redrawn.outcome.status, "stale");
  assert.equal(redrawn.outcome.failure.code, "stale-trigger-control");

  const withdrawn = actions({
    targets: [MAD],
    offered: [],
  }).executor.execute({ kind: "click", index: 0, targetId: "tech-mad" });
  assert.equal(withdrawn.outcome.status, "stale");
  assert.equal(withdrawn.outcome.failure.code, "stale-trigger-offer");
}

// The phase runs the whole list in order, and reports itself active only when a press bought
// something — that is what stands construction and research down for the cycle.
{
  const adapter = actions({
    targets: [MINE, MAD],
    onInvoke: (handle, _method, current) => {
      if (handle.elementId === "tech-mad") current.tech.mad = 1;
    },
  });
  const result = runTriggerAutomation(adapter);
  assert.deepEqual(adapter.invoked, ["city-mine.action", "tech-mad.action"]);
  assert.equal(result.outcome.status, "succeeded");
  assert.equal(triggerPhaseActive(result), true);

  const quiet = actions({ targets: [MINE, MAD] });
  assert.equal(triggerPhaseActive(runTriggerAutomation(quiet)), false);
}

// A skipped target is not pressed, and the phase carries on to the rest of the list.
{
  const adapter = actions({
    root: inflationRoot(),
    targets: [MINE, MAD],
    settings: {
      inflationChallengeAssist: true,
      inflationChallengeSaveMinutes: 5,
    },
  });
  runTriggerAutomation(adapter);
  assert.deepEqual(adapter.invoked, ["tech-mad.action"]);
}

// An uncertain phase stands construction and research down as though it had bought something.
{
  const adapter = actions({ generations: {} });
  const result = runTriggerAutomation(adapter);
  assert.equal(result.outcome.status, "rejected");
  assert.equal(triggerPhaseActive(result), true);
}

console.log("captured trigger actions tests passed");
