import assert from "node:assert/strict";

import { createCapturedConditionContextReader } from "../../../src/adapters/evolve/captured-condition-context.ts";

const calls = [];
const buildingUnlocks = {
  unlocked: new Set(["city-cottage"]),
  regions: new Set(["city"]),
  states: new Map(),
};
const contextReader = createCapturedConditionContextReader({
  costs: {
    readCost: (id) => {
      calls.push(`cost:${id}`);
      return { cost: { Money: 25 }, pool: undefined };
    },
  },
  readOfferedTechs: () => {
    calls.push("offered-techs");
    return [];
  },
  readGrantedTechs: () => new Set(["tech-mining"]),
  readProjects: () => [{ elementId: "arpa-lhc" }],
  readBuildingUnlocks: (regions) => {
    calls.push(`building-regions:${[...regions].join(",")}`);
    return buildingUnlocks;
  },
  readBuildingCapacity: (ids) => {
    calls.push(`capacity:${[...ids].join(",")}`);
    return new Map([["city-cottage", true]]);
  },
  readDemandSample: () => {
    calls.push("demand");
    return {
      isDemanded: (resourceId) => resourceId === "Money",
      storageRequired: () => 1,
      maxCost: () => 25,
    };
  },
  readTechKnowledge: () => 150,
  readHellGarrison: () => 12,
});

const storedSettings = { prestigeType: "MAD" };
const sampled = contextReader.read(
  [
    { type: "ResearchComplete", argument: "tech-mining" },
    { type: "BuildingCost", argument: "city-cottage.Money" },
    { type: "BuildingClickable", argument: "city-cottage" },
    { type: "ProjectUnlocked", argument: "arpa-lhc" },
    { type: "ResourceDemanded", argument: "Money" },
    { type: "Other", argument: "tknow" },
    { type: "Soldiers", argument: "hellGarrison" },
  ],
  storedSettings,
);

assert.equal(sampled.context.grantedTechs.has("tech-mining"), true);
assert.equal(sampled.context.buildingCosts.get("city-cottage").cost.Money, 25);
assert.equal(sampled.context.buildingUnlocks.regions.has("city"), true);
assert.equal(sampled.context.buildingCapacity.get("city-cottage"), true);
assert.equal(sampled.context.unlockedProjects.has("arpa-lhc"), true);
assert.equal(sampled.context.demand.isDemanded("Money"), true);
assert.equal(sampled.context.knowledgeRequiredByTechs, 150);
assert.equal(sampled.context.hellGarrison, 12);
assert.equal(sampled.context.settings, storedSettings);
assert.deepEqual(calls, [
  "offered-techs",
  "building-regions:city",
  "cost:city-cottage",
  "capacity:city-cottage",
  "demand",
]);

calls.length = 0;
contextReader.read([{ type: "Boolean", argument: true }], storedSettings);
assert.deepEqual(calls, []);

console.log("Captured condition context tests passed");
