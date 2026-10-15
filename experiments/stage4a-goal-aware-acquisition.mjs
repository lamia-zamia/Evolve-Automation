import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const saveArgument = process.argv.find((argument) =>
  argument.startsWith("--save="),
);
const savePath = path.resolve(
  root,
  saveArgument?.slice("--save=".length) ??
    "test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
);
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/stage4a-test.user.js",
);
const outputArgument = process.argv.find((argument) =>
  argument.startsWith("--out="),
);
const outputPath = path.resolve(
  root,
  outputArgument?.slice("--out=".length) ??
    "test-artifacts/benchmark/tmp/stage4a-goal-aware-acquisition.json",
);
const upstreamCommit = "db38e2af831907d49aeb5348d678d8d8745d6c3f";
const startCommit = "978619241a35cf9854e1eb3ddd7f29c57911dd46";
const shortProbe = process.argv.includes("--short-probe");
const activePeriod = shortProbe ? 1 : 8_000;
const checkpoints = shortProbe
  ? [1, 100]
  : [8_000, 8_001, 8_008, 9_000, 10_000, 12_000, 16_000, 20_000];
const scenariosArgument = process.argv.find((argument) =>
  argument.startsWith("--scenarios="),
);
const scenarioNames = (scenariosArgument?.slice("--scenarios=".length) ?? "B,F")
  .split(",")
  .filter(Boolean);
if (scenarioNames.some((scenario) => !["B", "F", "G"].includes(scenario)))
  throw new Error("--scenarios accepts only B,F,G");
const debugMode = process.argv.includes("--debug");
const disableAutoMad = process.argv.includes("--disable-auto-mad");
const activeCheckpoints = shortProbe
  ? checkpoints
  : debugMode
    ? [8_000, 8_001, 8_008]
    : checkpoints;
