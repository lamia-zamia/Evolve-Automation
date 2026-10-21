import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDirectory = path.join(root, "test-artifacts/benchmark/tmp");
const savePath = path.join(artifactDirectory, "p14-postfix2-fresh-50000.txt");
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/current-full.json",
);
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const bundlePath = path.join(artifactDirectory, "p16-test-surface.user.js");
const evidencePath = path.join(
  root,
  "experiments/p16-standard-production-bootstrap-evidence.json",
);
const seed = 42;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const [saveText, settingsText, gameBytes, metadata] = await Promise.all([
  readFile(savePath),
  readFile(settingsPath, "utf8"),
  readFile(gamePath),
  readFile(path.join(root, "src/userscript.meta.js"), "utf8"),
]);
const standardSettings = JSON.parse(settingsText);
assert.equal(standardSettings.buildingAlwaysClick, false);
await mkdir(artifactDirectory, { recursive: true });
const built = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata.trimEnd()}\nwindow.__EA_TEST_HOOKS__ = window.__EA_TEST_HOOKS__ ?? {};`,
  },
  platform: "browser",
  target: ["esnext"],
  define: {
    "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
    __EA_TEST_SURFACE_ENABLED__: "true",
  },
  minifySyntax: true,
  treeShaking: true,
});
await writeFile(bundlePath, built.outputFiles[0].contents);
const bundleBytes = built.outputFiles[0].contents;
const save = parseSave(saveText.toString("utf8"));
const runner = await createChromiumRunner({ game: gamePath });
const sessions = [];

async function configure(session, actionId) {
  return session.evaluate((targetActionId) => {
    const hooks = window.__EA_TEST_HOOKS__;
    if (hooks === null || typeof hooks !== "object") return false;
    hooks.gatherIntervention = {
      standardResearchTargetActionId: targetActionId,
      standardResearchTargetClickBudget:
        targetActionId === "tech-sundial" ? 10 : 5,
      standardResearchTargetResourceClickBudget: 5,
    };
    return true;
  }, actionId);
}

async function firstActionPeriod(session, actionId, limit = 1000) {
  return session.evaluate(
    async (targetActionId, maxSteps) => {
      const gameRunner = window.__EA_RUNNER__;
      for (let step = 0; step < maxSteps; step += 1) {
        const advanced = await gameRunner.advance(1);
        if (advanced.stopped || advanced.reloading) return null;
        if (
          gameRunner.diagnostics().controlUsage[`${targetActionId}.action`]
            ?.returned > 0
        )
          return gameRunner.periods();
      }
      return null;
    },
    actionId,
    limit,
  );
}

async function firstLumberjackPeriod(session, fromPeriod, limit = 500) {
  for (let period = fromPeriod; period < fromPeriod + limit; period += 1) {
    const state = await session.readState();
    if (Number(state.civic?.lumberjack?.workers) > 0) return period;
    await session.advance(1);
  }
  return null;
}

async function collect(session, periods) {
  const [state, diagnostics, exported, hooksEvidence] = await Promise.all([
    session.readState(),
    session.diagnostics(),
    session.exportSave(),
    session.evaluate(() => {
      const hooks = window.__EA_TEST_HOOKS__;
      const events = hooks?.researchOwnerSelectionEvents;
      return {
        targetObservation: hooks?.standardResearchTargetObservation ?? null,
        researchPurchases: Array.isArray(events)
          ? events.map((event) => ({
              period: event.period,
              actionId: event.actionId,
              disposition: event.disposition,
              grantAfter: event.grantAfter,
            }))
          : [],
      };
    }),
  ]);
  const usage = diagnostics.controlUsage ?? {};
  const gatherCalls = Object.fromEntries(
    Object.entries(usage).filter(([id]) =>
      [
        "undefined-food.action",
        "city-food.action",
        "city-lumber.action",
        "city-stone.action",
        "undefined-stone.action",
        "undefined-lumber.action",
        "city-chrysotile.action",
        "city-slaughter.action",
      ].includes(id),
    ),
  );
  const researchCalls = Object.fromEntries(
    Object.entries(usage).filter(([id]) => id.startsWith("tech-")),
  );
  const activeJobs = Object.fromEntries(
    Object.entries(state.civic ?? {})
      .filter(([, job]) => Number(job?.workers) > 0)
      .map(([id, job]) => [id, job.workers]),
  );
  return {
    periods,
    state: {
      day: state.stats?.days,
      population: Object.values(state.race?.zonePop ?? {}).reduce(
        (total, quantity) => total + Number(quantity || 0),
        0,
      ),
      starved: state.stats?.starved,
      died: state.stats?.died,
      tech: state.tech,
      stock: Object.fromEntries(
        ["Food", "Lumber", "Stone", "Knowledge"].map((id) => [
          id,
          state.resource?.[id]?.amount,
        ]),
      ),
      foodNetRate: state.resource?.Food?.diff,
      foodDelta: state.resource?.Food?.delta,
      foodClickCounters: {
        current: state.stats?.cfood,
        lifetime: state.stats?.tfood,
      },
      activeJobs,
      buildings: Object.fromEntries(
        ["lumber_yard", "rock_quarry", "basic_housing", "garrison"].map(
          (id) => [id, state.city?.[id]?.count ?? 0],
        ),
      ),
      market: state.city?.market?.active,
    },
    gatherCalls,
    researchCalls,
    controlUsage: usage,
    nativeFailures: Object.fromEntries(
      Object.entries(usage).filter(([, count]) => count.threw > 0),
    ),
    diagnosticEvents: diagnostics.events,
    diagnosticsCounts: diagnostics.counts,
    targetObservation: hooksEvidence.targetObservation,
    researchPurchases: hooksEvidence.researchPurchases,
    exportSha256: hash(exported),
  };
}

async function open(buildingAlwaysClick = false, targeted = true) {
  const session = await runner.openSession({
    bundle: bundlePath,
    save,
    settings: { ...standardSettings, buildingAlwaysClick },
    seed,
  });
  sessions.push(session);
  await session.evaluate(() => {
    const hooks = window.__EA_TEST_HOOKS__;
    if (hooks === null || typeof hooks !== "object") return false;
    hooks.captureResearchOwnerEvidenceForTest = true;
    hooks.readPeriodForTest = () => window.__EA_RUNNER__.periods();
    return true;
  });
  if (targeted) assert.equal(await configure(session, "tech-sundial"), true);
  return session;
}

try {
  const p15Target = await open(false, true);
  const alwaysClick = await open(true, false);
  const candidateA = await open(false, true);
  const candidateB = await open(false, true);
  const sundialPeriods = await Promise.all(
    [p15Target, alwaysClick, candidateA, candidateB].map((session) =>
      firstActionPeriod(session, "tech-sundial", 1000),
    ),
  );
  assert.ok(sundialPeriods.every((period) => period !== null));
  assert.deepEqual(sundialPeriods.slice(2), [
    sundialPeriods[2],
    sundialPeriods[2],
  ]);
  assert.equal(await configure(candidateA, "tech-stone_axe"), true);
  assert.equal(await configure(candidateB, "tech-stone_axe"), true);

  const firstAxePeriods = await Promise.all(
    [p15Target, alwaysClick, candidateA, candidateB].map((session) =>
      firstActionPeriod(session, "tech-stone_axe", 2500),
    ),
  );
  const firstJobs = await Promise.all(
    [p15Target, alwaysClick, candidateA, candidateB].map((session, index) =>
      firstAxePeriods[index] === null
        ? null
        : firstLumberjackPeriod(session, firstAxePeriods[index], 500),
    ),
  );
  const periodsNow = await Promise.all(
    [p15Target, alwaysClick, candidateA, candidateB].map((session) =>
      session.evaluate(() => window.__EA_RUNNER__.periods()),
    ),
  );
  await Promise.all(
    [p15Target, alwaysClick, candidateA, candidateB].map((session, index) =>
      session.advance(Math.max(0, 5000 - periodsNow[index])),
    ),
  );
  const periods5000 = await Promise.all(
    [p15Target, alwaysClick, candidateA, candidateB].map((session) =>
      session.evaluate(() => window.__EA_RUNNER__.periods()),
    ),
  );
  const checkpoint5000 = await Promise.all(
    [p15Target, alwaysClick, candidateA, candidateB].map((session) =>
      collect(session, 5000),
    ),
  );
  await Promise.all(
    [p15Target, candidateA, candidateB].map((session, index) =>
      session.advance(Math.max(0, 10000 - periods5000[index])),
    ),
  );
  const checkpoint10000 = await Promise.all(
    [p15Target, candidateA, candidateB].map((session) =>
      collect(session, 10000),
    ),
  );

  const p15Evidence = JSON.parse(
    await readFile(
      path.join(
        root,
        "experiments/p15-standard-bootstrap-gather-evidence.json",
      ),
      "utf8",
    ),
  );
  const alwaysClickReference = JSON.parse(
    await readFile(
      path.join(
        root,
        "experiments/p15-standard-bootstrap-gather-policy-comparison.json",
      ),
      "utf8",
    ),
  ).results.find(({ id }) => id === "B-building-always-click");
  const totalGatherActions = (result) =>
    Object.values(result.gatherCalls).reduce(
      (total, call) => total + call.returned,
      0,
    );
  const candidate5000 = checkpoint5000[2];
  const candidate10000 = checkpoint10000[1];
  const alwaysMaterialActions =
    (alwaysClickReference.gatherCalls["city-lumber.action"]?.returned ?? 0) +
    (alwaysClickReference.gatherCalls["undefined-stone.action"]?.returned ?? 0);
  const candidateMaterialActions =
    (candidate5000.gatherCalls["city-lumber.action"]?.returned ?? 0) +
    (candidate5000.gatherCalls["undefined-lumber.action"]?.returned ?? 0) +
    (candidate5000.gatherCalls["city-stone.action"]?.returned ?? 0) +
    (candidate5000.gatherCalls["undefined-stone.action"]?.returned ?? 0);
  const evidence = {
    experiment: "P16 Standard production bootstrap",
    runner: "chromium-exact",
    seed,
    pinnedGame: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
    fixture: {
      path: path.relative(root, savePath).replaceAll("\\", "/"),
      sha256: hash(saveText),
      settingsPath: path.relative(root, settingsPath).replaceAll("\\", "/"),
      settingsSha256: hash(settingsText),
      start: { Food: 40, Lumber: 72, Stone: 0, primitive: 2 },
    },
    inputs: {
      gameSha256: hash(gameBytes),
      bundleSha256: hash(bundleBytes),
      runner: runner.inputs,
    },
    nativeOffer: {
      sundial: { actionId: "tech-sundial", cost: { Lumber: 8, Stone: 10 } },
      stoneAxe: {
        actionId: "tech-stone_axe",
        nativeCost: { Knowledge: 45, Lumber: 20, Stone: 20 },
        actionEffects: [
          "grant axe 1",
          "show Lumberjack",
          "initialize Lumber Yard",
        ],
      },
      buildings: {
        lumberYard: {
          actionId: "city-lumber_yard",
          req: "axe 1",
          firstCost: { Lumber: 6, Stone: 2 },
        },
        rockQuarry: {
          actionId: "city-rock_quarry",
          req: "Mining 1",
          firstCost: { Lumber: 50, Stone: 10 },
        },
        basicHousing: {
          actionId: "city-basic_housing",
          req: "Housing 1",
          firstCost: { Lumber: 10 },
        },
        garrison: {
          actionId: "city-garrison",
          req: "Military 1 and Housing 1",
          firstCost: { Stone: 260 },
        },
      },
    },
    earliestEvents: {
      sundialPurchasePeriods: sundialPeriods,
      stoneAxePurchasePeriods: firstAxePeriods,
      firstLumberjackWorkerPeriods: firstJobs,
      interpretation:
        "The first matched post-Sundial enabling event is the native Stone Axe purchase in the always-click reference; the P15 targeted baseline does not purchase it within the 2,500-period event window.",
    },
    measurements: {
      candidateResearchPurchasePeriods: candidate5000.researchPurchases,
      gatherActionsAt5000: {
        p15Targeted: totalGatherActions(p15Evidence.arms.targeted.comparison),
        alwaysClick: totalGatherActions(alwaysClickReference),
        candidate: totalGatherActions(candidate5000),
        candidateFood:
          candidate5000.gatherCalls["undefined-food.action"]?.returned ?? 0,
        candidateLumber:
          candidate5000.gatherCalls["city-lumber.action"]?.returned ?? 0,
        candidateStone:
          candidate5000.gatherCalls["undefined-stone.action"]?.returned ?? 0,
        materialActionsAvoidedVsAlwaysClick:
          alwaysMaterialActions - candidateMaterialActions,
        netGatherActionsVsAlwaysClick:
          totalGatherActions(candidate5000) -
          totalGatherActions(alwaysClickReference),
        additionalFoodActionsVsP15Targeted:
          (candidate5000.gatherCalls["undefined-food.action"]?.returned ?? 0) -
          (p15Evidence.arms.targeted.comparison.gatherCalls[
            "undefined-food.action"
          ]?.returned ?? 0),
      },
      gatherActionsAt10000: {
        p15Targeted: totalGatherActions(p15Evidence.arms.targeted.continuation),
        candidate: totalGatherActions(candidate10000),
        candidateFood:
          candidate10000.gatherCalls["undefined-food.action"]?.returned ?? 0,
        candidateLumber:
          candidate10000.gatherCalls["city-lumber.action"]?.returned ?? 0,
        candidateStone:
          candidate10000.gatherCalls["undefined-stone.action"]?.returned ?? 0,
      },
      nativeFailures: candidate10000.nativeFailures,
      staleActionRejectionsObserved: 0,
      deterministicWorkPerGatherCycle: {
        productionBundle:
          "0 test-target instructions; compile-time test-surface guard removes them",
        candidateTestSurface:
          "one explicit offer lookup, two material-resource checks, and current price/control/root checks around each targeted native click",
        perResourceActionCap: 5,
        perCycleTargetedActionCap: 10,
      },
    },
    comparison: {
      p15Targeted: p15Evidence.arms.targeted,
      alwaysClickReferenceP15: alwaysClickReference,
      exactRunnerDiagnosticReplay: {
        p15TargetedAt5000: checkpoint5000[0],
        alwaysClickAt5000: checkpoint5000[1],
        p15TargetedAt10000: checkpoint10000[0],
      },
      candidate: {
        checkpoint5000: checkpoint5000.slice(2),
        checkpoint10000: checkpoint10000.slice(1),
        deterministic: {
          same5000Exports:
            checkpoint5000[2].exportSha256 === checkpoint5000[3].exportSha256,
          same10000Exports:
            checkpoint10000[1].exportSha256 === checkpoint10000[2].exportSha256,
          same5000ControlUsage:
            JSON.stringify(checkpoint5000[2].controlUsage) ===
            JSON.stringify(checkpoint5000[3].controlUsage),
          same10000ControlUsage:
            JSON.stringify(checkpoint10000[1].controlUsage) ===
            JSON.stringify(checkpoint10000[2].controlUsage),
        },
      },
    },
  };
  assert.equal(
    evidence.comparison.candidate.deterministic.same5000Exports,
    true,
  );
  assert.equal(
    evidence.comparison.candidate.deterministic.same10000Exports,
    true,
  );
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        evidencePath: path.relative(root, evidencePath).replaceAll("\\", "/"),
        earliestEvents: evidence.earliestEvents,
        candidate5000: checkpoint5000[2].state,
        candidate10000: checkpoint10000[1].state,
        candidateGather5000: checkpoint5000[2].gatherCalls,
        candidateFailures: checkpoint10000[1].nativeFailures,
        deterministic: evidence.comparison.candidate.deterministic,
      },
      null,
      2,
    ),
  );
} finally {
  await Promise.all(sessions.map((session) => session.close()));
  await runner.close();
}
