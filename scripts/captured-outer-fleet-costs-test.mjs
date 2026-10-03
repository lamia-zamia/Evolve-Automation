/**
 * The shipyard cost authority, at the two seams a browser harness cannot show: the order a design is
 * applied in, and what the planner does with an answer the yard could not give.
 *
 * The parsing, the passive rendered-row path and the off-tab probe are covered against a transcription
 * of the game's own `updateCosts()` in `captured-outer-fleet-dispatch-test.mjs`, which is where a real
 * panel, a real `#shipPlans` and a real `shipPlans.setVal` exist to be asked.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { outerFleetBlueprintWrites } from "../src/adapters/evolve/combat/captured-outer-fleet-blueprint.ts";
import { createCapturedOuterFleetCosts } from "../src/adapters/evolve/combat/captured-outer-fleet-costs.ts";
import { planOuterFleetBuild } from "../src/domain/combat/fleet-outer.ts";

// ---------------------------------------------------------------------------
// One blueprint, one order — shared by the price probe and the real build.
// ---------------------------------------------------------------------------

assert.deepEqual(
  outerFleetBlueprintWrites({
    class: "corvette",
    armor: "steel",
    weapon: "railgun",
    engine: "ion",
    power: "diesel",
    sensor: "radar",
    special: "none",
    name: "Nomad",
    fleet: 3,
  }),
  [
    { type: "class", part: "corvette" },
    { type: "armor", part: "steel" },
    { type: "weapon", part: "railgun" },
    { type: "engine", part: "ion" },
    { type: "power", part: "diesel" },
    { type: "sensor", part: "radar" },
    { type: "special", part: "none" },
  ],
  "the yard's own field order is not what it is written in",
);

// The hull comes first, because that is the write whose own rewrites the rest of the design depends
// on. Nothing here decides that; it is stated by the order each blueprint carries.
assert.deepEqual(
  outerFleetBlueprintWrites({ class: "explorer", armor: "neutronium" }),
  [
    { type: "class", part: "explorer" },
    { type: "armor", part: "neutronium" },
  ],
);
assert.deepEqual(outerFleetBlueprintWrites({}), []);
assert.deepEqual(outerFleetBlueprintWrites({ name: "Nomad", fleet: 1 }), []);

// A readable scratch price is not authority if the protected workspace cannot restore the page.
// The blueprint still goes back exactly, and both callers must discard the parsed answer.
for (const [request, failure] of ["current", "quote"].flatMap((request) =>
  ["workspace", "host"].map((failure) => [request, failure]),
)) {
  const blueprint = { class: "corvette", armor: "steel" };
  const original = { ...blueprint };
  let scratch;
  let released = false;
  let parsed = false;
  const faults = [];
  const amountNode = {
    getAttribute(name) {
      return (
        {
          class: "res-Money has-text-success",
          "data-money": "12345",
          "data-ok": "has-text-success",
        }[name] ?? null
      );
    },
    querySelectorAll: () => [],
  };
  const document = {
    getElementById: () => null,
    createElement() {
      return {
        style: {},
        get isConnected() {
          return scratch === this;
        },
        getAttribute: () => null,
        querySelectorAll() {
          parsed = true;
          return [amountNode];
        },
      };
    },
    body: {
      contains: (element) => scratch === element,
      appendChild(element) {
        scratch = element;
      },
      removeChild(element) {
        assert.equal(element, scratch);
        if (failure === "host") return;
        scratch = undefined;
      },
    },
  };
  const control = { methods: ["setVal", "crewText"] };
  const costs = createCapturedOuterFleetCosts({
    rootState: { readRoot: () => ({ space: { shipyard: { blueprint } } }) },
    controls: {
      resolve: () => control,
      invoke(handle, method, [field, value] = []) {
        assert.equal(handle, control);
        if (method === "crewText") return { ok: true, value: 37 };
        assert.equal(method, "setVal");
        assert.notEqual(scratch, undefined);
        blueprint[field] = value;
        return { ok: true, value: undefined };
      },
    },
    panels: {
      open: () => ({
        release() {
          released = true;
        },
        isIntact() {
          assert.equal(released, true);
          return failure !== "workspace";
        },
      }),
    },
    mountSuppression: { available: true, withoutMounting: (draw) => draw() },
    getDocument: () => document,
    onCaptureError: (detail) => faults.push(detail),
  });
  const answer =
    request === "quote"
      ? costs.quote({ class: "explorer", armor: "neutronium" })
      : costs.current();
  assert.equal(parsed, true, "the valid scratch cost row was read");
  assert.equal(answer, undefined, "a broken workspace cannot return a price");
  assert.deepEqual(blueprint, original);
  assert.equal(scratch === undefined, failure !== "host");
  assert.equal(released, true);
  assert.deepEqual(faults, [
    failure === "host"
      ? "the scratch shipYardCosts could not be removed"
      : "the workspace could not put the panels back",
  ]);
}

// ---------------------------------------------------------------------------
// What the planner does with the yard's answer.
// ---------------------------------------------------------------------------

const readiness = {
  kind: "check-build-readiness",
  blueprint: "fighter",
  targetRegion: "spc_red",
  targetLocationName: "spc_red",
  minimumCrew: 0,
  shipName: "Corvette",
  shipCrew: 2,
  nextShipName: "Corvette to spc_red",
};

const buildable = {
  costKnown: true,
  missingResourceName: null,
  currentCityGarrison: 10,
};

assert.deepEqual(planOuterFleetBuild({ ...buildable, plan: readiness }), {
  kind: "build-outer-fleet",
  blueprint: "fighter",
  targetRegion: "spc_red",
  targetLocationName: "spc_red",
  shipName: "Corvette",
  shipCrew: 2,
  nextShipName: "Corvette to spc_red",
});
assert.equal(
  planOuterFleetBuild({
    ...buildable,
    currentCityGarrison: null,
    plan: readiness,
  }).messageAfterUpdate,
  "City garrison data unavailable; ship construction paused",
);
assert.equal(
  planOuterFleetBuild({
    ...buildable,
    currentCityGarrison: null,
    missingResourceName: "Iridium",
    plan: readiness,
  }).messageAfterUpdate,
  "Next ship(Corvette to spc_red) is missing Iridium",
);
assert.equal(
  planOuterFleetBuild({
    ...buildable,
    currentCityGarrison: 39,
    plan: { ...readiness, shipCrew: 12, minimumCrew: 27 },
  }).kind,
  "build-outer-fleet",
);
assert.equal(
  planOuterFleetBuild({
    ...buildable,
    currentCityGarrison: 38,
    plan: { ...readiness, shipCrew: 12, minimumCrew: 27 },
  }).kind,
  "outer-fleet-status",
);

// The resource the game's own row marks as not payable is the one that is named. It comes from that
// marking rather than from a comparison against the global resource amount, so a supply-pool shortfall
// the totals do not show is still a shortfall.
assert.deepEqual(
  planOuterFleetBuild({
    ...buildable,
    missingResourceName: "Iridium",
    plan: readiness,
  }).messageAfterUpdate,
  "Next ship(Corvette to spc_red) is missing Iridium",
);

// No price is not an affordable price. The yard could not be asked, so the pass stands down rather
// than building a ship whose cost nobody has confirmed.
assert.deepEqual(
  planOuterFleetBuild({
    plan: readiness,
    costKnown: false,
    missingResourceName: null,
    currentCityGarrison: 10,
  }),
  {
    kind: "outer-fleet-status",
    blueprint: "fighter",
    nextShipName: "Corvette to spc_red",
    messageBeforeUpdate: null,
    messageAfterUpdate:
      "Next ship(Corvette to spc_red) cost unavailable; ship construction paused",
  },
);

// ---------------------------------------------------------------------------
// The removed replica.
// ---------------------------------------------------------------------------

const sourceRoot = path.join(
  fileURLToPath(new URL("..", import.meta.url)),
  "src",
);
const sources = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".ts")) sources.push(full);
  }
};
walk(sourceRoot);
assert.ok(sources.length > 100, "the source tree was not walked");

// The yard prices a design in `updateCosts()`, and the script used to answer that question with its
// own copy of the class, material, inflation and cost-tier arithmetic. That copy had to track every
// upstream balance change, and it could not see a supply pool at all. Its return is a regression:
// nothing in production source may price a ship.
const offenders = sources.filter((file) =>
  fs.readFileSync(file, "utf8").includes("capturedOuterFleetShipCosts"),
);
assert.deepEqual(
  offenders,
  [],
  `the local ship cost replica is back in ${offenders.join(", ")}`,
);

console.log("Captured shipyard cost authority tests passed");
