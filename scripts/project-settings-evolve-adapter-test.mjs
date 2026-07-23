import assert from "node:assert/strict";

import { createProjectSettingsEvolveAdapter } from "../src/adapters/evolve/progression/research/project-settings.ts";

const settingsRaw = {};
const trace = [];
const projectManager = {
  priorityList: [
    { id: "Alpha", name: "Project Alpha" },
    { id: "Beta", name: "Project Beta" },
  ],
  sortByPriority() {
    trace.push("sortByPriority");
  },
};
const adapter = createProjectSettingsEvolveAdapter({
  getProjectManager: () => projectManager,
  getSettingsRaw: () => settingsRaw,
});

const readModel = adapter.readProjectSettingsReadModel();
assert.equal(readModel.sectionName, "A.R.P.A.");
assert.deepEqual(readModel.rows, [
  {
    id: "Alpha",
    label: "Project Alpha",
    enabledSettingName: "arpa_Alpha",
    maximumSettingName: "arpa_m_Alpha",
    weightingSettingName: "arpa_w_Alpha",
  },
  {
    id: "Beta",
    label: "Project Beta",
    enabledSettingName: "arpa_Beta",
    maximumSettingName: "arpa_m_Beta",
    weightingSettingName: "arpa_w_Beta",
  },
]);
assert.equal(Object.isFrozen(readModel), true);
assert.equal(Object.isFrozen(readModel.rows), true);

adapter.reorderProjects(["Beta", "Alpha"]);
assert.deepEqual(settingsRaw, { arpa_p_Beta: 0, arpa_p_Alpha: 1 });
assert.deepEqual(trace, ["sortByPriority"]);

assert.throws(
  () =>
    createProjectSettingsEvolveAdapter({
      getProjectManager: () => ({ priorityList: {} }),
      getSettingsRaw: () => ({}),
    }).readProjectSettingsReadModel(),
  /priorityList must be an array/,
);
assert.throws(
  () =>
    createProjectSettingsEvolveAdapter({
      getProjectManager: () => ({ priorityList: [{ id: 1, name: "Bad" }] }),
      getSettingsRaw: () => ({}),
    }).readProjectSettingsReadModel(),
  /priorityList\[0\]\.id must be a string/,
);
assert.throws(
  () =>
    createProjectSettingsEvolveAdapter({
      getProjectManager: () => ({
        priorityList: [],
        sortByPriority: true,
      }),
      getSettingsRaw: () => ({}),
    }).reorderProjects([]),
  /sortByPriority must be a function/,
);

console.log("Project settings Evolve adapter tests passed");
