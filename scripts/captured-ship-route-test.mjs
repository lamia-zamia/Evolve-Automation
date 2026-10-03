import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { capturedShipBound } from "../src/adapters/evolve/combat/captured-ship-route.ts";
import { extractSnapshotFunction } from "./snapshot-function-fixture.mjs";

const point = (id) => ({ id, x: 0, y: 1, z: 2 });
const regionAnswer = (region) => ({ kind: "region", region });
const docked = { location: point("spc_red") };
assert.deepEqual(capturedShipBound(docked), regionAnswer("spc_red"));
for (const movement of [undefined, null, false, 0, ""]) {
  assert.deepEqual(
    capturedShipBound({ ...docked, movement }),
    regionAnswer("spc_red"),
    "falsy movement preserves the docked-port answer",
  );
}

const travelling = (port, destinations) => ({
  location: point(port),
  movement: {
    from: point(port),
    left: 5,
    legs: destinations.map((id) => ({ to: point(id), days: 3 })),
  },
});
assert.deepEqual(
  capturedShipBound(travelling("spc_dwarf", ["spc_red"])),
  regionAnswer("spc_red"),
);
assert.deepEqual(
  capturedShipBound(travelling("spc_dwarf", ["gate_waypoint", "spc_eris"])),
  regionAnswer("spc_eris"),
  "assignment follows the final leg rather than the first waypoint",
);
assert.deepEqual(
  capturedShipBound(travelling("spc_red", ["spc_belt"])),
  regionAnswer("spc_belt"),
  "the stale departure port does not reserve a target slot",
);
assert.deepEqual(
  capturedShipBound(travelling("spc_dwarf", ["tauceti"])),
  regionAnswer("tauceti"),
);
assert.deepEqual(capturedShipBound({ movement: { legs: [] } }), {
  kind: "none",
});
assert.deepEqual(
  capturedShipBound({
    movement: { legs: [undefined, { to: point("spc_red") }] },
  }),
  regionAnswer("spc_red"),
  "only the final leg determines assignment",
);
assert.deepEqual(capturedShipBound({ location: point("") }), regionAnswer(""));
assert.deepEqual(
  capturedShipBound(travelling("spc_red", [""])),
  regionAnswer(""),
);

for (const ship of [
  undefined,
  null,
  false,
  1,
  [],
  {},
  { location: "spc_red" },
  { location: null },
  { location: {} },
  { location: { id: 7 } },
]) {
  assert.deepEqual(capturedShipBound(ship), { kind: "unavailable" });
}
for (const movement of [
  true,
  1,
  "travelling",
  [],
  {},
  { legs: null },
  { legs: {} },
  { legs: "spc_red" },
  { legs: [undefined] },
  { legs: [null] },
  { legs: [{}] },
  { legs: [{ to: "spc_red" }] },
  { legs: [{ to: {} }] },
  { legs: [{ to: { id: 7 } }] },
]) {
  assert.deepEqual(
    capturedShipBound({ location: point("spc_red"), movement }),
    { kind: "unavailable" },
    "unreadable moving routes must not fall back to their departure port",
  );
}
// Explicit legacy/malformed state: neither old spelling grants an assignment.
assert.deepEqual(
  capturedShipBound({ location: "spc_dwarf", transit: { to: "spc_red" } }),
  { kind: "unavailable" },
);
assert.deepEqual(
  capturedShipBound({
    location: point("spc_dwarf"),
    movement: { to: "spc_red" },
  }),
  { kind: "unavailable" },
);
assert.deepEqual(
  capturedShipBound({
    get movement() {
      throw new Error("unreadable movement");
    },
  }),
  { kind: "unavailable" },
);
assert.deepEqual(
  capturedShipBound({
    location: {
      get id() {
        throw new Error("unreadable port");
      },
    },
  }),
  { kind: "unavailable" },
);
assert.deepEqual(
  capturedShipBound({
    movement: {
      get legs() {
        throw new Error("unreadable legs");
      },
    },
  }),
  { kind: "unavailable" },
);
assert.deepEqual(
  capturedShipBound({
    movement: {
      legs: [
        {
          to: {
            get id() {
              throw new Error("unreadable destination");
            },
          },
        },
      ],
    },
  }),
  { kind: "unavailable" },
);

const snapshotPath = new URL(
  "../test-artifacts/game/evolve-deadspace.js",
  import.meta.url,
);
const snapshot = readFileSync(snapshotPath, "utf8");
const sidecar = JSON.parse(
  readFileSync(new URL(`${snapshotPath.href}.json`), "utf8"),
);
assert.match(
  String(sidecar.commit),
  /^[0-9a-f]{7,40} \S/,
  "the snapshot must identify its upstream commit",
);
const pinnedDeclarations = {
  legsOf: `function legsOf(ship) {
    return ship && ship.movement && Array.isArray(ship.movement.legs) ? ship.movement.legs : [];
  }`,
  shipMoving: `function shipMoving(ship) {
    return !!(ship && ship.movement);
  }`,
  shipPort: `function shipPort(ship) {
    return ship && ship.location ? ship.location.id : void 0;
  }`,
  shipDestination: `function shipDestination(ship) {
    const legs = legsOf(ship);
    return legs.length ? legPlace(legs[legs.length - 1]) : false;
  }`,
  shipBound: `function shipBound(ship) {
    return shipMoving(ship) ? shipDestination(ship) : shipPort(ship);
  }`,
  legPlace: `function legPlace(leg) {
    return leg.to && typeof leg.to.id === "string" ? leg.to.id : "";
  }`,
};
for (const [name, declaration] of Object.entries(pinnedDeclarations)) {
  assert.equal(
    extractSnapshotFunction(snapshot, name).replace(/\s+/g, " ").trim(),
    declaration.replace(/\s+/g, " ").trim(),
    `${name} changed in ${sidecar.commit}; reverify capturedShipBound against upstream ships.js`,
  );
}

console.log(`Captured ship route tests passed (snapshot ${sidecar.commit})`);
