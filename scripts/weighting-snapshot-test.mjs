import assert from "node:assert/strict";
import { createWeightingSnapshotReader } from "../src/adapters/evolve/progression/build/weighting-snapshot.ts";

const validState = () => ({
  queuedTargets: [],
  triggerTargets: [],
  knowledgeRequiredByTechs: 0,
  knowledgeRequiredByBuildTargets: 0,
  cheapestTechKnowledge: 0,
});

let state = validState();
let gates = {};
const off = () => false;
const defaultGates = () => ({
  isGalaxyAssaultPending: off,
  isStargatePiracySupressed: off,
  isGalaxyPiracyCoveredByFleet: off,
  isLumberRace: off,
  isBananaRepublicObjectiveComplete: off,
  isInflationAssistActive: off,
  isInflationMoneyReachable: off,
  isRetirementAssistActive: off,
  getRetirementPreparationMissing: () => [],
  isAchievementGuardActive: off,
  getForeignAchievementGoal: () => null,
  isHellSupressUseful: off,
  isGateTowerSupressionTooLow: off,
  isGateDemonsSupressed: off,
  isGuardPostPrebuildIncomplete: off,
  getSpirePrebuildShortfall: () => ({ ports: false, baseCamps: false }),
  getNextCitadelPowerDraw: () => 30,
  isTechResearched: off,
  isGECKNeeded: off,
  isPrestigeAllowed: off,
  isPillarFinished: off,
  isMadPrestigeAwaited: off,
  getMechSupplySavingReason: () => null,
  isWomlingStatEarned: off,
});
gates = defaultGates();
const read = createWeightingSnapshotReader({
  getState: () => state,
  ...Object.fromEntries(
    Object.keys(defaultGates()).map((name) => [
      name,
      (...args) => gates[name](...args),
    ]),
  ),
});

// The uninitialized state the runtime installs before the first cycle reads as
// a valid empty snapshot.
const empty = read();
assert.equal(Object.isFrozen(empty), true);
assert.equal(empty.queuedTargets.size, 0);
assert.equal(empty.triggerTargets.size, 0);
assert.equal(empty.knowledgeRequiredByTechs, 0);
assert.equal(empty.knowledgeRequiredByBuildTargets, 0);
assert.equal(empty.cheapestTechKnowledge, 0);
assert.equal(empty.galaxyAssaultPending, false);
assert.equal(empty.stargatePiracySupressed, false);
assert.equal(empty.galaxyPiracyCoveredByFleet, false);
assert.equal(empty.lumberRace, false);
assert.equal(empty.bananaColliderObjectiveComplete, false);
assert.equal(empty.inflationAssistActive, false);
assert.equal(empty.inflationMoneyReachable, false);
assert.equal(empty.retirementPreparationIncomplete, false);
assert.equal(empty.guardDreadedActive, false);
assert.equal(empty.guardEnergeticActive, false);
assert.equal(empty.guardRedDeadActive, false);
assert.equal(empty.guardPacifistActive, false);
assert.equal(empty.foreignAchievementGoal, null);
assert.equal(empty.hellSupressUseful, false);
assert.equal(empty.gateTowerSupressionTooLow, false);
assert.equal(empty.gateDemonsSupressed, false);
assert.equal(empty.hellGuardPostPrebuildIncomplete, false);
assert.equal(empty.spirePortPrebuildIncomplete, false);
assert.equal(empty.spireBaseCampPrebuildIncomplete, false);
assert.equal(empty.nextCitadelPowerDraw, 30);
assert.equal(empty.worldUnified, false);
assert.equal(empty.spireWaygateComplete, false);
assert.equal(empty.spireEdenicGateComplete, false);
assert.equal(empty.elysiumFireSupportUnlocked, false);
assert.equal(empty.elysiumGarrisonDestroyed, false);
assert.equal(empty.eleriumCannonResearched, false);
assert.equal(empty.asphodelStabilizerUnlocked, false);
assert.equal(empty.spireSphinxSolved, false);
assert.equal(empty.assemblyCureComplete, false);
assert.equal(empty.tauCetiReached, false);
assert.equal(empty.geckNeeded, false);
assert.equal(empty.prestigeEdenAllowed, false);
assert.equal(empty.prestigeRetireAllowed, false);
assert.equal(empty.pillarFinished, false);
assert.equal(empty.madPrestigeAwaited, false);
assert.equal(empty.mechSupplySaving, null);
assert.equal(empty.womlingFriendEarned, false);
assert.equal(empty.womlingGodEarned, false);
assert.equal(empty.womlingLordEarned, false);

