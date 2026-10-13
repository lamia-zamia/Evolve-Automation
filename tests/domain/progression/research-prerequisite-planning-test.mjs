import assert from "node:assert/strict";

import { planNativeResearchPrerequisites } from "../../../src/domain/progression/research-prerequisite-planning.ts";

const definition = (
  actionId,
  grantTechnology,
  grantLevel,
  requirements = [],
  extra = {},
) => ({
  actionId,
  grantTechnology,
  grantLevel,
  prerequisites: { kind: "declared", requirements },
  hasNativeCondition: false,
  routeRestrictions: undefined,
  restrictions: [],
  ...extra,
});

const input = (overrides = {}) => ({
  targetActionId: "tech-terminal",
  definitions: [
    definition("tech-terminal", "terminal", 1, [
      { technologyId: "power", requiredLevel: 2 },
      { technologyId: "fuel", requiredLevel: 1 },
    ]),
    definition("tech-power-1", "power", 1, [
      { technologyId: "ore", requiredLevel: 1 },
    ]),
    definition("tech-power-2", "power", 2, [
      { technologyId: "power", requiredLevel: 1 },
      { technologyId: "ore", requiredLevel: 2 },
    ]),
    definition("tech-fuel", "fuel", 1, [
      { technologyId: "ore", requiredLevel: 1 },
    ]),
    definition("tech-ore", "ore", 2),
  ],
  grantLevels: new Map([
    ["terminal", 0],
    ["power", 0],
    ["fuel", 0],
    ["ore", 0],
    ["dynamic", 0],
    ["missing", 0],
    ["loop", 0],
  ]),
  offeredActionIds: new Set(["tech-ore"]),
  offerGenerations: new Map([["tech-ore", 7]]),
  cycle: 9,
  progressionEpoch: "run:3",
  rootGeneration: 4,
  maxDepth: 12,
  maxActions: 40,
  ...overrides,
});

const graphByRequirement = (graph, id) =>
  graph.requirements.find((entry) => entry.id === id);

{
  const graph = planNativeResearchPrerequisites(input());
  assert.equal(graph.targetStatus, "unsatisfied");
  assert.equal(graph.provenance, "retained-native-static-research-registry");
  assert.deepEqual(graph.actionableFrontier, ["tech-ore"]);
  assert.equal(
    graphByRequirement(graph, "research:power:2").status,
    "unsatisfied",
  );
  assert.equal(
    graphByRequirement(graph, "research:fuel:1").status,
    "unsatisfied",
  );
  assert.equal(
    graphByRequirement(graph, "research:ore:1").status,
    "unsatisfied",
  );
  assert.equal(
    graphByRequirement(graph, "research:ore:2").status,
    "unsatisfied",
  );
  assert.equal(
    graph.requirements.filter((entry) => entry.id === "research:ore:1").length,
    1,
    "shared dependency is deduplicated by technology and required level",
  );
  assert.ok(
    graph.requirements.some((entry) => entry.id === "research:power:1"),
  );
  assert.ok(
    graph.actions.some((action) =>
      action.reasons.some((reason) => reason.includes("queue precognition")),
    ),
    "native queue precognition and special requirement exceptions stay unsupported",
  );
  assert.deepEqual(graph.freshness, {
    cycle: 9,
    progressionEpoch: "run:3",
    rootGeneration: 4,
    offerGenerations: [["tech-ore", 7]],
  });
}

{
  const skipped = planNativeResearchPrerequisites(
    input({
      grantLevels: new Map(
        ["terminal", "cement"].map((technologyId) => [technologyId, 0]),
      ),
      definitions: [
        definition("tech-terminal", "terminal", 1, [
          {
            technologyId: "cement",
            requiredLevel: 1,
            applicabilityBoundary:
              "actions.js skipRequirement skips cement for Flier; current route applicability is not evaluated",
          },
        ]),
        definition("tech-cement", "cement", 1),
      ],
      offeredActionIds: new Set(),
    }),
  );
  assert.equal(
    graphByRequirement(skipped, "research:cement:1").status,
    "conditional",
  );
  assert.equal(
    graphByRequirement(skipped, "research:cement:1").declaredStatus,
    "unsatisfied",
  );
  assert.match(
    graphByRequirement(skipped, "research:cement:1").reasons.join(" "),
    /Flier/,
  );
}

{
  const graph = planNativeResearchPrerequisites(
    input({
      grantLevels: new Map([
        ["terminal", 0],
        ["ore", 2],
        ["power", 2],
        ["fuel", 1],
      ]),
      offeredActionIds: new Set(),
    }),
  );
  assert.equal(graph.targetStatus, "conditional");
  assert.equal(
    graphByRequirement(graph, "research:power:2").status,
    "satisfied",
  );
  assert.equal(
    graphByRequirement(graph, "research:fuel:1").status,
    "satisfied",
  );
}

{
  const graph = planNativeResearchPrerequisites(
    input({
      grantLevels: new Map([
        ["terminal", 1],
        ["power", 2],
        ["fuel", 1],
      ]),
      offeredActionIds: new Set(),
    }),
  );
  assert.equal(graph.targetStatus, "satisfied");
  assert.equal(
    graphByRequirement(graph, "research:power:2").status,
    "satisfied",
  );
  assert.equal(
    graphByRequirement(graph, "research:fuel:1").status,
    "satisfied",
  );
}

