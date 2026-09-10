import assert from "node:assert/strict";

import { createCapturedFleetAutomation } from "../src/adapters/evolve/combat/captured-fleet.ts";
import { runFleetAutomation } from "../src/application/fleet.ts";

const shipNames = [
  "scout_ship",
  "corvette_ship",
  "frigate_ship",
  "cruiser_ship",
  "dreadnought",
];
const defense = Object.fromEntries(
  [
    "gxy_gateway",
    "gxy_stargate",
    "gxy_gorddon",
    "gxy_alien1",
    "gxy_alien2",
    "gxy_chthonian",
  ].map((region) => [
    region,
    Object.fromEntries(
      shipNames.map((ship) => [
        ship,
        region === "gxy_gateway" && ship === "corvette_ship" ? 30 : 0,
      ]),
    ),
  ]),
);
const root = {
  race: {},
  tech: { piracy: 1 },
  galaxy: {
    defense,
    ...Object.fromEntries(
      shipNames.map((ship) => [
        ship,
        { count: ship === "corvette_ship" ? 30 : 0 },
      ]),
    ),
  },
  resource: { Knowledge: { max: 9000000 } },
};
const trace = [];
const controls = {
  resolve(elementId) {
    if (elementId === "fleet")
      return { elementId, generation: 1, methods: ["add", "sub"] };
    if (elementId === "galaxy-alien2_mission")
      return { elementId, generation: 1, methods: ["action"] };
    return undefined;
  },
  invoke(handle, method, args = []) {
    trace.push([handle.elementId, method, ...args]);
    return { ok: true, value: undefined };
  },
  capturedElementIds: () => ["fleet", "galaxy-alien2_mission"],
};

const automation = createCapturedFleetAutomation({
  rootState: { readRoot: () => root },
  controls,
  readDemand: () => ({ isDemanded: () => false }),
  readSettings: () => ({
    fleetAlien2Knowledge: 8000000,
    fleetAlien2Loses: "normal",
  }),
});
assert.equal(runFleetAutomation(automation).status, "succeeded");
assert.equal(trace.at(-1)[0], "galaxy-alien2_mission");
assert.equal(trace.at(-1)[1], "action");
assert.equal(
  trace.filter(
    ([elementId, method]) => elementId === "fleet" && method === "sub",
  ).length,
  30,
);
assert.equal(
  trace.filter(
    ([elementId, method]) => elementId === "fleet" && method === "add",
  ).length,
  30,
);

const ordinaryRoot = {
  race: {},
  tech: { piracy: 1 },
  galaxy: {
    defense: Object.fromEntries(
      [
        "gxy_gateway",
        "gxy_stargate",
        "gxy_gorddon",
        "gxy_alien1",
        "gxy_alien2",
        "gxy_chthonian",
      ].map((region) => [
        region,
        Object.fromEntries(shipNames.map((ship) => [ship, 0])),
      ]),
    ),
    ...Object.fromEntries(
      shipNames.map((ship) => [
        ship,
        { count: ship === "corvette_ship" ? 2 : 0 },
      ]),
    ),
    bolognium_ship: { on: 1 },
  },
  resource: {
    Bolognium: { amount: 0, max: 100 },
  },
};
const ordinaryTrace = [];
const ordinaryAutomation = createCapturedFleetAutomation({
  rootState: { readRoot: () => ordinaryRoot },
  controls: {
    resolve(elementId) {
      if (elementId === "fleet")
        return { elementId, generation: 1, methods: ["add", "sub"] };
      return undefined;
    },
    invoke(handle, method, args = []) {
      ordinaryTrace.push([handle.elementId, method, ...args]);
      return { ok: true, value: undefined };
    },
    capturedElementIds: () => ["fleet"],
  },
  readDemand: () => ({
    isDemanded: (resourceId) => resourceId === "Bolognium",
  }),
  readSettings: () => ({ fleetCrewReclaim: true, fleetMaxCover: true }),
});
assert.equal(runFleetAutomation(ordinaryAutomation).status, "succeeded");
assert.deepEqual(ordinaryTrace, [
  ["fleet", "add", "gxy_stargate", "corvette_ship"],
  ["fleet", "add", "gxy_gateway", "corvette_ship"],
]);

console.log("Captured galaxy fleet tests passed");
