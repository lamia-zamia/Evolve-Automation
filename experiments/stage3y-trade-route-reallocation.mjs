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
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const savePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
);
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/stage3y-test.user.js",
);
const outputArgument = process.argv.find((argument) =>
  argument.startsWith("--out="),
);
const outputPath = path.resolve(
  root,
  outputArgument?.slice("--out=".length) ??
    "test-artifacts/benchmark/tmp/stage3y-trade-route-reallocation.json",
);
const scenariosArgument = process.argv.find((argument) =>
  argument.startsWith("--scenarios="),
);
const scenariosToRun = (
  scenariosArgument?.slice("--scenarios=".length) ?? "B,E"
)
  .split(",")
  .filter(Boolean);
if (scenariosToRun.some((scenario) => !["B", "E"].includes(scenario)))
  throw new Error("--scenarios accepts only B,E");
const upstreamCommit = "db38e2af831907d49aeb5348d678d8d8745d6c3f";
const startCommit = "3abd7b3a43780a1f0120f049dcd1b9b6291b1b25";
const experimentBudget = 7_000;
const maximumExposurePeriods = 8;
const timeMultiplierPerPeriod = 5;
const snapshotPeriods = [
  ...new Set([
    8_000,
    8_001,
    ...Array.from({ length: 121 }, (_, index) => 8_000 + index * 100),
    20_000,
  ]),
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

if (
  execFileSync("git", ["branch", "--show-current"], {
    cwd: root,
    encoding: "utf8",
  }).trim() !== "deadspace"
)
  throw new Error("Stage 3Y must run on deadspace");
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
  autoSmelter: true,
  autoMarket: true,
  buyTitanium: true,
});
const built = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata.trimEnd()}\n\nwindow.__EA_TEST_HOOKS__ = window.__EA_TEST_HOOKS__ ?? {};`,
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

function installObservers() {
  const hooks = window.__EA_TEST_HOOKS__;
  hooks.gatherIntervention = { resourceClaimMode: "goal-derived-conjunctive" };
  hooks.stage3yPlans = [];
  hooks.stage3yApplied = [];
  hooks.resolveTradeRouteOperationsForTest = (input, planned, context) => {
    const period = window.__EA_RUNNER__.periods();
    const checkpoint = [
      8_000, 8_008, 8_016, 9_000, 10_000, 12_000, 15_000, 20_000,
    ].includes(period);
    const relevant = planned.operations.some((entry) =>
      ["Steel", "Titanium"].includes(entry.resourceId),
    );
    if (!checkpoint && !relevant) return undefined;
    hooks.stage3yPlans.push({
      period,
      routeCount: context.routeCount,
      maximumRoutes: context.maximumRoutes,
      rootCurrent: context.rootCurrent,
      boardCurrent: context.boardCurrent,
      money: { ...input.money },
      desiredOperations: planned.operations.map((entry) => ({ ...entry })),
      resources: context.resources
        .filter(
          (resource) =>
            checkpoint || ["Steel", "Titanium"].includes(resource.resourceId),
        )
        .map((resource) => ({ ...resource })),
      pricesAndPriorities: input.priorityList
        .filter(
          (resource) =>
            checkpoint || ["Steel", "Titanium"].includes(resource.id),
        )
        .map((resource) => ({
          resourceId: resource.id,
          routes: resource.tradeRoutes,
          importEnabled: resource.autoTradeBuyEnabled,
          exportEnabled: resource.autoTradeSellEnabled,
          demanded: resource.isDemanded,
          storageRatio: resource.storageRatio,
          usefulRatio: resource.usefulRatio,
          importPrice: resource.tradeBuyPrice,
          routeQuantity: resource.tradeRouteQuantity,
          exportPrice: resource.tradeSellPrice,
          exportVolume: resource.tradeRouteQuantity,
          priority: resource.autoTradePriority,
          weighting: resource.autoTradeWeighting,
        })),
    });
    return undefined;
  };
  hooks.recordTradeRouteTraceForTest = (event) => {
    if (
      event.kind === "applied" &&
      ["Steel", "Titanium"].includes(event.operation?.resourceId)
    )
      hooks.stage3yApplied.push({
        period: window.__EA_RUNNER__.periods(),
        kind: event.operation?.kind,
        resourceId: event.operation?.resourceId,
        count: event.operation?.count,
        routeCount: event.routeCount,
      });
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

function technologyEvidence(catalog) {
  const ids = new Set(["tech-hunter_process", "tech-electronics", "tech-mad"]);
  return {
    catalogCurrent: catalog?.current,
    source: catalog?.source,
    selectedPrestige: catalog?.selectedPrestige,
    targetEligibility: catalog?.targetEligibility,
    queueEvidence: catalog?.queueEvidence,
    researchPermission: catalog?.researchPermission,
    offers: catalog?.offers?.filter((offer) => ids.has(offer.elementId)),
    definitions: catalog?.definitions?.filter((definition) =>
      ids.has(definition.actionId),
    ),
    applicability: catalog?.applicability?.filter((entry) =>
      ids.has(entry.actionId),
    ),
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
      autoMarket: true,
      autoSmelter: true,
      buyTitanium: settings.res_trade_buy_Titanium,
    },
    seed: 42,
    epoch: "2026-09-21T00:00:00.000Z",
    gatherIntervention: "goal-derived-conjunctive",
    checkpoints: [8_000, 8_001, 8_008, 9_000, 10_000, 12_000, 15_000, 20_000],
    snapshotPeriods,
    experimentOnlyMaximumEstimatedExpenditure: experimentBudget,
    maximumExposurePeriods,
    nativeTimeMultiplierPerPeriod: timeMultiplierPerPeriod,
  },
  scenarios: [],
};

try {
  for (const scenario of scenariosToRun) {
    const session = await runner.openSession({
      bundle: bundlePath,
      save: parseSave(saveText),
      settings,
      seed: 42,
      epoch: Date.parse(result.inputs.epoch),
      perf: true,
      snapshotAt: result.inputs.snapshotPeriods,
    });
    try {
      await session.evaluate(installObservers);
      console.log(`${scenario}: opened exact Chromium session`);
      let period = 0;
      const checkpoints = [];
      const sample = async (at) => {
        const [state, catalog, hooks] = await Promise.all([
          session.readState(),
          session.evaluate(() =>
            window.__EA_TEST_HOOKS__.readCurrentResearchCatalog?.("tech-mad"),
          ),
          session.evaluate(() => ({
            keys: Object.keys(window.__EA_TEST_HOOKS__ ?? {}),
            stage3yPlans:
              window.__EA_TEST_HOOKS__.stage3yPlans?.slice(-8) ?? [],
          })),
        ]);
        const plans = hooks?.stage3yPlans ?? [];
        const routeAssignments = assignmentSnapshot(state);
        const activeRoutes = routeAssignments.map(({ resourceId }) => {
          const plan = plans.filter((entry) => entry.period <= at).at(-1);
          return plan?.pricesAndPriorities.find(
            (entry) => entry.resourceId === resourceId,
          );
        });
        return {
          period: at,
          holdings: Object.fromEntries(
            Object.entries(state.resource ?? {})
              .filter(([id]) =>
                [
                  "Money",
                  "Titanium",
                  "Knowledge",
                  "Lumber",
                  "Steel",
                  "Iron",
                  "Coal",
                  "Oil",
                  "Cement",
                  "Aluminium",
                  "Copper",
                ].includes(id),
              )
              .map(([id, value]) => [
                id,
                {
                  amount: value.amount,
                  capacity: value.max,
                  rate: value.diff,
                  trade: value.trade,
                },
              ]),
          ),
          technology: {
            highTech: state.tech?.high_tech,
            smelting: state.tech?.smelting,
            titanium: state.tech?.titanium,
            explosives: state.tech?.explosives,
            uranium: state.tech?.uranium,
            mad: state.tech?.mad,
          },
          factoryCount: state.city?.factory?.count,
          queues: { build: state.queue, research: state.r_queue },
          market: {
            used: state.city?.market?.trade,
            capacity: state.city?.market?.mtrade,
            assignments: routeAssignments,
            assignedPricesAndPriorities: activeRoutes,
          },
          nativeResearch: technologyEvidence(catalog),
          observerKeys: hooks?.keys ?? [],
          recentMarketPlans: plans
            .filter((entry) => entry.period <= at)
            .slice(-3),
        };
      };

      await session.advance(8_000);
      period = 8_000;
      console.log(`${scenario}: reached p8000`);
      const before = await sample(period);
      let intervention = { status: "baseline" };
      if (scenario === "E") {
        const plan = await session.evaluate(() =>
          window.__EA_TEST_HOOKS__?.stage3yPlans
            ?.filter((entry) => entry.period === 8_000)
            .at(-1),
        );
        const source = plan?.desiredOperations
          .filter((operation) => operation.kind === "remove")
          .flatMap((operation) => {
            const resource = plan.resources.find(
              (entry) => entry.resourceId === operation.resourceId,
            );
            const native = plan.pricesAndPriorities.find(
              (entry) => entry.resourceId === operation.resourceId,
            );
            const currentRoutes = before.market.assignments.find(
              (entry) => entry.resourceId === operation.resourceId,
            )?.routes;
            return resource !== undefined &&
              native !== undefined &&
              currentRoutes !== undefined &&
              currentRoutes !== 0 &&
              !resource.demanded &&
              (currentRoutes > 0
                ? resource.importsEnabled
                : resource.exportsEnabled) &&
              currentRoutes !== 0
              ? [
                  {
                    resourceId: operation.resourceId,
                    routes: currentRoutes,
                    operation,
                    native,
                  },
                ]
              : [];
          })[0];
        const target = await session.evaluate(() =>
          window.__EA_TEST_HOOKS__.capturedTradeRouteControlForTest?.inspect(
            "Titanium",
          ),
        );
        if (
          source === undefined ||
          target?.status !== "captured" ||
          target.importEnabled !== true
        ) {
          intervention = {
            status: "no-supported-pair",
            sourceCandidate: source,
            target,
          };
        } else {
          const beforeSource = await session.evaluate(
            (id) =>
              window.__EA_TEST_HOOKS__.capturedTradeRouteControlForTest.inspect(
                id,
              ),
            source.resourceId,
          );
          const beforeTarget = target;
          const reduced = await session.evaluate(
            (id) =>
              window.__EA_TEST_HOOKS__.capturedTradeRouteControlForTest.removeOne(
                id,
              ),
            source.resourceId,
          );
          const afterRemoval = await session.evaluate(
            (id) =>
              window.__EA_TEST_HOOKS__.capturedTradeRouteControlForTest.inspect(
                id,
              ),
            source.resourceId,
          );
          let added = { status: "not-attempted" };
          let afterTarget = await session.evaluate(() =>
            window.__EA_TEST_HOOKS__.capturedTradeRouteControlForTest.inspect(
              "Titanium",
            ),
          );
          if (
            reduced.status === "applied" &&
            afterRemoval?.routeCount === beforeSource.routeCount - 1 &&
            afterRemoval.maximumRoutes === beforeSource.maximumRoutes
          )
            added = await session.evaluate(() =>
              window.__EA_TEST_HOOKS__.capturedTradeRouteControlForTest.addOne(
                "Titanium",
                { requireDemand: false },
              ),
            );
          afterTarget = await session.evaluate(() =>
            window.__EA_TEST_HOOKS__.capturedTradeRouteControlForTest.inspect(
              "Titanium",
            ),
          );
          const sourceAfterAdd = await session.evaluate(
            (id) =>
              window.__EA_TEST_HOOKS__.capturedTradeRouteControlForTest.inspect(
                id,
              ),
            source.resourceId,
          );
          const assignmentAfter = await session.readState();
          const assignments = assignmentSnapshot(assignmentAfter);
          const selectedResearch = before.nativeResearch;
          const hunterCandidate = selectedResearch.offers?.find(
            (entry) => entry.elementId === "tech-hunter_process",
          );
          const hunterDefinition = selectedResearch.definitions?.find(
            (entry) => entry.actionId === "tech-hunter_process",
          );
          const sourceSellPrice = source.native.exportPrice;
          const targetBuyPrice = beforeTarget.resource.importPricePerPeriod;
          const maximumOneCycleCost = Number.isFinite(targetBuyPrice)
            ? targetBuyPrice * timeMultiplierPerPeriod * maximumExposurePeriods
            : Infinity;
          const enabledPair =
            reduced.status === "applied" &&
            added.status === "applied" &&
            afterTarget.routeCount === beforeTarget.routeCount &&
            afterTarget.maximumRoutes === beforeTarget.maximumRoutes &&
            assignments.reduce(
              (total, row) => total + Math.abs(row.routes),
              0,
            ) ===
              before.market.assignments.reduce(
                (total, row) => total + Math.abs(row.routes),
                0,
              );
          intervention = {
            status: enabledPair ? "applied" : "native-validation-failed",
            selectedPrestige: selectedResearch.selectedPrestige,
            selectedTargetAction: "tech-mad",
            diagnosticResearchAction: "tech-hunter_process",
            hunterOffer: hunterCandidate,
            hunterDefinition,
            source: {
              ...source,
              before: beforeSource,
              reduced,
              afterRemoval,
              afterAdd: sourceAfterAdd,
              currentExportPrice: sourceSellPrice,
            },
            target: {
              before: beforeTarget,
              added,
              after: afterTarget,
              estimatedOneCycleCost: maximumOneCycleCost,
            },
            routeCountConserved: enabledPair,
            maxEstimatedExpenditure: experimentBudget,
            maxExposurePeriods: maximumExposurePeriods,
            estimatedCostBasis:
              "current native quote × native time multiplier × at most eight periods; not an isolated debit ledger",
          };
        }
      }

      const expenditureTrace = [];
      let estimatedExposure = 0;
      let firstPeriodSample;
      if (scenario === "E" && intervention.status === "applied") {
        for (
          let next = 8_001;
          next <= 8_000 + maximumExposurePeriods;
          next += 1
        ) {
          const target = await session.evaluate(() =>
            window.__EA_TEST_HOOKS__.capturedTradeRouteControlForTest?.inspect(
              "Titanium",
            ),
          );
          const routes = target?.resource?.currentRoutes ?? 0;
          const quote = target?.resource?.importPricePerPeriod;
          const nextExposure =
            routes > 0 && Number.isFinite(quote)
              ? quote * timeMultiplierPerPeriod
              : 0;
          if (estimatedExposure + nextExposure > experimentBudget) {
            const removal = await session.evaluate(() =>
              window.__EA_TEST_HOOKS__.capturedTradeRouteControlForTest.removeOne(
                "Titanium",
              ),
            );
            expenditureTrace.push({
              period,
              action: "budget-stop",
              estimate: estimatedExposure,
              removal,
            });
            break;
          }
          estimatedExposure += nextExposure;
          await session.advance(1);
          period += 1;
          if (period === 8_001) firstPeriodSample = await sample(period);
          const afterPeriod = await session.evaluate(() =>
            window.__EA_TEST_HOOKS__.capturedTradeRouteControlForTest?.inspect(
              "Titanium",
            ),
          );
          expenditureTrace.push({
            period,
            routes: afterPeriod?.resource?.currentRoutes,
            quote: afterPeriod?.resource?.importPricePerPeriod,
            cumulativeEstimate: estimatedExposure,
          });
          if ((afterPeriod?.resource?.currentRoutes ?? 0) < 1) break;
        }
        if (period === 8_000 + maximumExposurePeriods) {
          const afterCycle = await session.evaluate(() =>
            window.__EA_TEST_HOOKS__.capturedTradeRouteControlForTest?.inspect(
              "Titanium",
            ),
          );
          if ((afterCycle?.resource?.currentRoutes ?? 0) === 1) {
            const removal = await session.evaluate(() =>
              window.__EA_TEST_HOOKS__.capturedTradeRouteControlForTest.removeOne(
                "Titanium",
              ),
            );
            expenditureTrace.push({
              period,
              action: "experiment-stop",
              reason: "one-cycle bound",
              removal,
            });
          } else if ((afterCycle?.resource?.currentRoutes ?? 0) > 1) {
            expenditureTrace.push({
              period,
              action: "owner-adjusted",
              reason: "native Market changed Titanium routes during the bound",
              routes: afterCycle.resource.currentRoutes,
            });
          }
        }
      }
      if (firstPeriodSample !== undefined) checkpoints.push(firstPeriodSample);
      const afterIntervention = await sample(period);
      const milestonePeriods = [
        8_001, 8_008, 9_000, 10_000, 12_000, 15_000, 20_000,
      ];
      if (scenario === "E" && period >= 8_001) milestonePeriods.shift();
      for (const targetPeriod of milestonePeriods) {
        if (targetPeriod <= period) {
          if (targetPeriod === period) checkpoints.push(afterIntervention);
          continue;
        }
        await session.advance(targetPeriod - period);
        period = targetPeriod;
        checkpoints.push(await sample(period));
        console.log(`${scenario}: captured p${period}`);
      }
      const hooks = await session.evaluate(() => ({
        stage3yPlans: window.__EA_TEST_HOOKS__.stage3yPlans?.slice(-100) ?? [],
        stage3yApplied:
          window.__EA_TEST_HOOKS__.stage3yApplied?.slice(-200) ?? [],
      }));
      const diagnostics = await session.diagnostics();
      const state = await session.readState();
      const snapshots = await session.snapshots();
      const moneySamples = Object.entries(snapshots)
        .map(([at, snapshot]) => ({
          period: Number(at),
          amount: parseSave(snapshot.exportSave).resource?.Money?.amount,
        }))
        .filter((entry) => Number.isFinite(entry.amount));
      const denseSummary = {
        sampleCount: moneySamples.length,
        sampledMoneyMinimum: moneySamples.reduce(
          (minimum, entry) => Math.min(minimum, entry.amount),
          Number.POSITIVE_INFINITY,
        ),
        sampledMoneyMinimumPeriod: moneySamples.reduce(
          (minimum, entry) => (entry.amount < minimum.amount ? entry : minimum),
          moneySamples[0] ?? { period: null, amount: null },
        ).period,
      };
      result.scenarios.push({
        scenario,
        initialAt8000: before,
        intervention,
        afterIntervention,
        expenditureTrace,
        estimatedExperimentalExposure: estimatedExposure,
        checkpoints,
        final: checkpoints.at(-1),
        denseSummary,
        routePlans: (hooks.stage3yPlans ?? []).filter((entry) =>
          [8_000, 8_008, 8_016, 9_000, 10_000, 12_000, 15_000, 20_000].includes(
            entry.period,
          ),
        ),
        appliedRouteOperations: hooks.stage3yApplied,
        diagnostics: {
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
        intervention: scenario.intervention,
        denseSummary: scenario.denseSummary,
        checkpoints: scenario.checkpoints.map((entry) => ({
          period: entry.period,
          money: entry.holdings.Money?.amount,
          titanium: entry.holdings.Titanium?.amount,
          highTech: entry.technology.highTech,
          titaniumTech: entry.technology.titanium,
          routes: entry.market.assignments,
        })),
        workTicks: scenario.diagnostics.workTicks,
      })),
    },
    null,
    2,
  ),
);
