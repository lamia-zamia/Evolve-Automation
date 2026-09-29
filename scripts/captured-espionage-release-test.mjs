import assert from "node:assert/strict";

import { createCapturedEspionageRunner } from "../src/application/captured-espionage.ts";
import { createCapturedEspionage } from "../src/adapters/evolve/combat/captured-espionage.ts";

function runRelease({ applyCampaign = true } = {}) {
  const government = {
    mil: 90,
    spy: 3,
    sab: 0,
    act: "none",
    hstl: 0,
    unrest: 20,
    eco: 1,
    occ: false,
    anx: true,
    buy: false,
  };
  const root = {
    race: { elusive: false },
    tech: { spy: 2 },
    city: { morale: { current: 250 } },
    resource: { Money: { amount: 0, max: 100_000 } },
    civic: {
      garrison: { display: true },
      foreign: { gov0: government },
    },
  };
  const foreign = {
    elementId: "foreign",
    generation: 1,
    methods: ["vis", "gvis", "trigModal", "spy_disabled", "spy"],
  };
  const garrison = {
    elementId: "garrison",
    generation: 1,
    methods: ["campaign"],
  };
  const calls = [];
  const controls = {
    resolve: (id) =>
      id === "foreign" ? foreign : id === "garrison" ? garrison : undefined,
    invoke(control, method, args = []) {
      calls.push([control.elementId, method, ...args]);
      if (control === foreign && method === "vis") {
        return { ok: true, value: true };
      }
      if (control === foreign && method === "gvis") {
        return { ok: true, value: args[0] === 0 };
      }
      if (control === garrison && method === "campaign") {
        if (applyCampaign) {
          government.occ = false;
          government.anx = false;
          government.buy = false;
        }
        return { ok: true, value: undefined };
      }
      return { ok: false, reason: "unknown-method" };
    },
  };
  const activities = [];
  const espionage = createCapturedEspionage({
    rootState: { readRoot: () => root },
    controls,
    readSettings: () => ({
      foreignPowerRequired: 75,
      foreignPolicyInferior: "Ignore",
      foreignPolicySuperior: "Influence",
      foreignPolicyRival: "Ignore",
      foreignForceSabotage: false,
      foreignUnification: false,
      foreignOccupyLast: false,
      achievementGuards: false,
    }),
    readPurchaseReservation: () => ({
      purchaseMoney: 0,
      purchaseGovernmentIds: Object.freeze([]),
    }),
    onActivity: (activity) => activities.push(activity),
  });
  const run = createCapturedEspionageRunner(espionage);
  return { run, espionage, government, calls, activities };
}

{
  const { run, espionage, government, calls, activities } = runRelease();
  const outcome = run();
  assert.equal(outcome.status, "succeeded");
  assert.deepEqual(
    [government.occ, government.anx, government.buy],
    [false, false, false],
  );
  assert.deepEqual(
    calls.filter(([, method]) => method === "campaign"),
    [["garrison", "campaign", 0]],
  );
  assert.equal(espionage.isBusy(), false);
  assert.equal(activities[0]?.message, "Released foreign power 1");
}

{
  const { run, espionage, government, calls } = runRelease({
    applyCampaign: false,
  });
  const outcome = run();
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "captured-espionage-release-not-applied");
  assert.deepEqual(
    [government.occ, government.anx, government.buy],
    [false, true, false],
  );
  assert.equal(
    calls.some(([, method]) => method === "campaign"),
    true,
  );
  assert.equal(espionage.isBusy(), false);
}

console.log("captured espionage release checks passed");