// Membership is by wrapper identity, not by name or index.
const queued = { _vueBinding: "city-bank" };
const triggered = { _vueBinding: "city-temple" };
state = {
  ...validState(),
  queuedTargets: [queued],
  triggerTargets: [triggered],
  knowledgeRequiredByTechs: 1_500,
  knowledgeRequiredByBuildTargets: 900,
  cheapestTechKnowledge: 250,
};
const sample = read();
assert.equal(sample.queuedTargets.has(queued), true);
assert.equal(sample.queuedTargets.has(triggered), false);
assert.equal(sample.triggerTargets.has(triggered), true);
assert.equal(sample.knowledgeRequiredByTechs, 1_500);
assert.equal(sample.knowledgeRequiredByBuildTargets, 900);
assert.equal(sample.cheapestTechKnowledge, 250);

// Later target-list mutation cannot reach an already-sampled snapshot.
state.queuedTargets.push(triggered);
assert.equal(sample.queuedTargets.has(triggered), false);
assert.equal(read().queuedTargets.has(triggered), true);

state = validState();

// Each gate is asked exactly the question its snapshot field names.
const askedObjectives = [];
const askedGuards = [];
const askedPrestiges = [];
const askedWomlingStats = [];
const askedTechs = [];
gates = {
  ...defaultGates(),
  isGalaxyAssaultPending: () => true,
  isStargatePiracySupressed: () => true,
  isGalaxyPiracyCoveredByFleet: () => true,
  isLumberRace: () => true,
  isBananaRepublicObjectiveComplete: (objective) => {
    askedObjectives.push(objective);
    return true;
  },
  isInflationAssistActive: () => true,
  isInflationMoneyReachable: () => true,
  isAchievementGuardActive: (guard) => {
    askedGuards.push(guard);
    return guard !== "guardPacifist";
  },
  getForeignAchievementGoal: () => "syndicate",
  isHellSupressUseful: () => true,
  isGateTowerSupressionTooLow: () => true,
  isGateDemonsSupressed: () => true,
  isGuardPostPrebuildIncomplete: () => true,
  getSpirePrebuildShortfall: () => ({ ports: true, baseCamps: false }),
  getNextCitadelPowerDraw: () => 172.5,
  isTechResearched: (research, level) => {
    askedTechs.push(`${research}:${level}`);
    return research !== "isle";
  },
  isGECKNeeded: () => true,
  isPrestigeAllowed: (prestige) => {
    askedPrestiges.push(prestige);
    return prestige === "eden";
  },
  isPillarFinished: () => true,
  isMadPrestigeAwaited: () => true,
  getMechSupplySavingReason: () => "saving",
  isWomlingStatEarned: (stat) => {
    askedWomlingStats.push(stat);
    return stat !== "lord";
  },
};
const gated = read();
assert.deepEqual(askedObjectives, ["b2"]);
assert.deepEqual(askedGuards, [
  "guardDreaded",
  "guardEnergetic",
  "guardRedDead",
  "guardPacifist",
]);
assert.deepEqual(askedPrestiges, ["eden", "retire"]);
assert.equal(gated.galaxyAssaultPending, true);
assert.equal(gated.stargatePiracySupressed, true);
assert.equal(gated.galaxyPiracyCoveredByFleet, true);
assert.equal(gated.lumberRace, true);
assert.equal(gated.bananaColliderObjectiveComplete, true);
assert.equal(gated.inflationAssistActive, true);
assert.equal(gated.inflationMoneyReachable, true);
assert.equal(gated.guardDreadedActive, true);
assert.equal(gated.guardEnergeticActive, true);
assert.equal(gated.guardRedDeadActive, true);
assert.equal(gated.guardPacifistActive, false);
assert.equal(gated.foreignAchievementGoal, "syndicate");
assert.equal(gated.hellSupressUseful, true);
assert.equal(gated.gateTowerSupressionTooLow, true);
assert.equal(gated.gateDemonsSupressed, true);
assert.equal(gated.hellGuardPostPrebuildIncomplete, true);
assert.equal(gated.spirePortPrebuildIncomplete, true);
assert.equal(gated.spireBaseCampPrebuildIncomplete, false);
assert.equal(gated.nextCitadelPowerDraw, 172.5);
assert.deepEqual(askedTechs, [
  "world_control:1",
  "waygate:2",
  "edenic:3",
  "elysium:8",
  "isle:2",
  "elysium:10",
  "asphodel:8",
  "hell_spire:8",
  "focus_cure:7",
  "tauceti:2",
]);
assert.equal(gated.worldUnified, true);
assert.equal(gated.spireWaygateComplete, true);
assert.equal(gated.spireEdenicGateComplete, true);
assert.equal(gated.elysiumFireSupportUnlocked, true);
assert.equal(gated.elysiumGarrisonDestroyed, false);
assert.equal(gated.eleriumCannonResearched, true);
assert.equal(gated.asphodelStabilizerUnlocked, true);
assert.equal(gated.spireSphinxSolved, true);
assert.equal(gated.assemblyCureComplete, true);
assert.equal(gated.tauCetiReached, true);
assert.equal(gated.geckNeeded, true);
assert.equal(gated.prestigeEdenAllowed, true);
assert.equal(gated.prestigeRetireAllowed, false);
assert.equal(gated.pillarFinished, true);
assert.equal(gated.madPrestigeAwaited, true);
assert.equal(gated.mechSupplySaving, "saving");
assert.deepEqual(askedWomlingStats, ["friend", "god", "lord"]);
assert.equal(gated.womlingFriendEarned, true);
assert.equal(gated.womlingGodEarned, true);
assert.equal(gated.womlingLordEarned, false);

