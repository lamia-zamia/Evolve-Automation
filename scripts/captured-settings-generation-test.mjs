/**
 * The settings lifecycle does its migration and default work once per catalog generation.
 *
 * `refreshDiscoveredSettings` runs after every control-discovery phase, so `ensureDynamicDefaults`
 * is called several times a tick. Each call used to re-run the migration sweep, the discovered
 * resets and two full `JSON.stringify` snapshots of the record. These cases pin the conditions
 * under which that work is skipped, and — more importantly — every condition under which it must
 * still happen.
 */

import assert from "node:assert/strict";

import {
  createSettingsFixture,
  createSettingsRoot,
  DEFAULT_CONTROL_IDS,
} from "./test-support/captured-settings.mjs";

// --- startup initializes exactly once, and a redrawn UI does not redo it ------------------------

{
  const { lifecycle, settings } = createSettingsFixture();
  lifecycle.initialize();
  assert.equal(lifecycle.stats().initializations, 1);
  assert.equal(settings.readRaw().masterScriptToggle, true);

  // `prepareSettingsForUi` calls this on every panel draw.
  for (let draw = 0; draw < 5; draw += 1) lifecycle.initialize();
  assert.equal(
    lifecycle.stats().initializations,
    1,
    "opening the settings UI must not redo migrations",
  );
}

// --- repeated per-tick calls do the work once ---------------------------------------------------

{
  const { lifecycle, settings } = createSettingsFixture();
  lifecycle.initialize();
  lifecycle.ensureDynamicDefaults();
  assert.equal(lifecycle.stats().dynamicDefaultRuns, 1);
  assert.equal(settings.readRaw().job_b1_farmer, -1);

  // Eight discovery phases in one tick, then several more ticks.
  for (let call = 0; call < 40; call += 1) lifecycle.ensureDynamicDefaults();
  const stats = lifecycle.stats();
  assert.equal(stats.dynamicDefaultRuns, 1, "the sweep must run once");
  assert.equal(stats.dynamicDefaultSkips, 40);
  assert.equal(
    settings.readRaw().job_b1_farmer,
    -1,
    "skipping must not lose a key the first sweep added",
  );
}

// --- a newly discovered control still adds its dynamic defaults ----------------------------------

{
  const gameRoot = createSettingsRoot();
  // Mutated in place: the registry closes over this array, as the captured one grows in place.
  const controlIds = [...DEFAULT_CONTROL_IDS];
  const { lifecycle, settings } = createSettingsFixture({
    gameRoot,
    controlIds,
  });
  lifecycle.initialize();
  lifecycle.ensureDynamicDefaults();
  lifecycle.ensureDynamicDefaults();
  assert.equal(lifecycle.stats().dynamicDefaultRuns, 1);
  assert.equal(settings.readRaw().job_b1_lumberjack, undefined);

  // The game draws another job row, and the capture picks it up.
  gameRoot.civic.lumberjack = {
    job: "lumberjack",
    assigned: 0,
    workers: 0,
    max: -1,
    display: true,
  };
  controlIds.push("civ-lumberjack");

  lifecycle.ensureDynamicDefaults();
  assert.equal(
    lifecycle.stats().dynamicDefaultRuns,
    2,
    "a grown catalog must re-run the sweep",
  );
  assert.equal(
    settings.readRaw().job_b1_lumberjack,
    4,
    "the newly discovered job must get its dynamic defaults",
  );

  // And then settle again.
  lifecycle.ensureDynamicDefaults();
  assert.equal(lifecycle.stats().dynamicDefaultRuns, 2);
}

// --- import forces reinitialization --------------------------------------------------------------

{
  const { lifecycle, settings } = createSettingsFixture();
  lifecycle.initialize();
  lifecycle.ensureDynamicDefaults();
  const before = lifecycle.stats();

  lifecycle.replaceAndInitialize({ autoBuild: true });
  assert.equal(
    lifecycle.stats().initializations,
    before.initializations + 1,
    "an import must re-run the migration sweep",
  );
  assert.equal(settings.readRaw().autoBuild, true);
  assert.equal(
    settings.readRaw().masterScriptToggle,
    true,
    "the imported record must be defaulted again",
  );

  // The imported record is missing the dynamic keys, and the next call must restore them.
  lifecycle.ensureDynamicDefaults();
  assert.equal(
    lifecycle.stats().dynamicDefaultRuns,
    before.dynamicDefaultRuns + 1,
  );
  assert.equal(settings.readRaw().job_b1_farmer, -1);
}

// --- a root replacement invalidates the generation ------------------------------------------------

{
  const { lifecycle } = createSettingsFixture();
  lifecycle.initialize();
  lifecycle.ensureDynamicDefaults();
  lifecycle.ensureDynamicDefaults();
  assert.equal(lifecycle.stats().dynamicDefaultRuns, 1);

  // The composition wires this to `subscribeRootReplaced`: the catalogs are read out of the root,
  // so a replacement can change them without changing any count the generation can see.
  lifecycle.invalidateDynamicDefaults();
  lifecycle.ensureDynamicDefaults();
  assert.equal(lifecycle.stats().dynamicDefaultRuns, 2);
  lifecycle.ensureDynamicDefaults();
  assert.equal(lifecycle.stats().dynamicDefaultRuns, 2);
}

// --- a section reset owes the sweep again ----------------------------------------------------------

{
  const { lifecycle, settings } = createSettingsFixture();
  lifecycle.initialize();
  lifecycle.ensureDynamicDefaults();
  assert.equal(settings.readRaw().job_b1_farmer, -1);

  lifecycle.resetSection("job");
  const runs = lifecycle.stats().dynamicDefaultRuns;
  lifecycle.ensureDynamicDefaults();
  assert.equal(
    lifecycle.stats().dynamicDefaultRuns,
    runs + 1,
    "a reset writes the startup defaults, so the live-catalog sweep is owed again",
  );
  assert.equal(settings.readRaw().job_b1_farmer, -1);
}

// --- the effective layer is untouched by any of this ------------------------------------------------

{
  const { lifecycle } = createSettingsFixture();
  lifecycle.initialize();
  const effective = lifecycle.readEffective();
  lifecycle.ensureDynamicDefaults();
  for (let call = 0; call < 10; call += 1) lifecycle.ensureDynamicDefaults();
  assert.equal(
    lifecycle.readEffective(),
    effective,
    "the effective object identity must survive; overrides refresh on their own cadence",
  );
}

console.log("captured settings generation checks passed");
