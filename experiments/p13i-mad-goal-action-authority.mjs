import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { classifyMandatoryResearchPrerequisiteObligations } from "../src/domain/progression/research-prerequisite-obligations.ts";
import { planNativeResearchPrerequisites } from "../src/domain/progression/research-prerequisite-planning.ts";

const p13h = JSON.parse(
  await readFile(
    new URL(
      "../test-artifacts/benchmark/tmp/p13h-research-owner-evidence.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const observation = p13h.observations.find(({ cycle }) => cycle === 232);
assert.ok(observation, "P13H cycle 232 evidence is required");
const steelContainers = observation.offers.find(
  ({ actionId }) => actionId === "tech-steel_containers",
);
assert.deepEqual(steelContainers?.cost, { Knowledge: 9000, Steel: 250 });
assert.ok(steelContainers.bindingGeneration > 0);
assert.equal(observation.ordinaryOwnerSelection, "tech-steel_containers");
assert.equal(observation.ownerQueueEvidence, "empty");
assert.equal(observation.result?.disposition, "researched");
const settings = JSON.parse(
  await readFile(
    new URL(
      "../test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
assert.equal(settings.prestigeType, "mad");

const offers = new Map(
  observation.offers.map(({ actionId, bindingGeneration }) => [
    actionId,
    bindingGeneration,
  ]),
);
const graph = planNativeResearchPrerequisites({
  targetActionId: "tech-mad",
  definitions: undefined,
  grantLevels: undefined,
  offeredActionIds: new Set(offers.keys()),
  offerGenerations: offers,
  cycle: observation.cycle,
  progressionEpoch: observation.progressionGeneration,
  rootGeneration: observation.rootGeneration,
  maxDepth: 16,
  maxActions: 256,
});
const obligations = classifyMandatoryResearchPrerequisiteObligations(
  graph,
  false,
);

const stage3i = JSON.parse(
  await readFile(
    new URL(
      "../test-artifacts/benchmark/tmp/stage3i-after-first.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const firstCycleMandatory = stage3i.results.D.selectedClaim.mandatoryActionIds;
assert.deepEqual(firstCycleMandatory, [
  "tech-black_powder",
  "tech-mad_science",
]);
const firstCycleClaims = stage3i.results.D.selectedClaim.claims;
assert.deepEqual(
  firstCycleClaims.map(({ nativeActionId, requiredQuantity }) => [
    nativeActionId,
    requiredQuantity,
  ]),
  [
    ["tech-black_powder", 100],
    ["tech-mad_science", 50],
  ],
);

console.log(
  JSON.stringify(
    {
      p13hCycle232: {
        targetActionId: graph.targetActionId,
        selectedPrestige: settings.prestigeType,
        ordinarySelection: observation.ordinaryOwnerSelection,
        steelContainers: {
          offered: steelContainers !== undefined,
          cost: steelContainers.cost,
          bindingGeneration: steelContainers.bindingGeneration,
          ownerQueueEvidence: observation.ownerQueueEvidence,
          ownerResult: observation.result.disposition,
          madPrerequisiteRelation: "unknown in archived P13H evidence",
        },
        terminalStatus: graph.targetStatus,
        obligationStatus: obligations.status,
        reasons: obligations.reasons,
        expandedActions: graph.actions.length,
        expandedRequirements: graph.requirements.length,
        observedDepth: 0,
        maxDepth: 16,
        maxActions: 256,
        missingBranches: graph.unavailableFacts,
        truncation: graph.limits,
        nativeResearchDraws: 0,
        controlInvocations: 0,
        catalogScans: 0,
      },
      stage3iFirstCycle: {
        evidenceSource: "saved Stage 3I D native-obligation result",
        mandatoryActionIds: firstCycleMandatory,
        manaPrices: firstCycleClaims.map(
          ({ nativeActionId, requiredQuantity }) => ({
            actionId: nativeActionId,
            mana: requiredQuantity,
          }),
        ),
        selectionPreference: "unestablished",
      },
    },
    null,
    2,
  ),
);
