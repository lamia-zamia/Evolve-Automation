import assert from "node:assert/strict";

import { readShapeshiftInput } from "../src/adapters/evolve/shapeshift.ts";
import { planShapeshift } from "../src/domain/shapeshift.ts";

// End-to-end reader + planner + apply, matching the legacy autoShapeshift.
function run(scenario) {
  const shapes = [];
  const game = {
    global: {
      race: {
        shapeshifter: scenario.shapeshifter,
        ss_genus: scenario.currentGenus,
      },
    },
  };
  const settings = { shifterGenus: scenario.shifterGenus };
  const getVueById = (id) =>
    id === "sshifter" ? { setShape: (genus) => shapes.push(genus) } : undefined;

  const genus = planShapeshift(
    readShapeshiftInput({ getGame: () => game, getSettings: () => settings }),
  );
  if (genus !== null) {
    getVueById("sshifter")?.setShape(genus);
  }
  return shapes;
}

assert.deepEqual(
  run({
    shapeshifter: true,
    currentGenus: "humanoid",
    shifterGenus: "reptilian",
  }),
  ["reptilian"],
  "shifts to the configured genus when it differs",
);
assert.deepEqual(
  run({
    shapeshifter: true,
    currentGenus: "reptilian",
    shifterGenus: "reptilian",
  }),
  [],
  "already the target genus: no shift",
);
assert.deepEqual(
  run({ shapeshifter: true, currentGenus: "humanoid", shifterGenus: "ignore" }),
  [],
  "ignore setting: no shift",
);
assert.deepEqual(
  run({
    shapeshifter: false,
    currentGenus: "humanoid",
    shifterGenus: "reptilian",
  }),
  [],
  "non-shapeshifter race: no shift",
);

// Planner directly.
assert.equal(
  planShapeshift({
    isShapeshifter: true,
    shifterGenus: "fey",
    currentGenus: undefined,
  }),
  "fey",
);
assert.equal(
  planShapeshift({
    isShapeshifter: false,
    shifterGenus: "fey",
    currentGenus: undefined,
  }),
  null,
);

console.log("Shapeshift automation regression tests passed");
