import assert from "node:assert/strict";

import { createStorageRequirements } from "../src/planning/storage-requirements.ts";

const makeResource = (maxQuantity) => ({
  maxQuantity,
  maxCost: 0,
  storageRequired: 0,
  autoSellEnabled: false,
  autoSellRatio: 0,
  hasStorage: () => false,
});
let resources = {
  Iron: makeResource(100),
  Money: makeResource(0),
  Graphene: makeResource(0),
};
let settings = {
  storageAssignExtra: false,
  fleetEmbassyKnowledge: 0,
  autoFleet: false,
  prioritizeOuterFleet: "ignore",
  autoMarket: false,
};
const state = {
  unlockedTechs: [],
  queuedTargetsAll: [],
  triggerTargets: [],
  knowledgeRequiredByTechs: 0,
  cheapestTechKnowledge: 0,
  knowledgeRequiredByBuildTargets: 0,
};
const requirements = createStorageRequirements({
  getSettings: () => settings,
  getState: () => state,
  getResources: () => resources,
  getBuildings: () => ({ GorddonEmbassy: { isAutoBuildable: () => false } }),
  getGame: () => ({ global: { race: {} } }),
  getBuildingManager: () => ({ priorityList: [] }),
  getProjectManager: () => ({ priorityList: [] }),
  getFleetManagerOuter: () => ({
    nextShipExpandable: false,
    nextShipCost: {},
  }),
  isTechnology: () => false,
  getInflationChallengeAssistActive: () => () => false,
  getRetirementChallengeAssistActive: () => () => false,
  getInflationChallengeMoney: () => 250_000_000_000,
  getRetirementGraphene: () => 200_000_000,
});

requirements.requestStorageFor([{ cost: { Iron: 80 } }]);
assert.equal(resources.Iron.storageRequired, 80);

resources = {
  Iron: makeResource(200),
  Money: makeResource(0),
  Graphene: makeResource(0),
};
settings = { ...settings, storageAssignExtra: true };
requirements.requestStorageFor([{ cost: { Iron: 100 } }]);
assert.equal(resources.Iron.storageRequired, 103);

console.log("Storage requirement module tests passed");