// The tech gates keep the game's lenient coercion: `haveTech` answers
// `undefined` for a research the run has never started and `0` for one recorded
// at level 0, and neither may become a malformed-input rejection.
for (const absent of [undefined, 0, false]) {
  gates = { ...defaultGates(), isTechResearched: () => absent };
  assert.equal(read().tauCetiReached, false);
}
gates = { ...defaultGates(), isTechResearched: () => true };
assert.equal(read().tauCetiReached, true);

// The other mech-saving reason survives the same validation.
gates = { ...defaultGates(), getMechSupplySavingReason: () => "building" };
assert.equal(read().mechSupplySaving, "building");

// The retirement preparation read is skipped while the assist is inactive, and
// an empty shortfall list still reads as prepared.
let preparationReads = 0;
const countedPreparation = (missing) => ({
  ...defaultGates(),
  isRetirementAssistActive: () => missing !== null,
  getRetirementPreparationMissing: () => {
    preparationReads++;
    return missing ?? [];
  },
});
gates = countedPreparation(null);
assert.equal(read().retirementPreparationIncomplete, false);
assert.equal(preparationReads, 0);
gates = countedPreparation([]);
assert.equal(read().retirementPreparationIncomplete, false);
assert.equal(preparationReads, 1);
gates = countedPreparation(["20 Fusion Generator"]);
assert.equal(read().retirementPreparationIncomplete, true);
assert.equal(preparationReads, 2);

const rejects = (mutate, message) => {
  state = validState();
  gates = defaultGates();
  mutate(state);
  assert.throws(read, { name: "TypeError", message });
};
rejects((s) => delete s.queuedTargets, "state.queuedTargets must be an array");
rejects(
  (s) => (s.triggerTargets = { 0: queued }),
  "state.triggerTargets must be an array",
);
rejects(
  (s) => (s.knowledgeRequiredByTechs = undefined),
  "state.knowledgeRequiredByTechs must be a finite number",
);
rejects(
  (s) => (s.knowledgeRequiredByBuildTargets = Number.NaN),
  "state.knowledgeRequiredByBuildTargets must be a finite number",
);
rejects(
  (s) => (s.cheapestTechKnowledge = "250"),
  "state.cheapestTechKnowledge must be a finite number",
);

