import assert from "node:assert/strict";

import { createCapturedEspionage } from "../src/adapters/evolve/combat/captured-espionage.ts";
import { createCapturedSpyTraining } from "../src/adapters/evolve/combat/captured-spy-training.ts";
import { createCapturedResourceDemand } from "../src/adapters/evolve/economy/resources/captured-resource-demand.ts";

const root = {
  race: { elusive: false },
  tech: { spy: 3, unify: 1 },
  stats: { attacks: 0, achieve: {} },
  city: { morale: { current: 250 } },
  civic: {
    garrison: { display: true },
    foreign: {
      gov0: {
        mil: 50,
        spy: 3,
        trn: 0,
        sab: 0,
        act: "none",
        hstl: 20,
        unrest: 10,
        eco: 1,
        occ: false,
        anx: false,
        buy: false,
      },
      gov1: {
        mil: 60,
        spy: 3,
        trn: 0,
        sab: 0,
        act: "none",
        hstl: 20,
        unrest: 10,
        eco: 1,
        occ: false,
        anx: false,
        buy: false,
      },
    },
  },
  resource: { Money: { amount: 100_000, max: 100_000 } },
};

const settings = {
  autoFight: true,
  foreignTrainSpy: true,
  foreignSpyMax: 5,
  foreignPowerRequired: 75,
  foreignPolicyInferior: "Purchase",
  foreignPolicySuperior: "Ignore",
  foreignPolicyRival: "Ignore",
  foreignUnification: true,
  foreignForceSabotage: false,
  foreignOccupyLast: false,
  foreignPacifist: false,
  achievementGuards: false,
};
const foreign = {
  elementId: "foreign",
  generation: 1,
  methods: ["vis", "gvis", "trigModal", "spy_disabled", "spy"],
};
const controls = {
  resolve: (id) => (id === "foreign" ? foreign : undefined),
  invoke: (_control, method, args = []) => {
    if (method === "vis") return { ok: true, value: true };
    if (method === "gvis") {
      return {
        ok: true,
        value: root.civic.foreign[`gov${args[0]}`] !== undefined,
      };
    }
    if (method === "spy_disabled") return { ok: true, value: false };
    return { ok: false, reason: "unknown-method" };
  },
  capturedElementIds: () => ["foreign"],
};
const rootState = { readRoot: () => root };

const resourceDemand = createCapturedResourceDemand({
  rootState,
  reservations: {
    readReservations: () => ({ targets: [], unavailable: false }),
  },
  controls,
  readSettings: () => settings,
});
const reservation = resourceDemand.sample().spyPurchaseReservation;
assert.ok(reservation);

const spyTraining = createCapturedSpyTraining({
  rootState,
  controls,
  readSettings: () => settings,
  readPurchaseMoney: () => reservation.purchaseMoney,
});
assert.deepEqual(spyTraining.reader.readCycle(), {
  available: true,
  governmentCount: 2,
});
const trainingPolicies = [0, 1].map((id) => [
  id,
  spyTraining.reader.readGovernment(id).policy,
]);

const espionage = createCapturedEspionage({
  rootState,
  controls,
  readSettings: () => settings,
  readPurchaseReservation: () => reservation,
});
const espionagePolicies = espionage.reader
  .readAll()
  .map((input) => [input.governmentId, input.policy]);

assert.deepEqual(trainingPolicies, [
  [0, "Purchase"],
  [1, "Ignore"],
]);
assert.deepEqual(
  espionagePolicies,
  trainingPolicies,
  "captured espionage and training see the same farm-suppressed per-government policies",
);
assert.deepEqual(
  reservation.purchaseGovernmentIds,
  [0],
  "Purchase reservation includes only the government whose shared effective policy remains Purchase",
);
assert.equal(reservation.purchaseMoney > 0, true);

const pacifistSettings = {
  ...settings,
  foreignPacifist: true,
  foreignPolicyInferior: "Sabotage",
  foreignForceSabotage: true,
};
const pacifistEspionage = createCapturedEspionage({
  rootState,
  controls,
  readSettings: () => pacifistSettings,
});
assert.deepEqual(
  pacifistEspionage.reader
    .readAll()
    .map((input) => [input.governmentId, input.policy]),
  [
    [0, "Sabotage"],
    [1, "Sabotage"],
  ],
  "pacifist mode still runs old per-government espionage with unadjusted policies despite having no SpyManager.foreignTarget",
);

console.log("captured foreign consumer policy parity checks passed");
