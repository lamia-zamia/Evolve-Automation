/**
 * Captured planet selection: metadata capture, multi-candidate ranking, fail-closed behaviour,
 * the committed-selection postcondition, and the Planet Weighting table that feeds it.
 */

import assert from "node:assert/strict";

import { createCapturedPlanetSelection } from "../src/adapters/evolve/progression/evolution/captured-planet-selection.ts";
import { readCapturedPlanetMetadata } from "../src/adapters/evolve/progression/evolution/captured-planet-metadata.ts";
import { runCapturedPlanetSelection } from "../src/application/captured-planet-selection.ts";
import { computePlanetDefaults } from "../src/domain/settings-defaults.ts";
import {
  biomeList,
  extraList,
  planetBiomes,
  planetTraits,
  traitList,
} from "../src/adapters/evolve/runtime-catalogs.ts";
import { createCapturedSettingsPage, edit } from "./captured-settings-page.mjs";

const planetDefaults = computePlanetDefaults({
  biomeList,
  planetBiomes,
  traitList,
  planetTraits,
  extraList,
}).def;

/**
 * One drawn planet, described the way the game renders it: an id of capitalized biome plus a
 * number, a title of trait labels then biome label then that number, a `set_planet` summary, and
 * the `.pGeo` rows the popover shows.
 */
function planet({ biome, num, traits = [], orbit = 365, geology = [] }) {
  const label = biome.charAt(0).toUpperCase() + biome.slice(1);
  const traitLabels = traits.map(
    (trait) => trait.charAt(0).toUpperCase() + trait.slice(1),
  );
  const title = [...traitLabels, label, String(num)].join(" ");
  return {
    elementId: `${label}${num}`,
    title,
    summary: `${title} is a ${label} planet with an orbital period of ${orbit} days.`,
    geology,
  };
}

function geo(label, { percent, beneficial } = {}) {
  return { label, beneficial, percent };
}

/** The captured planet selection adapter over a set of drawn rows. */
function createSelection(
  details,
  { settings = {}, root: rootOverrides, effectiveSettings } = {},
) {
  const root = {
    race: { universe: "standard", seeded: true, chose: false, gods: null },
    stats: { achieve: {} },
    city: {},
    ...rootOverrides,
  };
  const clicked = [];
  // `effectiveSettings` is passed through untouched: the captured effective layer delegates to
  // raw through its prototype, so copying it would drop every value the player did not override.
  const effective = effectiveSettings ?? {
    userPlanetTargetName: "weighting",
    ...planetDefaults,
    ...settings,
  };
  const byId = new Map(details.map((detail) => [detail.elementId, detail]));
  const hovered = [];
  const selection = createCapturedPlanetSelection({
    rootState: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    drawnActions: {
      read: () => details.map((detail) => ({ id: detail.elementId, cost: {} })),
      exists: () => details.length > 0,
    },
    readSettings: () => effective,
    controls: {
      selectPlanet: (elementId) => {
        clicked.push(elementId);
        // The game's click handler commits the choice; a fixture that skipped this would be
        // testing the click rather than the selection.
        if (root.race.commits !== false) root.race.chose = elementId;
        return true;
      },
    },
    metadata: {
      readPlanetDetail: (elementId) => {
        hovered.push(elementId);
        return byId.get(elementId);
      },
    },
  });
  return { root, clicked, hovered, selection, effective };
}

// --- metadata parsing ---------------------------------------------------------------------------

{
  const parsed = readCapturedPlanetMetadata(
    planet({
      biome: "volcanic",
      num: 4821,
      traits: ["toxic", "dense"],
      orbit: 412,
      geology: [
        geo("Copper", { percent: 18, beneficial: true }),
        geo("Iron", { beneficial: false }),
      ],
    }),
  );
  assert.deepEqual(parsed.candidate, {
    id: "Volcanic4821",
    biome: "volcanic",
    traits: ["toxic", "dense"],
    orbit: 412,
    geology: { Copper: 0.18, Iron: -0.01 },
  });
  assert.equal(parsed.revealedDeposits, 1);

  // A planet the game drew with no trait labels takes the weighting table's `none` entry.
  assert.deepEqual(
    readCapturedPlanetMetadata(planet({ biome: "eden", num: 7 })).candidate
      .traits,
    ["none"],
  );

  // Fail closed, one case per recoverable field.
  const unparsable = [
    { ...planet({ biome: "forest", num: 12 }), elementId: "Forest" },
    { ...planet({ biome: "forest", num: 12 }), title: "Sparkly Forest 12" },
    { ...planet({ biome: "forest", num: 12 }), summary: "no title here" },
    planet({
      biome: "forest",
      num: 12,
      geology: [geo("Unobtainium", { beneficial: true })],
    }),
  ];
  for (const detail of unparsable) {
    assert.equal(
      readCapturedPlanetMetadata(detail),
      undefined,
      `${JSON.stringify(detail.title)} must not parse`,
    );
  }
}

