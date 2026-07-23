import assert from "node:assert/strict";

import { createShapeshiftControls } from "../src/adapters/browser/progression-controls.ts";
import {
  createShapeshiftCommandExecutor,
  readShapeshiftInput,
} from "../src/adapters/evolve/traits/shapeshift.ts";
import { planShapeshift } from "../src/domain/traits/shapeshift.ts";

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
  createShapeshiftCommandExecutor({
    getGame: () => game,
    controls: createShapeshiftControls(getVueById),
  }).execute(genus);
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
    currentGenus: null,
  }),
  "fey",
);
assert.equal(
  planShapeshift({
    isShapeshifter: false,
    shifterGenus: "fey",
    currentGenus: null,
  }),
  null,
);

assert.equal(
  readShapeshiftInput({
    getGame: () => ({
      global: { race: { shapeshifter: true, ss_genus: undefined } },
    }),
    getSettings: () => ({ shifterGenus: "fey" }),
  }).currentGenus,
  null,
  "unknown game genus is normalized at the adapter boundary",
);

console.log("Shapeshift automation regression tests passed");
