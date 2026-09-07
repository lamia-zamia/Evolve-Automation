import assert from "node:assert/strict";

import { createCapturedConstructionAdapter } from "../src/adapters/evolve/progression/construction/captured-construction.ts";
import {
  createCapturedProjectSource,
  isProjectAutomationEnabled,
  readCapturedProjectSettings,
} from "../src/adapters/evolve/progression/research/captured-project.ts";
import { runBuildAutomation } from "../src/application/build.ts";
import {
  NO_PROJECT_CONTEXT,
  planProjects,
} from "../src/domain/progression/research/project.ts";
import { createCapturedProjectContextReader } from "../src/adapters/evolve/progression/research/captured-project-context.ts";

const offered = (id, overrides = {}) => ({
  elementId: `arpa${id}`,
  projectId: id,
  rank: 0,
  progress: 0,
  cost: { Money: 10 },
  generation: 1,
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
      generation: project.generation,
      rank: project.rank,
      progress: project.progress,
      steps: project.steps,
      cost: project.cost,
    })),
    [
      {
        elementId: "arpalhc",
        projectId: "lhc",
        generation: 1,
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

function makeAdapter({
  progress = 20,
  generation = 2,
  conflict = { status: "none" },
  queue = [],
  catalog = undefined,
  settings = undefined,
  context = NO_PROJECT_CONTEXT,
} = {}) {
  if (catalog === undefined) {
    catalog = [offered("lhc", { rank: 1, progress, generation: 2 })];
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
  const root = {
    arpa: { lhc: { rank: 1, complete: progress } },
    resource: { Money: { display: true, amount: 1000, max: 1000, diff: 10 } },
    queue: { queue },
  };
  const calls = [];
  const controls = {
    resolve: (elementId) => ({ elementId, generation, methods: ["build"] }),
    capturedElementIds: () => ["arpalhc"],
    invoke(handle, method, args = []) {
      calls.push([handle.elementId, method, ...args]);
      if (handle.generation !== generation)
        return { ok: false, reason: "stale-control" };
      const steps = args[1];
      if (root.resource.Money.amount < steps * 10)
        return { ok: true, value: undefined };
      root.resource.Money.amount -= steps * 10;
      root.arpa.lhc.complete += steps;
      if (root.arpa.lhc.complete >= 100) {
        root.arpa.lhc.rank++;
        root.arpa.lhc.complete = 0;
      }
      return { ok: true, value: undefined };
    },
  };
  const rootState = {
    readRoot: () => root,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
  const resources = {
    readResources(ids) {
      return {
        resources: new Map(
          [...ids].map((id) => {
            const resource = root.resource[id];
            return [
              id,
              resource === undefined
                ? {
                    unlocked: false,
                    amount: 0,
                    max: 0,
                    rateOfChange: 0,
                    storageRatio: 0,
                  }
                : {
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
            return catalog ?? undefined;
          },
        },
        resources,
        controls,
        context: { readContext: () => context },
        readSettings: () => settings,
      }),
    ],
    resources,
    conflicts: { evaluate: () => conflict },
    readOptions: () => ({
      consumptionMode: "unlimited",
      buildIfStorageFull: false,
      ignoreZeroRate: false,
      respectReservations: true,
    }),
  });
  return { adapter, root, calls, reads: () => catalogReads };
}

// The captured row's build method advances the sampled project and no redraw method is involved.
{
  const page = makeAdapter();
  assert.equal(runBuildAutomation(page.adapter).status, "succeeded");
  assert.deepEqual(page.calls, [["arpalhc", "build", "lhc", 5]]);
  assert.equal(page.root.arpa.lhc.complete, 25);
  assert.equal(page.root.resource.Money.amount, 950);
}

// A queue owns the same project, and a reservation owns overlapping resources: neither is spent.
{
  const queued = makeAdapter({ queue: [{ id: "arpalhc" }] });
  assert.equal(runBuildAutomation(queued.adapter).status, "succeeded");
  assert.deepEqual(queued.calls, []);

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
  assert.equal(runBuildAutomation(reserved.adapter).status, "succeeded");
  assert.deepEqual(reserved.calls, []);
}

// The executor refuses a redrawn closure and a project whose rank/progress moved after planning.
{
  const redrawn = makeAdapter({ generation: 3 });
  redrawn.adapter.reader.beginCycle();
  assert.equal(
    redrawn.adapter.executor.executeClick({ index: 0, key: "arpalhc" }).outcome
      .failure.code,
    "stale-project-control",
  );
  assert.deepEqual(redrawn.calls, []);

  const moved = makeAdapter();
  moved.adapter.reader.beginCycle();
  moved.root.arpa.lhc.complete++;
  assert.equal(
    moved.adapter.executor.executeClick({ index: 0, key: "arpalhc" }).outcome
      .failure.code,
    "stale-project-state",
  );
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
  const failed = makeAdapter({ catalog: null });
  assert.equal(runBuildAutomation(failed.adapter).status, "succeeded");
  assert.deepEqual(failed.calls, []);
  assert.equal(failed.reads(), 1);
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
