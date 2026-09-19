/**
 * Ordinary settings-page reachability for the four sections whose captured adapters were built but
 * never drawn there: Government, Fleet, Trigger and Research.
 *
 * Every case drives the real captured panel — `ensurePanel` draws the page, a DOM control the
 * player would touch makes the edit — and then asserts the existing captured consumer of that
 * setting. Rendering is only half the claim; the other half is that an ordinary-page edit reaches
 * the same effective value the runtime reads.
 */

import assert from "node:assert/strict";

import { createCapturedGovernmentAutomation } from "../src/adapters/evolve/civic/captured-government.ts";
import { createCapturedFleetAutomation } from "../src/adapters/evolve/combat/captured-fleet.ts";
import { triggersNeedGrantedTechs } from "../src/adapters/evolve/progression/build/captured-triggers.ts";
import { createCapturedSettingsPage, edit } from "./captured-settings-page.mjs";
import { element } from "./dom-fixture.mjs";

const SECTIONS = ["government", "fleet", "trigger", "research"];

/** The captured root the Government reader needs; only `govInterim` is under test here. */
const governmentRoot = {
  race: { governor: { tasks: {} } },
  tech: { governor: 1, govern: 3, q_factory: 1 },
  civic: { govern: { type: "democracy" } },
};

/** The captured galaxy root the Fleet reader needs before it will sample anything at all. */
const fleetShips = [
  "scout_ship",
  "corvette_ship",
  "frigate_ship",
  "cruiser_ship",
  "dreadnought",
];
const fleetRoot = {
  race: {},
  tech: { piracy: 1 },
  galaxy: {
    defense: Object.fromEntries(
      [
        "gxy_gateway",
        "gxy_stargate",
        "gxy_gorddon",
        "gxy_alien1",
        "gxy_alien2",
        "gxy_chthonian",
      ].map((region) => [
        region,
        Object.fromEntries(fleetShips.map((ship) => [ship, 0])),
      ]),
    ),
    ...Object.fromEntries(fleetShips.map((ship) => [ship, { count: 0 }])),
  },
  resource: { Knowledge: { max: 9000000 } },
};
const fleetControls = {
  resolve: (elementId) =>
    elementId === "fleet"
      ? { elementId, generation: 1, methods: ["add", "sub"] }
      : undefined,
  invoke: () => ({ ok: true, value: undefined }),
  capturedElementIds: () => ["fleet"],
};

function readGovernment(page) {
  return createCapturedGovernmentAutomation({
    rootState: { readRoot: () => governmentRoot },
    controls: {
      resolve: () => undefined,
      invoke: () => ({ ok: false, reason: "unknown-method" }),
      capturedElementIds: () => [],
    },
    readSettings: () => page.effective,
  }).reader.read();
}

function readFleet(page) {
  return createCapturedFleetAutomation({
    rootState: { readRoot: () => fleetRoot },
    controls: fleetControls,
    readDemand: () => ({ isDemanded: () => false }),
    readSettings: () => page.effective,
  }).reader.read();
}

// --- 1. all four sections are drawn by the ordinary settings page -------------------------------

{
  const page = createCapturedSettingsPage();
  for (const section of SECTIONS) {
    assert.equal(
      page.root.querySelectorAll(`#script_${section}Settings`).length,
      1,
      `${section} must be drawn once by the ordinary settings page`,
    );
    assert.equal(
      page.root.querySelectorAll(`#script_reset${section}`).length,
      1,
      `${section} must offer its reset once`,
    );
  }
  // A representative real control of each section reaches the ordinary page, not only the modal.
  for (const settingName of [
    "generalRequestedTaxRate",
    "fleetOuterCrew",
    "userResearchTheology_1",
  ]) {
    assert.equal(
      page.root.querySelectorAll(`.script_${settingName}`).length,
      1,
      `${settingName} should be drawn once`,
    );
  }
  assert.equal(
    page.root.querySelectorAll("#script_trigger_add").length,
    1,
    "the Trigger section should offer its add button once",
  );
  assert.deepEqual(
    page.diagnostics,
    [],
    "a ported section must report no unported diagnostic",
  );
  assert.deepEqual(page.logged, []);
  // A second draw must not double anything: `buildScriptSettings` is called on every panel pass.
  page.panel.ensurePanel();
  for (const section of SECTIONS) {
    assert.equal(
      page.root.querySelectorAll(`#script_${section}Settings`).length,
      1,
      `${section} must still be drawn once after a redraw`,
    );
  }
}

// --- 2. a Government edit reaches the captured government reader --------------------------------

{
  const page = createCapturedSettingsPage();
  assert.notEqual(readGovernment(page).govInterim, "technocracy");
  edit(page, "govInterim", "technocracy");
  assert.equal(page.settings.readRaw()["govInterim"], "technocracy");
  page.refreshEffectiveSettings();
  assert.equal(readGovernment(page).govInterim, "technocracy");

  edit(page, "autoGovernment", true);
  page.refreshEffectiveSettings();
  assert.equal(readGovernment(page).isEnabled, true);
}

