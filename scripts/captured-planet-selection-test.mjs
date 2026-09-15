import assert from "node:assert/strict";

import { runCapturedPlanetSelection } from "../src/application/captured-planet-selection.ts";
import { createCapturedPlanetSelection } from "../src/adapters/evolve/progression/evolution/captured-planet-selection.ts";
import { planSinglePlanetSelection } from "../src/domain/progression/evolution/planet-selection.ts";

const activeGate = {
  universe: "standard",
  seeded: true,
  chose: false,
  targetName: "weighting",
};

assert.deepEqual(planSinglePlanetSelection(activeGate, ["Grass123"]), {
  elementId: "Grass123",
});
assert.equal(
  planSinglePlanetSelection(activeGate, ["Grass123", "Desert456"]),
  null,
);
assert.equal(
  planSinglePlanetSelection({ ...activeGate, targetName: "none" }, [
    "Grass123",
  ]),
  null,
);
assert.equal(
  planSinglePlanetSelection({ ...activeGate, chose: true }, ["Grass123"]),
  null,
);

const root = {
  race: { universe: "standard", seeded: true, chose: false },
};
const chosen = [];
const captured = createCapturedPlanetSelection({
  rootState: {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  },
  drawnActions: {
    read: (selector) =>
      selector === "#evolution > .action" ? [{ id: "Grass123", cost: {} }] : [],
    exists: () => true,
  },
  readSettings: () => ({ userPlanetTargetName: "habitable" }),
  controls: {
    selectPlanet: (elementId) => {
      chosen.push(elementId);
      root.race.chose = elementId;
      return true;
    },
  },
});

assert.deepEqual(captured.reader.sample().candidateIds, ["Grass123"]);
assert.deepEqual(runCapturedPlanetSelection(captured), { status: "succeeded" });
assert.deepEqual(chosen, ["Grass123"]);
assert.equal(runCapturedPlanetSelection(captured).status, "succeeded");

console.log("captured planet selection tests passed");
