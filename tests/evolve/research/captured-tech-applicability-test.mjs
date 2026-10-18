import assert from "node:assert/strict";

import {
  createEffectiveCapturedTechPrerequisiteSnapshot,
  combineCapturedTechEligibility,
  readCapturedMadTargetCondition,
  readCapturedTechApplicability,
} from "../../../src/adapters/evolve/progression/research/captured-tech-applicability.ts";
import { planNativeResearchPrerequisites } from "../../../src/domain/progression/research-prerequisite-planning.ts";
import { classifyMandatoryResearchPrerequisiteObligations } from "../../../src/domain/progression/research-prerequisite-obligations.ts";

const definition = (actionId, eligibility) => ({ actionId, eligibility });
const definitions = [
  definition("tech-standard", {
    hasNativeCondition: false,
    routeRestrictions: ["standard", "truepath"],
    restrictions: [],
  }),
  definition("tech-flier-excluded", {
    hasNativeCondition: false,
    routeRestrictions: undefined,
    restrictions: [{ kind: "not_trait", values: ["flier"] }],
  }),
  definition("tech-needs-gene", {
    hasNativeCondition: false,
    routeRestrictions: undefined,
    restrictions: [{ kind: "gene", values: ["queue"] }],
  }),
  definition("tech-not-researched", {
    hasNativeCondition: false,
    routeRestrictions: undefined,
    restrictions: [{ kind: "not_tech", values: ["mad"] }],
  }),
  definition("tech-condition", {
    hasNativeCondition: true,
    routeRestrictions: undefined,
    restrictions: [],
  }),
  definition("tech-mad", {
    hasNativeCondition: true,
    routeRestrictions: ["standard", "truepath"],
    restrictions: [
      { kind: "not_trait", values: ["cataclysm", "lone_survivor", "warlord"] },
    ],
  }),
];

const root = {
  race: { iceage: false, truepath: false, flier: true },
  genes: { queue: 3 },
  tech: { mad: 0 },
};
const applicability = readCapturedTechApplicability(root, definitions);
assert.equal(applicability?.get("tech-standard")?.status, "eligible");
assert.equal(applicability?.get("tech-flier-excluded")?.status, "excluded");
assert.equal(applicability?.get("tech-needs-gene")?.status, "eligible");
assert.equal(applicability?.get("tech-not-researched")?.status, "eligible");
assert.equal(applicability?.get("tech-mad")?.status, "eligible");
assert.equal(
  combineCapturedTechEligibility([
    applicability.get("tech-mad"),
    readCapturedMadTargetCondition(root),
  ]).status,
  "eligible",
  "standard route restrictions and native MAD condition facts jointly establish eligibility",
);

{
  const iceage = readCapturedTechApplicability(
    { ...root, race: { iceage: true, truepath: true, flier: false } },
    definitions,
  );
  assert.equal(iceage?.get("tech-standard")?.status, "excluded");
  assert.equal(iceage?.get("tech-mad")?.status, "excluded");
  assert.equal(iceage?.get("tech-condition")?.status, "eligible");
  assert.equal(
    iceage?.get("tech-condition")?.status,
    "eligible",
    "presence of native condition is retained separately and never invoked here",
  );
}

{
  const truepath = readCapturedTechApplicability(
    { ...root, race: { iceage: false, truepath: true, flier: false } },
    definitions,
  );
  assert.equal(truepath?.get("tech-standard")?.status, "eligible");
}

{
  const absentLazyKeys = readCapturedTechApplicability(
    { race: { iceage: false, truepath: false }, genes: {}, tech: {} },
    definitions,
  );
  assert.equal(
    absentLazyKeys?.get("tech-needs-gene")?.status,
    "excluded",
    "native trait/gene checks read absent lazily initialized keys as false",
  );
  assert.equal(absentLazyKeys?.get("tech-not-researched")?.status, "eligible");
}

assert.equal(readCapturedTechApplicability(null, definitions), undefined);
assert.equal(readCapturedTechApplicability(root, undefined), undefined);
assert.equal(
  readCapturedTechApplicability(
    { ...root, genes: { queue: {} } },
    definitions,
  )?.get("tech-needs-gene")?.status,
  "unknown",
);

assert.equal(readCapturedMadTargetCondition(root).status, "eligible");
assert.equal(
  readCapturedMadTargetCondition({
    ...root,
    race: { ...root.race, sludge: true },
  }).status,
  "excluded",
);
assert.equal(
  readCapturedMadTargetCondition({
    ...root,
    race: { ...root.race, ultra_sludge: true },
  }).status,
  "excluded",
);
assert.equal(
  readCapturedMadTargetCondition({
    ...root,
    race: { ...root.race, truepath: true },
  }).status,
  "excluded",
);
assert.deepEqual(
  readCapturedMadTargetCondition({
    ...root,
    race: { ...root.race, truepath: true },
    tech: { ...root.tech, world_control: false },
  }),
  {
    status: "excluded",
    reasons: ["native MAD condition requires world control on Truepath"],
  },
);
assert.equal(
  readCapturedMadTargetCondition({
    ...root,
    race: { ...root.race, truepath: true },
    tech: { ...root.tech, world_control: 1 },
  }).status,
  "eligible",
);
assert.equal(readCapturedMadTargetCondition(null).status, "unknown");
assert.equal(
  readCapturedMadTargetCondition({
    race: { truepath: true },
    tech: { world_control: {} },
  }).status,
  "unknown",
  "invalid native condition facts stay unknown",
);

