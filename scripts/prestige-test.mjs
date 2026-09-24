import assert from "node:assert/strict";

import { planPrestige } from "../src/domain/progression/prestige/prestige.ts";

assert.deepEqual(
  planPrestige({ goal: "Normal", branch: { type: "noop" } }),
  [],
);
assert.deepEqual(
  planPrestige({
    goal: "Normal",
    branch: { type: "apocalypse", eligible: true },
  }),
  [{ kind: "set-goal", goal: "Reset" }],
);
assert.deepEqual(
  planPrestige({
    goal: "Reset",
    branch: { type: "apocalypse", eligible: false },
  }),
  [],
);
assert.deepEqual(
  planPrestige({
    goal: "Reset",
    branch: { type: "celestial-lab", mode: "ascension", eligible: true },
  }),
  [{ kind: "complete-celestial-lab", mode: "ascension" }],
);
assert.deepEqual(
  planPrestige({
    goal: "Reset",
    branch: {
      type: "mad",
      eligible: true,
      armed: false,
      waitForPopulation: false,
      currentSoldiers: 0,
      maxSoldiers: 0,
      currentPopulation: 0,
      maxPopulation: 0,
      requiredPopulation: 0,
    },
  }),
  [
    { kind: "set-goal", goal: "GameOverMan" },
    { kind: "log-prestige" },
    { kind: "launch-mad" },
  ],
);

console.log("Prestige domain policy tests passed");
