// Section ownership is the one rule that keeps a reset button from deleting another section's
// work. These cases pin the boundaries that actually overlap in the persisted namespace.

import assert from "node:assert/strict";
import {
  SETTINGS_SECTION_POLICIES,
  findSettingsSectionPolicy,
  SETTINGS_RESET_ORDER,
} from "../src/domain/settings-sections.ts";
import {
  createSettingsFixture,
  seedOverrides,
} from "./test-support/captured-settings.mjs";

// --- the registry itself -------------------------------------------------------------------

// One entry per section, one reset per entry, and the reset order derived from the same table.
{
  const ids = SETTINGS_SECTION_POLICIES.map((policy) => policy.id);
  assert.equal(new Set(ids).size, ids.length, "section ids must be unique");
  const resets = SETTINGS_SECTION_POLICIES.map((policy) => policy.resetName);
  assert.equal(new Set(resets).size, resets.length, "resets must be unique");
  assert.deepEqual(SETTINGS_RESET_ORDER, resets);
  assert.equal(findSettingsSectionPolicy("Production")?.id, "production");
  assert.equal(findSettingsSectionPolicy("nosuchsection"), undefined);
}

// No persisted key may be claimed by two sections. The pairs below are the namespaces that
// genuinely abut; `job_*` is the one that used to be claimed twice.
{
  const keys = [
    "job_farmer",
    "job_p_farmer",
    "job_b1_farmer",
    "job_b2_farmer",
    "job_b3_farmer",
    "job_s_farmer",
    "job_Plywood",
    "job_Wrought_Iron",
    "craftPlywood",
    "foundry_w_Plywood",
    "foundry_p_Plywood",
    "production_Alloy",
    "smelter_fuel_p_Oil",
    "droid_w_Adamantite",
    "replicator_Food",
    "batcity-mill",
    "bld_p_city-mill",
    "arpa_launch_facility",
    "res_storageFood",
    "res_min_storeFood",
    "res_buy_p_Food",
    "res_trade_buy_Food",
    "res_galaxy_w_Deuterium",
    "buyFood",
    "sellFood",
    "res_alchemy_Crystal",
    "spell_w_farmer",
    "res_ejectFood",
    "res_supplyFood",
    "res_naniteFood",
    "tickRate",
    "autoBuild",
    "challenge_plasmid",
    "biome_w_forest",
    "trait_w_smart",
    "extra_w_Achievement",
    "log_mercenary",
    "mTrait_hardy",
    "mTrait_p_hardy",
    "mTrait_w_hardy",
    "ocularPower_hardy",
    "ocularPower_p_hardy",
    "mutableTrait_p_creative",
    "mutableTrait_purge_creative",
    "mutableTrait_gain_creative",
    "mutableTrait_reset_creative",
  ];
  for (const key of keys) {
    const owners = SETTINGS_SECTION_POLICIES.filter((policy) =>
      policy.ownsDynamicKey(key),
    ).map((policy) => policy.id);
    assert.ok(
      owners.length <= 1,
      `${key} is claimed by more than one section: ${owners.join(", ")}`,
    );
  }
}

// The regression this ownership model exists for: Production owns crafter keys only.
{
  const production = findSettingsSectionPolicy("production");
  const jobs = findSettingsSectionPolicy("job");
  assert.equal(production.ownsDynamicKey("job_Plywood"), true);
  assert.equal(production.ownsDynamicKey("foundry_w_Plywood"), true);
  assert.equal(production.ownsDynamicKey("craftPlywood"), true);
  assert.equal(production.ownsDynamicKey("job_p_farmer"), false);
  assert.equal(production.ownsDynamicKey("job_b1_farmer"), false);
  assert.equal(production.ownsDynamicKey("job_farmer"), false);
  assert.equal(jobs.ownsDynamicKey("job_p_farmer"), true);
  assert.equal(jobs.ownsDynamicKey("job_Plywood"), false);
}

// --- reset isolation over a real lifecycle ---------------------------------------------------