for (const restriction of ["cataclysm", "lone_survivor", "warlord"]) {
  const excluded = readCapturedTechApplicability(
    {
      ...root,
      race: { ...root.race, [restriction]: true },
    },
    definitions,
  );
  assert.equal(excluded?.get("tech-mad")?.status, "excluded", restriction);
}

{
  const definitions = [
    {
      registryKey: "tech-terminal",
      actionId: "tech-terminal",
      grantTechnology: "terminal",
      grantLevel: 1,
      prerequisites: {
        kind: "declared",
        requirements: [{ technologyId: "static", requiredLevel: 1 }],
      },
      eligibility: {
        hasNativeCondition: true,
        routeRestrictions: ["standard"],
        restrictions: [],
      },
    },
    {
      registryKey: "tech-static",
      actionId: "tech-static",
      grantTechnology: "static",
      grantLevel: 1,
      prerequisites: { kind: "declared", requirements: [] },
      eligibility: {
        hasNativeCondition: false,
        routeRestrictions: undefined,
        restrictions: [],
      },
    },
    {
      registryKey: "tech-computed",
      actionId: "tech-computed",
      grantTechnology: "computed",
      grantLevel: 1,
      prerequisites: { kind: "conditional", reason: "native predicate" },
      eligibility: {
        hasNativeCondition: false,
        routeRestrictions: undefined,
        restrictions: [],
      },
    },
  ];
  const context = { rootGeneration: 7, progressionEpoch: "run:9" };
  const baseline = createEffectiveCapturedTechPrerequisiteSnapshot(
    definitions,
    context,
  );
  assert.deepEqual(
    baseline.definitions?.[2]?.prerequisites,
    { kind: "conditional", reason: "native predicate" },
    "missing computed evidence retains the original uncertainty",
  );

  definitions[0].computedRequirements = [
    {
      actionId: "tech-terminal",
      registryKey: "tech-terminal",
      actionIdentity: 1,
      reqsIdentity: 2,
      source: "native-actionReqs-during-drawTech",
      effectiveEra: "standard",
      arguments: { era: "standard", wiki: false, offset: undefined },
      rootGeneration: 7,
      progressionEpoch: "run:9",
      captureGeneration: 15,
      requirements: [{ technologyId: "computed", requiredLevel: 1 }],
      nativeCallCount: 1,
      status: "observed",
      complete: true,
      validation: "valid",
    },
  ];
  const fresh = createEffectiveCapturedTechPrerequisiteSnapshot(
    definitions,
    context,
  );
  assert.notEqual(
    fresh.identity,
    baseline.identity,
    "fresh computed evidence changes identity even when the registry array is unchanged",
  );
  const graph = planNativeResearchPrerequisites({
    targetActionId: "tech-terminal",
    definitions: fresh.definitions,
    grantLevels: new Map([
      ["terminal", 0],
      ["static", 0],
      ["computed", 0],
    ]),
    offeredActionIds: new Set(["tech-computed"]),
    offerGenerations: new Map([["tech-computed", 3]]),
    cycle: 1,
    progressionEpoch: "run:9",
    rootGeneration: 7,
    maxDepth: 8,
    maxActions: 20,
  });
  const obligations = classifyMandatoryResearchPrerequisiteObligations(
    graph,
    true,
  );
  assert.deepEqual(graph.actionableFrontier, ["tech-computed"]);
  assert.deepEqual(obligations.mandatoryActionIds, ["tech-computed"]);
  assert.deepEqual(
    fresh.definitions?.[0]?.routeRestrictions,
    ["standard"],
    "route eligibility remains separately represented alongside computed requirements",
  );

  const changed = {
    ...definitions[0],
    computedRequirements: [
      {
        ...definitions[0].computedRequirements[0],
        requirements: [{ technologyId: "static", requiredLevel: 2 }],
      },
    ],
  };
  const changedSnapshot = createEffectiveCapturedTechPrerequisiteSnapshot(
    [changed, ...definitions.slice(1)],
    context,
  );
  assert.notEqual(changedSnapshot.identity, fresh.identity);
  assert.deepEqual(changedSnapshot.definitions?.[0]?.prerequisites, {
    kind: "declared",
    requirements: [{ technologyId: "static", requiredLevel: 2 }],
  });

  const expired = createEffectiveCapturedTechPrerequisiteSnapshot(definitions, {
    rootGeneration: 8,
    progressionEpoch: "run:9",
  });
  assert.notEqual(expired.identity, fresh.identity);
  assert.deepEqual(
    expired.definitions?.[0]?.prerequisites,
    definitions[0].prerequisites,
    "expired computed evidence falls back to the original declaration",
  );
  definitions[0].computedRequirements[0].complete = false;
  const incomplete = createEffectiveCapturedTechPrerequisiteSnapshot(
    definitions,
    context,
  );
  assert.deepEqual(
    incomplete.definitions?.[0]?.prerequisites,
    definitions[0].prerequisites,
    "incomplete computed evidence cannot clear prerequisite uncertainty",
  );
  assert.notEqual(incomplete.identity, fresh.identity);
}

console.log("captured static Research applicability tests passed");
