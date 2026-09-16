import assert from "node:assert/strict";

import { createCapturedMercenary } from "../src/adapters/evolve/combat/captured-mercenary.ts";
import { runMercenaryAutomation } from "../src/application/mercenary.ts";
import {
  planMercenaryCycle,
  planMercenaryHire,
} from "../src/domain/combat/mercenary.ts";

function mercenaryCost(root) {
  const garrison = root.civic.garrison;
  let cost = Math.round(1.24 ** garrison.workers * 75) - 50;
  if (cost > 25_000) cost = 25_000;
  if (garrison.m_use > 0) cost *= 1.1 ** garrison.m_use;
  return Math.round(cost);
}

function createFixture(options = {}) {
  const root = {
    tech: { mercs: 1 },
    race: options.inflation ? { inflation: 1, universe: "standard" } : {},
    civic: {
      garrison: {
        display: true,
        mercs: options.unlocked !== false,
        workers: 0,
        max: options.maximumWorkers ?? 3,
        crew: 0,
        m_use: 0,
      },
    },
    resource: {
      Money: {
        amount: options.money ?? 1_000,
        max: 1_000,
        diff: 100,
      },
    },
    portal: {},
    space: {},
    eden: {},
    stats: { achieve: {} },
  };
  const calls = [];
  const activities = [];
  const control = {
    elementId: "garrison",
    generation: 1,
    methods: ["vis", "hire", "hell", "s_max"],
  };
  const controls = {
    resolve: (id) => (id === "garrison" ? control : undefined),
    invoke: (_handle, method) => {
      calls.push(method);
      if (method === "vis") return { ok: true, value: true };
      if (method === "hell")
        return { ok: true, value: root.civic.garrison.workers };
      if (method === "s_max")
        return { ok: true, value: root.civic.garrison.max };
      if (method === "hire") {
        if (options.mutate !== false) {
          const cost = mercenaryCost(root);
          root.resource.Money.amount -= cost;
          root.civic.garrison.workers += 1;
          root.civic.garrison.m_use += 1;
        }
        return { ok: true, value: undefined };
      }
      return { ok: false, reason: "unknown-method" };
    },
    capturedElementIds: () => ["garrison"],
  };
  const settings = {
    foreignHireMercDeadSoldiers: 0,
    foreignHireMercCostLowerThanIncome: 1,
    foreignHireMercMoneyStoragePercent: 0,
    storageAssignExtra: false,
    inflationChallengeAssist: options.inflation === true,
    inflationChallengeSaveMinutes: 30,
  };
  const automation = createCapturedMercenary({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => settings,
    readGoal: () => options.goal ?? "Standard",
    readMoneyRequested: () => options.moneyRequested ?? 0,
    readMoneyStorageRequired: () => options.storageRequired ?? 0,
    onActivity: (activity) => activities.push(activity),
  });
  return { root, calls, activities, automation };
}

{
  const fixture = createFixture({ unlocked: false });
  assert.equal(runMercenaryAutomation(fixture.automation).status, "succeeded");
  assert.deepEqual(fixture.calls, []);
}

{
  const fixture = createFixture({ money: 0 });
  assert.equal(runMercenaryAutomation(fixture.automation).status, "succeeded");
  assert.equal(fixture.calls.filter((method) => method === "hire").length, 0);
}

{
  const fixture = createFixture({ maximumWorkers: 1 });
  const cycle = fixture.automation.reader.readCycle();
  assert.equal(cycle.available, true);
  const plan = planMercenaryCycle(cycle);
  assert.notEqual(plan, null);
  assert.notEqual(
    planMercenaryHire(plan, fixture.automation.reader.readState()),
    null,
  );
}

{
  const fixture = createFixture({ maximumWorkers: 1 });
  assert.equal(runMercenaryAutomation(fixture.automation).status, "succeeded");
  assert.equal(fixture.root.civic.garrison.workers, 1);
  assert.equal(fixture.root.civic.garrison.m_use, 1);
  assert.equal(fixture.root.resource.Money.amount, 975);
  assert.deepEqual(fixture.activities, [
    {
      message: "Hired a mercenary to join the garrison.",
      color: "success",
      tags: ["combat"],
    },
  ]);
  assert.equal(fixture.calls.filter((method) => method === "hire").length, 1);
}

{
  const fixture = createFixture({ maximumWorkers: 1, mutate: false });
  const outcome = runMercenaryAutomation(fixture.automation);
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "captured-mercenary-not-hired");
  assert.equal(fixture.calls.filter((method) => method === "hire").length, 1);
  assert.deepEqual(fixture.activities, []);
}

{
  const fixture = createFixture({ maximumWorkers: 3 });
  assert.equal(runMercenaryAutomation(fixture.automation).status, "succeeded");
  assert.equal(fixture.root.civic.garrison.workers, 3);
  assert.equal(fixture.calls.filter((method) => method === "hire").length, 3);
}

{
  const fixture = createFixture({ maximumWorkers: 1, inflation: true });
  fixture.root.resource.Money.amount = 249_999_999_900;
  fixture.root.resource.Money.max = 250_000_000_000;
  assert.equal(runMercenaryAutomation(fixture.automation).status, "succeeded");
  assert.equal(fixture.calls.filter((method) => method === "hire").length, 0);
}

console.log("captured mercenary adapter and application tests passed");
