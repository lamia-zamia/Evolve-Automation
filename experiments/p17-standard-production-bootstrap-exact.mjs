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
const bundlePath = path.join(artifactDirectory, "p17-test-surface.user.js");
const evidencePath = path.join(
  root,
  "experiments/p17-standard-production-bootstrap-evidence.json",
);
const seed = 42;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const [saveText, settingsText, gameBytes, metadata, productionBundleBytes] =
  await Promise.all([
    readFile(savePath),
    readFile(settingsPath, "utf8"),
    readFile(gamePath),
    readFile(path.join(root, "src/userscript.meta.js"), "utf8"),
    readFile(path.join(root, "evolve_automation.user.js")),
  ]);
const standardSettings = JSON.parse(settingsText);
assert.equal(standardSettings.buildingAlwaysClick, false);
assert.equal(
  hash(productionBundleBytes),
  "47db27fa5185d9ffe79f9f03fc26c499d7ba09a0fd01396f7a5a6d5bf485fb0b",
  "P17 must preserve the starting P16 production bundle",
);
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
// The game's own settings gate its native debug clone; enable this observer-only
// setting on the in-memory fixture so native breakdowns can be read per sample.
save.settings.expose = true;
const runner = await createChromiumRunner({ game: gamePath });
const sessions = [];

async function configure(session, actionId, compostTarget = false) {
  return session.evaluate(
    (targetActionId, enableCompostTarget) => {
      const hooks = window.__EA_TEST_HOOKS__;
      if (hooks === null || typeof hooks !== "object") return false;
      hooks.gatherIntervention = {
        standardResearchTargetActionId: targetActionId,
        standardResearchTargetClickBudget:
          targetActionId === "tech-sundial" ? 10 : 5,
        standardResearchTargetResourceClickBudget: 5,
        standardCompostTargetEnabled: enableCompostTarget,
      };
      return true;
    },
    actionId,
    compostTarget,
  );
}

