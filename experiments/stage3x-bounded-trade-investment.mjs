import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const expectedStartingHead = "6bc642190a2735866f91feb9501b043d3b493c3a";
const expectedUpstreamCommit = "db38e2af831907d49aeb5348d678d8d8745d6c3f";
const branchName = execFileSync("git", ["branch", "--show-current"], {
  cwd: root,
  encoding: "utf8",
}).trim();
if (branchName !== "deadspace")
  throw new Error(`Expected the deadspace branch, found ${branchName}`);
let startingHeadIsAncestor = false;
try {
  execFileSync(
    "git",
    ["merge-base", "--is-ancestor", expectedStartingHead, "HEAD"],
    { cwd: root, stdio: "ignore" },
  );
  startingHeadIsAncestor = true;
} catch {}
if (!startingHeadIsAncestor)
  throw new Error(
    `Expected starting HEAD ${expectedStartingHead} to be an ancestor of ${sourceHead}`,
  );
const savePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
);
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/stage3x-test.user.js",
);
const outputArgument = process.argv.find((argument) =>
  argument.startsWith("--out="),
);
const outputPath = path.resolve(
  root,
  outputArgument?.slice("--out=".length) ??
    "test-artifacts/benchmark/tmp/stage3x-bounded-trade-investment.json",
);
const periodArgument = process.argv.find((argument) =>
  argument.startsWith("--periods="),
);
const periods = Number(periodArgument?.slice("--periods=".length) ?? 20_000);
if (!Number.isSafeInteger(periods) || periods < 8_001)
  throw new Error("--periods must be an integer of at least 8001");
const scenariosArgument = process.argv.find((argument) =>
  argument.startsWith("--scenarios="),
);
const scenariosToRun = (
  scenariosArgument?.slice("--scenarios=".length) ?? "B,C,D"
)
  .split(",")
  .filter((scenario) => scenario.length > 0);
if (scenariosToRun.some((scenario) => !["B", "C", "D"].includes(scenario)))
  throw new Error("--scenarios accepts only B,C,D");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const saveText = await readFile(savePath, "utf8");
