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

function nativeBuilding(binding) {
  const struct = binding.slice(binding.indexOf("-") + 1);
  return Object.freeze({
    entryKey: `spc_belt:${struct}`,
    region: "space",
    sector: "spc_belt",
    struct,
    actionId: binding,
    readTitle: () => ({ kind: "value", value: binding }),
  });
}

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

// --- native Space settings exist before a Building panel control is ever captured ----------------

{
  const binding = "space-atmo_terraformer";
  const structure = nativeBuilding(binding);
  const gameRoot = createSettingsRoot({
    space: { atmo_terraformer: { count: 1, on: 0 } },
  });
  let structures;
  const mechanics = { readStructures: () => structures };
  const capturedIds = [...DEFAULT_CONTROL_IDS];
  const { lifecycle, settings, controls, saved } = createSettingsFixture({
    gameRoot,
    controlIds: capturedIds,
    mechanics,
  });

  // Settings initializes while the private native registry is not ready yet.
  lifecycle.initialize();
  structures = [structure];
  lifecycle.ensureDynamicDefaults();

  const raw = settings.readRaw();
  assert.equal(raw[`bat${binding}`], true);
  assert.equal(raw[`bld_s_${binding}`], true);
  assert.equal(raw[`bld_m_${binding}`], -1);
  assert.equal(raw[`bld_w_${binding}`], 100);
  assert.ok(Number.isFinite(raw[`bld_p_${binding}`]));
  assert.equal(
    JSON.parse(saved.read())[`bld_s_${binding}`],
    true,
    "dynamic defaults are persisted in the raw settings record",
  );
  assert.equal(
    controls.capturedElementIds().some((id) => id.startsWith("space-")),
    false,
    "semantic defaults must not need a Space Building control or panel discovery",
  );
}

// --- semantic settings use the existing smart metadata and Belt special defaults ----------------

{
  const bindings = [
    "space-space_station",
    "space-elerium_ship",
    "space-iridium_ship",
    "space-iron_ship",
  ];
  const gameRoot = createSettingsRoot({
    space: Object.fromEntries(
      bindings.map((binding) => [
        binding.slice("space-".length),
        { count: 1, on: 0 },
      ]),
    ),
  });
  const { lifecycle, settings, controls } = createSettingsFixture({
    gameRoot,
    controlIds: [],
    mechanics: { readStructures: () => bindings.map(nativeBuilding) },
  });
  lifecycle.initialize();
  lifecycle.ensureDynamicDefaults();

  const raw = settings.readRaw();
  for (const binding of bindings) {
    assert.equal(raw[`bld_s_${binding}`], true);
    assert.equal(raw[`bld_s2_${binding}`], true);
  }
  assert.equal(raw["bld_m_space-elerium_ship"], 15);
  assert.equal(raw["bld_m_space-iridium_ship"], 15);
  assert.deepEqual(controls.capturedElementIds(), []);
}

// --- dynamic defaults fill absent keys without overwriting existing Space choices -----------------

{
  const binding = "space-atmo_terraformer";
  const gameRoot = createSettingsRoot({
    space: { atmo_terraformer: { count: 1, on: 0 } },
  });
  const controlIds = [];
  const { lifecycle, settings, saved } = createSettingsFixture({
    rawText: JSON.stringify({
      [`bld_s_${binding}`]: false,
      [`bld_s2_${binding}`]: false,
      [`bld_p_${binding}`]: 91,
      [`bld_m_${binding}`]: 4,
      [`bld_w_${binding}`]: 17,
    }),
    gameRoot,
    controlIds,
    mechanics: { readStructures: () => [nativeBuilding(binding)] },
  });
  lifecycle.initialize();
  lifecycle.ensureDynamicDefaults();

  const raw = settings.readRaw();
  assert.equal(raw[`bld_s_${binding}`], false);
  assert.equal(raw[`bld_s2_${binding}`], false);
  assert.equal(raw[`bld_p_${binding}`], 91);
  assert.equal(raw[`bld_m_${binding}`], 4);
  assert.equal(raw[`bld_w_${binding}`], 17);
  assert.equal(raw[`bat${binding}`], true);

  controlIds.push(binding);
  lifecycle.ensureDynamicDefaults();
  assert.equal(settings.readRaw()[`bld_p_${binding}`], 91);
  assert.equal(
    JSON.parse(saved.read())[`bld_p_${binding}`],
    91,
    "capturing a control later must not reorder a stored automation priority",
  );
}

// --- semantic catalog growth advances generation without any control growth ----------------------

{
  const first = nativeBuilding("space-atmo_terraformer");
  const second = nativeBuilding("space-space_station");
  const gameRoot = createSettingsRoot({
    space: {
      atmo_terraformer: { count: 1, on: 0 },
      space_station: { count: 1, on: 0 },
    },
  });
  let structures = [first];
  const controlIds = [...DEFAULT_CONTROL_IDS];
  const { lifecycle, settings, defaults, controls } = createSettingsFixture({
    gameRoot,
    controlIds,
    mechanics: { readStructures: () => structures },
  });
  lifecycle.initialize();
  lifecycle.ensureDynamicDefaults();
  const firstGeneration = defaults.readCatalogGeneration();
  const controlCount = controls.capturedElementIds().length;

  structures = [first, second];
  assert.notEqual(
    defaults.readCatalogGeneration(),
    firstGeneration,
    "a native Building added by mechanics must change catalog generation",
  );
  assert.equal(controls.capturedElementIds().length, controlCount);
  lifecycle.ensureDynamicDefaults();
  assert.equal(settings.readRaw()["bld_s_space-space_station"], true);
  assert.ok(Number.isFinite(settings.readRaw()["bld_p_space-space_station"]));
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