{
  const alternatives = input({
    grantLevels: new Map([
      ["terminal", 0],
      ["shared", 0],
    ]),
    definitions: [
      definition("tech-terminal", "terminal", 1, [
        { technologyId: "shared", requiredLevel: 1 },
      ]),
      definition("tech-route-a", "shared", 1, [], {
        routeRestrictions: ["standard"],
      }),
      definition("tech-route-b", "shared", 1, [], {
        restrictions: [{ kind: "trait", values: ["psychic"] }],
      }),
    ],
  });
  const graph = planNativeResearchPrerequisites(alternatives);
  assert.deepEqual(
    graphByRequirement(graph, "research:shared:1").candidateActionIds,
    ["tech-route-a", "tech-route-b"],
  );
  assert.equal(
    graphByRequirement(graph, "research:shared:1").status,
    "conditional",
  );
  assert.deepEqual(graph.actionableFrontier, []);
}

{
  const graph = planNativeResearchPrerequisites(
    input({
      definitions: [
        definition("tech-terminal", "terminal", 1, [
          { technologyId: "missing", requiredLevel: 2 },
        ]),
      ],
      offeredActionIds: new Set(),
    }),
  );
  assert.equal(
    graphByRequirement(graph, "research:missing:2").status,
    "unavailable",
  );
  assert.match(
    graphByRequirement(graph, "research:missing:2").reasons.join(" "),
    /no retained native action/,
  );
}

{
  const dynamic = planNativeResearchPrerequisites(
    input({
      definitions: [
        definition("tech-terminal", "terminal", 1, [
          { technologyId: "dynamic", requiredLevel: 1 },
        ]),
        definition("tech-dynamic", "dynamic", 1, [], {
          prerequisites: {
            kind: "conditional",
            reason: "native reqs is a function and was not evaluated",
          },
        }),
      ],
      offeredActionIds: new Set(),
    }),
  );
  assert.equal(
    graphByRequirement(dynamic, "research:dynamic:1").status,
    "conditional",
  );
  assert.match(
    graphByRequirement(dynamic, "research:dynamic:1").reasons.join(" "),
    /not evaluated/,
  );
}

{
  const cycle = planNativeResearchPrerequisites(
    input({
      definitions: [
        definition("tech-terminal", "terminal", 1, [
          { technologyId: "loop", requiredLevel: 1 },
        ]),
        definition("tech-loop", "loop", 1, [
          { technologyId: "loop", requiredLevel: 1 },
        ]),
      ],
      offeredActionIds: new Set(),
    }),
  );
  assert.ok(cycle.cycles.length > 0);
  const bounded = planNativeResearchPrerequisites(input({ maxDepth: 0 }));
  assert.ok(bounded.limits.some((entry) => entry.startsWith("depth:")));
}

{
  const unavailable = planNativeResearchPrerequisites(
    input({
      definitions: undefined,
      grantLevels: undefined,
      offeredActionIds: undefined,
    }),
  );
  assert.equal(unavailable.targetStatus, "unavailable");
  assert.equal(unavailable.actionableFrontier.length, 0);
  assert.ok(
    unavailable.unavailableFacts.some((entry) => entry.includes("registry")),
  );
  assert.ok(
    unavailable.unavailableFacts.some((entry) =>
      entry.includes("technology levels"),
    ),
  );
  assert.ok(
    unavailable.unavailableFacts.some((entry) =>
      entry.includes("offer catalog"),
    ),
  );
}

{
  const stale = planNativeResearchPrerequisites(
    input({
      expectedFreshness: {
        cycle: 8,
        progressionEpoch: "run:2",
        rootGeneration: 3,
        offerGenerations: new Map([["tech-ore", 6]]),
      },
    }),
  );
  assert.ok(stale.unavailableFacts.some((entry) => entry.includes("stale")));
  assert.equal(stale.targetStatus, "unavailable");
  assert.deepEqual(stale.freshness, {
    cycle: 9,
    progressionEpoch: "run:3",
    rootGeneration: 4,
    offerGenerations: [["tech-ore", 7]],
  });
}

{
  const ambiguous = planNativeResearchPrerequisites(
    input({
      definitions: [
        definition("tech-terminal", "terminal", 1),
        definition("tech-terminal", "terminal", 1),
      ],
    }),
  );
  assert.equal(ambiguous.targetStatus, "unavailable");
  assert.ok(
    ambiguous.unavailableFacts.some((entry) => entry.includes("ambiguous")),
  );
}

{
  const staleBinding = planNativeResearchPrerequisites(
    input({
      expectedFreshness: {
        cycle: 9,
        progressionEpoch: "run:3",
        rootGeneration: 4,
        offerGenerations: new Map([["tech-ore", 6]]),
      },
    }),
  );
  assert.equal(staleBinding.targetStatus, "unavailable");
  assert.ok(
    staleBinding.unavailableFacts.some((entry) => entry.includes("stale")),
  );
}

{
  const newlyOffered = planNativeResearchPrerequisites(
    input({
      offeredActionIds: new Set(["tech-power-2"]),
    }),
  );
  assert.ok(newlyOffered.actionableFrontier.includes("tech-power-2"));
  assert.ok(!newlyOffered.actionableFrontier.includes("tech-terminal"));
}

{
  const offeredTarget = planNativeResearchPrerequisites(
    input({
      offeredActionIds: new Set(["tech-terminal"]),
    }),
  );
  assert.equal(offeredTarget.targetStatus, "unsatisfied");
  assert.ok(offeredTarget.actionableFrontier.includes("tech-terminal"));
  assert.equal(
    graphByRequirement(offeredTarget, "research:power:2").declaredStatus,
    "unsatisfied",
    "native offer membership does not erase the declared observed level",
  );
}

console.log("native Research prerequisite planner tests passed");