// --- 3. a Fleet edit reaches the captured fleet reader ------------------------------------------

{
  const page = createCapturedSettingsPage();
  edit(page, "fleetMaxCover", false);
  assert.equal(page.settings.readRaw()["fleetMaxCover"], false);
  page.refreshEffectiveSettings();
  assert.equal(readFleet(page).maximumCoverage, false);

  edit(page, "fleetMaxCover", true);
  page.refreshEffectiveSettings();
  assert.equal(readFleet(page).maximumCoverage, true);
}

// --- 4. a Trigger edit reaches the captured trigger sample ---------------------------------------

{
  const page = createCapturedSettingsPage();
  edit(page, "autoTrigger", true);
  page.refreshEffectiveSettings();
  assert.equal(
    triggersNeedGrantedTechs(page.effective),
    false,
    "no trigger row yet, so no granted-tech sample is owed",
  );

  page.root.querySelectorAll("#script_trigger_add")[0].dispatch("click");
  assert.equal(page.settings.readRaw()["triggers"].length, 1);
  page.refreshEffectiveSettings();
  assert.equal(
    triggersNeedGrantedTechs(page.effective),
    true,
    "the added trigger researches, so the runtime must sample granted techs",
  );
}

// --- 5. a Research edit reaches the effective layer ---------------------------------------------

{
  const page = createCapturedSettingsPage();
  assert.equal(page.effective["userResearchTheology_1"], "auto");
  edit(page, "userResearchTheology_1", "tech-fanaticism");
  assert.equal(
    page.settings.readRaw()["userResearchTheology_1"],
    "tech-fanaticism",
  );
  page.refreshEffectiveSettings();
  assert.equal(page.effective["userResearchTheology_1"], "tech-fanaticism");
}

// --- 6. each section resets through the lifecycle and keeps unrelated overrides -----------------

{
  const page = createCapturedSettingsPage();
  const defaults = { ...page.settings.readRaw() };
  edit(page, "govInterim", "technocracy");
  edit(page, "fleetMaxCover", false);
  edit(page, "userResearchTheology_1", "tech-fanaticism");
  edit(page, "autoTrigger", true);
  page.root.querySelectorAll("#script_trigger_add")[0].dispatch("click");
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

  for (const section of SECTIONS) {
    page.root.querySelectorAll(`#script_reset${section}`)[0].dispatch("click");
  }

  const raw = page.settings.readRaw();
  assert.equal(raw["govInterim"], defaults["govInterim"]);
  assert.equal(raw["fleetMaxCover"], defaults["fleetMaxCover"]);
  assert.equal(raw["userResearchTheology_1"], "auto");
  assert.equal(raw["autoTrigger"], false);
  assert.deepEqual(raw["triggers"], []);
  assert.notEqual(
    raw["overrides"]["autoBuild"],
    undefined,
    "a section reset must leave an unrelated override alone",
  );
}

// --- 7. the Government and Fleet secondary buttons still draw, and share the section state ------

{
  const page = createCapturedSettingsPage();
  const government = element("div", { id: "government" });
  const tabs = element("div");
  tabs.classList.add("tabs");
  tabs.appendChild(element("ul"));
  government.appendChild(tabs);
  page.root.appendChild(government);
  const fleet = element("div", { id: "hfleet" });
  fleet.appendChild(element("h3"));
  page.root.appendChild(fleet);
  page.panel.ensurePanel();

  // The ordinary page drew each section once; the secondary surface is a second rendering of the
  // same read model under the `c_` prefix, so the section itself must still exist exactly once.
  for (const [buttonId, sectionId, settingName] of [
    ["s-government-options", "government", "generalRequestedTaxRate"],
    ["s-fleet-options", "fleet", "fleetOuterCrew"],
  ]) {
    page.root.querySelectorAll(`#${buttonId}`)[0].dispatch("click");
    assert.equal(
      page.root.querySelectorAll(`#scriptModalBody .script_${settingName}`)
        .length,
      1,
      `${sectionId} options should render ${settingName}`,
    );
    assert.equal(
      page.root.querySelectorAll(`#script_${sectionId}Settings`).length,
      1,
      `${sectionId} must still own one ordinary section after its modal opened`,
    );
  }

  // An edit made in the modal is the same raw setting the ordinary section edits.
  const [modalControl] = page.root.querySelectorAll(
    "#scriptModalBody .script_fleetOuterCrew",
  );
  modalControl.value = "7";
  modalControl.dispatch("change");
  assert.equal(page.settings.readRaw()["fleetOuterCrew"], 7);

  assert.deepEqual(page.diagnostics, []);
  assert.deepEqual(page.logged, []);
}

console.log("captured settings reachability checks passed");
