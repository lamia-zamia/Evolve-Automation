import assert from "node:assert/strict";

import { readCapturedFactoryCapacity } from "../src/adapters/evolve/economy/production/captured-factory-capacity.ts";

// `industry.js:factoryData.factoryCapacity()` multiplies crater workers before dividing by the
// High Population scale. Grouping the division first rounds this exact boundary down one line.
assert.equal(
  readCapturedFactoryCapacity({
    city: { factory: { on: 0 } },
    surface: { crater_factory: { count: 15, on: 15 } },
    civic: { crater_worker: { workers: 98 } },
    race: { high_pop: 0.5 },
  }),
  245,
);
