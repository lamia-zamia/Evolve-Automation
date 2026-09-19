import assert from "node:assert/strict";

import {
  createCapturedResearchLocalize,
  readCapturedResearchTechnologies,
  readTechElementId,
} from "../src/adapters/evolve/progression/research/captured-research-settings-catalog.ts";
import { createCapturedResearchSettingsAdapter } from "../src/adapters/evolve/progression/research/captured-research-settings.ts";
import { createRecordSettingsLifecycle } from "./test-support/captured-settings.mjs";

assert.equal(readTechElementId("mining"), "tech-mining");
assert.equal(readTechElementId("tech-mining"), "tech-mining");

function harness({ root = {}, titles = {} } = {}) {
  const controlsById = new Map(
    Object.entries(titles).map(([id, title]) => [
      id,
      { elementId: id, generation: 1, methods: [], data: { title } },
    ]),
  );
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
  return { controls, rootState };
}

// Root keys (grant shape or element shape) union captured control ids; labels
// come from the bound control with the raw id as fallback.
const game = harness({
  root: { tech: { mining: 1, "tech-club": 1 } },
  titles: { "tech-mining": "Mining", "tech-steel": "Steel" },
});
game.controls.capturedElementIds = () => ["tech-steel", "tech-club"];
game.controls.resolve = (id) =>
  id === "tech-mining"
    ? { elementId: id, generation: 1, methods: [], data: { title: "Mining" } }
    : undefined;
const technologies = readCapturedResearchTechnologies(
  game.rootState,
  game.controls,
);
assert.deepEqual(Object.keys(technologies), [
  "tech-mining",
  "tech-club",
  "tech-steel",
]);
assert.deepEqual(technologies["tech-mining"], {
  _vueBinding: "tech-mining",
  name: "Mining",
});
assert.deepEqual(technologies["tech-club"], {
  _vueBinding: "tech-club",
  name: "tech-club",
});
assert.ok(Object.isFrozen(technologies));

// No root record means controls alone; a non-record tech record is ignored.
const bare = harness({ titles: { "tech-x": "X" } });
bare.controls.capturedElementIds = () => ["tech-x", "city-farm"];
assert.deepEqual(
  Object.keys(readCapturedResearchTechnologies(bare.rootState, bare.controls)),
  ["tech-x"],
);
const odd = harness({ root: { tech: [] } });
assert.deepEqual(
  readCapturedResearchTechnologies(odd.rootState, odd.controls),
  {},
);

// Base localization keys resolve to the bound title or the element id; effect
// descriptions have no captured source and stay empty.
const localize = createCapturedResearchLocalize(game.controls);
assert.equal(localize("tech_anthropology"), "tech-anthropology");
assert.equal(localize("tech_anthropology_effect"), "");
assert.equal(localize("tech_study_desc"), "");
assert.equal(localize("other_key"), "other_key");

const raw = {
  autoResearch: true,
  userResearchTheology_1: "tech-fanaticism",
  researchIgnore: ["tech-mining"],
};
const adapter = createCapturedResearchSettingsAdapter({
  rootState: game.rootState,
  controls: game.controls,
  getSettingsRaw: () => raw,
});
const model = adapter.readResearchSettingsReadModel();
assert.equal(model.sectionId, "research");
assert.equal(model.sectionName, "Research");
assert.equal(model.controls.length, 3);
const [theologyOne, theologyTwo, ignore] = model.controls;
assert.equal(theologyOne.kind, "select");
assert.equal(theologyOne.settingName, "userResearchTheology_1");
assert.deepEqual(
  theologyOne.options.map((option) => option.val),
  ["auto", "tech-anthropology", "tech-fanaticism"],
);
assert.equal(theologyTwo.settingName, "userResearchTheology_2");
assert.equal(ignore.kind, "list");
assert.equal(ignore.settingName, "researchIgnore");
assert.deepEqual(Object.keys(ignore.list), [
  "tech-mining",
  "tech-club",
  "tech-steel",
]);

const sectionLifecycle = createRecordSettingsLifecycle({
  raw,
  rootState: game.rootState,
  controls: game.controls,
});

sectionLifecycle.resetSection("research");
assert.deepEqual(raw, {
  autoResearch: false,
  userResearchTheology_1: "auto",
  userResearchTheology_2: "auto",
  researchIgnore: ["tech-purify"],
  overrides: {},
  triggers: [],
});

console.log("captured research settings ok");
