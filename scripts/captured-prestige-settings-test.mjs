/**
 * Prestige settings, end to end.
 *
 * The exposed set is asserted both ways: every control drawn must reach a captured consumer, and
 * every control withheld must stay undrawn until its runtime semantics exist.
 */

import assert from "node:assert/strict";

import {
  CAPTURED_PRESTIGE_SETTINGS,
  createCapturedPrestigeSettingsAdapter,
} from "../src/adapters/evolve/progression/prestige/captured-prestige-settings.ts";
import { createPrestigeSettingsReadModel } from "../src/domain/progression/prestige/prestige-settings.ts";
import { PRESTIGE_TYPES } from "../src/domain/progression/prestige/prestige-types.ts";
import { createCapturedMadPrestige } from "../src/adapters/evolve/progression/prestige/captured-mad.ts";
import { createCapturedProjectContextReader } from "../src/adapters/evolve/progression/research/captured-project-context.ts";
import { createCapturedBuildPolicyReader } from "../src/adapters/evolve/progression/build/captured-build-policy.ts";
import { createCapturedTechConflictReader } from "../src/adapters/evolve/progression/research/captured-tech-conflicts.ts";
import { createCapturedSettingsPage, edit } from "./captured-settings-page.mjs";

const WITHHELD = [
  "prestigeWaitAT",
  "prestigeDemonicPotential",
  "prestigeCustomRaceMode",
];

// --- the read model offers exactly the exposed set, with no empty headers -----------------------

{
  const model = createCapturedPrestigeSettingsAdapter().read();
  const drawn = model.controls
    .filter((control) => control.kind !== "header")
    .map((control) => control.settingName);
  assert.deepEqual(
    [...drawn].sort(),
    [...CAPTURED_PRESTIGE_SETTINGS].sort(),
    "the read model must offer exactly the traced set",
  );
  for (const setting of WITHHELD) {
    assert.ok(!drawn.includes(setting), `${setting} must stay withheld`);
  }

  // A header is dropped only when nothing survives under it. "Matrix" holds the vaccination
  // strategy the research exclusions now consume, so it is back.
  const headers = model.controls
    .filter((control) => control.kind === "header")
    .map((control) => control.label);
  assert.ok(headers.includes("Matrix"));
  assert.ok(headers.includes("Demonic Infusion"));
  assert.ok(headers.includes("Mutual Assured Destruction"));

  // The unfiltered model still carries everything, so the filter is the only difference.
  const full = createPrestigeSettingsReadModel({ prestigeOptions: [] });
  for (const setting of WITHHELD) {
    assert.ok(
      full.controls.some(
        (control) =>
          control.kind !== "header" && control.settingName === setting,
      ),
      `${setting} must still exist in the unfiltered model`,
    );
  }

  // Every prestige the script can aim for is selectable.
  const type = model.controls.find(
    (control) =>
      control.kind === "select" && control.settingName === "prestigeType",
  );
  assert.deepEqual(
    type.options.map((option) => option.val),
    PRESTIGE_TYPES.map((entry) => entry.val),
  );
}

// --- the section draws the exposed set and nothing else -----------------------------------------

{
  const page = createCapturedSettingsPage();
  assert.equal(
    page.root.querySelectorAll("#script_prestigeSettings").length,
    1,
    "Prestige must be drawn by the captured panel",
  );
  assert.deepEqual(page.logged, []);
  for (const setting of CAPTURED_PRESTIGE_SETTINGS) {
    assert.equal(
      page.root.querySelectorAll(`.script_${setting}`).length,
      1,
      `${setting} should be drawn once`,
    );
  }
  for (const setting of WITHHELD) {
    assert.equal(
      page.root.querySelectorAll(`.script_${setting}`).length,
      0,
      `${setting} has no captured consumer and must not be drawn`,
    );
  }
}

// --- prestigeType reaches the captured prestige branch ------------------------------------------

/** The captured prestige adapter over a minimal root, with no action row offered. */
function prestigeRuntime(readSettings) {
  const root = {
    settings: { qKey: false, touch: false },
    race: { species: "human", universe: "standard" },
    stats: { achieve: {}, terraform: 0, ascend: 0, descend: 0 },
    tech: {},
    civic: {
      mad: { display: true, armed: false },
      garrison: { workers: 0, max: 0, crew: 0 },
    },
    resource: { Population: { amount: 0, max: 0 } },
  };
  const goals = [];
  return {
    root,
    goals,
    adapter: createCapturedMadPrestige({
      rootState: { readRoot: () => root },
      controls: {
        resolve: () => undefined,
        invoke: () => ({ ok: false, reason: "unknown-method" }),
        capturedElementIds: () => [],
      },
      readSettings,
      readGoal: () => "Standard",
      setGoal: (goal) => goals.push(goal),
      readOfferedTechs: () => [],
      readBuildingResetActions: () => new Set(),
    }),
  };
}

