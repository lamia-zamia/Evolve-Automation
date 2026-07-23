import assert from "node:assert/strict";

import { createResearchSettingsEvolveAdapter } from "../src/adapters/evolve/progression/research/research-settings.ts";

const technologies = {
  "tech-anthropology": {
    _vueBinding: "tech-anthropology",
    name: "Anthropology",
  },
  "tech-fanaticism": {
    _vueBinding: "tech-fanaticism",
    name: "Fanaticism",
  },
};
const game = {
  loc(key) {
    assert.equal(this, game);
    return `localized:${key}`;
  },
};

const adapter = createResearchSettingsEvolveAdapter({
  getGame: () => game,
  getTechIds: () => technologies,
});
const readModel = adapter.readResearchSettingsReadModel();

assert.equal(readModel.sectionId, "research");
assert.equal(readModel.controls.length, 3);
assert.equal(
  readModel.controls[0].options[1].label,
  "localized:tech_anthropology",
);
assert.equal(
  readModel.controls[1].options[2].hint,
  "localized:tech_deify_desc",
);
assert.equal(readModel.controls[2].list["tech-fanaticism"].name, "Fanaticism");
assert.ok(Object.isFrozen(readModel));
assert.ok(Object.isFrozen(readModel.controls));
assert.ok(Object.isFrozen(readModel.controls[2].list));

assert.throws(
  () =>
    createResearchSettingsEvolveAdapter({
      getGame: () => undefined,
      getTechIds: () => technologies,
    }).readResearchSettingsReadModel(),
  /game must be an object/,
);
assert.throws(
  () =>
    createResearchSettingsEvolveAdapter({
      getGame: () => ({}),
      getTechIds: () => technologies,
    }).readResearchSettingsReadModel(),
  /game\.loc must be a function/,
);
assert.throws(
  () =>
    createResearchSettingsEvolveAdapter({
      getGame: () => ({ loc: () => 42 }),
      getTechIds: () => technologies,
    }).readResearchSettingsReadModel(),
  /game\.loc\(tech_anthropology\) result must be a string/,
);
assert.throws(
  () =>
    createResearchSettingsEvolveAdapter({
      getGame: () => game,
      getTechIds: () => ({ "tech-bad": { name: "Bad" } }),
    }).readResearchSettingsReadModel(),
  /techIds\.tech-bad\._vueBinding must be a string/,
);
assert.throws(
  () =>
    createResearchSettingsEvolveAdapter({
      getGame: () => game,
      getTechIds: () => ({
        "tech-bad": { _vueBinding: "tech-other", name: "Bad" },
      }),
    }).readResearchSettingsReadModel(),
  /_vueBinding must match its key/,
);

console.log("Research settings Evolve adapter contract tests passed");