// --- 1. one candidate takes the safe path, and never opens a popover ---------------------------

{
  const one = planet({ biome: "grassland", num: 100 });
  const fixture = createSelection([one]);
  assert.equal(
    runCapturedPlanetSelection({
      reader: fixture.selection.reader,
      executor: fixture.selection.executor,
    }).status,
    "succeeded",
  );
  assert.deepEqual(fixture.clicked, ["Grassland100"]);
  assert.deepEqual(
    fixture.hovered,
    [],
    "a sole row needs no ranking and must not be hovered",
  );
}

// --- 2. several candidates are ranked by weighting -----------------------------------------------

{
  const candidates = [
    planet({ biome: "desert", num: 1 }),
    planet({ biome: "eden", num: 2 }),
  ];
  // Shipped defaults weight eden highest of all biomes.
  const fixture = createSelection(candidates);
  runCapturedPlanetSelection({
    reader: fixture.selection.reader,
    executor: fixture.selection.executor,
  });
  assert.deepEqual(fixture.clicked, ["Eden2"]);
  assert.deepEqual(
    fixture.hovered,
    ["Desert1", "Eden2"],
    "every candidate row is sampled exactly once",
  );

  const sample = createSelection(candidates).selection.reader.sample();
  assert.notEqual(sample.ranking, undefined);
  assert.equal(sample.ranking.planets.length, 2);
}

// --- 3. editing a biome weight changes the result ------------------------------------------------

{
  const candidates = [
    planet({ biome: "desert", num: 1 }),
    planet({ biome: "eden", num: 2 }),
  ];
  const fixture = createSelection(candidates, {
    settings: { biome_w_desert: 10_000 },
  });
  runCapturedPlanetSelection({
    reader: fixture.selection.reader,
    executor: fixture.selection.executor,
  });
  assert.deepEqual(fixture.clicked, ["Desert1"]);
}

// --- 4. editing a trait weight changes the result ------------------------------------------------

{
  const candidates = [
    planet({ biome: "forest", num: 1, traits: ["toxic"] }),
    planet({ biome: "forest", num: 2, traits: ["mellow"] }),
  ];
  const first = createSelection(candidates, {
    settings: { trait_w_toxic: 5_000, trait_w_mellow: 0 },
  });
  runCapturedPlanetSelection({
    reader: first.selection.reader,
    executor: first.selection.executor,
  });
  assert.deepEqual(first.clicked, ["Forest1"]);

  const second = createSelection(candidates, {
    settings: { trait_w_toxic: 0, trait_w_mellow: 5_000 },
  });
  runCapturedPlanetSelection({
    reader: second.selection.reader,
    executor: second.selection.executor,
  });
  assert.deepEqual(second.clicked, ["Forest2"]);
}

// --- 5. geology weighting, including the revealed-percentage branch -------------------------------

{
  const candidates = [
    planet({
      biome: "forest",
      num: 1,
      geology: [geo("Copper", { percent: 25, beneficial: true })],
    }),
    planet({
      biome: "forest",
      num: 2,
      geology: [geo("Copper", { percent: 5, beneficial: true })],
    }),
  ];
  // `miners_dream` level 1 is the reveal budget that made the game print one percentage a planet.
  const root = {
    race: { universe: "standard", seeded: true, chose: false, gods: null },
    stats: { achieve: { miners_dream: { l: 1 } } },
  };
  const fixture = createSelection(candidates, {
    settings: { extra_w_Copper: 10 },
    root,
  });
  runCapturedPlanetSelection({
    reader: fixture.selection.reader,
    executor: fixture.selection.executor,
  });
  assert.deepEqual(
    fixture.clicked,
    ["Forest1"],
    "the richer revealed deposit must win",
  );
}

// --- 6. a reveal count that disagrees with the achievement state fails closed --------------------

{
  const candidates = [
    planet({
      biome: "forest",
      num: 1,
      geology: [geo("Copper", { percent: 25, beneficial: true })],
    }),
    planet({ biome: "eden", num: 2 }),
  ];
  // No `miners_dream`, so the game could not have revealed a percentage. The sample is refused
  // rather than scored against a reveal rule the popover did not use.
  const fixture = createSelection(candidates);
  assert.equal(fixture.selection.reader.sample().ranking, undefined);
  runCapturedPlanetSelection({
    reader: fixture.selection.reader,
    executor: fixture.selection.executor,
  });
  assert.deepEqual(
    fixture.clicked,
    [],
    "two candidates with no usable ranking must select nothing",
  );
}

// --- 7. missing metadata for one row fails closed for all of them ---------------------------------

