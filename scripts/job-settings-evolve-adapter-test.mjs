import assert from "node:assert/strict";

import { createJobSettingsEvolveAdapter } from "../src/adapters/evolve/civic/job-settings.ts";

class BasicJob {}
class CraftingJob {}

const unemployed = {
  _originalId: "unemployed",
  _originalName: "Unemployed",
  is: {},
};
const forager = {
  _originalId: "forager",
  _originalName: "Forager",
  is: { split: true },
};
Object.setPrototypeOf(forager, BasicJob.prototype);
const smelter = {
  _originalId: "smelter",
  _originalName: "Smelter",
  is: { smart: true },
};
Object.setPrototypeOf(smelter, CraftingJob.prototype);
const jobs = { Unemployed: unemployed, Forager: forager, Smelter: smelter };
const settingsRaw = {
  overrides: { job_forager: true },
  job_forager: true,
};
const sortTrace = [];
const manager = {
  priorityList: [smelter, forager, unemployed],
  sortByPriority: () => sortTrace.push("sort"),
};

const adapter = createJobSettingsEvolveAdapter({
  getBasicJob: () => BasicJob,
  getCraftingJob: () => CraftingJob,
  getJobManager: () => manager,
  getJobs: () => jobs,
  getSettingsRaw: () => settingsRaw,
});

assert.deepEqual(adapter.readJobSettingsReadModel().rows, [
  {
    id: "smelter",
    label: "Smelter",
    color: "danger",
    enabledSettingName: "job_smelter",
    enabled: false,
    hasOverride: false,
    breakpoints: [
      { kind: "managed" },
      { kind: "managed" },
      { kind: "managed" },
    ],
    smartSettingName: "job_s_smelter",
  },
  {
    id: "forager",
    label: "Forager",
    color: "info",
    enabledSettingName: "job_forager",
    enabled: true,
    hasOverride: true,
    breakpoints: [
      { kind: "input", settingName: "job_b1_forager" },
      { kind: "input", settingName: "job_b2_forager" },
      { kind: "weighted" },
    ],
  },
  {
    id: "unemployed",
    label: "Unemployed",
    color: "warning",
    enabledSettingName: "job_unemployed",
    enabled: false,
    hasOverride: false,
    breakpoints: [
      { kind: "input", settingName: "job_b1_unemployed" },
      { kind: "input", settingName: "job_b2_unemployed" },
      { kind: "input", settingName: "job_b3_unemployed" },
    ],
  },
]);

adapter.reorderJobs(["forager", "smelter"]);
assert.equal(settingsRaw.job_p_forager, 0);
assert.equal(settingsRaw.job_p_smelter, 1);
assert.deepEqual(sortTrace, ["sort"]);

adapter.resetPriorities();
assert.deepEqual(manager.priorityList, [unemployed, forager, smelter]);
assert.equal(settingsRaw.job_p_unemployed, 0);
assert.equal(settingsRaw.job_p_forager, 1);
assert.equal(settingsRaw.job_p_smelter, 2);

assert.throws(
  () =>
    createJobSettingsEvolveAdapter({
      getBasicJob: () => BasicJob,
      getCraftingJob: () => CraftingJob,
      getJobManager: () => ({ priorityList: [{}] }),
      getJobs: () => jobs,
      getSettingsRaw: () => settingsRaw,
    }).readJobSettingsReadModel(),
  /_originalId must be a string/,
);
assert.throws(
  () =>
    createJobSettingsEvolveAdapter({
      getBasicJob: () => BasicJob,
      getCraftingJob: () => CraftingJob,
      getJobManager: () => manager,
      getJobs: () => jobs,
      getSettingsRaw: () => ({ overrides: null }),
    }).readJobSettingsReadModel(),
  /settingsRaw\.overrides must be an object/,
);

console.log("Job settings Evolve adapter tests passed");