// Every case seeds one override the section owns, one a neighbouring section owns, and one
// global. Each id below is stale on purpose: no live catalog in the fixture produces it, so
// only the section's own ownership rule can remove it.
const RESET_CASES = [
  {
    section: "production",
    own: ["job_Plywood", "foundry_w_Plywood", "craftPlywood"],
    other: ["job_p_farmer", "job_b1_farmer", "job_farmer"],
  },
  {
    section: "job",
    own: ["job_p_farmer", "job_b1_farmer"],
    other: ["job_Plywood", "foundry_w_Plywood"],
  },
  {
    section: "market",
    own: ["res_trade_buy_Old", "buyOld", "sellOld"],
    other: ["res_storageOld", "res_min_storeOld"],
  },
  {
    section: "storage",
    own: ["res_storageOld", "res_max_storeOld"],
    other: ["res_trade_buy_Old", "buyOld"],
  },
  {
    section: "building",
    own: ["batold-building", "bld_p_old-building"],
    other: ["arpa_old_project"],
  },
  {
    section: "project",
    own: ["arpa_old_project", "arpa_w_old_project"],
    other: ["batold-building", "bld_p_old-building"],
  },
  {
    section: "minortrait",
    own: [
      "mTrait_old_trait",
      "mTrait_p_old_trait",
      "mTrait_w_old_trait",
      "ocularPower_old_trait",
    ],
    other: ["mutableTrait_p_old_trait", "job_p_farmer", "batold-building"],
  },
  {
    section: "mutabletrait",
    own: [
      "mutableTrait_p_old_trait",
      "mutableTrait_purge_old_trait",
      "mutableTrait_gain_old_trait",
      "mutableTrait_reset_old_trait",
    ],
    other: ["mTrait_old_trait", "mTrait_p_old_trait", "job_p_farmer"],
  },
  {
    section: "evolution",
    own: ["challenge_old_challenge"],
    other: ["mTrait_old_trait", "biome_w_old_biome", "job_p_farmer"],
  },
  {
    section: "planet",
    own: ["biome_w_old_biome", "trait_w_old_trait", "extra_w_old_extra"],
    other: ["challenge_old_challenge", "mTrait_old_trait", "job_p_farmer"],
  },
  {
    section: "logging",
    own: ["log_old_type"],
    other: ["challenge_old_challenge", "biome_w_old_biome", "job_p_farmer"],
  },
];

for (const { section, own, other } of RESET_CASES) {
  const { lifecycle, settings } = createSettingsFixture();
  lifecycle.initialize();
  const globals = ["tickRate", "masterScriptToggle"];
  seedOverrides(settings, [...own, ...other, ...globals]);
  lifecycle.resetSection(section);
  const overrides = settings.readRaw().overrides;
  for (const key of own) {
    assert.equal(
      overrides[key],
      undefined,
      `${section} reset should remove its own stale override ${key}`,
    );
  }
  for (const key of [...other, ...globals]) {
    assert.notEqual(
      overrides[key],
      undefined,
      `${section} reset must not remove ${key}`,
    );
  }
}

// The required Production/Jobs regression, spelled out end to end over the real record.
{
  const { lifecycle, settings } = createSettingsFixture();
  lifecycle.initialize();
  seedOverrides(settings, [
    "job_p_farmer",
    "job_b1_farmer",
    "job_Plywood",
    "foundry_w_Plywood",
  ]);
  lifecycle.resetSection("production");
  const overrides = settings.readRaw().overrides;
  assert.equal(overrides.job_Plywood, undefined);
  assert.equal(overrides.foundry_w_Plywood, undefined);
  assert.notEqual(overrides.job_p_farmer, undefined);
  assert.notEqual(overrides.job_b1_farmer, undefined);
}

// An unknown section id changes nothing at all.
{
  const { lifecycle, settings } = createSettingsFixture();
  lifecycle.initialize();
  seedOverrides(settings, ["job_p_farmer"]);
  const before = JSON.stringify(settings.readRaw());
  lifecycle.resetSection("nosuchsection");
  assert.equal(JSON.stringify(settings.readRaw()), before);
}
