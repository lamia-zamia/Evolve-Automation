import assert from "node:assert/strict";
import { createSettingsStore } from "../src/adapters/browser/settings-store.ts";
import { createCapturedSettingsDefaults } from "../src/adapters/evolve/captured-settings-defaults.ts";
import { createCapturedSettingsLifecycle } from "../src/application/captured-settings-lifecycle.ts";
import { createOverrideSettings } from "../src/application/override-settings.ts";
import { createCapturedOverrideEvaluation } from "../src/adapters/evolve/captured-override-evaluation.ts";
import { overrideComparisons } from "../src/settings/override-comparators.ts";
import { inspectImportedSettings } from "../src/adapters/browser/settings-import.ts";

function storage(initial) {
  let value = initial;
  return {
    getItem(key) {
      return key === "settings" ? value : null;
    },
    setItem(key, next) {
      if (key === "settings") value = next;
    },
    read() {
      return value;
    },
  };
}

function controls(ids) {
  return {
    capturedElementIds: () => ids,
    resolve: (id) =>
      ids.includes(id)
        ? {
            elementId: id,
            generation: 1,
            methods: ["add", "sub", "setDefault"],
          }
        : undefined,
  };
}

function root() {
  return {
    race: { universe: "standard", governor: { tasks: {} } },
    civic: {
      d_job: "unemployed",
      unemployed: {
        job: "unemployed",
        assigned: 0,
        workers: 10,
        max: -1,
        display: true,
      },
      farmer: {
        job: "farmer",
        assigned: 0,
        workers: 0,
        max: -1,
        display: true,
      },
      teamster: {
        job: "teamster",
        assigned: 0,
        workers: 0,
        max: -1,
        display: true,
      },
    },
    resource: {},
    tech: {},
  };
}

function createLifecycle(
  rawText = null,
  ids = ["civ-unemployed", "civ-farmer", "civ-teamster"],
) {
  const saved = storage(rawText);
  const settings = createSettingsStore({ storage: saved });
  const gameRoot = root();
  const lifecycle = createCapturedSettingsLifecycle({
    settings,
    defaults: createCapturedSettingsDefaults({
      rootState: { readRoot: () => gameRoot },
      controls: controls(ids),
    }),
  });
  return { saved, settings, lifecycle, gameRoot };
}

// Empty profiles get the complete record baseline and the job breakpoint/priority keys needed by
// the captured ordinary-job catalog.
{
  const { lifecycle, settings, saved } = createLifecycle();
  lifecycle.initialize();
  lifecycle.ensureDynamicDefaults();
  const raw = settings.readRaw();
  assert.equal(raw.masterScriptToggle, true);
  assert.equal(raw.autoJobs, false);
  assert.equal(raw.autoBuild, false);
  assert.equal(raw.autoMarket, false);
  assert.equal(raw.autoStorage, false);
  assert.equal(raw.autoARPA, false);
  assert.equal(raw.autoAlchemy, false);
  assert.equal(raw.job_b1_farmer, -1);
  assert.equal(raw.job_p_teamster, 2);
  assert.notEqual(saved.read(), null);

  const persisted = saved.read();
  const second = createLifecycle(persisted);
  second.lifecycle.initialize();
  assert.equal(
    second.saved.read(),
    persisted,
    "a second startup must be idempotent",
  );
}

// Existing records migrate old names and their override definitions together.
{
  const { lifecycle, settings } = createLifecycle(
    JSON.stringify({
      masterScriptToggle: true,
      prestigeWhiteholeEjectEnabled: true,
      overrides: {
        prestigeWhiteholeEjectEnabled: [
          {
            type1: "Boolean",
            arg1: true,
            type2: "Boolean",
            arg2: true,
            cmp: "==",
            ret: true,
          },
        ],
      },
    }),
  );
  lifecycle.initialize();
  const raw = settings.readRaw();
  assert.equal(raw.autoEject, true);
  assert.equal(raw.prestigeWhiteholeEjectEnabled, undefined);
  assert.equal(raw.overrides.prestigeWhiteholeEjectEnabled, undefined);
  assert.equal(raw.overrides.autoEject.length, 1);
}