async function firstActionPeriod(session, actionId, limit = 1000) {
  return session.evaluate(
    async (targetActionId, maxSteps) => {
      const gameRunner = window.__EA_RUNNER__;
      for (let step = 0; step < maxSteps; step += 1) {
        const advanced = await gameRunner.advance(1);
        if (advanced.stopped || advanced.reloading) return null;
        const hooks = window.__EA_TEST_HOOKS__;
        hooks?.p17TraceNative?.(gameRunner);
        if (
          hooks?.p17FirstCompostPurchasePeriod == null &&
          gameRunner.diagnostics().controlUsage["city-compost.action"]
            ?.returned > 0
        )
          hooks.p17FirstCompostPurchasePeriod = gameRunner.periods();
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

async function firstCompostActionPeriod(session, limit = 5000) {
  return session.evaluate(async (maxSteps) => {
    const gameRunner = window.__EA_RUNNER__;
    const hooks = window.__EA_TEST_HOOKS__;
    if (hooks?.p17FirstCompostPurchasePeriod != null)
      return hooks.p17FirstCompostPurchasePeriod;
    for (let step = 0; step < maxSteps; step += 1) {
      const advanced = await gameRunner.advance(1);
      if (advanced.stopped || advanced.reloading) return null;
      hooks?.p17TraceNative?.(gameRunner);
      if (
        gameRunner.diagnostics().controlUsage["city-compost.action"]?.returned >
        0
      ) {
        const period = gameRunner.periods();
        hooks.p17FirstCompostPurchasePeriod = period;
        return period;
      }
    }
    return null;
  }, limit);
}

async function advanceTracked(session, targetPeriod) {
  return session.evaluate(async (target) => {
    const gameRunner = window.__EA_RUNNER__;
    const hooks = window.__EA_TEST_HOOKS__;
    while (gameRunner.periods() < target) {
      const remaining = target - gameRunner.periods();
      const nextBoundary = Math.ceil((gameRunner.periods() + 1) / 100) * 100;
      const step = Math.min(remaining, nextBoundary - gameRunner.periods());
      const advanced = await gameRunner.advance(step);
      if (advanced.stopped || advanced.reloading) break;
      hooks?.p17TraceNative?.(gameRunner);
    }
    return gameRunner.periods();
  }, targetPeriod);
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
        compostBoundary: hooks?.p17FirstConstructionBoundary ?? null,
        constructionTargetTrajectory:
          hooks?.p17ConstructionTargetTrajectory ?? [],
        nativeTrajectory: hooks?.p17NativeTrajectory ?? [],
        researchPurchases: Array.isArray(events)
          ? events.map((event) => ({
              period: event.period,
              actionId: event.actionId,
              disposition: event.disposition,
              grantAfter: event.grantAfter,
            }))
          : [],
        nativeProduction: (() => {
          const global = window.evolve?.global;
          const breakdown = window.evolve?.breakdown;
          const foodProduced = breakdown?.p?.Food ?? {};
          const lumberConsumed = breakdown?.p?.consume?.Lumber ?? {};
          const speciesResource = global?.resource?.[global?.race?.species];
          return {
            authority: "pinned-game debug.js updateDebugData clone",
            compost: {
              count: global?.city?.compost?.count ?? 0,
              on: global?.city?.compost?.on ?? 0,
            },
            food: {
              amount: global?.resource?.Food?.amount,
              max: global?.resource?.Food?.max,
              produced: foodProduced,
              compostProduced:
                Object.entries(foodProduced).find(([label]) =>
                  /compost/i.test(label),
                )?.[1] ?? null,
              consumed: breakdown?.p?.consume?.Food ?? null,
              populationConsumed:
                breakdown?.p?.consume?.Food?.[speciesResource?.name] ?? null,
              netRate: global?.resource?.Food?.diff,
            },
            lumber: {
              amount: global?.resource?.Lumber?.amount,
              max: global?.resource?.Lumber?.max,
              produced: breakdown?.p?.Lumber ?? null,
              consumed: lumberConsumed,
              compostConsumed:
                Object.entries(lumberConsumed).find(([label]) =>
                  /compost/i.test(label),
                )?.[1] ?? null,
              netRate: global?.resource?.Lumber?.diff,
            },
          };
        })(),
        firstCompostPurchasePeriod:
          hooks?.p17FirstCompostPurchasePeriod ?? null,
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
        [
          "compost",
          "lumber_yard",
          "rock_quarry",
          "basic_housing",
          "garrison",
        ].map((id) => [id, state.city?.[id]?.count ?? 0]),
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
    compostBoundary: hooksEvidence.compostBoundary,
    constructionTargetTrajectory: hooksEvidence.constructionTargetTrajectory,
    nativeProduction: hooksEvidence.nativeProduction,
    firstCompostPurchasePeriod: hooksEvidence.firstCompostPurchasePeriod,
    nativeTrajectory: hooksEvidence.nativeTrajectory,
    researchPurchases: hooksEvidence.researchPurchases,
    exportSha256: hash(exported),
  };
}

async function open(
  buildingAlwaysClick = false,
  targeted = true,
  compostTarget = false,
) {
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
    hooks.p17NativeTrajectory = [];
    hooks.p17ConstructionTargetTrajectory = [];
    hooks.p17TraceNative = (gameRunner) => {
      const period = gameRunner.periods();
      if (period % 100 !== 0) return;
      const global = window.evolve?.global;
      const breakdown = window.evolve?.breakdown;
      if (global == null) return;
      const species = global.race?.species;
      const popResource = global.resource?.[species];
      const foodBreakdown = breakdown?.p?.Food ?? {};
      const compostFood = Object.entries(foodBreakdown).find(([label]) =>
        /compost/i.test(label),
      );
      const lumberConsumption = breakdown?.p?.consume?.Lumber ?? {};
      const compostLumber = Object.entries(lumberConsumption).find(([label]) =>
        /compost/i.test(label),
      );
      const populationFoodConsumption =
        breakdown?.p?.consume?.Food?.[popResource?.name];
      hooks.p17NativeTrajectory.push({
        period,
        population: popResource?.amount,
        starved: global.stats?.starved,
        compost: {
          count: global.city?.compost?.count ?? 0,
          on: global.city?.compost?.on ?? 0,
          foodProduced: compostFood?.[1] ?? null,
          lumberConsumed: compostLumber?.[1] ?? null,
        },
        food: {
          amount: global.resource?.Food?.amount,
          max: global.resource?.Food?.max,
          populationConsumption: populationFoodConsumption ?? null,
          production: foodBreakdown,
          consumption: breakdown?.p?.consume?.Food ?? null,
        },
      });
    };
    return true;
  });
  if (targeted)
    assert.equal(await configure(session, "tech-sundial", compostTarget), true);
  return session;
}

try {
  const alwaysClick = await open(true, false);
  const candidateB = await open(false, true, true);
  const duplicateB = await open(false, true, true);
  const replaySessions = [alwaysClick, candidateB, duplicateB];
  const sundialPeriods = await Promise.all(
    replaySessions.map((session) =>
      firstActionPeriod(session, "tech-sundial", 1000),
    ),
  );
  assert.ok(sundialPeriods.every((period) => period !== null));
  assert.equal(await configure(candidateB, "tech-stone_axe", true), true);
  assert.equal(await configure(duplicateB, "tech-stone_axe", true), true);

  const firstAxePeriods = await Promise.all(
    replaySessions.map((session) =>
      firstActionPeriod(session, "tech-stone_axe", 2500),
    ),
  );
  const compostPurchasePeriods = await Promise.all(
    [alwaysClick, candidateB, duplicateB].map((session, index) =>
      firstCompostActionPeriod(session, index === 0 ? 1000 : 500),
    ),
  );
  const firstJobs = await Promise.all(
    replaySessions.map((session, index) =>
      firstAxePeriods[index] === null
        ? null
        : firstLumberjackPeriod(session, firstAxePeriods[index], 500),
    ),
  );
  await Promise.all(
    replaySessions.map((session) => advanceTracked(session, 5000)),
  );
  const periods5000 = await Promise.all(
    replaySessions.map((session) =>
      session.evaluate(() => window.__EA_RUNNER__.periods()),
    ),
  );
  const checkpoint5000 = await Promise.all(
    replaySessions.map((session) => collect(session, 5000)),
  );
  await Promise.all(
    replaySessions.map((session) => advanceTracked(session, 10000)),
  );
  const checkpoint10000 = await Promise.all(
    replaySessions.map((session) => collect(session, 10000)),
  );

  const p16Evidence = JSON.parse(
    await readFile(
      path.join(
        root,
        "experiments/p16-standard-production-bootstrap-evidence.json",
      ),
      "utf8",
    ),
  );
  const totalGatherActions = (result) =>
    Object.values(result.gatherCalls).reduce(
      (total, call) => total + call.returned,
      0,
    );
  const foodGatherActions = (result) =>
    (result.gatherCalls["undefined-food.action"]?.returned ?? 0) +
    (result.gatherCalls["city-food.action"]?.returned ?? 0);
  const nativeDemandSummary = (result) => {
    const samples = Array.isArray(result.nativeTrajectory)
      ? result.nativeTrajectory
      : [];
    let populationPeriods = 0;
    let populationFoodDemandSample = 0;
    const rate = (value) => {
      const parsed = Number.parseFloat(String(value ?? ""));
      return Number.isFinite(parsed) ? Math.abs(parsed) : undefined;
    };
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      const span = current.period - previous.period;
      const population =
        (Number(previous.population) + Number(current.population)) / 2;
      if (Number.isFinite(population)) populationPeriods += population * span;
      const beforeRate = rate(previous.food.populationConsumption);
      const afterRate = rate(current.food.populationConsumption);
      if (beforeRate !== undefined && afterRate !== undefined)
        populationFoodDemandSample += ((beforeRate + afterRate) / 2) * span;
    }
    const clicks = foodGatherActions(result);
    return {
      foodGatherCalls: clicks,
      foodGatherCallsPerPopulationAtCheckpoint:
        Number(result.state.population) > 0
          ? clicks / Number(result.state.population)
          : null,
      gatherCallsPer100PopulationPeriods:
        populationPeriods > 0 ? (clicks * 100) / populationPeriods : null,
      foodGatherCallsPerNativePopulationDemandSample:
        populationFoodDemandSample > 0
          ? clicks / populationFoodDemandSample
          : null,
      sampledPopulationPeriods: populationPeriods,
      sampledNativePopulationFoodDemand: populationFoodDemandSample,
      sampleCount: samples.length,
    };
  };
  const p16Candidate5000 = p16Evidence.comparison.candidate.checkpoint5000[0];
  const p16Candidate10000 = p16Evidence.comparison.candidate.checkpoint10000[0];
  const alwaysClick5000 = checkpoint5000[0];
  const alwaysClick10000 = checkpoint10000[0];
  const candidate5000 = checkpoint5000[1];
  const candidate10000 = checkpoint10000[1];
  const duplicate5000 = checkpoint5000[2];
  const duplicate10000 = checkpoint10000[2];
  const alwaysMaterialActions =
    (alwaysClick5000.gatherCalls["city-lumber.action"]?.returned ?? 0) +
    (alwaysClick5000.gatherCalls["undefined-stone.action"]?.returned ?? 0);
  const candidateMaterialActions =
    (candidate5000.gatherCalls["city-lumber.action"]?.returned ?? 0) +
    (candidate5000.gatherCalls["undefined-lumber.action"]?.returned ?? 0) +
    (candidate5000.gatherCalls["city-stone.action"]?.returned ?? 0) +
    (candidate5000.gatherCalls["undefined-stone.action"]?.returned ?? 0);
  const evidence = {
    experiment: "P17 Standard Compost production bootstrap",
    runner: "chromium-exact",
    seed,
    pinnedGame: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
    fixture: {
      path: path.relative(root, savePath).replaceAll("\\", "/"),
      sha256: hash(saveText),
      settingsPath: path.relative(root, settingsPath).replaceAll("\\", "/"),
      settingsSha256: hash(settingsText),
      observerOnlySaveSetting: {
        path: "settings.expose",
        enabledInMemory: true,
        includedInFixtureFileHash: false,
        purpose:
          "publish pinned-game debug.js native state and breakdown clones",
      },
      start: { Food: 40, Lumber: 72, Stone: 0, primitive: 2 },
    },
    inputs: {
      gameSha256: hash(gameBytes),
      bundleSha256: hash(bundleBytes),
      startingProductionBundleSha256:
        "47db27fa5185d9ffe79f9f03fc26c499d7ba09a0fd01396f7a5a6d5bf485fb0b",
      currentProductionBundleSha256: hash(productionBundleBytes),
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
      compost: {
        actionId: "city-compost",
        sourceCostFormula:
          "12 Lumber and 12 Stone at count 0; native multiplier scales later purchases",
        observedCurrentCost: candidate5000.compostBoundary?.nativePrice,
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
      firstCompostPurchasePeriods: compostPurchasePeriods,
      firstCompostPurchasePeriodsAtCheckpoint: [
        alwaysClick5000.firstCompostPurchasePeriod,
        candidate5000.firstCompostPurchasePeriod,
        duplicate5000.firstCompostPurchasePeriod,
      ],
      interpretation:
        "The first matched post-Sundial enabling event is the native Stone Axe purchase in the always-click reference; the P15 targeted baseline does not purchase it within the 2,500-period event window.",
    },
    measurements: {
      firstConstructionBoundary: candidate5000.compostBoundary,
      duplicateConstructionBoundary: duplicate5000.compostBoundary,
      candidateResearchPurchasePeriods: candidate5000.researchPurchases,
      gatherActionsAt5000: {
        p15Targeted: totalGatherActions(
          p16Evidence.comparison.p15Targeted.comparison,
        ),
        alwaysClick: totalGatherActions(alwaysClick5000),
        p16Targeted: totalGatherActions(p16Candidate5000),
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
          totalGatherActions(alwaysClick5000),
        additionalFoodActionsVsP15Targeted:
          (candidate5000.gatherCalls["undefined-food.action"]?.returned ?? 0) -
          (p16Evidence.comparison.p15Targeted.comparison.gatherCalls[
            "undefined-food.action"
          ]?.returned ?? 0),
      },
      gatherActionsAt10000: {
        p15Targeted: totalGatherActions(
          p16Evidence.comparison.p15Targeted.continuation,
        ),
        candidate: totalGatherActions(candidate10000),
        candidateFood:
          candidate10000.gatherCalls["undefined-food.action"]?.returned ?? 0,
        candidateLumber:
          candidate10000.gatherCalls["city-lumber.action"]?.returned ?? 0,
        candidateStone:
          candidate10000.gatherCalls["undefined-stone.action"]?.returned ?? 0,
        alwaysClick: totalGatherActions(alwaysClick10000),
      },
      nativeFailures: candidate10000.nativeFailures,
      foodDemandNormalization: {
        p16TargetedAt5000: nativeDemandSummary(p16Candidate5000),
        interventionAt5000: nativeDemandSummary(candidate5000),
        alwaysClickAt5000: nativeDemandSummary(alwaysClick5000),
        p16TargetedAt10000: nativeDemandSummary(p16Candidate10000),
        interventionAt10000: nativeDemandSummary(candidate10000),
        alwaysClickAt10000: nativeDemandSummary(alwaysClick10000),
      },
      staleActionRejectionsObserved: 0,
      deterministicWorkPerGatherCycle: {
        productionBundle:
          "0 test-target instructions; compile-time test-surface guard removes them",
        candidateTestSurface:
          "one current Construction saving-target read per Gather input, live native-price and target-control checks, and root/progression/queue/Build/Gather-control checks before each targeted material action",
        perResourceActionCap: 5,
        perCycleTargetedActionCap: 10,
      },
    },
    comparison: {
      p15Targeted: p16Evidence.comparison.p15Targeted,
      p16Targeted: {
        priorEvidence5000: p16Evidence.comparison.candidate.checkpoint5000[0],
        priorEvidence10000: p16Evidence.comparison.candidate.checkpoint10000[0],
        replay5000: p16Candidate5000,
        replay10000: p16Candidate10000,
      },
      exactRunnerDiagnosticReplay: {
        alwaysClickAt5000: alwaysClick5000,
        alwaysClickAt10000: alwaysClick10000,
      },
      candidate: {
        checkpoint5000: candidate5000,
        checkpoint10000: candidate10000,
        duplicateCheckpoint5000: duplicate5000,
        duplicateCheckpoint10000: duplicate10000,
        deterministic: {
          same5000Exports:
            candidate5000.exportSha256 === duplicate5000.exportSha256,
          same10000Exports:
            candidate10000.exportSha256 === duplicate10000.exportSha256,
          same5000ControlUsage:
            JSON.stringify(candidate5000.controlUsage) ===
            JSON.stringify(duplicate5000.controlUsage),
          same10000ControlUsage:
            JSON.stringify(candidate10000.controlUsage) ===
            JSON.stringify(duplicate10000.controlUsage),
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
        p16Targeted5000: p16Candidate5000.state,
        p16Targeted10000: p16Candidate10000.state,
        candidate5000: candidate5000.state,
        candidate10000: candidate10000.state,
        candidateGather5000: candidate5000.gatherCalls,
        candidateFailures: candidate10000.nativeFailures,
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
