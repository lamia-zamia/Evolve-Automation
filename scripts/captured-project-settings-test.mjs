import assert from "node:assert/strict";

import { projectIdByKey } from "../src/adapters/evolve/captured-settings-defaults.ts";
import { readCapturedProjectSettingsEntries } from "../src/adapters/evolve/progression/research/captured-project-settings-catalog.ts";
import { createCapturedProjectSettingsAdapter } from "../src/adapters/evolve/progression/research/captured-project-settings.ts";
import { createCapturedArpaToggleReader } from "../src/adapters/evolve/progression/research/captured-arpa-toggles.ts";
import {
  ALWAYS_TRUE_OVERRIDE,
  createRecordSettingsLifecycle,
} from "./test-support/captured-settings.mjs";

function makeCapturedGame() {
  const root = {
    arpa: {
      lhc: { rank: 0, complete: 0 },
      launch_facility: { rank: 1, complete: 0 },
      railway: { rank: 0, complete: 25 },
      sequence: { on: false },
    },
  };
  const controlsById = new Map([
    [
      "arpalhc",
      {
        elementId: "arpalhc",
        generation: 1,
        methods: [],
        data: { title: "Supercollider", act: root.arpa.lhc },
      },
    ],
    [
      "arpalaunch_facility",
      {
        elementId: "arpalaunch_facility",
        generation: 1,
        methods: [],
        data: { title: "Launch Facility", act: root.arpa.launch_facility },
      },
    ],
  ]);
  const controls = {
    resolve: (id) => controlsById.get(id),
    invoke: () => ({ ok: false, reason: "unknown-method" }),
    capturedElementIds: () => [...controlsById.keys()],
  };
  const rootState = {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
  return { root, controls, rootState };
}

const game = makeCapturedGame();

// The `sequence` subsystem flag is not a buildable project.
assert.deepEqual(
  readCapturedProjectSettingsEntries(game.root, game.controls).map((entry) => [
    entry.projectId,
    entry.elementId,
    entry.label,
  ]),
  [
    ["lhc", "arpalhc", "Supercollider"],
    ["launch_facility", "arpalaunch_facility", "Launch Facility"],
    ["railway", "arparailway", "railway"],
  ],
);

// Upstream names three catalog entries differently from the script's default
// table; those aliases must resolve or the projects miss their defaults.
assert.deepEqual(projectIdByKey(["lhc", "syphon", "tp_depot", "railway"]), {
  Lhc: "lhc",
  Syphon: "syphon",
  TpDepot: "tp_depot",
  Railway: "railway",
  SuperCollider: "lhc",
  ManaSyphon: "syphon",
  Depot: "tp_depot",
});

const raw = {
  autoARPA: true,
  arpa_lhc: false,
  arpa_launch_facility: true,
  arpa_railway: true,
  arpa_p_lhc: 2,
  arpa_p_launch_facility: 0,
  arpa_p_railway: 1,
  arpa_m_railway: 5,
  arpa_w_lhc: 9,
  overrides: {
    arpa_lhc: ALWAYS_TRUE_OVERRIDE,
    job_farmer: ALWAYS_TRUE_OVERRIDE,
  },
};
const adapter = createCapturedProjectSettingsAdapter({
  rootState: game.rootState,
  controls: game.controls,
  getSettingsRaw: () => raw,
});

const model = adapter.readProjectSettingsReadModel();
assert.equal(model.sectionId, "project");
assert.equal(model.sectionName, "A.R.P.A.");
assert.deepEqual(
  model.rows.map((row) => row.id),
  ["launch_facility", "railway", "lhc"],
);
const lhc = model.rows.find((row) => row.id === "lhc");
assert.deepEqual(
  {
    label: lhc.label,
    enabledSettingName: lhc.enabledSettingName,
    maximumSettingName: lhc.maximumSettingName,
    weightingSettingName: lhc.weightingSettingName,
  },
  {
    label: "Supercollider",
    enabledSettingName: "arpa_lhc",
    maximumSettingName: "arpa_m_lhc",
    weightingSettingName: "arpa_w_lhc",
  },
);

// The settings panel reads the raw persisted value. An active override is
// deliberately not allowed to turn the displayed value into the effective one.
assert.equal(raw["arpa_lhc"], false);

adapter.resetPriorities();
assert.equal(raw["arpa_p_lhc"], 0);
assert.equal(raw["arpa_p_launch_facility"], 1);
assert.equal(raw["arpa_p_railway"], 2);
adapter.reorderProjects(["railway", "lhc", "not-captured"]);
assert.equal(raw["arpa_p_railway"], 0);
assert.equal(raw["arpa_p_lhc"], 1);
assert.equal(raw["arpa_p_not-captured"], undefined);

const sectionLifecycle = createRecordSettingsLifecycle({
  raw,
  rootState: game.rootState,
  controls: game.controls,
});

sectionLifecycle.resetSection("project");
assert.deepEqual(
  {
    launch: raw["arpa_launch_facility"],
    collider: raw["arpa_lhc"],
    colliderWeight: raw["arpa_w_lhc"],
    railwayWeight: raw["arpa_w_railway"],
    railwayMax: raw["arpa_m_railway"],
  },
  {
    launch: true,
    collider: true,
    colliderWeight: 5,
    railwayWeight: 0.1,
    railwayMax: -1,
  },
);
assert.deepEqual(raw["overrides"], {
  job_farmer: ALWAYS_TRUE_OVERRIDE,
});

const toggleReader = createCapturedArpaToggleReader({
  rootState: game.rootState,
  controls: game.controls,
  getDocument: () => ({
    getElementById: (id) => (id === "arpalhc" ? {} : null),
  }),
  getSettingsRaw: () => raw,
});
assert.deepEqual(toggleReader.readItems(), [
  {
    projectId: "lhc",
    settingKey: "arpa_lhc",
    enabled: true,
  },
]);

console.log("captured project settings ok");