// Invalid override definitions are dropped at the raw boundary, before any effective sample.
{
  const { lifecycle, settings } = createLifecycle(
    JSON.stringify({
      overrides: {
        autoJobs: [{ type1: true, type2: "Boolean", cmp: "==", ret: true }],
      },
    }),
  );
  lifecycle.initialize();
  assert.deepEqual(settings.readRaw().overrides.autoJobs, []);
}

// A newly discovered Civics draw fills dynamic defaults without overwriting an edit made earlier.
{
  const { lifecycle, settings, gameRoot } = createLifecycle();
  lifecycle.initialize();
  settings.readRaw().job_p_farmer = 77;
  const nextIds = [
    "civ-unemployed",
    "civ-farmer",
    "civ-teamster",
    "civ-scientist",
  ];
  const nextLifecycle = createCapturedSettingsLifecycle({
    settings,
    defaults: createCapturedSettingsDefaults({
      rootState: { readRoot: () => gameRoot },
      controls: controls(nextIds),
    }),
  });
  nextLifecycle.ensureDynamicDefaults();
  assert.equal(settings.readRaw().job_p_farmer, 77);
  assert.equal(settings.readRaw().job_b1_scientist, 3);
}

// Captured catalogs discovered after startup fill every dynamic section, not only Jobs.
{
  const gameRoot = root();
  gameRoot.resource = {
    Food: {
      amount: 10,
      max: 100,
      display: true,
      diff: 0,
      trade: 0,
      stackable: true,
    },
    Plywood: {
      amount: 10,
      max: 100,
      display: true,
      diff: 0,
      trade: 0,
      stackable: true,
    },
  };
  gameRoot.arpa = { launch_facility: { display: true } };
  const saved = storage(null);
  const settings = createSettingsStore({ storage: saved });
  const lifecycle = createCapturedSettingsLifecycle({
    settings,
    defaults: createCapturedSettingsDefaults({
      rootState: { readRoot: () => gameRoot },
      controls: controls([
        "civ-unemployed",
        "civ-farmer",
        "market-Food",
        "market-Plywood",
      ]),
    }),
  });
  lifecycle.initialize();
  lifecycle.ensureDynamicDefaults();
  const raw = settings.readRaw();
  assert.equal(raw.res_trade_buy_Food, true);
  assert.equal(raw.buyFood, false);
  assert.equal(raw.res_storageFood, true);
  assert.equal(raw.craftPlywood, true);
  assert.equal(raw.arpa_launch_facility, true);
}

// A tech-dependent trigger remains in its old form until a real captured tech catalog is present.
{
  const { lifecycle, settings, gameRoot } = createLifecycle(
    JSON.stringify({
      masterScriptToggle: true,
      autoTrigger: true,
      triggers: [
        {
          requirementType: "unlocked",
          requirementId: "trade",
          requirementCount: 1,
          actionType: "research",
          actionId: "trade",
        },
      ],
    }),
  );
  lifecycle.initialize();
  assert.equal(settings.readRaw().triggers[0].requirementType, "unlocked");
  gameRoot.tech = { trade: { display: true } };
  lifecycle.ensureDynamicDefaults();
  assert.equal(
    settings.readRaw().triggers[0].requirementType,
    "ResearchUnlocked",
  );
  assert.equal(settings.readRaw().triggers[0].requirementId, "tech-trade");
  assert.equal(settings.readRaw().triggers[0].actionId, "tech-trade");
}

// An authoritative replacement is persisted even when migration makes no further edits, and a
// fresh lifecycle instance reads the replacement rather than the previous stored record.
{
  const { lifecycle, saved } = createLifecycle(
    JSON.stringify({ masterScriptToggle: true, autoJobs: false }),
  );
  lifecycle.initialize();
  lifecycle.replaceAndInitialize({ masterScriptToggle: true, autoJobs: true });
  assert.equal(JSON.parse(saved.read()).autoJobs, true);
  const second = createLifecycle(saved.read());
  second.lifecycle.initialize();
  assert.equal(second.settings.readRaw().autoJobs, true);
}

