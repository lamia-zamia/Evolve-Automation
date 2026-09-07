import assert from "node:assert/strict";

import {
  createCapturedProjectAdapter,
  readCapturedProjectSettings,
} from "../src/adapters/evolve/progression/research/captured-project.ts";
import { runBuildAutomation } from "../src/application/build.ts";
import { planProjects } from "../src/domain/progression/research/project.ts";

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
} = {}) {
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
  const adapter = createCapturedProjectAdapter({
    rootState,
    offered: [offered("lhc", { rank: 1, progress, generation: 2 })],
    resources,
    conflicts: { evaluate: () => conflict },
    controls,
    readSettings: () => ({
      autoARPA: true,
      arpaStep: 5,
      arpaScaleWeighting: true,
      arpa_lhc: true,
      arpa_p_lhc: 0,
      arpa_m_lhc: -1,
      arpa_w_lhc: 2,
    }),
  });
  return { adapter, root, calls };
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

console.log("captured project tests passed");
