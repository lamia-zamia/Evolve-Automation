import assert from "node:assert/strict";

import { createCapturedResourceDemand } from "../../../src/adapters/evolve/economy/resources/captured-resource-demand.ts";

const root = {
  race: {},
  tech: { unify: 1 },
  stats: { attacks: 0, achieve: {} },
  civic: {
    garrison: { display: true },
    foreign: {
      gov0: {
        mil: 50,
        spy: 3,
        sab: 0,
        act: "none",
        hstl: 20,
        unrest: 10,
        eco: 10,
        occ: true,
        anx: false,
        buy: false,
      },
      gov1: {
        mil: 90,
        spy: 3,
        sab: 0,
        act: "none",
        hstl: 20,
        unrest: 10,
        eco: 20,
        occ: false,
        anx: true,
        buy: false,
      },
      gov2: {
        mil: 60,
        spy: 3,
        sab: 0,
        act: "purchase",
        hstl: 20,
        unrest: 10,
        eco: 30,
        occ: false,
        anx: false,
        buy: false,
      },
    },
  },
  resource: { Money: { amount: 0, max: 1_000_000 } },
};

const settings = {
  autoFight: true,
  foreignUnification: true,
  foreignPolicyInferior: "Purchase",
  foreignPolicySuperior: "Purchase",
  foreignPolicyRival: "Ignore",
  foreignForceSabotage: false,
  foreignOccupyLast: false,
  achievementGuards: false,
};
const foreign = {
  elementId: "foreign",
  generation: 1,
  methods: ["vis", "gvis"],
};
const controls = {
  resolve: (id) => (id === "foreign" ? foreign : undefined),
  invoke: (_control, method, args = []) => ({
    ok: true,
    value:
      method === "vis" ||
      (method === "gvis" && root.civic.foreign[`gov${args[0]}`] !== undefined),
  }),
  capturedElementIds: () => ["foreign"],
};

function readReservation(overrides = {}) {
  return createCapturedResourceDemand({
    rootState: { readRoot: () => root },
    reservations: {
      readReservations: () => ({ targets: [], unavailable: false }),
    },
    controls,
    readSettings: () => ({ ...settings, ...overrides }),
  }).sample().spyPurchaseReservation;
}

const reservation = readReservation();
const price0 = Math.round(10 * 15_384 * 1.32 * 0.975);
const price1 = Math.round(20 * 15_384 * 1.32 * 0.975);
assert.equal(reservation.purchaseMoney, Math.max(price0, price1));
assert.deepEqual(
  reservation.purchaseGovernmentIds,
  [0, 1],
  "the shared target set keeps occupied and annexed governments, but skips an active Purchase",
);
assert.equal(Object.isFrozen(reservation), true);
assert.equal(Object.isFrozen(reservation.purchaseGovernmentIds), true);

const unavailable = createCapturedResourceDemand({
  rootState: { readRoot: () => root },
  reservations: {
    readReservations: () => ({ targets: [], unavailable: false }),
  },
  controls,
  readSettings: () => settings,
  readPrerequisites: () => ({ spy: "unavailable", ai: "not-needed" }),
}).sample().spyPurchaseReservation;
assert.equal(unavailable, undefined);

const outsideStorage = readReservation({});
assert.equal(outsideStorage.purchaseGovernmentIds.includes(0), true);

console.log("captured foreign purchase authority checks passed");