// Resetting a dynamic section removes stale entity overrides even when the entity is no longer in
// the current captured catalog, while leaving another section untouched.
{
  const { lifecycle, settings } = createLifecycle();
  lifecycle.initialize();
  settings.readRaw().overrides.job_old = [];
  settings.readRaw().overrides.res_trade_buy_Old = [];
  settings.readRaw().overrides.tickRate = [];
  lifecycle.resetSection("job");
  assert.equal(settings.readRaw().overrides.job_old, undefined);
  assert.notEqual(settings.readRaw().overrides.res_trade_buy_Old, undefined);
  assert.notEqual(settings.readRaw().overrides.tickRate, undefined);
  lifecycle.resetSection("market");
  assert.equal(settings.readRaw().overrides.res_trade_buy_Old, undefined);
  assert.notEqual(settings.readRaw().overrides.tickRate, undefined);
}

// An empty object is a valid partial import: initialization supplies the missing defaults.
{
  const inspection = inspectImportedSettings("{}");
  assert.equal(inspection.ok, true);
}

// Section reset is authoritative: it clears the section's overrides, force-writes defaults, and
// persists the same raw object the UI edits.
{
  const { lifecycle, settings } = createLifecycle();
  lifecycle.initialize();
  settings.readRaw().tickRate = 99;
  settings.readRaw().overrides.tickRate = [
    {
      type1: "Boolean",
      arg1: true,
      type2: "Boolean",
      arg2: true,
      cmp: "==",
      ret: 99,
    },
  ];
  lifecycle.resetSection("general");
  assert.equal(settings.readRaw().tickRate, 4);
  assert.equal(settings.readRaw().overrides.tickRate, undefined);
}

// Effective settings layer resolves an override while leaving the raw record untouched.
{
  const { lifecycle, settings, gameRoot } = createLifecycle();
  lifecycle.initialize();
  const raw = settings.readRaw();
  raw.autoJobs = false;
  raw.overrides.autoJobs = [
    {
      type1: "Boolean",
      arg1: true,
      type2: "Boolean",
      arg2: true,
      cmp: "==",
      ret: true,
    },
  ];
  const effective = lifecycle.readEffective();
  createOverrideSettings({
    getSafeMode: () => false,
    getSettings: () => effective,
    getSettingsRaw: lifecycle.readRaw,
    source: createCapturedOverrideEvaluation({
      rootState: { readRoot: () => gameRoot },
      readSettings: lifecycle.readRaw,
      comparatorSource: {
        comparisons: overrideComparisons,
        rightOperandComparators: ["A?B", "!A?B"],
      },
    }),
    reporter: { report: () => {} },
    display: { publish: () => {} },
  }).updateOverrides();
  assert.equal(raw.autoJobs, false);
  assert.equal(effective.autoJobs, true);
}

// Governor task suppression is sampled by the captured source and remains separate from raw.
{
  const gameRoot = root();
  gameRoot.race.governor.tasks = {
    storage: "storage",
    trash: "trash",
    tax: "tax",
  };
  const source = createCapturedOverrideEvaluation({
    rootState: { readRoot: () => gameRoot },
    readSettings: () => ({}),
    comparatorSource: {
      comparisons: overrideComparisons,
      rightOperandComparators: ["A?B", "!A?B"],
    },
  });
  assert.deepEqual(source.readForcedTasks(), {
    storageTaskActive: true,
    trashTaskActive: true,
    taxTaskActive: true,
  });

  const { lifecycle, settings } = createLifecycle();
  lifecycle.initialize();
  const raw = settings.readRaw();
  raw.autoStorage = true;
  raw.overrides.researchIgnore = [
    {
      type1: "Boolean",
      arg1: true,
      type2: "Boolean",
      arg2: true,
      cmp: "==",
      ret: "tech-new",
    },
  ];
  raw.researchIgnore = ["tech-purify"];
  const effective = lifecycle.readEffective();
  createOverrideSettings({
    getSafeMode: () => false,
    getSettings: () => effective,
    getSettingsRaw: lifecycle.readRaw,
    source,
    reporter: { report: () => {} },
    display: { publish: () => {} },
  }).updateOverrides();
  assert.equal(raw.autoStorage, true);
  assert.equal(effective.autoStorage, false);
  assert.deepEqual(effective.researchIgnore, ["tech-purify", "tech-new"]);
}

console.log("captured-settings-lifecycle: ok");