const rejectsGate = (overrides, message) => {
  state = validState();
  gates = { ...defaultGates(), ...overrides };
  assert.throws(read, { name: "TypeError", message });
};
rejectsGate(
  { isGalaxyAssaultPending: () => undefined },
  "isGalaxyAssaultPending() must be a boolean",
);
rejectsGate(
  { isStargatePiracySupressed: () => 0 },
  "isStargatePiracySupressed() must be a boolean",
);
rejectsGate(
  { isGalaxyPiracyCoveredByFleet: () => null },
  "isGalaxyPiracyCoveredByFleet() must be a boolean",
);
rejectsGate({ isLumberRace: () => 1 }, "isLumberRace() must be a boolean");
rejectsGate(
  { isGateTowerSupressionTooLow: () => 0.5 },
  "isGateTowerSupressionTooLow() must be a boolean",
);
rejectsGate(
  { isGateDemonsSupressed: () => "yes" },
  "isGateDemonsSupressed() must be a boolean",
);
rejectsGate(
  { isGuardPostPrebuildIncomplete: () => undefined },
  "isGuardPostPrebuildIncomplete() must be a boolean",
);
rejectsGate(
  { isBananaRepublicObjectiveComplete: () => "yes" },
  'isBananaRepublicObjectiveComplete("b2") must be a boolean',
);
rejectsGate(
  { isAchievementGuardActive: (guard) => guard !== "guardRedDead" || null },
  'isAchievementGuardActive("guardRedDead") must be a boolean',
);
rejectsGate(
  { isPrestigeAllowed: (prestige) => prestige === "eden" && "yes" },
  'isPrestigeAllowed("eden") must be a boolean',
);
rejectsGate(
  {
    isRetirementAssistActive: () => true,
    getRetirementPreparationMissing: () => "none",
  },
  "getRetirementPreparationMissing() must be an array",
);
rejectsGate(
  { getSpirePrebuildShortfall: () => null },
  "getSpirePrebuildShortfall() must be an object",
);
rejectsGate(
  { getSpirePrebuildShortfall: () => ({ baseCamps: false }) },
  "getSpirePrebuildShortfall().ports must be a boolean",
);
rejectsGate(
  { getSpirePrebuildShortfall: () => ({ ports: true, baseCamps: 1 }) },
  "getSpirePrebuildShortfall().baseCamps must be a boolean",
);
rejectsGate(
  { getNextCitadelPowerDraw: () => Number.NaN },
  "getNextCitadelPowerDraw() must be a finite number",
);
rejectsGate(
  { getNextCitadelPowerDraw: () => "30" },
  "getNextCitadelPowerDraw() must be a finite number",
);
rejectsGate(
  { isMadPrestigeAwaited: () => "mad" },
  "isMadPrestigeAwaited() must be a boolean",
);
rejectsGate(
  { isWomlingStatEarned: (stat) => (stat === "god" ? 3 : true) },
  'isWomlingStatEarned("god") must be a boolean',
);
rejectsGate(
  { getMechSupplySavingReason: () => "hoarding" },
  'getMechSupplySavingReason() must be null, "building", or "saving"',
);
rejectsGate(
  { getMechSupplySavingReason: () => false },
  'getMechSupplySavingReason() must be null, "building", or "saving"',
);
rejectsGate(
  { getForeignAchievementGoal: () => "unification" },
  'getForeignAchievementGoal() must be null, "world-domination", or "syndicate"',
);
rejectsGate(
  { getForeignAchievementGoal: () => undefined },
  'getForeignAchievementGoal() must be null, "world-domination", or "syndicate"',
);

state = validState();
gates = defaultGates();
assert.throws(
  createWeightingSnapshotReader({
    getState: () => null,
    ...defaultGates(),
  }),
  {
    name: "TypeError",
    message: "state must be an object",
  },
);

console.log("Building weighting snapshot adapter tests passed");
