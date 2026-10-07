import assert from "node:assert/strict";

import { createCapturedConstructionAdapter } from "../../../src/adapters/evolve/progression/construction/captured-construction.ts";
import {
  createCapturedProjectSource,
  isProjectAutomationEnabled,
  readCapturedProjectSettings,
} from "../../../src/adapters/evolve/progression/research/captured-project.ts";
import { runBuildAutomation } from "../../../src/application/build.ts";
import {
  NO_PROJECT_CONTEXT,
  planProjects,
  planProjectsWithRejections,
} from "../../../src/domain/progression/research/project.ts";
import { createCapturedProjectContextReader } from "../../../src/adapters/evolve/progression/research/captured-project-context.ts";

const offered = (id, overrides = {}) => ({
  elementId: `arpa${id}`,
  projectId: id,
  rank: 0,
  progress: 0,
  cost: { Money: 10 },
  ...overrides,
});

// Step size is bounded by rank completion and storage, then contributes to the effective weight.
{
  const projects = [
    offered("lhc", { progress: 95, cost: { Money: 10, Knowledge: 4 } }),
    offered("monument", { cost: { Money: 5 } }),
  ];
  const settings = {
    enabled: true,
    stepPercent: 10,
    scaleWeighting: true,
    targets: [
      {
        projectId: "lhc",
        enabled: true,
        priority: 1,
        maximum: -1,
        weighting: 2,
      },
      {
        projectId: "monument",
        enabled: true,
        priority: 0,
        maximum: 0,
        weighting: 100,
      },
    ],
  };
  const planned = planProjects({
    settings,
    projects,
    capacities: {
      Money: { unlocked: true, maximum: 30 },
      Knowledge: { unlocked: true, maximum: 100 },
    },
    context: NO_PROJECT_CONTEXT,
  });
  assert.ok(Math.abs(planned[0].weighting - 120) < 1e-9);
  assert.deepEqual(
    planned.map((project) => ({
      elementId: project.elementId,
      projectId: project.projectId,
      rank: project.rank,
      progress: project.progress,
      steps: project.steps,
      cost: project.cost,
    })),
    [
      {
        elementId: "arpalhc",
        projectId: "lhc",
        rank: 0,
        progress: 95,
        steps: 3,
        cost: { Money: 30, Knowledge: 12 },
      },
    ],
  );
}

// Imported settings are normalized rather than leaking NaN or oversized steps into the planner.
{
  assert.deepEqual(
    readCapturedProjectSettings(
      {
        autoARPA: 1,
        arpaStep: 900,
        arpaScaleWeighting: true,
        arpa_lhc: true,
        arpa_p_lhc: "bad",
        arpa_m_lhc: -1,
        arpa_w_lhc: 5,
      },
      [offered("lhc")],
    ),
    {
      enabled: true,
      stepPercent: 100,
      scaleWeighting: true,
      targets: [
        {
          projectId: "lhc",
          enabled: true,
          priority: 0,
          maximum: -1,
          weighting: 5,
        },
      ],
    },
  );
}

// The same pure planner decision that feeds candidate generation exposes each named gate to the
// explicitly enabled diagnostics path.
{
  const projectIds = ["disabled", "zero", "maximum", "capacity", "ready"];
  const result = planProjectsWithRejections({
    settings: {
      enabled: true,
      stepPercent: 5,
      scaleWeighting: false,
      targets: projectIds.map((projectId) => ({
        projectId,
        enabled: projectId !== "disabled",
        priority: 0,
        maximum: projectId === "maximum" ? 2 : -1,
        weighting: projectId === "zero" ? 0 : 1,
      })),
    },
    projects: projectIds.map((projectId) =>
      offered(projectId, {
        rank: projectId === "maximum" ? 2 : 0,
        cost: { Money: projectId === "capacity" ? 10 : 1 },
      }),
    ),
    capacities: { Money: { unlocked: true, maximum: 5 } },
    context: NO_PROJECT_CONTEXT,
  });
  assert.deepEqual(
    result.rejections.map(({ projectId, reason }) => [projectId, reason]),
    [
      ["disabled", "disabled"],
      ["zero", "zero-weighting"],
      ["maximum", "maximum-reached"],
      ["capacity", "capacity-rejected"],
    ],
  );
  assert.deepEqual(
    result.candidates.map((project) => project.projectId),
    ["ready"],
  );
  const suppressed = planProjectsWithRejections({
    settings: {
      enabled: true,
      stepPercent: 5,
      scaleWeighting: false,
      targets: [],
    },
    projects: [offered("ready")],
    capacities: {},
    context: { suppressed: true, overrides: {} },
  });
  assert.deepEqual(suppressed.rejections, [
    { projectId: "ready", reason: "run-context-suppressed" },
  ]);
}