const settingsText = await readFile(settingsPath, "utf8");
const baseSettings = JSON.parse(settingsText);
const effectiveEpoch = "2026-09-21T00:00:00.000Z";
const settings = Object.freeze({
  ...baseSettings,
  autoSmelter: true,
  autoMarket: true,
  buyTitanium: true,
});
const effectiveSettingsText = JSON.stringify(settings);
const metadata = (
  await readFile(path.join(root, "src/userscript.meta.js"), "utf8")
).trimEnd();
const policyBundle = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["experiments/stage3x-bounded-trade-investment.ts"],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "Stage3XPolicy",
  platform: "browser",
  target: ["esnext"],
});
const automationBundle = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata}\n\n${policyBundle.outputFiles[0].text}\nwindow.__EA_TEST_HOOKS__ = window.__EA_TEST_HOOKS__ ?? {};`,
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
await writeFile(bundlePath, automationBundle.outputFiles[0].contents);

const snapshotPeriods = [];
for (let period = 100; period <= 8_000; period += 100)
  snapshotPeriods.push(period);
snapshotPeriods.push(8_001);
for (let period = 8_100; period <= periods; period += 100)
  snapshotPeriods.push(period);
if (snapshotPeriods.at(-1) !== periods) snapshotPeriods.push(periods);

function selectedState(state, period) {
  const money = state.resource?.Money;
  const titanium = state.resource?.Titanium;
  const marketRouteAssignments =
    period === 8_000
      ? Object.entries(state.resource ?? {})
          .filter(
            ([resourceId, resource]) =>
              resourceId !== "Money" &&
              Number.isFinite(resource.trade) &&
              resource.trade !== 0,
          )
          .map(([resourceId, resource]) => ({
            resourceId,
            routes: resource.trade,
          }))
      : undefined;
  return {
    period,
    money: money && { amount: money.amount, rate: money.diff },
    titanium: titanium && {
      amount: titanium.amount,
      capacity: titanium.max,
      rate: titanium.diff,
      routes: titanium.trade,
      value: titanium.value,
    },
    marketRoutes: state.city?.market?.trade,
    marketRouteCapacity: state.city?.market?.mtrade,
    marketRouteAssignments,
    knowledge: state.resource?.Knowledge?.amount,
    tech: {
      highTech: state.tech?.high_tech,
      smelting: state.tech?.smelting,
      titanium: state.tech?.titanium,
    },
    factoryCount: state.city?.factory?.count,
    queues: {
      build: state.queue,
      research: state.r_queue,
    },
  };
}

function summarizeMilestones(samples) {
  const first = (predicate) =>
    samples.find((sample) => predicate(sample))?.period ?? null;
  return {
    firstTitanium: first((sample) => (sample.titanium?.amount ?? 0) > 0),
    firstHunterProcessTechnology: first(
      (sample) => (sample.tech.titanium ?? 0) >= 1,
    ),
    firstFactory: first((sample) => (sample.factoryCount ?? 0) > 0),
    firstHighTech4: first((sample) => (sample.tech.highTech ?? 0) >= 4),
  };
}

function installScenarioHooks(scenarioId) {
  const hooks = Object.assign({}, window.__EA_TEST_HOOKS__ ?? {});
  window.__EA_TEST_HOOKS__ = hooks;
  hooks.gatherIntervention = {
    resourceClaimMode: "goal-derived-conjunctive",
  };
  hooks.marketRoutePlanCount = 0;
  hooks.marketRouteTrace = [];
  hooks.marketRouteQuotes = [];
  hooks.marketRouteTraceCounts = {};
  hooks.marketRouteOperationCounts = {};
  hooks.marketRouteSkipReasons = {};
  hooks.marketRouteRefusalReasons = {};
  hooks.marketRouteCaptureFailures = {};
  hooks.marketRouteInputAt8000 = null;
  hooks.marketInvestmentDecisions = [];
  hooks.marketInvestmentEvaluations = 0;
  hooks.marketInvestmentStatuses = {};
  hooks.marketInvestmentReasons = {};
  hooks.marketInvestmentFirstDecision = null;
  hooks.marketInvestmentLastDecision = null;
  hooks.marketInvestmentPendingResource = null;
  hooks.marketInvestmentOwnedResource = null;
  hooks.resolveTradeRouteOperationsForTest = (input, planned, context) => {
    if (scenarioId === "D") {
      hooks.marketInvestmentPendingResource = null;
      hooks.marketInvestmentEvaluations += 1;
      const candidates = context.resources.filter(
        (resource) =>
          resource.demanded && resource.holding < resource.demandedQuantity,
      );
      const selected = candidates.length === 1 ? candidates[0] : undefined;
      const decision = window.Stage3XPolicy.evaluateBoundedTradeInvestment({
        goal:
          selected === undefined
            ? undefined
            : {
                resourceId: selected.resourceId,
                targetQuantity: selected.demandedQuantity,
              },
        resource: {
          id: selected?.resourceId ?? "",
          holding: selected?.holding ?? 0,
          capacity: selected?.capacity ?? 0,
          productionLowerBoundPerPeriod: undefined,
          existingImportQuantity:
            selected === undefined || selected.currentRoutes <= 0
              ? 0
              : selected.currentRoutes * selected.importQuantityPerPeriod,
          importPriceUpperBoundPerPeriod: undefined,
          importQuantityLowerBoundPerPeriod: undefined,
          routeAssignments: selected?.currentRoutes ?? 0,
        },
        availableRouteSlots: Math.max(
          0,
          context.maximumRoutes - context.routeCount,
        ),
        maximumRoutes: context.maximumRoutes,
        maximumResourceRoutes: selected?.maximumRoutes ?? 0,
        settings: {
          autoMarket: context.ownerEnabled,
          importEnabled: selected?.importsEnabled === true,
        },
        money: {
          holding: input.money.currentQuantity,
          incomePerPeriod: undefined,
          outflowPerPeriod: undefined,
          projectedNetFlowPerPeriod: input.money.rateOfChange,
          protectedCommitments: undefined,
          commitmentsComplete: false,
          ongoingObligationsPerPeriod: undefined,
          obligationsComplete: false,
        },
        freshness: {
          root: context.rootCurrent,
          marketBoard: context.boardCurrent,
          quote: selected !== undefined,
          demand: selected !== undefined,
          resourceControl:
            selected !== undefined &&
            context.controls.some(
              (control) =>
                control.elementId === selected.controlElementId &&
                control.generation === selected.controlGeneration,
            ),
        },
      });
      const decisionRecord = {
        period: window.__EA_RUNNER__.periods(),
        status: decision.status,
        reason: decision.reason,
        missingEvidence: decision.missingEvidence,
        resourceId: selected?.resourceId,
        shortfall: decision.shortfall,
        maximumAffordableCommitment: decision.maximumAffordableCommitment,
        estimatedRequiredCommitment: decision.estimatedRequiredCommitment,
      };
      hooks.marketInvestmentStatuses[decision.status] =
        (hooks.marketInvestmentStatuses[decision.status] ?? 0) + 1;
      hooks.marketInvestmentReasons[decision.reason] =
        (hooks.marketInvestmentReasons[decision.reason] ?? 0) + 1;
      hooks.marketInvestmentFirstDecision ??= decisionRecord;
      hooks.marketInvestmentLastDecision = decisionRecord;
      hooks.marketInvestmentDecisions.push(decisionRecord);
      if (hooks.marketInvestmentDecisions.length > 30)
        hooks.marketInvestmentDecisions.shift();
      if (decision.candidate && selected?.currentRoutes === 0) {
        hooks.marketInvestmentPendingResource = selected.resourceId;
        return [{ kind: "add", resourceId: selected.resourceId, count: 1 }];
      }
      if (
        hooks.marketInvestmentOwnedResource !== null &&
        (decision.status !== "candidate-investment" ||
          decision.status === "demand-satisfied")
      ) {
        const owned = hooks.marketInvestmentOwnedResource;
        hooks.marketInvestmentOwnedResource = null;
        return [{ kind: "zero", resourceId: owned }];
      }
    }
    return undefined;
  };
  hooks.recordTradeRouteTraceForTest = (event) => {
    hooks.marketRouteTraceCounts[event.kind] =
      (hooks.marketRouteTraceCounts[event.kind] ?? 0) + 1;
    if (event.kind === "skipped")
      hooks.marketRouteSkipReasons[event.reason] =
        (hooks.marketRouteSkipReasons[event.reason] ?? 0) + 1;
    if (event.kind === "capture-unavailable")
      hooks.marketRouteCaptureFailures[event.reason] =
        (hooks.marketRouteCaptureFailures[event.reason] ?? 0) + 1;
    if (event.kind === "refused")
      hooks.marketRouteRefusalReasons[event.reason] =
        (hooks.marketRouteRefusalReasons[event.reason] ?? 0) + 1;
    if (event.kind === "applied" && event.operation !== undefined) {
      const key = `${event.operation.kind}:${event.operation.resourceId}`;
      hooks.marketRouteOperationCounts[key] =
        (hooks.marketRouteOperationCounts[key] ?? 0) + 1;
    }
    if (event.kind === "applied" && scenarioId === "D") {
      if (
        event.operation.kind === "add" &&
        event.operation.resourceId === hooks.marketInvestmentPendingResource
      ) {
        hooks.marketInvestmentOwnedResource = event.operation.resourceId;
        hooks.marketInvestmentPendingResource = null;
      } else if (
        event.operation.kind === "zero" &&
        event.operation.resourceId === hooks.marketInvestmentOwnedResource
      ) {
        hooks.marketInvestmentOwnedResource = null;
      }
    }
    const period = window.__EA_RUNNER__.periods();
    if (event.kind !== "plan") return;
    const titanium = event.resources.find(
      (resource) => resource.resourceId === "Titanium",
    );
    if (period === 8_000) {
      hooks.marketRouteInputAt8000 = {
        routeCount: event.routeCount,
        maximumRoutes: event.maximumRoutes,
        moneyHolding: event.moneyHolding,
        moneyRate: event.moneyRate,
        resources: event.resources.map((resource) => ({ ...resource })),
      };
    }
    hooks.marketRoutePlanCount += 1;
    const quote =
      titanium === undefined
        ? undefined
        : {
            period,
            routes: titanium.currentRoutes,
            price: titanium.importPricePerPeriod,
            quantity: titanium.importQuantityPerPeriod,
            moneyHolding: event.moneyHolding,
          };
    const previousQuote = hooks.marketRouteQuotes.at(-1);
    if (
      quote !== undefined &&
      (period === 8_000 ||
        period % 100 === 0 ||
        previousQuote?.routes !== quote.routes ||
        previousQuote?.price !== quote.price ||
        previousQuote?.quantity !== quote.quantity)
    ) {
      hooks.marketRouteQuotes.push(quote);
      if (hooks.marketRouteQuotes.length > 500) hooks.marketRouteQuotes.shift();
    }
    const summarizeOperations = (operations) =>
      operations.map((operation) => ({
        kind: operation.kind,
        resourceId: operation.resourceId,
        count: operation.count ?? 1,
      }));
    for (const operation of event.desiredOperations) {
      const key = `planned:${operation.kind}:${operation.resourceId}`;
      hooks.marketRouteOperationCounts[key] =
        (hooks.marketRouteOperationCounts[key] ?? 0) + (operation.count ?? 1);
    }
    if (
      period !== 8_000 &&
      period % 500 !== 0 &&
      event.desiredOperations.length === 0 &&
      event.baselineOperations.length === 0
    )
      return;
    hooks.marketRouteTrace.push({
      period,
      rootCurrent: event.rootCurrent,
      boardCurrent: event.boardCurrent,
      routeCount: event.routeCount,
      maximumRoutes: event.maximumRoutes,
      moneyHolding: event.moneyHolding,
      moneyRate: event.moneyRate,
      titanium: titanium && {
        currentRoutes: titanium.currentRoutes,
        holding: titanium.holding,
        capacity: titanium.capacity,
        demandedQuantity: titanium.demandedQuantity,
        demanded: titanium.demanded,
        importEnabled: titanium.importsEnabled,
        importPrice: titanium.importPricePerPeriod,
        importQuantity: titanium.importQuantityPerPeriod,
      },
      titaniumDesiredRouteCount:
        titanium === undefined
          ? null
          : event.baselineOperations.reduce((routes, operation) => {
              if (operation.resourceId !== "Titanium") return routes;
              if (operation.kind === "zero") return 0;
              return (
                routes +
                (operation.kind === "add" ? operation.count : -operation.count)
              );
            }, titanium.currentRoutes),
      desiredOperations: summarizeOperations(event.desiredOperations),
      baselineOperations: summarizeOperations(event.baselineOperations),
    });
    if (hooks.marketRouteTrace.length > 500) hooks.marketRouteTrace.shift();
  };
  return {
    gather: hooks.gatherIntervention,
    routeControlReady:
      typeof hooks.capturedTradeRouteControlForTest?.addOne === "function",
  };
}

async function configureScenarioHooks(session, scenario) {
  await session.page.evaluateOnNewDocument(installScenarioHooks, scenario);
  await session.page.reload({ waitUntil: "load" });
  await session.page.waitForFunction(
    () => window.__EA_RUNNER__?.ready() === true,
  );
  return session.evaluate(installScenarioHooks, scenario);
}

async function readSnapshotMap(session) {
  const snapshots = await session.snapshots();
  return Object.fromEntries(
    Object.entries(snapshots).map(([period, snapshot]) => [
      period,
      selectedState(parseSave(snapshot.exportSave), Number(period)),
    ]),
  );
}

const runner = await createChromiumRunner({
  game: gamePath,
  upstream: "D:/work/Evolve-DeadSpace",
});
if (!expectedUpstreamCommit.startsWith(runner.inputs.gameSnapshot.commit)) {
  await runner.close();
  throw new Error(
    `Expected pinned upstream ${expectedUpstreamCommit}, found ${runner.inputs.gameSnapshot.commit}`,
  );
}
const reportInputs = {
  branch: branchName,
  sourceHead,
  expectedStartingHead,
  expectedUpstreamCommit,
  upstream: runner.inputs,
  save: path.relative(root, savePath),
  saveSha256: sha256(saveText),
  settings: path.relative(root, settingsPath),
  settingsOriginalSha256: sha256(settingsText),
  settingsEffectiveSha256: sha256(effectiveSettingsText),
  effectiveOverrides: {
    autoSmelter: true,
    autoMarket: true,
    buyTitanium: true,
    res_trade_buy_Titanium: settings.res_trade_buy_Titanium,
  },
  seed: 42,
  epoch: effectiveEpoch,
  gatherIntervention: { resourceClaimMode: "goal-derived-conjunctive" },
  periods,
  freshChromiumContextPerScenario: true,
  nativeInvocationTrace: false,
  snapshotPeriods,
  bundle: {
    path: bundlePath,
    sha256: sha256(automationBundle.outputFiles[0].contents),
  },
};
const results = [];
try {
  for (const scenario of scenariosToRun) {
    const started = performance.now();
    const session = await runner.openSession({
      bundle: bundlePath,
      save: parseSave(saveText),
      settings,
      seed: 42,
      epoch: Date.parse(effectiveEpoch),
      perf: true,
      forwardPerfSummary: true,
      snapshotAt: snapshotPeriods,
    });
    try {
      const hookState = await configureScenarioHooks(session, scenario);
      await session.advance(8_000);
      const beforeState = selectedState(await session.readState(), 8_000);
      const beforeControl = await session.evaluate(() =>
        window.__EA_TEST_HOOKS__.capturedTradeRouteControlForTest?.inspect(
          "Titanium",
        ),
      );
      let intervention;
      let afterControl = beforeControl;
      if (scenario === "C") {
        if (beforeControl?.status !== "captured")
          throw new Error(
            `C has no complete current native Market capture at p8000: ${JSON.stringify({ beforeControl, hookState, captureFailures: await session.evaluate(() => window.__EA_TEST_HOOKS__?.marketRouteCaptureFailures) })}`,
          );
        if (beforeControl?.ownerEnabled !== true)
          throw new Error(
            `C lacks explicit autoMarket permission at p8000: ${JSON.stringify({ beforeControl, hookState, hookStateAtFailure: await session.evaluate(() => ({ traceCounts: window.__EA_TEST_HOOKS__?.marketRouteTraceCounts, skipReasons: window.__EA_TEST_HOOKS__?.marketRouteSkipReasons, captureFailures: window.__EA_TEST_HOOKS__?.marketRouteCaptureFailures, plans: window.__EA_TEST_HOOKS__?.marketRouteTrace?.slice?.(-5) ?? [] })) })}`,
          );
        if (beforeControl?.importEnabled !== true)
          throw new Error(
            "C lacks explicit Titanium route permission at p8000",
          );
        intervention = await session.evaluate(() =>
          window.__EA_TEST_HOOKS__.capturedTradeRouteControlForTest.addOne(
            "Titanium",
            { requireDemand: false },
          ),
        );
        afterControl = await session.evaluate(() =>
          window.__EA_TEST_HOOKS__.capturedTradeRouteControlForTest.inspect(
            "Titanium",
          ),
        );
      }
      await session.advance(1);
      const afterInterventionState = selectedState(
        await session.readState(),
        8_001,
      );
      await session.advance(periods - 8_001);
      const snapshotMap = await readSnapshotMap(session);
      const allSamples = Object.values(snapshotMap).sort(
        (left, right) => left.period - right.period,
      );
      const samples = allSamples
        .filter(({ period }) => period >= 8_000)
        .sort((left, right) => left.period - right.period);
      const diagnostics = await session.diagnostics();
      const controlTrace = await session.evaluate(() => {
        const hooks = window.__EA_TEST_HOOKS__;
        return {
          planCount: hooks.marketRoutePlanCount,
          traceCounts: hooks.marketRouteTraceCounts,
          operationCounts: hooks.marketRouteOperationCounts,
          skipReasons: hooks.marketRouteSkipReasons,
          refusalReasons: hooks.marketRouteRefusalReasons,
          captureFailures: hooks.marketRouteCaptureFailures,
          inputAt8000: hooks.marketRouteInputAt8000,
          plans: hooks.marketRouteTrace,
          quotes: hooks.marketRouteQuotes,
          investmentEvaluations: hooks.marketInvestmentEvaluations,
          investmentStatuses: hooks.marketInvestmentStatuses,
          investmentReasons: hooks.marketInvestmentReasons,
          investmentFirstDecision: hooks.marketInvestmentFirstDecision,
          investmentLastDecision: hooks.marketInvestmentLastDecision,
          investmentDecisions: hooks.marketInvestmentDecisions,
        };
      });
      const moneyValues = samples
        .map((sample) => sample.money?.amount)
        .filter(Number.isFinite);
      const quoteTraceAvailable = Array.isArray(controlTrace.quotes);
      const priceTrace = quoteTraceAvailable ? [...controlTrace.quotes] : [];
      if (scenario === "C")
        priceTrace.unshift({
          period: 8_000,
          routes: afterControl.resource.currentRoutes,
          price: afterControl.resource.importPricePerPeriod,
          quantity: afterControl.resource.importQuantityPerPeriod,
          moneyHolding: beforeState.money.amount,
        });
      const nativeTimeMultiplierPerPeriod = 5;
      const routeSpendEstimate = quoteTraceAvailable
        ? priceTrace.reduce((sum, quote, index) => {
            const next = priceTrace[index + 1];
            if (
              next === undefined ||
              quote.routes <= 0 ||
              !Number.isFinite(quote.price)
            )
              return sum;
            return (
              sum +
              Math.max(0, next.period - quote.period) *
                quote.routes *
                quote.price *
                nativeTimeMultiplierPerPeriod
            );
          }, 0)
        : null;
      results.push({
        scenario,
        elapsedMs: Number((performance.now() - started).toFixed(1)),
        initialAt8000: beforeState,
        nativeControlBefore: beforeControl,
        intervention: intervention ?? null,
        nativeControlAfter: afterControl,
        afterInterventionAt8001: afterInterventionState,
        checkpoints: samples,
        milestones: summarizeMilestones(allSamples),
        milestoneTiming:
          "first observed sample only (100 periods); true acquisition times may be earlier",
        money: {
          minimumSampled: moneyValues.length ? Math.min(...moneyValues) : null,
          minimumInterpretation:
            "minimum at sampled checkpoints only; within-interval lows are unobserved",
          final: samples.at(-1)?.money?.amount ?? null,
          changeFrom8000:
            samples.at(-1)?.money?.amount !== undefined &&
            beforeState.money?.amount !== undefined
              ? samples.at(-1).money.amount - beforeState.money.amount
              : null,
          negativeSampleCount: moneyValues.filter((value) => value < 0).length,
          negativeSampleInterpretation:
            "negative sampled checkpoints only; intervening events are unobserved",
          sampleIntervalPeriods: 100,
        },
        routePriceTrace: priceTrace,
        quoteTraceAvailable,
        estimatedCumulativeNativeImportSpend: routeSpendEstimate,
        nativeTimeMultiplierPerPeriod,
        routePlanner: controlTrace,
        diagnostics,
        hookState,
        workTicks: diagnostics.workTicks,
        perfSummaries: diagnostics.perfSummaries,
      });
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(
        outputPath,
        `${JSON.stringify({ inputs: reportInputs, scenarios: results }, null, 2)}\n`,
      );
    } finally {
      await session.close();
    }
  }
} finally {
  await runner.close();
}

const result = { inputs: reportInputs, scenarios: results };
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      outputPath,
      scenarios: results.map(({ scenario, money, milestones }) => ({
        scenario,
        money,
        milestones,
      })),
    },
    null,
    2,
  ),
);