const branchOf = (runtime) =>
  runtime.adapter.reader.samplePrestige().branch.type;

{
  const page = createCapturedSettingsPage();
  edit(page, "prestigeType", "cataclysm");
  assert.equal(page.settings.readRaw()["prestigeType"], "cataclysm");
  assert.equal(page.effective["prestigeType"], "cataclysm");

  assert.equal(
    branchOf(prestigeRuntime(() => page.effective)),
    "cataclysm",
    "the edited prestige type must select the captured branch",
  );

  edit(page, "prestigeType", "apocalypse");
  assert.equal(branchOf(prestigeRuntime(() => page.effective)), "apocalypse");

  edit(page, "prestigeType", "mad");
  assert.equal(branchOf(prestigeRuntime(() => page.effective)), "mad");

  edit(page, "prestigeType", "none");
  assert.equal(branchOf(prestigeRuntime(() => page.effective)), "noop");
}

// --- the A.R.P.A. policy settings reach the captured project context -----------------------------

/** Samples answer for exactly the ids they were asked about, and a fresh run has none of them. */
function projectContext(settings, { manaRate = 0, witchHunter = false } = {}) {
  const zeroes = (ids) => new Map(ids.map((id) => [id, 0]));
  const ranks = (ids) =>
    new Map(
      [...ids].map((id) => [id, witchHunter && id === "witch_hunter" ? 1 : 0]),
    );
  return createCapturedProjectContextReader({
    traits: { readRaceTraits: (ids) => ({ ranks: ranks(ids) }) },
    tech: { readTech: (ids) => ({ levels: zeroes([...ids]) }) },
    resources: {
      readResources: (ids) => ({
        resources: new Map(
          [...ids].map((id) => [
            id,
            {
              amount: 0,
              maximum: 0,
              rateOfChange: id === "Mana" ? manaRate : 0,
              tradable: false,
            },
          ]),
        ),
      }),
    },
    achievements: {
      readAchievementState: (achievementIds, bananaObjectiveIds) => ({
        stars: zeroes([...achievementIds]),
        bananaObjectives: new Map(
          [...bananaObjectiveIds].map((id) => [id, false]),
        ),
      }),
    },
    readSettings: () => settings,
  }).readContext();
}

{
  // The prestige-driven project overrides are gated on autoPrestige, as the runtime gates them.
  const page = createCapturedSettingsPage({ autoPrestige: true });

  // An early run with the toggle on suppresses A.R.P.A. entirely; with it off it does not.
  edit(page, "prestigeMADIgnoreArpa", true);
  const blocked = projectContext(page.effective);
  edit(page, "prestigeMADIgnoreArpa", false);
  const allowed = projectContext(page.effective);
  assert.notDeepEqual(
    blocked,
    allowed,
    "the early-A.R.P.A. toggle must change the captured project context",
  );

  // The Mana Syphon threshold decides when the final-stage weighting applies, against a mana
  // regeneration the run is actually producing.
  edit(page, "prestigeType", "vacuum");
  edit(page, "prestigeVacuumMana", 100);
  const reached = projectContext(page.effective, { manaRate: 500 });
  assert.notEqual(reached.overrides["syphon"].weightMultiplier, undefined);
  edit(page, "prestigeVacuumMana", 1000);
  assert.equal(
    projectContext(page.effective, { manaRate: 500 }).overrides["syphon"]
      .weightMultiplier,
    undefined,
    "raising the required regeneration must withdraw the final-stage weighting",
  );

  // "Ignore useless buildings" excludes the Mana Syphon on a Witch Hunter run aiming elsewhere.
  edit(page, "prestigeType", "demonic");
  edit(page, "prestigeBioseedConstruct", true);
  assert.equal(
    projectContext(page.effective, { witchHunter: true }).overrides["syphon"]
      .excluded,
    true,
  );
  edit(page, "prestigeBioseedConstruct", false);
  assert.equal(
    projectContext(page.effective, { witchHunter: true }).overrides["syphon"],
    undefined,
  );
}

// --- the Soul Gem reserve reaches the captured build policy --------------------------------------

