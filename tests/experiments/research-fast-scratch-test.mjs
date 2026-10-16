import assert from "node:assert/strict";
import {
  patchOffersOnlyBundle,
  patchResearchSnapshot,
} from "../../experiments/research-fast-scratch.mjs";

const gameSource = `  function drawTech() {
    const new_techs = {};
    old_categories.forEach(function(category) {
      old_techs[category].forEach(function(tech_name) {
        addAction("tech", tech_name, true, false);
      });
    });
  }`;
const bundleSource = `          let captureNativeDraw = () => mechanics.captureTechDefinitionsDuring(
            () => discovery.discover(RESEARCH_TAB_PATH, {
              purpose: "research-catalog",
              ...(includeGranted ? {} : { discard: UNREAD_RESEARCH_CONTENT }),
            }),
            computedRequirementsContext
          );`;

const patchedGame = patchResearchSnapshot(gameSource);
assert.match(
  patchedGame,
  /if \(window\.__EA_RESEARCH_OFFERS_ONLY_SCRATCH__ !== true\)/,
);
assert.match(patchedGame, /researchTrace\.completed \+= completedTechCount/);
assert.match(
  patchedGame,
  /researchTrace\.callbackCount \+= completedTechCount/,
);
assert.match(
  patchedGame,
  /researchTrace\.latestOffers = Array\.from\(document\.querySelectorAll\("#tech \.action"\)/,
);
assert.match(patchedGame, /const price = row\.querySelector\("\.button"\)/);
assert.equal(
  patchedGame.includes('addAction("tech", tech_name, true, false)'),
  true,
);
assert.throws(
  () => patchResearchSnapshot(`${gameSource}\n${gameSource}`),
  /not unique/,
);
const tracedBaselineGame = patchResearchSnapshot(gameSource, {
  suppressCompleted: false,
});
assert.doesNotMatch(tracedBaselineGame, /__EA_RESEARCH_OFFERS_ONLY_SCRATCH__/);
assert.match(
  tracedBaselineGame,
  /researchTrace\.callbackCount \+= completedTechCount/,
);
const minimalGame = patchResearchSnapshot(gameSource, { instrument: false });
assert.match(
  minimalGame,
  /if \(window\.__EA_RESEARCH_OFFERS_ONLY_SCRATCH__ !== true\)/,
);
assert.doesNotMatch(minimalGame, /__EA_RESEARCH_DRAW_TRACE__/);
assert.doesNotMatch(minimalGame, /nativeNow\(\)/);

const patchedBundle = patchOffersOnlyBundle(bundleSource);
assert.match(
  patchedBundle,
  /if \(!includeGranted\) globalThis\.__EA_RESEARCH_OFFERS_ONLY_SCRATCH__ = true/,
);
assert.match(patchedBundle, /finally \{/);
assert.match(
  patchedBundle,
  /delete globalThis\.__EA_RESEARCH_OFFERS_ONLY_SCRATCH__/,
);
assert.match(
  patchedBundle,
  /else globalThis\.__EA_RESEARCH_OFFERS_ONLY_SCRATCH__ = previousScratchFlag/,
);
assert.match(
  patchedBundle,
  /try \{[\s\S]*?return mechanics\.captureTechDefinitionsDuring[\s\S]*?finally \{/,
);
assert.match(
  patchedBundle,
  /includeGranted \? \{\} : \{ discard: UNREAD_RESEARCH_CONTENT \}/,
);
assert.throws(
  () => patchOffersOnlyBundle(`${bundleSource}\n${bundleSource}`),
  /not unique/,
);