{
  const candidates = [
    planet({ biome: "desert", num: 1 }),
    planet({ biome: "eden", num: 2 }),
  ];
  const fixture = createSelection(candidates);
  fixture.selection.reader.sample();
  const broken = createCapturedPlanetSelection({
    rootState: {
      readRoot: () => fixture.root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    drawnActions: {
      read: () =>
        candidates.map((detail) => ({ id: detail.elementId, cost: {} })),
      exists: () => true,
    },
    readSettings: () => fixture.effective,
    controls: { selectPlanet: () => true },
    metadata: { readPlanetDetail: () => undefined },
  });
  assert.equal(broken.reader.sample().ranking, undefined);
}

// --- 8. ranking by most achievements, and by habitability -----------------------------------------

{
  const candidates = [
    planet({ biome: "grassland", num: 1 }),
    planet({ biome: "eden", num: 2 }),
  ];
  // Eden is the most habitable biome in the ordering, and carries the `angelic` genus, so it also
  // has the most unearned achievements on a fresh account.
  for (const targetName of ["habitable", "achieve"]) {
    const fixture = createSelection(candidates, {
      settings: { userPlanetTargetName: targetName },
    });
    runCapturedPlanetSelection({
      reader: fixture.selection.reader,
      executor: fixture.selection.executor,
    });
    assert.deepEqual(
      fixture.clicked,
      ["Eden2"],
      `${targetName} must pick Eden`,
    );
  }

  // With every eden achievement already earned, "achieve" prefers grassland's unearned ones.
  const earned = {
    race: { universe: "standard", seeded: true, chose: false, gods: null },
    stats: {
      achieve: Object.fromEntries(
        ["biome_eden", "genus_angelic", "madagascar_tree"].map((id) => [
          id,
          { l: 5 },
        ]),
      ),
    },
  };
  const fixture = createSelection(candidates, {
    settings: { userPlanetTargetName: "achieve" },
    root: earned,
  });
  const ranking = fixture.selection.reader.sample().ranking;
  assert.equal(ranking.achievementUnlocked["biome_eden"], true);
  assert.equal(ranking.achievementUnlocked["biome_grassland"], false);
}

// --- 9. a click the game did not commit is not a success ------------------------------------------

{
  const one = planet({ biome: "grassland", num: 100 });
  const fixture = createSelection([one], {
    root: {
      race: {
        universe: "standard",
        seeded: true,
        chose: false,
        gods: null,
        commits: false,
      },
      stats: { achieve: {} },
    },
  });
  const outcome = runCapturedPlanetSelection({
    reader: fixture.selection.reader,
    executor: fixture.selection.executor,
  });
  assert.deepEqual(fixture.clicked, ["Grassland100"]);
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "planet-selection-uncommitted");
}

// --- 10. the Planet Weighting table draws every weight the planner reads --------------------------

{
  const page = createCapturedSettingsPage();
  assert.equal(
    page.root.querySelectorAll("#script_planetSettings").length,
    1,
    "Planet Weighting must be drawn by the captured panel",
  );
  assert.deepEqual(page.logged, []);
  for (const key of Object.keys(planetDefaults)) {
    assert.equal(
      page.root.querySelectorAll(`.script_${key}`).length,
      1,
      `${key} should be drawn once`,
    );
  }

  // An edited weight reaches the planner through the effective record.
  edit(page, "userPlanetTargetName", "weighting");
  edit(page, "biome_w_desert", 9_999);
  assert.equal(page.effective["biome_w_desert"], 9_999);
  const fixture = createSelection(
    [planet({ biome: "desert", num: 1 }), planet({ biome: "eden", num: 2 })],
    { effectiveSettings: page.effective },
  );
  runCapturedPlanetSelection({
    reader: fixture.selection.reader,
    executor: fixture.selection.executor,
  });
  assert.deepEqual(fixture.clicked, ["Desert1"]);
}

// --- 11. the Planet reset clears stale planet weights and keeps unrelated overrides ---------------

{
  const page = createCapturedSettingsPage();
  edit(page, "biome_w_desert", 9_999);
  const overrides = page.settings.readRaw()["overrides"];
  // A weight for a biome the current catalog no longer offers: only the prefix purge can reach it.
  overrides["biome_w_retired"] = [
    {
      type1: "Boolean",
      arg1: true,
      cmp: "==",
      type2: "Boolean",
      arg2: true,
      ret: 1,
    },
  ];
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

  page.root.querySelectorAll("#script_resetplanet")[0].dispatch("click");

  const raw = page.settings.readRaw();
  assert.equal(raw["biome_w_desert"], planetDefaults["biome_w_desert"]);
  assert.equal(raw["overrides"]["biome_w_retired"], undefined);
  assert.notEqual(raw["overrides"]["autoBuild"], undefined);
}

console.log("captured planet selection and weighting checks passed");