{
  const page = createCapturedSettingsPage();
  const policy = () =>
    createCapturedBuildPolicyReader({
      rootState: { readRoot: () => undefined },
      controls: {
        resolve: () => undefined,
        invoke: () => ({ ok: false, reason: "unknown-method" }),
        capturedElementIds: () => [],
      },
      getSettings: () => page.effective,
      readKnowledge: () => ({
        levels: {
          knowledgeCapacity: 0,
          knowledgeRequiredByBuildTargets: 0,
        },
        knowledgeRequiredByTechs: 0,
      }),
      costs: { readCost: () => undefined },
    })();

  edit(page, "prestigeType", "whitehole");
  edit(page, "prestigeWhiteholeSaveGems", true);
  assert.equal(policy().saveWhiteholeGems, true);

  edit(page, "prestigeWhiteholeSaveGems", false);
  assert.equal(policy().saveWhiteholeGems, false);

  // The reserve only applies to the prestige it is for.
  edit(page, "prestigeWhiteholeSaveGems", true);
  edit(page, "prestigeType", "bioseed");
  assert.equal(policy().saveWhiteholeGems, false);
}

// --- an override changes behaviour without mutating raw storage ----------------------------------

{
  const page = createCapturedSettingsPage();
  edit(page, "prestigeType", "mad");
  page.settings.readRaw()["overrides"]["prestigeType"] = [
    {
      type1: "Boolean",
      arg1: true,
      cmp: "==",
      type2: "Boolean",
      arg2: true,
      ret: "cataclysm",
    },
  ];
  page.refreshEffectiveSettings();
  assert.equal(page.settings.readRaw()["prestigeType"], "mad");
  assert.equal(page.effective["prestigeType"], "cataclysm");
  assert.equal(branchOf(prestigeRuntime(() => page.effective)), "cataclysm");
}

// --- the Prestige reset restores defaults and keeps unrelated overrides --------------------------

{
  const page = createCapturedSettingsPage();
  edit(page, "prestigeType", "bioseed");
  edit(page, "prestigeBioseedProbes", 99);
  edit(page, "prestigeMADWait", false);
  const overrides = page.settings.readRaw()["overrides"];
  overrides["autoBuild"] = [
    {
      type1: "Boolean",
      arg1: true,
      cmp: "==",
      type2: "Boolean",
      arg2: true,
      ret: true,
    },
  ];

  page.root.querySelectorAll("#script_resetprestige")[0].dispatch("click");

  const raw = page.settings.readRaw();
  assert.equal(raw["prestigeType"], "none");
  assert.notEqual(raw["prestigeBioseedProbes"], 99);
  assert.notEqual(raw["overrides"]["autoBuild"], undefined);
}

// --- the two controls the research exclusions brought back ---------------------------------------

/**
 * The owning subsystem for both: the captured research exclusions. A page edit must change what it
 * decides about a real offered technology, which is what "consumed" means here.
 */
function conflictFor(page, elementId, root = {}) {
  return createCapturedTechConflictReader({
    rootState: {
      readRoot: () => ({ race: { species: "human", gods: "none" }, ...root }),
    },
    readSettings: () => page.effective,
    resources: {
      readResources: (ids) =>
        Object.freeze({
          resources: new Map(
            [...ids].map((id) => [
              id,
              {
                unlocked: true,
                amount: 0,
                max: 0,
                rateOfChange: 0,
                storageRatio: 0,
              },
            ]),
          ),
        }),
    },
  }).evaluate({ elementId, cost: {}, generation: 1 });
}

{
  // The Dark Energy Bomb is drawn, and turning it on is what stops the exclusion from rejecting it.
  const page = createCapturedSettingsPage();
  assert.equal(
    page.root.querySelectorAll(".script_prestigeDemonicBomb").length,
    1,
    "the Demonic Bomb toggle must be drawn once",
  );
  edit(page, "prestigeType", "demonic");
  page.refreshEffectiveSettings();
  assert.deepEqual(conflictFor(page, "tech-dark_bomb"), {
    status: "conflict",
    conflict: { code: "dark-bomb-disabled" },
  });

  edit(page, "prestigeDemonicBomb", true);
  page.refreshEffectiveSettings();
  assert.deepEqual(conflictFor(page, "tech-dark_bomb"), { status: "none" });
}

{
  // The vaccination select offers every strategy, and picking one excludes the others.
  const page = createCapturedSettingsPage();
  const [control] = page.root.querySelectorAll(".script_prestigeVaxStrat");
  assert.ok(control, "the vaccination strategy select must be drawn");

  assert.deepEqual(conflictFor(page, "tech-vax_strat2"), {
    status: "conflict",
    conflict: { code: "vaccination-strategy" },
  });

  edit(page, "prestigeVaxStrat", "strat2");
  assert.equal(page.settings.readRaw()["prestigeVaxStrat"], "strat2");
  page.refreshEffectiveSettings();
  assert.deepEqual(conflictFor(page, "tech-vax_strat2"), { status: "none" });
  assert.deepEqual(conflictFor(page, "tech-vax_strat3"), {
    status: "conflict",
    conflict: { code: "vaccination-strategy" },
  });
}

console.log("captured Prestige settings checks passed");