const snapshotPeriods = [
  ...new Set([
    ...(shortProbe
      ? [1, 100]
      : [
          8_000,
          8_001,
          ...Array.from({ length: 121 }, (_, index) => 8_000 + index * 100),
          20_000,
        ]),
  ]),
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

if (
  execFileSync("git", ["branch", "--show-current"], {
    cwd: root,
    encoding: "utf8",
  }).trim() !== "deadspace"
)
  throw new Error("Stage 4A must run on deadspace");
execFileSync("git", ["merge-base", "--is-ancestor", startCommit, "HEAD"], {
  cwd: root,
  stdio: "ignore",
});

const [saveText, settingsText, metadata] = await Promise.all([
  readFile(savePath, "utf8"),
  readFile(settingsPath, "utf8"),
  readFile(path.join(root, "src/userscript.meta.js"), "utf8"),
]);
const settings = Object.freeze({
  ...JSON.parse(settingsText),
  ...(disableAutoMad ? { autoPrestige: false } : {}),
  autoSmelter: true,
  autoMarket: true,
  buyTitanium: true,
});
const policyBundle = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["experiments/stage4a-goal-aware-acquisition.ts"],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "EAStage4a",
  platform: "browser",
  target: ["esnext"],
  minifySyntax: true,
  treeShaking: true,
});
const built = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata.trimEnd()}\n\n${policyBundle.outputFiles[0].text}\nwindow.__EA_TEST_HOOKS__ = window.__EA_TEST_HOOKS__ ?? {};`,
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
await mkdir(path.dirname(bundlePath), { recursive: true });
await writeFile(bundlePath, built.outputFiles[0].contents);

function installObservers(scenario) {
  const hooks = window.__EA_TEST_HOOKS__;
  hooks.gatherIntervention = { resourceClaimMode: "goal-derived-conjunctive" };
  hooks.readPeriodForTest = () => window.__EA_RUNNER__.periods();
  hooks.researchOwnerSelectionEvents = [];
  hooks.stage4aScenario = scenario;
  hooks.preserveGoalDemandMoneyFloorForTest = scenario === "G";
  hooks.stage4aActive = false;
  hooks.stage4aRecordFromNow = false;
  hooks.stage4aDecisions = [];
  hooks.stage4aTraceCounts = {};
  hooks.stage4aCaptureFailures = [];
  hooks.stage4aSelectionCalls = 0;
  hooks.stage4aSelectorProfile = {
    calls: 0,
    catalogCaptureTotalMs: 0,
    selectorTotalMs: 0,
    catalogCaptureMaxMs: 0,
    selectorMaxMs: 0,
  };
  hooks.stage4aSelectorFailures = [];
  hooks.stage4aPlans = [];
  hooks.stage4aApplied = [];
  hooks.stage4aControlEvents = [];
  hooks.stage4aLastDecisionKey = "";
  hooks.stage4aLastPlanKey = "";
  hooks.selectGoalAwareMarketDemandForTest = (input, context) => {
    const period = window.__EA_RUNNER__.periods();
    hooks.stage4aSelectionCalls += 1;
    if (!["F", "G"].includes(scenario) || !hooks.stage4aActive)
      return undefined;
    const now = () => window.eaDiagnosticsNow?.() ?? performance.now();
    const catalogStarted = now();
    const catalog = hooks.readCurrentResearchCatalog?.();
    const catalogCaptureMs = now() - catalogStarted;
    const selectorStarted = now();
    let decision;
    try {
      decision = window.EAStage4a.evaluateGoalAwareAcquisition(
        catalog,
        input,
        context,
      );
    } catch (error) {
      const reason = String(error);
      if (!hooks.stage4aSelectorFailures.includes(reason))
        hooks.stage4aSelectorFailures.push(reason);
      decision = {
        status: "unavailable",
        reason: `test selector failed: ${reason}`,
        candidates: [],
      };
    }
    const selectorMs = now() - selectorStarted;
    const profile = hooks.stage4aSelectorProfile;
    profile.calls += 1;
    profile.catalogCaptureTotalMs += catalogCaptureMs;
    profile.selectorTotalMs += selectorMs;
    profile.catalogCaptureMaxMs = Math.max(
      profile.catalogCaptureMaxMs,
      catalogCaptureMs,
    );
    profile.selectorMaxMs = Math.max(profile.selectorMaxMs, selectorMs);
    const key = JSON.stringify([
      decision.status,
      decision.selectedActionId,
      decision.selectedOfferGeneration,
      decision.resourceId,
      decision.targetQuantity,
      decision.shortfall,
      decision.reason,
    ]);
    if (
      key !== hooks.stage4aLastDecisionKey ||
      [8_000, 8_001, 8_008, 9_000, 10_000, 12_000, 16_000, 20_000].includes(
        period,
      )
    ) {
      hooks.stage4aDecisions.push({ period, ...decision });
      hooks.stage4aLastDecisionKey = key;
    }
    return decision;
  };
  hooks.recordTradeRouteTraceForTest = (event) => {
    const period = window.__EA_RUNNER__.periods();
    hooks.stage4aTraceCounts[event.kind] =
      (hooks.stage4aTraceCounts[event.kind] ?? 0) + 1;
    if (
      event.kind === "capture-unavailable" &&
      !hooks.stage4aCaptureFailures.includes(event.reason)
    )
      hooks.stage4aCaptureFailures.push(event.reason);
    if (event.kind === "plan" && hooks.stage4aRecordFromNow) {
      const key = JSON.stringify([
        event.testDemandResourceId,
        event.desiredOperations,
        event.plannerOperations,
      ]);
      const checkpoint = [
        8_000, 8_001, 8_008, 9_000, 10_000, 12_000, 16_000, 20_000,
      ].includes(period);
      if (checkpoint || key !== hooks.stage4aLastPlanKey) {
        const target = event.testDemandResourceId;
        hooks.stage4aPlans.push({
          period,
          kind: event.kind,
          testDemandResourceId: target,
          routeCount: event.routeCount,
          maximumRoutes: event.maximumRoutes,
          moneyRate: event.moneyRate,
          moneyHolding: event.moneyHolding,
          moneyFloor: event.moneyFloor,
          operations: event.desiredOperations,
          baselineOperations: event.baselineOperations,
          plannerOperations: event.plannerOperations,
          pricesAndPriorities: checkpoint
            ? event.pricesAndPriorities
            : undefined,
          resources: checkpoint ? event.resources : undefined,
          resource: event.resources?.find(
            (resource) => resource.resourceId === target,
          ),
        });
        hooks.stage4aLastPlanKey = key;
      }
    } else if (hooks.stage4aRecordFromNow) {
      if (event.kind === "applied")
        hooks.stage4aApplied.push({ period, ...event });
      if (event.kind === "skipped" || event.kind === "capture-unavailable")
        hooks.stage4aControlEvents.push({ period, ...event });
    }
  };
}

function assignmentSnapshot(state) {
  return Object.entries(state.resource ?? {})
    .filter(
      ([id, resource]) =>
        id !== "Money" &&
        Number.isFinite(resource.trade) &&
        resource.trade !== 0,
    )
    .map(([resourceId, resource]) => ({ resourceId, routes: resource.trade }))
    .sort((left, right) => left.resourceId.localeCompare(right.resourceId));
}

function allResourceSnapshot(state) {
  return Object.fromEntries(
    Object.entries(state.resource ?? {}).map(([resourceId, resource]) => [
      resourceId,
      {
        amount: resource.amount,
        capacity: resource.max,
        rate: resource.diff,
        routes: resource.trade,
      },
    ]),
  );
}

function madEvidence(state) {
  return {
    techLevels: {
      highTech: state.tech?.high_tech,
      smelting: state.tech?.smelting,
      titanium: state.tech?.titanium,
      explosives: state.tech?.explosives,
      uranium: state.tech?.uranium,
      mad: state.tech?.mad,
    },
    factoryCount: state.city?.factory?.count,
    buildQueue: state.queue,
    researchQueue: state.r_queue,
    construction: {
      factory: state.city?.factory,
      government: state.city?.government,
      space: state.space,
    },
  };
}

const runner = await createChromiumRunner({
  game: gamePath,
  upstream: "D:/work/Evolve-DeadSpace",
});
if (runner.inputs.gameSnapshot.commit !== upstreamCommit.slice(0, 8)) {
  await runner.close();
  throw new Error(
    `Expected ${upstreamCommit}, got ${runner.inputs.gameSnapshot.commit}`,
  );
}
const result = {
  inputs: {
    branch: "deadspace",
    startingHead: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    upstreamCommit,
    snapshot: runner.inputs.gameSnapshot,
    runner: runner.inputs.runner,
    bundleSha256: sha256(built.outputFiles[0].contents),
    save: path.relative(root, savePath),
    saveSha256: sha256(saveText),
    settings: path.relative(root, settingsPath),
    settingsSha256: sha256(settingsText),
    effectiveSettingsSha256: sha256(JSON.stringify(settings)),
    effectiveOverrides: {
      ...(disableAutoMad ? { autoPrestige: false } : {}),
      autoMarket: true,
      autoSmelter: true,
      buyTitanium: settings.res_trade_buy_Titanium,
    },
    seed: 42,
    epoch: "2026-09-21T00:00:00.000Z",
    gatherIntervention: "goal-derived-conjunctive",
    activeAfterPeriod: activePeriod,
    checkpoints: activeCheckpoints,
    snapshotPeriods,
    extensionRule:
      "Continue to p30000 when High Tech remains below 7 and all Money samples through p20000 plus current Money are positive.",
    demandSource:
      "one-cycle test-only signal from current native Research candidate price",
    moneyFloor: "unchanged native planTradeRoutes input settings and decision",
  },
  scenarios: [],
};

try {
  for (const scenario of scenarioNames) {
    const session = await runner.openSession({
      bundle: bundlePath,
      save: parseSave(saveText),
      settings,
      seed: 42,
      epoch: Date.parse(result.inputs.epoch),
      perf: true,
      forwardPerfSummary: true,
      snapshotAt: snapshotPeriods,
    });
    try {
      const metricsBefore = await session.metrics();
      await session.evaluate(installObservers, scenario);
      console.log(`${scenario}: opened exact Chromium session`);
      let period = 0;
      const outputCheckpoints = [];
      const lastResearchEvent = { index: 0 };
      const sample = async (at) => {
        const [state, catalog, hooks] = await Promise.all([
          session.readState(),
          session.evaluate(() =>
            window.__EA_TEST_HOOKS__.readCurrentResearchCatalog?.(),
          ),
          session.evaluate(() => ({
            decisions:
              window.__EA_TEST_HOOKS__.stage4aDecisions?.slice(-12) ?? [],
            plans: window.__EA_TEST_HOOKS__.stage4aPlans?.slice(-20) ?? [],
            applied: window.__EA_TEST_HOOKS__.stage4aApplied?.slice(-30) ?? [],
            controlEvents:
              window.__EA_TEST_HOOKS__.stage4aControlEvents?.slice(-30) ?? [],
            traceCounts: window.__EA_TEST_HOOKS__.stage4aTraceCounts ?? {},
            captureFailures:
              window.__EA_TEST_HOOKS__.stage4aCaptureFailures ?? [],
            selectionCalls: window.__EA_TEST_HOOKS__.stage4aSelectionCalls ?? 0,
            selectorFailures:
              window.__EA_TEST_HOOKS__.stage4aSelectorFailures ?? [],
            researchEvents:
              window.__EA_TEST_HOOKS__.researchOwnerSelectionEvents ?? [],
            lastResearch: window.__EA_TEST_HOOKS__.researchOwnerSelectionLast,
          })),
        ]);
        const researchEvents = hooks.researchEvents.slice(
          lastResearchEvent.index,
        );
        lastResearchEvent.index = hooks.researchEvents.length;
        return {
          period: at,
          resources: allResourceSnapshot(state),
          mad: madEvidence(state),
          market: {
            used: state.city?.market?.trade,
            capacity: state.city?.market?.mtrade,
            assignments: assignmentSnapshot(state),
            recentPlans: hooks.plans,
            recentApplied: hooks.applied,
            recentControlEvents: hooks.controlEvents,
            traceCounts: hooks.traceCounts,
            captureFailures: hooks.captureFailures,
            selectionCalls: hooks.selectionCalls,
            selectorFailures: hooks.selectorFailures,
          },
          nativeResearch: {
            current: catalog?.current,
            selectedPrestige: catalog?.selectedPrestige,
            rootGeneration: catalog?.rootGeneration,
            progressionEpoch: catalog?.progressionEpoch,
            offers: catalog?.offers,
            definitions: catalog?.definitions,
            grantLevels: catalog?.grantLevels,
            applicability: catalog?.applicability,
            queueEvidence: catalog?.queueEvidence,
            researchPermission: catalog?.researchPermission,
            eventsSincePriorCheckpoint: researchEvents,
            lastSelection: hooks.lastResearch,
          },
          goalDemand: hooks.decisions,
        };
      };

      const wallStarted = performance.now();
      for (const targetPeriod of activeCheckpoints) {
        if (targetPeriod <= period) continue;
        await session.advance(targetPeriod - period);
        period = targetPeriod;
        outputCheckpoints.push(await sample(period));
        console.log(`${scenario}: captured p${period}`);
        if (period === activePeriod) {
          await session.evaluate(() => {
            window.__EA_TEST_HOOKS__.stage4aRecordFromNow = true;
            window.__EA_TEST_HOOKS__.stage4aActive = true;
          });
        }
      }
      const snapshots = await session.snapshots();
      const moneySamples = Object.entries(snapshots)
        .map(([at, snapshot]) => ({
          period: Number(at),
          amount: parseSave(snapshot.exportSave).resource?.Money?.amount,
        }))
        .filter((entry) => Number.isFinite(entry.amount));
      const sampledMoneyMinimum = moneySamples.reduce(
        (minimum, entry) => (entry.amount < minimum.amount ? entry : minimum),
        moneySamples[0] ?? { period: null, amount: null },
      );
      const stateAt20000 = await session.readState();
      let extensionDecision = {
        status: "not-needed",
        reason: "p20000 is not a checkpoint or selected goal is complete",
      };
      if (
        !debugMode &&
        period === 20_000 &&
        (stateAt20000.tech?.high_tech ?? 0) < 7 &&
        sampledMoneyMinimum.amount > 0 &&
        (stateAt20000.resource?.Money?.amount ?? 0) > 0
      ) {
        extensionDecision = {
          status: "extended",
          reason:
            "goal remains incomplete and sampled/current Money stayed positive through p20000",
        };
        const extendedCheckpoints = new Set([24_000, 28_000, 30_000]);
        for (
          let targetPeriod = 20_100;
          targetPeriod <= 30_000;
          targetPeriod += 100
        ) {
          await session.advance(100);
          period = targetPeriod;
          const state = await session.readState();
          moneySamples.push({
            period,
            amount: state.resource?.Money?.amount,
          });
          if (extendedCheckpoints.has(period)) {
            outputCheckpoints.push(await sample(period));
            console.log(`${scenario}: captured p${period}`);
          }
        }
      }
      const wallMs = performance.now() - wallStarted;
      const metricsAfter = await session.metrics();
      const diagnostics = await session.diagnostics();
      const state = await session.readState();
      const moneyMinimum = moneySamples.reduce(
        (minimum, entry) => (entry.amount < minimum.amount ? entry : minimum),
        moneySamples[0] ?? { period: null, amount: null },
      );
      const final = outputCheckpoints.at(-1);
      const researchSequence = await session.evaluate(
        () => window.__EA_TEST_HOOKS__.researchOwnerSelectionEvents ?? [],
      );
      const firstHunterPurchase = researchSequence.find(
        (event) =>
          event.actionId === "tech-hunter_process" &&
          event.disposition === "researched",
      );
      result.scenarios.push({
        scenario,
        checkpoints: outputCheckpoints,
        extensionDecision,
        final,
        firstHunterPurchase: firstHunterPurchase
          ? {
              period: firstHunterPurchase.period,
              cycle: firstHunterPurchase.cycle,
              grantAfter: firstHunterPurchase.grantAfter,
              disposition: firstHunterPurchase.disposition,
            }
          : undefined,
        money: {
          sampleCount: moneySamples.length,
          minimum: moneyMinimum.amount,
          minimumPeriod: moneyMinimum.period,
          final: final.resources.Money?.amount,
          denseSamples: moneySamples,
        },
        routePlans: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aPlans ?? [],
        ),
        demandDecisions: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aDecisions ?? [],
        ),
        appliedRouteOperations: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aApplied ?? [],
        ),
        nativeControlEvents: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aControlEvents ?? [],
        ),
        traceCounts: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aTraceCounts ?? {},
        ),
        captureFailures: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aCaptureFailures ?? [],
        ),
        selectionCalls: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aSelectionCalls ?? 0,
        ),
        selectorProfile: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aSelectorProfile,
        ),
        selectorFailures: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aSelectorFailures ?? [],
        ),
        researchSequence,
        diagnostics: {
          wallMs,
          rendererTaskSeconds:
            metricsAfter.TaskDuration - metricsBefore.TaskDuration,
          rendererScriptSeconds:
            metricsAfter.ScriptDuration - metricsBefore.ScriptDuration,
          jsHeapBytes: metricsAfter.JSHeapUsedSize,
          domNodes: metricsAfter.Nodes,
          workTicks: diagnostics.workTicks,
          counts: diagnostics.counts,
          errors: diagnostics.errors,
          controlUsage: diagnostics.controlUsage,
          perfSummaries: diagnostics.perfSummaries,
        },
        finalAssignments: assignmentSnapshot(state),
      });
    } finally {
      await session.close();
    }
  }
} finally {
  await runner.close();
}

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      output: path.relative(root, outputPath),
      inputs: result.inputs,
      scenarios: result.scenarios.map((scenario) => ({
        scenario: scenario.scenario,
        extensionDecision: scenario.extensionDecision,
        money: scenario.money,
        milestones: scenario.checkpoints.map((entry) => ({
          period: entry.period,
          money: entry.resources.Money?.amount,
          titanium: entry.resources.Titanium?.amount,
          technology: entry.mad.techLevels,
          factoryCount: entry.mad.factoryCount,
          routeCount: entry.market.used,
          assignments: entry.market.assignments,
          demand: entry.goalDemand.at(-1),
        })),
        decisions: scenario.demandDecisions,
        workTicks: scenario.diagnostics.workTicks,
        wallMs: scenario.diagnostics.wallMs,
        rendererTaskSeconds: scenario.diagnostics.rendererTaskSeconds,
        rendererScriptSeconds: scenario.diagnostics.rendererScriptSeconds,
      })),
    },
    null,
    2,
  ),
);
