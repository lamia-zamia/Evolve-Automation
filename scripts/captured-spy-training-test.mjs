import assert from "node:assert/strict";

import { runCapturedSpyTraining } from "../src/application/captured-spy-training.ts";
import { createCapturedSpyTraining } from "../src/adapters/evolve/combat/captured-spy-training.ts";
import { planCapturedSpyTraining } from "../src/domain/combat/captured-spy-training.ts";

function trainingScenario({
  policy = "Influence",
  military = 70,
  superiorPolicy = "Ignore",
  foreignSpyMax = 0,
  foreignTrainSpy = true,
  spyCount = 0,
  moneyMaximum = 100_000,
  purchaseMoney = 0,
  purchaseReservationKnown = true,
  foreignForceSabotage = false,
  foreignPacifist = false,
  foreignUnification = false,
  unify = 0,
  occupied = false,
  annexed = false,
  purchased = false,
  extraGovernments = [],
}) {
  const governments = [
    {
      id: 0,
      military,
      spy: spyCount,
      occupied,
      annexed,
      purchased,
      policy,
    },
    ...extraGovernments,
  ];
  const root = {
    race: {},
    tech: { spy: 1, unify },
    stats: { achieve: {} },
    resource: { Money: { amount: 100_000, max: moneyMaximum } },
    civic: { garrison: { display: true }, foreign: {} },
  };
  for (const government of governments) {
    root.civic.foreign[`gov${government.id}`] = {
      mil: government.military,
      spy: government.spy,
      trn: 0,
      sab: 0,
      act: "none",
      hstl: 0,
      unrest: 0,
      eco: 1,
      occ: government.occupied ?? false,
      anx: government.annexed ?? false,
      buy: government.purchased ?? false,
    };
  }
  const settings = {
    foreignTrainSpy,
    foreignSpyMax,
    autoFight: true,
    foreignPowerRequired: 75,
    foreignPolicyInferior: policy,
    foreignPolicySuperior: superiorPolicy,
    foreignPolicyRival: "Ignore",
    foreignUnification,
    foreignForceSabotage,
    foreignOccupyLast: false,
    foreignPacifist,
    achievementGuards: false,
  };
  const calls = [];
  const foreign = {
    elementId: "foreign",
    generation: 1,
    methods: ["vis", "gvis", "spy_disabled", "spy"],
  };
  const controls = {
    resolve: (id) => (id === "foreign" ? foreign : undefined),
    invoke(handle, method, args = []) {
      assert.equal(handle, foreign);
      if (method === "vis") return { ok: true, value: true };
      if (method === "gvis") {
        return {
          ok: true,
          value: governments.some((government) => government.id === args[0]),
        };
      }
      if (method === "spy_disabled") return { ok: true, value: false };
      if (method === "spy") {
        const index = args[0];
        calls.push(index);
        root.civic.foreign[`gov${index}`].trn = 300;
        return { ok: true, value: undefined };
      }
      return { ok: false, reason: "unknown-method" };
    },
    capturedElementIds: () => ["foreign"],
  };
  const adapter = createCapturedSpyTraining({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    readSettings: () => settings,
    readPurchaseMoney: () =>
      purchaseReservationKnown ? purchaseMoney : undefined,
  });
  const cycle = adapter.reader.readCycle();
  const inputs = governments.map((government) =>
    adapter.reader.readGovernment(government.id),
  );
  const outcome = runCapturedSpyTraining(adapter);
  return { adapter, calls, cycle, inputs, outcome, root };
}

{
  const influence = trainingScenario({ policy: "Influence" });
  assert.deepEqual(influence.cycle, { available: true, governmentCount: 1 });
  assert.equal(influence.inputs[0].policy, "Influence");
  assert.deepEqual(planCapturedSpyTraining(influence.inputs[0]), {
    kind: "train-spy",
    governmentIndex: 0,
    expectedSpyCount: 0,
    expectedTraining: 0,
  });
  assert.equal(influence.outcome.status, "succeeded");
  assert.deepEqual(influence.calls, [0]);
  assert.equal(influence.root.civic.foreign.gov0.trn, 300);
}

