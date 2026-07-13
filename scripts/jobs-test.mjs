import assert from "node:assert/strict";

import { createAutoJobs } from "../src/automation/civic/jobs.ts";

const craftingJob = {
  workers: 0,
  is: { split: false },
  isDefault: () => false,
  breakpointEmployees: () => assert.fail("crafting jobs must be skipped"),
};
let typeChecks = 0;
const autoJobs = createAutoJobs({
  getJobManager: () => ({
    managedPriorityList: () => [craftingJob],
    craftingMax: () => 0,
  }),
  getGame: () => ({
    global: { race: {}, civic: { crew: { max: 0, workers: 0 } } },
  }),
  getJobs: () => ({}),
  isDemonRace: () => false,
  isLumberRace: () => false,
  getSettings: () => ({
    autoCraftsmen: false,
    jobManageServants: false,
    jobSetDefault: false,
  }),
  traitVal: () => 1,
  getCrafter: () => ({}),
  getWindow: () => ({}),
  getBuildings: () => ({ GatewayStarbase: { count: 0 } }),
  getHaveTech: () => () => false,
  getResources: () => ({ Population: { currentQuantity: 0 } }),
  ticksPerSecond: () => 1,
  getState: () => ({}),
  findRequiredResourceWeight: () => 0,
  getPoly: () => ({}),
  getHaveTask: () => () => false,
  getFoodConsume: () => 1,
  isCraftingJob: (job) => {
    typeChecks++;
    return job === craftingJob;
  },
});

assert.doesNotThrow(() => autoJobs(true));
assert.equal(typeChecks, 1);

console.log("Jobs automation regression tests passed");