function makeAdapter({
  progress = 20,
  buildVerdict = "built",
  conflict = { status: "none" },
  queue = [],
  catalog = undefined,
  settings = undefined,
  context = NO_PROJECT_CONTEXT,
  actionModes = {},
  onDiagnostic = undefined,
  resourcesAvailable = true,
} = {}) {
  if (catalog === undefined) {
    catalog = [offered("lhc", { rank: 1, progress })];
  }
  settings ??= {
    autoARPA: true,
    arpaStep: 5,
    arpaScaleWeighting: true,
    arpa_lhc: true,
    arpa_p_lhc: 0,
    arpa_m_lhc: -1,
    arpa_w_lhc: 2,
  };
  const entries = catalog ?? [];
  const root = {
    arpa: Object.fromEntries(
      entries.map((project) => [
        project.projectId,
        { rank: project.rank, complete: project.progress },
      ]),
    ),
    resource: { Money: { display: true, amount: 1000, max: 1000, diff: 10 } },
    queue: { queue },
  };
  const calls = [];
  const activity = [];
  // The running bundle's own project build, as the captured mechanics answer it. The authority
  // bracket lives in the real adapter; this fake only performs the native mutation.
  const mechanics = {
    ensureCaptured: () => ({ kind: "captured" }),
    readOffers: () =>
      entries.map((project) => ({
        projectId: project.projectId,
        rank: root.arpa[project.projectId]?.rank ?? 0,
        progress: root.arpa[project.projectId]?.complete ?? 0,
        percentCosts: project.cost,
      })),
    buildPercent(sample, plan) {
      if (sample !== root)
        return { kind: "stale", reason: "the game root was replaced" };
      if (buildVerdict === "unavailable")
        return {
          kind: "unavailable",
          reason: "the native build is unavailable",
        };
      const project = entries.find(
        (entry) => entry.projectId === plan.projectId,
      );
      if (project === undefined)
        return {
          kind: "stale",
          reason: "the project left the native registry",
        };
      const current = root.arpa[plan.projectId] ?? { rank: 0, complete: 0 };
      if (current.rank !== plan.rank || current.complete !== plan.progress)
        return {
          kind: "stale",
          reason: "the project moved after it was sampled",
        };
      calls.push([
        `arpa${plan.projectId}`,
        "build",
        plan.projectId,
        plan.percent,
      ]);
      if (actionModes[plan.projectId] === "no-op") {
        return {
          kind: "stale",
          reason: "the native build moved 0 of 1 points",
        };
      }
      const state = root.arpa[plan.projectId];
      const price = project.cost.Money ?? 0;
      let steps = 0;
      for (let index = 0; index < plan.percent; index++) {
        if (root.resource.Money.amount < price) break;
        root.resource.Money.amount -= price;
        state.complete += 1;
        if (state.complete >= 100) {
          state.rank++;
          state.complete = 0;
        }
        steps++;
      }
      if (steps === 0)
        return { kind: "stale", reason: "the native build moved 0 points" };
      return {
        kind: "built",
        rank: state.rank,
        progress: state.complete,
        charged: { Money: steps * price },
      };
    },
  };
  const rootState = {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
  const resources = {
    readResources(ids) {
      if (!resourcesAvailable) return undefined;
      return {
        resources: new Map(
          [...ids].map((id) => {
            const resource = root.resource[id];
            return [
              id,
              resource === undefined
                ? {
                    present: false,
                    unlocked: false,
                    amount: 0,
                    max: 0,
                    rateOfChange: 0,
                    storageRatio: 0,
                  }
                : {
                    present: true,
                    unlocked: resource.display,
                    amount: resource.amount,
                    max: resource.max,
                    rateOfChange: resource.diff,
                    storageRatio: resource.amount / resource.max,
                  },
            ];
          }),
        ),
      };
    },
  };
  let catalogReads = 0;
  const adapter = createCapturedConstructionAdapter({
    sources: [
      createCapturedProjectSource({
        rootState,
        catalog: {
          readProjects() {
            catalogReads++;
            return catalog?.map((project) => ({
              ...project,
              rank: root.arpa[project.projectId]?.rank,
              progress: root.arpa[project.projectId]?.complete,
            }));
          },
        },
        resources,
        mechanics,
        readProjectLabel: () => "Large Hadron Collider",
        context: { readContext: () => context },
        readSettings: () => settings,
        onActivity: (activityEntry) => activity.push(activityEntry.message),
        ...(onDiagnostic === undefined ? {} : { onDiagnostic }),
      }),
    ],
    resources,
    rootState,
    conflicts: { evaluate: () => conflict },
    readOptions: () => ({
      consumptionMode: "unlimited",
      buildIfStorageFull: false,
      ignoreZeroRate: false,
      respectReservations: true,
    }),
  });
  return {
    adapter,
    root,
    calls,
    activity,
    reads: () => catalogReads,
    setCatalog: (next) => {
      catalog = next;
    },
  };
}

// Old Project.updateResourceRequirements refreshes the next currentStep chunk before demand.
// Keep the completed weight order, but use the current progress for the same rank's next chunk.
{
  const settings = {
    autoARPA: true,
    arpaStep: 5,
    arpaScaleWeighting: true,
    arpa_lhc: true,
    arpa_p_lhc: 0,
    arpa_m_lhc: -1,
    arpa_w_lhc: 2,
  };
  const fixture = makeAdapter({
    progress: 95,
    settings,
    catalog: [
      offered("lhc", {
        rank: 1,
        progress: 95,
        cost: { Money: 10, Stone: 4 },
      }),
    ],
  });
  fixture.root.resource.Money.amount = 0;
  fixture.root.resource.Stone = {
    display: true,
    amount: 0,
    max: 1000,
    diff: 1,
  };
  assert.equal(runBuildAutomation(fixture.adapter).status, "succeeded");
  assert.deepEqual(fixture.adapter.observations.readSavingTarget(), {
    name: "arpalhc",
    cost: { Money: 50, Stone: 20 },
  });
  fixture.root.arpa.lhc.complete = 98;
  assert.deepEqual(fixture.adapter.observations.readSavingTarget(), {
    name: "arpalhc",
    cost: { Money: 20, Stone: 8 },
  });
  assert.equal(fixture.reads(), 3);
  fixture.root.arpa.lhc.rank = 2;
  fixture.root.arpa.lhc.complete = 0;
  fixture.setCatalog([
    offered("lhc", {
      rank: 2,
      progress: 0,
      cost: { Money: 25, Stone: 9 },
    }),
  ]);
  assert.deepEqual(fixture.adapter.observations.readSavingTarget(), {
    name: "arpalhc",
    cost: { Money: 125, Stone: 45 },
  });
  assert.deepEqual(fixture.calls, []);
  fixture.setCatalog([]);
  assert.equal(fixture.adapter.observations.readSavingTarget(), null);
  fixture.setCatalog(undefined);
  assert.throws(
    () => fixture.adapter.observations.readSavingTarget(),
    /saving cost unavailable/,
  );
  settings.arpa_lhc = false;
  assert.equal(fixture.adapter.observations.readSavingTarget(), null);
}

// Explicit diagnostics identify each project-planning gate without requiring a synthetic planner
// candidate to reach the shared construction runner.
{
  const targetSettings = {
    autoARPA: true,
    arpaStep: 5,
    arpaScaleWeighting: false,
    arpa_lhc: true,
    arpa_p_lhc: 0,
    arpa_m_lhc: -1,
    arpa_w_lhc: 2,
  };
  const cases = [
    [
      "disabled",
      { settings: { ...targetSettings, arpa_lhc: false } },
      "ARPA project disabled: lhc",
    ],
    [
      "zero weighting",
      { settings: { ...targetSettings, arpa_w_lhc: 0 } },
      "ARPA project zero weighting: lhc",
    ],
    [
      "maximum reached",
      {
        catalog: [offered("lhc", { rank: 2 })],
        settings: { ...targetSettings, arpa_m_lhc: 2 },
      },
      "ARPA maximum reached: lhc",
    ],
    [
      "suppressed run context",
      { context: { suppressed: true, overrides: {} } },
      "ARPA suppressed by run context: lhc",
    ],
    [
      "excluded run context",
      {
        context: { suppressed: false, overrides: { lhc: { excluded: true } } },
      },
      "ARPA excluded by run context: lhc",
    ],
    [
      "capacity",
      {
        catalog: [offered("lhc", { cost: { Money: 1001 } })],
      },
      "ARPA capacity rejected: lhc",
    ],
  ];
  for (const [label, overrides, expectedDiagnostic] of cases) {
    const diagnostics = [];
    const page = makeAdapter({
      settings: targetSettings,
      ...overrides,
      onDiagnostic: (message) => diagnostics.push(message),
    });
    assert.equal(
      runBuildAutomation({
        ...page.adapter,
        onDiagnostic: (message) => diagnostics.push(message),
      }).status,
      "succeeded",
      `${label} gate should be a normal skipped candidate`,
    );
    assert.deepEqual(page.calls, [], `${label} gate must not invoke build`);
    assert.ok(
      diagnostics.includes(expectedDiagnostic),
      `missing diagnostic ${expectedDiagnostic}: ${diagnostics.join(" | ")}`,
    );
  }
}

// A native build that moves nothing is not a purchase: the authority bracket fails it stale, and
// the lower-ranked project is not invoked behind an unverified mutation.
{
  const page = makeAdapter({
    catalog: [
      offered("lhc", { rank: 1, progress: 20 }),
      offered("monument", { rank: 1, progress: 20 }),
    ],
    settings: {
      autoARPA: true,
      arpaStep: 5,
      arpaScaleWeighting: false,
      arpa_lhc: true,
      arpa_p_lhc: 0,
      arpa_m_lhc: -1,
      arpa_w_lhc: 2,
      arpa_monument: true,
      arpa_p_monument: 1,
      arpa_m_monument: -1,
      arpa_w_monument: 1,
    },
    actionModes: { lhc: "no-op" },
  });
  const outcome = runBuildAutomation(page.adapter);
  assert.equal(outcome.status, "stale");
  assert.equal(outcome.failure.code, "stale-project-state");
  assert.deepEqual(page.calls, [["arpalhc", "build", "lhc", 5]]);
  assert.equal(page.root.arpa.monument.complete, 20);
}

// The captured row's build method advances the sampled project and no redraw method is involved.
{
  const sourceDiagnostics = [];
  const plannerDiagnostics = [];
  const page = makeAdapter({
    onDiagnostic: (message) => sourceDiagnostics.push(message),
  });
  assert.equal(
    runBuildAutomation({
      ...page.adapter,
      onDiagnostic: (message) => plannerDiagnostics.push(message),
    }).status,
    "succeeded",
  );
  assert.deepEqual(page.calls, [["arpalhc", "build", "lhc", 5]]);
  assert.deepEqual(page.activity, ["Built Large Hadron Collider (1:25%)"]);
  assert.equal(page.root.arpa.lhc.complete, 25);
  assert.equal(page.root.resource.Money.amount, 950);
  assert.ok(
    sourceDiagnostics.some((message) =>
      message.includes("ARPA candidate produced: lhc 5%"),
    ),
  );
  assert.ok(
    sourceDiagnostics.some((message) =>
      message.includes("ARPA action invoked: lhc 5%"),
    ),
  );
}

// A queue owns the same project, and a reservation owns overlapping resources: neither is spent.
{
  const queueDiagnostics = [];
  const queued = makeAdapter({ queue: [{ id: "arpalhc" }] });
  assert.equal(
    runBuildAutomation({
      ...queued.adapter,
      onDiagnostic: (message) => queueDiagnostics.push(message),
    }).status,
    "succeeded",
  );
  assert.deepEqual(queued.calls, []);
  assert.ok(
    queueDiagnostics.some((message) =>
      message.includes("ARPA candidate blocked by reservation/planner"),
    ),
  );

  const reservationDiagnostics = [];
  const reserved = makeAdapter({
    conflict: {
      status: "conflict",
      conflict: {
        targetNames: ["Queued Farm"],
        resourceNames: ["Money"],
        targetCause: "Queue",
      },
    },
  });
  assert.equal(
    runBuildAutomation({
      ...reserved.adapter,
      onDiagnostic: (message) => reservationDiagnostics.push(message),
    }).status,
    "succeeded",
  );
  assert.deepEqual(reserved.calls, []);
  assert.ok(
    reservationDiagnostics.some(
      (message) =>
        message.includes("ARPA candidate blocked by reservation/planner") &&
        message.includes("Queued Farm") &&
        message.includes("Money") &&
        message.includes("Queue"),
    ),
  );
}

// The executor refuses an unavailable native build and a project whose rank/progress moved after planning.
{
  const actionDiagnostics = [];
  const redrawn = makeAdapter({
    buildVerdict: "unavailable",
    catalog: [
      offered("lhc", { rank: 1, progress: 20 }),
      offered("monument", { rank: 1, progress: 20 }),
    ],
    settings: {
      autoARPA: true,
      arpaStep: 5,
      arpaScaleWeighting: false,
      arpa_lhc: true,
      arpa_p_lhc: 0,
      arpa_m_lhc: -1,
      arpa_w_lhc: 2,
      arpa_monument: true,
      arpa_p_monument: 1,
      arpa_m_monument: -1,
      arpa_w_monument: 1,
    },
    onDiagnostic: (message) => actionDiagnostics.push(message),
  });
  const redrawnOutcome = runBuildAutomation(redrawn.adapter);
  assert.equal(redrawnOutcome.status, "rejected");
  assert.equal(redrawnOutcome.failure.code, "project-build-failed");
  // A refusal from the mutation authority is caught by its own bracket, so nothing is invoked.
  assert.deepEqual(redrawn.calls, []);
  assert.ok(
    actionDiagnostics.some((message) =>
      message.includes("ARPA action failed/stale"),
    ),
  );

  const moved = makeAdapter();
  moved.adapter.reader.beginCycle();
  moved.root.arpa.lhc.complete++;
  assert.equal(
    moved.adapter.executor.executeClick({ index: 0, key: "arpalhc" }).outcome
      .failure.code,
    "stale-project-state",
  );
  // The stale sample is caught by the mutation authority's own bracket, so the native build is
  // never invoked.
  assert.deepEqual(moved.calls, []);
}

// With A.R.P.A. automation off the cycle never reaches for the catalog, so no player who leaves
// the feature alone pays for a discovery pass.
{
  const off = makeAdapter({ settings: { autoARPA: false } });
  assert.equal(runBuildAutomation(off.adapter).status, "succeeded");
  assert.equal(off.reads(), 0);
  assert.deepEqual(off.calls, []);
  assert.equal(isProjectAutomationEnabled({ autoARPA: false }), false);
  assert.equal(isProjectAutomationEnabled(undefined), false);
  assert.equal(isProjectAutomationEnabled({ autoARPA: 1 }), true);
}

// A discovery pass that failed leaves no catalog: nothing is offered, and nothing is planned from
// the previous cycle's offers.
{
  const diagnostics = [];
  const failed = makeAdapter({
    catalog: null,
    onDiagnostic: (message) => diagnostics.push(message),
  });
  assert.equal(
    runBuildAutomation({
      ...failed.adapter,
      onDiagnostic: (message) => diagnostics.push(message),
    }).status,
    "succeeded",
  );
  assert.deepEqual(failed.calls, []);
  assert.equal(failed.reads(), 1);
  assert.equal(failed.adapter.observations.hasCompletedOrdering(), false);
  assert.throws(
    () => failed.adapter.observations.readSavingTarget(),
    /order is not established/,
  );
  assert.ok(
    diagnostics.some((message) => message.includes("ARPA catalog unavailable")),
  );

  const unpriced = makeAdapter({ resourcesAvailable: false });
  assert.equal(runBuildAutomation(unpriced.adapter).status, "succeeded");
  assert.equal(unpriced.adapter.observations.hasCompletedOrdering(), false);
  assert.deepEqual(unpriced.calls, []);
}

// --- the run context: gates that are about the run, not about one project ------------------------

// The pure planner applies each override in the game's own order: exclusion and the maximum first,
// then the multiplier, then optional progress scaling.
{
  const settings = {
    enabled: true,
    stepPercent: 1,
    scaleWeighting: false,
    targets: [
      {
        projectId: "syphon",
        enabled: true,
        priority: 0,
        maximum: 2,
        weighting: 10,
      },
    ],
  };
  const projects = [offered("syphon", { rank: 2, cost: { Money: 10 } })];
  const capacities = { Money: { unlocked: true, maximum: 1000 } };
  const plan = (context) =>
    planProjects({ settings, projects, capacities, context });

  assert.deepEqual(plan(NO_PROJECT_CONTEXT), [], "the maximum still applies");
  assert.deepEqual(
    plan({ suppressed: true, overrides: { syphon: { ignoreMaximum: true } } }),
    [],
    "a suppressed run builds nothing at all",
  );
  assert.equal(
    plan({ suppressed: false, overrides: { syphon: { ignoreMaximum: true } } })
      .length,
    1,
    "the prestige plan builds past the configured maximum",
  );
  assert.deepEqual(
    plan({
      suppressed: false,
      overrides: { syphon: { ignoreMaximum: true, excluded: true } },
    }),
    [],
    "a project this run does not want is not built at any weighting",
  );
  assert.equal(
    plan({
      suppressed: false,
      overrides: { syphon: { ignoreMaximum: true, weightMultiplier: 10 } },
    })[0].weighting,
    100,
  );
  assert.deepEqual(
    plan({
      suppressed: false,
      overrides: { syphon: { ignoreMaximum: true, weightMultiplier: 0 } },
    }),
    [],
    "a multiplier that zeroes the weighting drops the candidate",
  );
}

/** Trait, tech and resource samples that answer for exactly what they are asked. */
function makeWorld({
  traits = {},
  tech = {},
  manaRate = 0,
  achievements = { stars: {}, banana: {} },
} = {}) {
  return {
    traits: {
      readRaceTraits: (ids) => ({
        ranks: new Map([...ids].map((id) => [id, Number(traits[id] ?? 0)])),
      }),
    },
    tech: {
      readTech: (ids) => ({
        levels: new Map([...ids].map((id) => [id, Number(tech[id] ?? 0)])),
      }),
    },
    resources: {
      readResources: (ids) => ({
        resources: new Map(
          [...ids].map((id) => [
            id,
            {
              unlocked: true,
              amount: 0,
              max: 0,
              rateOfChange: id === "Mana" ? manaRate : 0,
              storageRatio: 0,
            },
          ]),
        ),
      }),
    },
    achievements: {
      readAchievementState: (achievementIds, bananaObjectiveIds) => ({
        stars: new Map(
          [...achievementIds].map((id) => [
            id,
            Number(achievements.stars[id] ?? 0),
          ]),
        ),
        bananaObjectives: new Map(
          [...bananaObjectiveIds].map((id) => [
            id,
            Boolean(achievements.banana[id]),
          ]),
        ),
      }),
    },
  };
}

function readContext(world, settings) {
  return createCapturedProjectContextReader({
    ...world,
    readSettings: () => settings,
  }).readContext();
}

// Pre-MAD suppression follows the game's own early-game rule, and only when asked for.
{
  const early = makeWorld();
  assert.equal(readContext(early, {}).suppressed, false, "off by default");
  assert.equal(
    readContext(early, { prestigeMADIgnoreArpa: true }).suppressed,
    true,
  );
  assert.equal(
    readContext(makeWorld({ tech: { mad: 1 } }), {
      prestigeMADIgnoreArpa: true,
    }).suppressed,
    false,
    "MAD is researched, so the run is past the early game",
  );
  assert.equal(
    readContext(makeWorld({ traits: { cataclysm: 1 } }), {
      prestigeMADIgnoreArpa: true,
    }).suppressed,
    false,
    "a start that begins past MAD is never early",
  );
  // The true-path family is measured by high_tech instead, and MAD says nothing about it.
  assert.equal(
    readContext(makeWorld({ traits: { truepath: 1 }, tech: { mad: 1 } }), {
      prestigeMADIgnoreArpa: true,
    }).suppressed,
    true,
  );
  assert.equal(
    readContext(
      makeWorld({ traits: { truepath: 1 }, tech: { high_tech: 7 } }),
      { prestigeMADIgnoreArpa: true },
    ).suppressed,
    false,
  );
}

// The Mana Syphon is the one project the prestige plan overrides.
{
  const plain = makeWorld();
  assert.deepEqual(readContext(plain, {}).overrides, {});

  assert.deepEqual(
    readContext(plain, { autoPrestige: true, prestigeType: "vacuum" })
      .overrides,
    { syphon: { ignoreMaximum: true } },
    "a Vacuum Collapse is reached by building Syphons past their maximum",
  );
  assert.deepEqual(
    readContext(plain, { autoPrestige: false, prestigeType: "vacuum" })
      .overrides,
    {},
    "with auto prestige off the vacuum plan is not being pursued",
  );

  assert.deepEqual(
    readContext(makeWorld({ traits: { witch_hunter: 1 } }), {
      prestigeBioseedConstruct: true,
      prestigeType: "bioseed",
    }).overrides,
    { syphon: { excluded: true } },
    "a witch hunter building for a bioseed does not want Syphons",
  );
  assert.deepEqual(
    readContext(makeWorld({ traits: { witch_hunter: 1 } }), {
      prestigeBioseedConstruct: true,
      prestigeType: "vacuum",
    }).overrides,
    {},
    "under a vacuum plan the Syphon is exactly what is wanted",
  );
}

// The final Vacuum Collapse stage is decided by Mana regeneration, not by Syphon count.
{
  const ready = makeWorld({ manaRate: 12 });
  assert.deepEqual(
    readContext(ready, { autoPrestige: true, prestigeType: "vacuum" })
      .overrides,
    { syphon: { ignoreMaximum: true, weightMultiplier: 10 } },
  );
  assert.deepEqual(
    readContext(makeWorld({ manaRate: 4 }), {
      autoPrestige: true,
      prestigeType: "vacuum",
    }).overrides,
    { syphon: { ignoreMaximum: true } },
    "below the required regeneration the run is still producing Mana",
  );
  assert.deepEqual(
    readContext(ready, {
      autoPrestige: true,
      prestigeType: "vacuum",
      prestigeVacuumMana: 20,
      buildingWeightingVacuumCollapse: 3,
    }).overrides,
    { syphon: { ignoreMaximum: true } },
    "the player's own requirement and multiplier are used",
  );
  assert.deepEqual(
    readContext(makeWorld({ manaRate: 25 }), {
      autoPrestige: true,
      prestigeType: "vacuum",
      prestigeVacuumMana: 20,
      buildingWeightingVacuumCollapse: 3,
    }).overrides,
    { syphon: { ignoreMaximum: true, weightMultiplier: 3 } },
  );
}

// Achievement-gated project multipliers are sampled only for the relevant run.
{
  const banana = readContext(
    makeWorld({
      traits: { banana: 1 },
      achievements: { stars: {}, banana: { b5: false } },
    }),
    {
      achievementGuards: true,
      guardBananaRepublic: true,
      buildingWeightingBananaObjective: 3,
    },
  );
  assert.deepEqual(banana.overrides, {
    monument: { weightMultiplier: 3 },
  });

  const complete = readContext(
    makeWorld({
      traits: { banana: 1 },
      achievements: { stars: {}, banana: { b5: true } },
    }),
    { achievementGuards: true, guardBananaRepublic: true },
  );
  assert.deepEqual(complete.overrides, {});
}

{
  const inflation = readContext(
    makeWorld({
      traits: { inflation: 1, no_plasmid: 1 },
      achievements: { stars: { wheelbarrow: 1 }, banana: {} },
    }),
    {
      inflationChallengeAssist: true,
      buildingWeightingInflationMoney: 4,
    },
  );
  assert.deepEqual(inflation.overrides, {
    stock_exchange: { weightMultiplier: 4 },
  });

  const earned = readContext(
    makeWorld({
      traits: { inflation: 1, no_plasmid: 1 },
      achievements: { stars: { wheelbarrow: 2 }, banana: {} },
    }),
    { inflationChallengeAssist: true },
  );
  assert.deepEqual(earned.overrides, {});
}

console.log("captured project tests passed");