assert.deepEqual(trainingScenario({ policy: "Sabotage" }).calls, [0]);
assert.deepEqual(trainingScenario({ policy: "Occupy" }).calls, []);
assert.deepEqual(trainingScenario({ policy: "Ignore" }).calls, []);

// Purchase remains the training policy under the old manager's pacifist gate,
// even where its normal current-target adjustment would force Sabotage.
{
  const pacifistPurchase = trainingScenario({
    policy: "Purchase",
    military: 75,
    foreignForceSabotage: true,
    foreignPacifist: true,
    moneyMaximum: 20_000,
  });
  assert.equal(pacifistPurchase.inputs[0].policy, "Purchase");
  assert.deepEqual(pacifistPurchase.calls, [0]);
}

// SpyManager.updateForeigns() adjusts the last eligible inferior. The first
// Purchase remains a three-spy target while the last target is force-sabotaged.
{
  const orderedTargets = trainingScenario({
    policy: "Purchase",
    military: 75,
    foreignForceSabotage: true,
    moneyMaximum: 20_000,
    extraGovernments: [
      { id: 1, military: 75, spy: 0, occupied: false, policy: "Purchase" },
    ],
  });
  assert.equal(orderedTargets.inputs[0].policy, "Purchase");
  assert.equal(orderedTargets.inputs[1].policy, "Sabotage");
  assert.deepEqual(orderedTargets.calls, [0, 1]);
}

{
  const purchase = trainingScenario({
    policy: "Purchase",
    moneyMaximum: 20_000,
  });
  assert.equal(purchase.inputs[0].purchasePrice, 15_384);
  assert.equal(purchase.inputs[0].moneyMaximum, 20_000);
  assert.deepEqual(purchase.calls, [0]);
}

{
  const purchaseAtOne = trainingScenario({
    policy: "Purchase",
    foreignSpyMax: 1,
    spyCount: 1,
    moneyMaximum: 20_000,
  });
  assert.deepEqual(purchaseAtOne.calls, [0]);
}

assert.deepEqual(
  trainingScenario({
    policy: "Purchase",
    foreignSpyMax: 1,
    spyCount: 1,
    moneyMaximum: 15_383,
  }).calls,
  [],
);

assert.deepEqual(
  trainingScenario({ foreignSpyMax: 0, spyCount: 1 }).calls,
  [],
  "an ordinary policy reaches the zero-cap one-spy minimum",
);

assert.deepEqual(
  trainingScenario({
    foreignSpyMax: 5,
    spyCount: 5,
  }).calls,
  [],
);
assert.deepEqual(trainingScenario({ occupied: true }).calls, []);
assert.deepEqual(trainingScenario({ annexed: true }).calls, []);
assert.deepEqual(trainingScenario({ purchased: true }).calls, []);
assert.deepEqual(
  trainingScenario({ foreignSpyMax: -1, spyCount: 5 }).calls,
  [0],
);
assert.deepEqual(
  trainingScenario({
    foreignSpyMax: 5,
    spyCount: 1,
    unify: 1,
    foreignUnification: true,
    purchaseReservationKnown: false,
  }).calls,
  [],
  "an unknown active Purchase reservation must not train extra spies elsewhere",
);
assert.deepEqual(trainingScenario({ foreignTrainSpy: false }).calls, []);

{
  const saving = trainingScenario({
    foreignSpyMax: 5,
    spyCount: 1,
    purchaseMoney: 125_500,
    unify: 1,
    foreignUnification: true,
    extraGovernments: [
      { id: 1, military: 80, spy: 0, occupied: false, policy: "Purchase" },
    ],
    superiorPolicy: "Purchase",
  });
  assert.equal(saving.inputs[0].policy, "Influence");
  assert.equal(saving.inputs[1].policy, "Purchase");
  assert.deepEqual(saving.calls, [1]);
  assert.equal(saving.root.civic.foreign.gov0.trn, 0);
  assert.equal(saving.root.civic.foreign.gov1.trn, 300);
}

console.log("captured spy-training policy checks passed");
