import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import * as prettier from "prettier";

import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";
import {
  P36_BOOTSTRAP_LIMITS,
  P36_BOOTSTRAP_TARGETS,
} from "./p36-productive-resource-bootstrap-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/p18-standard-human-fixture.txt",
);
const settingsPath = path.join(
  root,
  "experiments/p18-standard-human-settings.json",
);
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const metadataPath = path.join(root, "src/userscript.meta.js");
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p36-productive-resource-bootstrap.user.js",
);
const evidencePath = path.join(
  root,
  "experiments/p36-productive-resource-bootstrap-evidence.json",
);
const interimPath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p36-productive-resource-bootstrap-interim.json",
);
const fixtureSha256 =
  "2d2def2ecad5ae015c0dc825747da105bb90dbd0c405ed0ae5fe672755e0c684";
const pinnedGame =
  "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f";
const pinnedGameSha256 =
  "05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7";
const seed = 44;
const epoch = "2026-09-21T00:00:00.000Z";
const checkpoints = [
  8, 48, 56, 64, 72, 80, 96, 112, 272, 448, 1_000, 2_000, 3_000, 4_000, 5_000,
  6_000, 7_000, 8_000, 9_000, 10_000,
];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => JSON.stringify(value);

const [fixtureText, settingsText, gameBytes, metadata] = await Promise.all([
  readFile(fixturePath, "utf8"),
  readFile(settingsPath, "utf8"),
  readFile(gamePath),
  readFile(metadataPath, "utf8"),
]);
let previousBundleBytes;
try {
  previousBundleBytes = await readFile(bundlePath);
} catch {
  previousBundleBytes = undefined;
}
const settings = JSON.parse(settingsText);
assert.equal(hash(fixtureText), fixtureSha256);
assert.equal(hash(gameBytes), pinnedGameSha256);
assert.equal(settings.buildingAlwaysClick, false);
assert.equal(settings.autoBuild, true);
assert.equal(settings.autoJobs, true);

await mkdir(path.dirname(bundlePath), { recursive: true });
const metricPlugin = {
  name: "p36-test-only-native-authority-metrics",
  setup(build) {
    build.onLoad({ filter: /captured-runtime-control\.ts$/ }, async (args) => {
      let source = await readFile(args.path, "utf8");
      const replaceOnce = (before, after, label) => {
        assert.equal(
          source.split(before).length - 1,
          1,
          `P36 instrumentation anchor changed: ${label}`,
        );
        source = source.replace(before, after);
      };
      replaceOnce(
        `              const nativePrice =
                typeof targetId === "string"
                  ? buildCosts.readCost(targetId)
                  : undefined;`,
        `              const p36Metrics = readProperty(settingsHostWindow, "__EA_TEST_HOOKS__")?.p36Metrics;
              const p36Metric = (name: string) => {
                if (isRecord(p36Metrics)) Reflect.set(p36Metrics, name, Number(readProperty(p36Metrics, name) ?? 0) + 1);
              };
              const nativePrice =
                typeof targetId === "string"
                  ? (p36Metric("freshPriceProbes"), buildCosts.readCost(targetId))
                  : undefined;`,
        "initial live native price probe",
      );
      replaceOnce(
        `              const isNativeRequestCurrent = () => {
                let failureReason = "changed-state-during-revalidation";`,
        `              const isNativeRequestCurrent = () => {
                p36Metric("validationFences");
                let failureReason = "changed-state-during-revalidation";`,
        "per-action native validation fence",
      );
      replaceOnce(
        `                  const nowNativePrice =
                    typeof targetId === "string"
                      ? buildCosts.readCost(targetId)
                      : undefined;`,
        `                  const nowNativePrice =
                    typeof targetId === "string"
                      ? (p36Metric("freshPriceProbes"), buildCosts.readCost(targetId))
                      : undefined;`,
        "fresh native price probe inside validation fence",
      );
      return { contents: source, loader: "ts" };
    });
  },
};

const mainBundle = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata.trimEnd()}\nwindow.__EA_TEST_HOOKS__ = { ...(window.__EA_TEST_HOOKS__ ?? {}), constructionSavingTargetObservations: [], civilizationBootstrapEvents: [], civilizationHandoffEvents: [], p36Metrics: { freshPriceProbes: 0, validationFences: 0 }, captureConstructionSavingTargetForTest(target, authority) { this.constructionSavingTargetObservations.push({ period: window.__EA_RUNNER__?.periods?.() ?? null, target, authority }); } };`,
  },
  plugins: [metricPlugin],
  platform: "browser",
  target: ["esnext"],
  define: {
    "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
    __EA_TEST_SURFACE_ENABLED__: "true",
  },
  minifySyntax: true,
  treeShaking: true,
});
const policyBundle = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["experiments/p36-productive-resource-bootstrap-policy.mjs"],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "__EA_P36_TEST_POLICY__",
  platform: "browser",
  target: ["esnext"],
  minifySyntax: true,
});
const bundleBytes = Buffer.concat([
  Buffer.from(mainBundle.outputFiles[0].contents),
  Buffer.from("\n;\n"),
  Buffer.from(policyBundle.outputFiles[0].contents),
]);
const runtimeBundleSha256 = hash(mainBundle.outputFiles[0].contents);
const policyBundleSha256 = hash(policyBundle.outputFiles[0].contents);
const sameRuntimeAsPreviousBundle =
  previousBundleBytes !== undefined &&
  previousBundleBytes
    .subarray(0, mainBundle.outputFiles[0].contents.length)
    .equals(Buffer.from(mainBundle.outputFiles[0].contents));
await writeFile(bundlePath, bundleBytes);
const bundleSha256 = hash(bundleBytes);

const runner = await createChromiumRunner({ game: gamePath });

async function capture(session, period) {
  const [state, diagnostics, native] = await Promise.all([
    session.readState(),
    session.diagnostics(),
    session.evaluate(() => {
      const hooks = window.__EA_TEST_HOOKS__;
      const pageCapture = window[Symbol.for("evolve-automation.page-capture")];
      const global = pageCapture?.rootState.readRoot();
      const species = global?.race?.species;
      const ledger = pageCapture?.mechanics?.readProductionBreakdown?.();
      const sumUnits = (values) =>
        Object.values(values ?? {}).reduce((sum, value) => {
          if (typeof value === "number" && Number.isFinite(value))
            return sum + value;
          if (typeof value === "string" && /v$/.test(value)) {
            const amount = Number.parseFloat(value);
            return Number.isFinite(amount) ? sum + amount : sum;
          }
          return sum;
        }, 0);
      return {
        population: global?.resource?.[species]?.amount ?? null,
        populationCapacity: global?.resource?.[species]?.max ?? null,
        jobs: Object.fromEntries(
          Object.entries(global?.civic ?? {})
            .filter(([, value]) => Number(value?.workers ?? 0) > 0)
            .map(([id, value]) => [id, value.workers]),
        ),
        buildings: Object.fromEntries(
          Object.entries(global?.city ?? {})
            .filter(([, value]) => Number(value?.count ?? 0) > 0)
            .map(([id, value]) => [id, value.count]),
        ),
        resources: Object.fromEntries(
          ["Food", "Lumber", "Stone", "Money", "Knowledge"].map((id) => {
            const resource = global?.resource?.[id];
            return [
              id,
              resource
                ? {
                    amount: resource.amount ?? null,
                    max: resource.max ?? null,
                    diff: resource.diff ?? null,
                  }
                : null,
            ];
          }),
        ),
        foodProduction: ledger ? sumUnits(ledger.production?.Food) : null,
        foodConsumption: ledger
          ? Math.abs(sumUnits(ledger.consumption?.Food))
          : null,
        lumberProduction: sumUnits(ledger?.production?.Lumber),
        stoneProduction: sumUnits(ledger?.production?.Stone),
        days: global?.stats?.days ?? null,
        starved: global?.stats?.starved ?? null,
        deaths: global?.stats?.died ?? null,
        research: global?.tech ?? {},
        targets: hooks?.constructionSavingTargetObservations ?? [],
        bootstrapEvents: hooks?.civilizationBootstrapEvents ?? [],
        handoffEvents: hooks?.civilizationHandoffEvents ?? [],
        p36: {
          policyEvents: hooks?.p36PolicyEvents ?? [],
          eligibility: hooks?.p36Eligibility ?? [],
          firstAuthorization: hooks?.p36FirstAuthorization ?? null,
          downstreamChanges: hooks?.p36DownstreamChanges ?? [],
          shadowSummary: hooks?.p32LiveAuthoritySummary ?? null,
          shadowRecords: hooks?.p32LiveAuthority ?? [],
          metrics: hooks?.p36Metrics ?? null,
          totalPolicyClicks: hooks?.p36Policy?.snapshot?.().totalClicks ?? 0,
          policySnapshot: hooks?.p36Policy?.snapshot?.() ?? null,
        },
      };
    }),
  ]);
  const species = state.race?.species;
  const canonicalState = {
    population: state.resource?.[species]?.amount ?? null,
    populationCapacity: state.resource?.[species]?.max ?? null,
    resources: Object.fromEntries(
      ["Food", "Lumber", "Stone", "Money", "Knowledge"].map((id) => [
        id,
        state.resource?.[id]
          ? {
              amount: state.resource[id].amount ?? null,
              max: state.resource[id].max ?? null,
              diff: state.resource[id].diff ?? null,
            }
          : null,
      ]),
    ),
    buildings: Object.fromEntries(
      Object.entries(state.city ?? {})
        .filter(([, value]) => Number(value?.count ?? 0) > 0)
        .map(([id, value]) => [id, value.count]),
    ),
    jobs: Object.fromEntries(
      Object.entries(state.civic ?? {})
        .filter(([, value]) => Number(value?.workers ?? 0) > 0)
        .map(([id, value]) => [id, value.workers]),
    ),
    tech: state.tech ?? {},
    days: state.stats?.days ?? null,
    starved: state.stats?.starved ?? null,
    deaths: state.stats?.died ?? null,
  };
  const relevantNativeCalls = (diagnostics.nativeInvocations ?? [])
    .filter(
      (entry) =>
        /^civ-/.test(entry.elementId ?? "") ||
        (entry.method === "action" &&
          (/^(undefined-food|city-lumber|undefined-stone)$/.test(
            entry.elementId ?? "",
          ) ||
            /^(tech-|city-)/.test(entry.elementId ?? ""))),
    )
    .map(({ period: callPeriod, elementId, method }) => ({
      period: callPeriod,
      elementId,
      method,
    }));
  return {
    period,
    saveSha256: hash(await session.exportSave()),
    state: canonicalState,
    production: {
      foodOutput: native.foodProduction,
      foodConsumption: native.foodConsumption,
      lumberOutput: native.lumberProduction,
      stoneOutput: native.stoneProduction,
    },
    controlUsage: diagnostics.controlUsage ?? {},
    nativeCalls: relevantNativeCalls,
    randomCalls: diagnostics.randomCalls,
    rngState: diagnostics.rngState,
    native: {
      foodProduction: native.foodProduction,
      foodConsumption: native.foodConsumption,
      lumberProduction: native.lumberProduction,
      stoneProduction: native.stoneProduction,
      p36: {
        policyEventCount: native.p36.policyEvents.length,
        eligibilityCount: native.p36.eligibility.length,
        firstAuthorization: native.p36.firstAuthorization,
        downstreamChangeCount: native.p36.downstreamChanges.length,
        shadowSummary: native.p36.shadowSummary,
        metrics: native.p36.metrics,
        totalPolicyClicks: native.p36.totalPolicyClicks,
        policySnapshot: native.p36.policySnapshot,
      },
    },
  };
}

async function replay(arm, extraCheckpoints = []) {
  const session = await runner.openSession({
    bundle: bundlePath,
    save: parseSave(fixtureText),
    settings,
    seed,
    epoch,
    perf: true,
    forwardPerfSummary: true,
    nativeTrace: true,
  });
  try {
    await session.evaluate(
      (configuration) => {
        const hooks = window.__EA_TEST_HOOKS__;
        hooks.civilizationBootstrapEvents = [];
        hooks.civilizationHandoffEvents = [];
        hooks.p36Eligibility = [];
        hooks.p36PolicyEvents = [];
        hooks.p36DownstreamChanges = [];
        hooks.p36FirstAuthorization = null;
        hooks.gatherIntervention = {
          civilizationBootstrap: {
            authorized: true,
            authorizationId: "p19-human-candidate-1",
          },
          constructionHandoffEnabled: true,
          civilizationBootstrapObserver(event) {
            hooks.civilizationBootstrapEvents.push({
              period: window.__EA_RUNNER__?.periods?.() ?? null,
              ...event,
            });
          },
          civilizationHandoffObserver(event) {
            hooks.civilizationHandoffEvents.push({
              period: window.__EA_RUNNER__?.periods?.() ?? null,
              ...event,
            });
          },
        };
        if (configuration.shadow)
          hooks.constructionAllocationShadowBudgets = {
            perCycle: 5,
            perTargetEpisode: 80,
            totalEpisode: 140,
          };
        if (!configuration.policy) return;

        const snapshotNative = () => {
          const pageCapture =
            window[Symbol.for("evolve-automation.page-capture")];
          const game = pageCapture?.rootState.readRoot();
          const species = game?.race?.species;
          const ledger = pageCapture?.mechanics?.readProductionBreakdown?.();
          const sumUnits = (values) =>
            Object.values(values ?? {}).reduce((sum, value) => {
              if (typeof value === "number" && Number.isFinite(value))
                return sum + value;
              if (typeof value === "string" && /v$/.test(value)) {
                const amount = Number.parseFloat(value);
                return Number.isFinite(amount) ? sum + amount : sum;
              }
              return sum;
            }, 0);
          const jobs = Object.fromEntries(
            Object.entries(game?.civic ?? {})
              .filter(([, value]) => Number(value?.workers ?? 0) > 0)
              .map(([id, value]) => [id, value.workers]),
          );
          const buildings = Object.fromEntries(
            Object.entries(game?.city ?? {})
              .filter(([, value]) => Number(value?.count ?? 0) > 0)
              .map(([id, value]) => [id, value.count]),
          );
          const resources = Object.fromEntries(
            ["Food", "Lumber", "Stone", "Money", "Knowledge"].map((id) => [
              id,
              game?.resource?.[id]
                ? {
                    amount: game.resource[id].amount ?? null,
                    max: game.resource[id].max ?? null,
                    diff: game.resource[id].diff ?? null,
                  }
                : null,
            ]),
          );
          return {
            population: game?.resource?.[species]?.amount ?? null,
            populationCapacity: game?.resource?.[species]?.max ?? null,
            jobs,
            buildings,
            resources,
            foodProduction: ledger ? sumUnits(ledger.production?.Food) : null,
            foodConsumption: ledger
              ? Math.abs(sumUnits(ledger.consumption?.Food))
              : null,
            lumberProduction: sumUnits(ledger?.production?.Lumber),
            stoneProduction: sumUnits(ledger?.production?.Stone),
            starved: game?.stats?.starved ?? null,
            deaths: game?.stats?.died ?? null,
          };
        };
        const snapshotStocks = () => {
          const game =
            window[
              Symbol.for("evolve-automation.page-capture")
            ]?.rootState.readRoot();
          return Object.fromEntries(
            ["Lumber", "Stone"].map((id) => [
              id,
              game?.resource?.[id]?.amount ?? null,
            ]),
          );
        };
        let downstreamKey;
        let lastEligibilityKey;
        const recordPolicyEvent = (event) => {
          const period = window.__EA_RUNNER__?.periods?.() ?? null;
          const record = { period, ...event };
          if (
            event.type === "authorized" &&
            hooks.p36FirstAuthorization === null
          ) {
            const diagnostics = window.__EA_RUNNER__?.diagnostics?.() ?? {};
            hooks.p36FirstAuthorization = {
              period,
              event,
              state: snapshotNative(),
              controlUsage: diagnostics.controlUsage ?? {},
              randomCalls: diagnostics.randomCalls ?? null,
              rngState: diagnostics.rngState ?? null,
              nativeCalls: (diagnostics.nativeInvocations ?? [])
                .filter(
                  (entry) =>
                    /^civ-/.test(entry.elementId ?? "") ||
                    (entry.method === "action" &&
                      (/^(undefined-food|city-lumber|undefined-stone)$/.test(
                        entry.elementId ?? "",
                      ) ||
                        /^(tech-|city-)/.test(entry.elementId ?? ""))),
                )
                .map(({ period: callPeriod, elementId, method }) => ({
                  period: callPeriod,
                  elementId,
                  method,
                })),
            };
          }
          if (event.type === "gather-click")
            record.afterClickStocks = snapshotStocks();
          if (
            event.type === "native-purchase-verified" ||
            event.type === "complete" ||
            event.type === "stopped"
          )
            record.state = snapshotNative();
          hooks.p36PolicyEvents.push(record);
        };
        hooks.p36Policy =
          window.__EA_P36_TEST_POLICY__.createP36BootstrapPolicy({
            onEvent: recordPolicyEvent,
          });
        hooks.gatherIntervention.constructionAllocation = {
          enabled: true,
          onRejected(event) {
            hooks.p36Policy.onRejected(event);
          },
          observe(contract) {
            const period = window.__EA_RUNNER__?.periods?.() ?? null;
            const native =
              window[
                Symbol.for("evolve-automation.page-capture")
              ]?.rootState.readRoot();
            hooks.p36Policy.inspect(contract, native, period);
            if (
              contract.targetId === "city-shed" ||
              contract.targetId === "city-rock_quarry"
            ) {
              const eligibilityKey = JSON.stringify([
                contract.targetId,
                contract.price,
                contract.rootGeneration,
                contract.progressionGeneration,
                contract.controlGeneration,
              ]);
              if (eligibilityKey !== lastEligibilityKey) {
                hooks.p36Eligibility.push({
                  period,
                  targetId: contract.targetId,
                  price: contract.price,
                  stock: contract.stock,
                  rootGeneration: contract.rootGeneration,
                  progressionGeneration: contract.progressionGeneration,
                  controlGeneration: contract.controlGeneration,
                  requestMatchesPublication: contract.requestMatchesPublication,
                  publicationCurrent: contract.publicationCurrent,
                  priceAuthorityValid: contract.priceAuthorityValid,
                  permissions: contract.permissions,
                  queuesEmpty: contract.queuesEmpty,
                  competingClaims: contract.competingClaims,
                });
                lastEligibilityKey = eligibilityKey;
              }
            } else {
              lastEligibilityKey = undefined;
            }
            if (hooks.p36Policy.snapshot().stage === "complete") {
              const game =
                window[
                  Symbol.for("evolve-automation.page-capture")
                ]?.rootState.readRoot();
              const species = game?.race?.species;
              const state = {
                population: game?.resource?.[species]?.amount ?? null,
                jobs: Object.fromEntries(
                  Object.entries(game?.civic ?? {})
                    .filter(([, value]) => Number(value?.workers ?? 0) > 0)
                    .map(([id, value]) => [id, value.workers]),
                ),
                buildings: Object.fromEntries(
                  Object.entries(game?.city ?? {})
                    .filter(([, value]) => Number(value?.count ?? 0) > 0)
                    .map(([id, value]) => [id, value.count]),
                ),
              };
              const key = JSON.stringify([
                state.population,
                state.jobs,
                state.buildings,
              ]);
              if (downstreamKey !== undefined && downstreamKey !== key)
                hooks.p36DownstreamChanges.push({
                  period,
                  state: { ...snapshotNative(), ...state },
                });
              downstreamKey = key;
            }
          },
          isCurrent(contract) {
            return hooks.p36Policy.isCurrent(
              contract,
              window[
                Symbol.for("evolve-automation.page-capture")
              ]?.rootState.readRoot(),
            );
          },
          authorize(contract) {
            return hooks.p36Policy.authorize(
              contract,
              window[
                Symbol.for("evolve-automation.page-capture")
              ]?.rootState.readRoot(),
              window.__EA_RUNNER__?.periods?.() ?? null,
            );
          },
        };
      },
      { shadow: arm === "B", policy: arm === "C" || arm === "C-repeat" },
    );

    const requested = [...new Set([...checkpoints, ...extraCheckpoints])].sort(
      (left, right) => left - right,
    );
    const captured = [];
    let elapsed = 0;
    for (const targetPeriod of requested) {
      await session.advance(targetPeriod - elapsed);
      elapsed = targetPeriod;
      captured.push(await capture(session, targetPeriod));
    }
    const [exportText, diagnostics, hooks] = await Promise.all([
      session.exportSave(),
      session.diagnostics(),
      session.evaluate(() => {
        const value = window.__EA_TEST_HOOKS__;
        return {
          targets: value.constructionSavingTargetObservations ?? [],
          bootstrap: value.civilizationBootstrapEvents ?? [],
          handoff: value.civilizationHandoffEvents ?? [],
          policyEvents: value.p36PolicyEvents ?? [],
          eligibility: value.p36Eligibility ?? [],
          firstAuthorization: value.p36FirstAuthorization ?? null,
          downstreamChanges: value.p36DownstreamChanges ?? [],
          policySnapshot: value.p36Policy?.snapshot?.() ?? null,
          shadowSummary: value.p32LiveAuthoritySummary ?? null,
          shadowRecords: value.p32LiveAuthority ?? [],
          metrics: value.p36Metrics ?? null,
        };
      }),
    ]);
    const final = captured.at(-1);
    const targetTransitions = [];
    for (const observation of hooks.targets) {
      const previous = targetTransitions.at(-1)?.target;
      if (
        targetTransitions.length === 0 ||
        canonical(previous) !== canonical(observation.target)
      )
        targetTransitions.push(observation);
    }
    const performanceSamples = (diagnostics.perfSummaries ?? []).map(
      (values) => ({
        label: values[0],
        summary: values[1] ?? {},
        counts: values[2] ?? {},
      }),
    );
    return {
      arm,
      periods: final.period,
      checkpoints: captured,
      finalExportSha256: hash(exportText),
      finalRng: {
        calls: final.randomCalls,
        state: final.rngState,
      },
      bootstrapEvents: hooks.bootstrap,
      handoffEvents: hooks.handoff,
      targetTransitions,
      p36: {
        policyEvents: hooks.policyEvents,
        eligibility: hooks.eligibility,
        firstAuthorization: hooks.firstAuthorization,
        downstreamChanges: hooks.downstreamChanges,
        policySnapshot: hooks.policySnapshot,
        shadowSummary: hooks.shadowSummary,
        shadowRecordsSha256: hash(JSON.stringify(hooks.shadowRecords)),
        shadowEligibleCount: hooks.shadowRecords.filter(
          (record) => record.shadow?.authorized === true,
        ).length,
        metrics: hooks.metrics,
      },
      controlUsage: diagnostics.controlUsage ?? {},
      nativeCalls: (diagnostics.nativeInvocations ?? [])
        .filter(
          (entry) =>
            /^civ-/.test(entry.elementId ?? "") ||
            (entry.method === "action" &&
              (/^(undefined-food|city-lumber|undefined-stone)$/.test(
                entry.elementId ?? "",
              ) ||
                /^(tech-|city-)/.test(entry.elementId ?? ""))),
        )
        .map(({ period: callPeriod, elementId, method }) => ({
          period: callPeriod,
          elementId,
          method,
        })),
      performanceSamples,
    };
  } finally {
    await session.close();
  }
}

function checkpointParity(left, right) {
  const rightByPeriod = new Map(
    right.checkpoints.map((checkpoint) => [checkpoint.period, checkpoint]),
  );
  return left.checkpoints.map((checkpoint) => {
    const comparison = rightByPeriod.get(checkpoint.period);
    assert.ok(comparison, `missing parity checkpoint p${checkpoint.period}`);
    return {
      period: checkpoint.period,
      saveHashEqual: checkpoint.saveSha256 === comparison.saveSha256,
      stateEqual: canonical(checkpoint.state) === canonical(comparison.state),
      nativeCallsEqual:
        canonical(checkpoint.nativeCalls) === canonical(comparison.nativeCalls),
      controlUsageEqual:
        canonical(checkpoint.controlUsage) ===
        canonical(comparison.controlUsage),
      rngEqual:
        checkpoint.randomCalls === comparison.randomCalls &&
        checkpoint.rngState === comparison.rngState,
    };
  });
}

function perfPhaseTotal(samples, phase) {
  return samples.reduce(
    (sum, sample) => sum + Number(sample.summary?.[phase]?.totalMs ?? 0),
    0,
  );
}

function compareTreatmentCheckpointToBaseline(checkpoint, baselineCheckpoint) {
  const resources = Object.fromEntries(
    ["Food", "Lumber", "Stone", "Money", "Knowledge"].map((id) => {
      const before = baselineCheckpoint.state.resources[id]?.amount ?? null;
      const after = checkpoint.state.resources[id]?.amount ?? null;
      return [
        id,
        before === after ? null : { baseline: before, treatment: after },
      ];
    }),
  );
  const changes = {
    period: checkpoint.period,
    population:
      checkpoint.state.population === baselineCheckpoint.state.population
        ? null
        : {
            baseline: baselineCheckpoint.state.population,
            treatment: checkpoint.state.population,
          },
    populationCapacity:
      checkpoint.state.populationCapacity ===
      baselineCheckpoint.state.populationCapacity
        ? null
        : {
            baseline: baselineCheckpoint.state.populationCapacity,
            treatment: checkpoint.state.populationCapacity,
          },
    stocks: resources,
    buildings:
      canonical(checkpoint.state.buildings) ===
      canonical(baselineCheckpoint.state.buildings)
        ? null
        : {
            baseline: baselineCheckpoint.state.buildings,
            treatment: checkpoint.state.buildings,
          },
    jobs:
      canonical(checkpoint.state.jobs) ===
      canonical(baselineCheckpoint.state.jobs)
        ? null
        : {
            baseline: baselineCheckpoint.state.jobs,
            treatment: checkpoint.state.jobs,
          },
    research:
      canonical(checkpoint.state.tech) ===
      canonical(baselineCheckpoint.state.tech)
        ? null
        : {
            baseline: baselineCheckpoint.state.tech,
            treatment: checkpoint.state.tech,
          },
    starvationDeaths:
      checkpoint.state.starved === baselineCheckpoint.state.starved &&
      checkpoint.state.deaths === baselineCheckpoint.state.deaths
        ? null
        : {
            baseline: {
              starved: baselineCheckpoint.state.starved,
              deaths: baselineCheckpoint.state.deaths,
            },
            treatment: {
              starved: checkpoint.state.starved,
              deaths: checkpoint.state.deaths,
            },
          },
    rng:
      checkpoint.randomCalls === baselineCheckpoint.randomCalls &&
      checkpoint.rngState === baselineCheckpoint.rngState
        ? null
        : {
            baseline: {
              calls: baselineCheckpoint.randomCalls,
              state: baselineCheckpoint.rngState,
            },
            treatment: {
              calls: checkpoint.randomCalls,
              state: checkpoint.rngState,
            },
          },
    nativeControlOrder: (() => {
      const base = baselineCheckpoint.nativeCalls;
      const candidate = checkpoint.nativeCalls;
      let index = 0;
      while (
        index < base.length &&
        index < candidate.length &&
        canonical(base[index]) === canonical(candidate[index])
      )
        index += 1;
      return index === base.length && index === candidate.length
        ? null
        : {
            firstDifferentIndex: index,
            baseline: base.slice(index),
            treatment: candidate.slice(index),
          };
    })(),
  };
  changes.changedAreas = Object.entries(changes)
    .filter(
      ([key, value]) =>
        key !== "period" && key !== "changedAreas" && value !== null,
    )
    .map(([key]) => key);
  return changes;
}

try {
  const priorEvidencePaths = [
    "experiments/p19-civilization-bootstrap-evidence.json",
    "experiments/p20-standard-human-sustained-allocation-evidence.json",
    "experiments/p20-2-construction-handoff-parity-evidence.json",
    "experiments/p35-targeted-allocation-value-evidence.json",
  ];
  const priorEvidenceTexts = await Promise.all(
    priorEvidencePaths.map((relativePath) =>
      readFile(path.join(root, relativePath), "utf8"),
    ),
  );
  const [p19Evidence, p20Evidence, p20Parity, p35Evidence] =
    priorEvidenceTexts.map(JSON.parse);
  assert.equal(
    p35Evidence.targetAssessment.shed.estimatedMaterialClicksAtP19Stock,
    80,
  );
  assert.equal(
    p35Evidence.targetAssessment.shed.firstMoneyAffordablePeriod,
    448,
  );
  assert.equal(
    p35Evidence.targetAssessment.shed.downstream.p20QuarryClicks.clicks,
    48,
  );
  assert.equal(
    p35Evidence.targetAssessment.shed.downstream.quarryPurchased,
    false,
  );
  const p19At10000 = p19Evidence.candidate.checkpoints.find(
    (value) => value.period === 10000,
  );
  assert.ok(p19At10000);
  const p19Native = p19At10000.native;
  const parseProductionUnits = (value) => {
    if (typeof value === "number") return value;
    if (typeof value === "string" && /v$/.test(value))
      return Number.parseFloat(value);
    return 0;
  };
  const p19FarmerFoodOutput = parseProductionUnits(
    p19Native.foodProduction?.Farmer,
  );
  const p19FoodConsumption = Math.abs(
    Object.values(p19Native.foodConsumption ?? {}).reduce(
      (sum, value) => sum + parseProductionUnits(value),
      0,
    ),
  );
  const initialJobCapacity =
    Number(p19Native.buildings?.basic_housing ?? 0) * 1;

  // Run C first to learn the exact first authorized work period. A/B are then
  // checkpointed at that same boundary for the causal pre-action comparison.
  let interim = {
    bundleSha256,
    runtimeBundleSha256,
    policyBundleSha256,
    arms: {},
  };
  if (process.argv.includes("--reuse")) {
    try {
      const retained = JSON.parse(await readFile(interimPath, "utf8"));
      if (
        retained.bundleSha256 === bundleSha256 ||
        retained.runtimeBundleSha256 === runtimeBundleSha256 ||
        (retained.runtimeBundleSha256 === undefined &&
          sameRuntimeAsPreviousBundle)
      )
        interim = {
          ...retained,
          runtimeBundleSha256,
          ...(retained.bundleSha256 === bundleSha256
            ? { policyBundleSha256 }
            : {}),
        };
    } catch {
      // A missing or stale interim simply causes a fresh controlled replay.
    }
  }
  const replayOrReuse = async (arm, extraCheckpoints = []) => {
    const compatibleReuse =
      arm === "A" || arm === "B"
        ? interim.runtimeBundleSha256 === runtimeBundleSha256
        : interim.policyBundleSha256 === policyBundleSha256;
    if (
      process.argv.includes("--reuse") &&
      compatibleReuse &&
      interim.arms[arm] !== undefined
    )
      return interim.arms[arm];
    const result = await replay(arm, extraCheckpoints);
    interim.bundleSha256 = bundleSha256;
    interim.runtimeBundleSha256 = runtimeBundleSha256;
    interim.policyBundleSha256 = policyBundleSha256;
    interim.arms[arm] = result;
    await writeFile(
      interimPath,
      await prettier.format(JSON.stringify(interim), { parser: "json" }),
    );
    return result;
  };
  const treatment = await replayOrReuse("C");
  const firstAuthorization = treatment.p36.firstAuthorization;
  const dynamicCheckpoints = firstAuthorization
    ? [firstAuthorization.period]
    : [];
  const baseline = await replayOrReuse("A", dynamicCheckpoints);
  const shadow = await replayOrReuse("B", dynamicCheckpoints);
  const repeat = await replayOrReuse("C-repeat", dynamicCheckpoints);
  const p19ShadowParity = checkpointParity(baseline, shadow);
  const treatmentRepeatParity = checkpointParity(treatment, repeat);
  const baselineVsTreatment = checkpointParity(baseline, treatment);
  const firstAuthorizationBaseline = firstAuthorization
    ? baseline.checkpoints.find(
        (checkpoint) => checkpoint.period === firstAuthorization.period,
      )
    : undefined;
  const preActionParity = firstAuthorization
    ? {
        period: firstAuthorization.period,
        stateEqual:
          canonical(firstAuthorization.state) ===
          canonical(firstAuthorizationBaseline?.state),
        nativeCallsEqual:
          canonical(firstAuthorization.nativeCalls) ===
          canonical(firstAuthorizationBaseline?.nativeCalls),
        controlUsageEqual:
          canonical(firstAuthorization.controlUsage) ===
          canonical(firstAuthorizationBaseline?.controlUsage),
        rngEqual:
          firstAuthorization.randomCalls ===
            firstAuthorizationBaseline?.randomCalls &&
          firstAuthorization.rngState === firstAuthorizationBaseline?.rngState,
      }
    : {
        period: null,
        allCheckpointsEqual: baselineVsTreatment.every(
          (entry) =>
            entry.saveHashEqual &&
            entry.stateEqual &&
            entry.nativeCallsEqual &&
            entry.controlUsageEqual &&
            entry.rngEqual,
        ),
      };
  const baselineByPeriod = new Map(
    baseline.checkpoints.map((checkpoint) => [checkpoint.period, checkpoint]),
  );
  const treatmentDivergences = treatment.checkpoints
    .map((checkpoint) => {
      const comparison = baselineByPeriod.get(checkpoint.period);
      return comparison
        ? compareTreatmentCheckpointToBaseline(checkpoint, comparison)
        : null;
    })
    .filter((entry) => entry !== null && entry.changedAreas.length > 0);

  const shedPurchase = treatment.p36.policyEvents.find(
    (event) =>
      event.type === "native-purchase-verified" &&
      event.targetId === P36_BOOTSTRAP_TARGETS.shed,
  );
  const quarryEligibility = treatment.p36.eligibility.find(
    (entry) => entry.targetId === P36_BOOTSTRAP_TARGETS.quarry,
  );
  const quarryPurchase = treatment.p36.policyEvents.find(
    (event) =>
      event.type === "native-purchase-verified" &&
      event.targetId === P36_BOOTSTRAP_TARGETS.quarry,
  );
  const firstGather = treatment.p36.policyEvents.find(
    (event) => event.type === "gather-click",
  );
  const successfulGatherClicks = treatment.p36.policyEvents.filter(
    (event) => event.type === "gather-click",
  );
  const shedClicks = successfulGatherClicks.filter(
    (event) => event.targetId === P36_BOOTSTRAP_TARGETS.shed,
  );
  const quarryClicks = successfulGatherClicks.filter(
    (event) => event.targetId === P36_BOOTSTRAP_TARGETS.quarry,
  );
  const populationAndJobs = treatment.p36.downstreamChanges;
  const treatmentFinal = treatment.checkpoints.at(-1);
  const baselineFinal = baseline.checkpoints.at(-1);
  const treatmentStableFood = treatment.checkpoints
    .filter((checkpoint) =>
      [
        1_000, 2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000, 9_000, 10_000,
      ].includes(checkpoint.period),
    )
    .map((checkpoint) => ({
      period: checkpoint.period,
      foodStock: checkpoint.state.resources.Food?.amount ?? null,
      foodOutput: checkpoint.production.foodOutput,
      foodConsumption: checkpoint.production.foodConsumption,
      population: checkpoint.state.population,
      jobs: checkpoint.state.jobs,
      starved: checkpoint.state.starved,
      deaths: checkpoint.state.deaths,
    }));
  const twoFarmersWithQuarryWorker = treatmentStableFood.some(
    (sample) =>
      Number(sample.jobs.farmer ?? 0) >= 2 &&
      Number(sample.jobs.quarry_worker ?? 0) >= 1,
  );
  const sustainableFood =
    treatmentStableFood.length > 0 &&
    treatmentStableFood.every(
      (sample) =>
        Number(sample.starved ?? 0) === 0 &&
        Number(sample.deaths ?? 0) === 0 &&
        Number(sample.foodStock ?? 0) > 0 &&
        Number(sample.foodOutput ?? 0) >= Number(sample.foodConsumption ?? 0),
    );
  const noFarmReplacementForQuarryWorker = treatmentStableFood.every(
    (sample) =>
      Number(sample.jobs.quarry_worker ?? 0) === 0 ||
      Number(sample.jobs.farmer ?? 0) >= 2,
  );
  const netProductiveGain =
    treatmentFinal.state.jobs.quarry_worker > 0 &&
    Number(treatmentFinal.production.stoneOutput ?? 0) >
      Number(baselineFinal.production.stoneOutput ?? 0);
  const downstreamProgression =
    treatmentFinal.state.population >= baselineFinal.state.population &&
    Object.values(treatmentFinal.state.jobs).reduce(
      (sum, value) => sum + Number(value ?? 0),
      0,
    ) >=
      Object.values(baselineFinal.state.jobs).reduce(
        (sum, value) => sum + Number(value ?? 0),
        0,
      );
  const noStarvation =
    treatmentFinal.state.starved === 0 && treatmentFinal.state.deaths === 0;
  const clicksByPeriod = new Map();
  for (const event of successfulGatherClicks) {
    const key = `${event.targetId}:${event.period}`;
    clicksByPeriod.set(key, (clicksByPeriod.get(key) ?? 0) + 1);
  }
  const maxClicksInOneWorkCycle = Math.max(0, ...clicksByPeriod.values());
  const perCycleBudgetRespected =
    maxClicksInOneWorkCycle <= P36_BOOTSTRAP_LIMITS.perCycle;
  const exactBudget =
    shedClicks.length <= P36_BOOTSTRAP_LIMITS.shed &&
    quarryClicks.length <= P36_BOOTSTRAP_LIMITS.quarry &&
    successfulGatherClicks.length <= P36_BOOTSTRAP_LIMITS.total &&
    treatment.p36.policySnapshot?.totalClicks ===
      successfulGatherClicks.length &&
    perCycleBudgetRespected;
  const p19HandoffPreserved =
    treatment.bootstrapEvents.length === 10 &&
    treatment.bootstrapEvents.every((event) => event.period === 8) &&
    treatment.handoffEvents.length === 10;
  const baselineShadowExact = p19ShadowParity.every(
    (entry) =>
      entry.saveHashEqual &&
      entry.stateEqual &&
      entry.nativeCallsEqual &&
      entry.controlUsageEqual &&
      entry.rngEqual,
  );
  const treatmentReplayExact =
    treatmentRepeatParity.every(
      (entry) =>
        entry.saveHashEqual &&
        entry.stateEqual &&
        entry.nativeCallsEqual &&
        entry.controlUsageEqual &&
        entry.rngEqual,
    ) &&
    canonical(treatment.p36.policyEvents) ===
      canonical(repeat.p36.policyEvents) &&
    canonical(treatment.p36.eligibility) ===
      canonical(repeat.p36.eligibility) &&
    canonical(treatment.p36.firstAuthorization) ===
      canonical(repeat.p36.firstAuthorization) &&
    canonical(treatment.p36.downstreamChanges) ===
      canonical(repeat.p36.downstreamChanges) &&
    canonical(treatment.p36.metrics) === canonical(repeat.p36.metrics) &&
    treatment.finalExportSha256 === repeat.finalExportSha256;
  const causalPreActionMatch = firstAuthorization
    ? Object.entries(preActionParity)
        .filter(([key]) => key !== "period")
        .every(([, value]) => value === true)
    : preActionParity.allCheckpointsEqual === true;
  const executionBlocked =
    treatment.p36.policySnapshot?.stoppedReason != null ||
    !shedPurchase ||
    !quarryEligibility ||
    !quarryPurchase;
  const meaningfulSuccess =
    Boolean(shedPurchase) &&
    Boolean(quarryEligibility) &&
    Boolean(quarryPurchase) &&
    netProductiveGain &&
    sustainableFood &&
    noFarmReplacementForQuarryWorker &&
    downstreamProgression &&
    noStarvation &&
    baselineShadowExact &&
    treatmentReplayExact &&
    causalPreActionMatch &&
    exactBudget &&
    p19HandoffPreserved;
  const decision = meaningfulSuccess ? "A" : executionBlocked ? "C" : "B";
  const relevantP35Hashes = {
    p19: hash(priorEvidenceTexts[0]),
    p20: hash(priorEvidenceTexts[1]),
    p20_2: hash(priorEvidenceTexts[2]),
    p35: hash(priorEvidenceTexts[3]),
  };
  const p36BuildingPhase = {
    armTotalsMs: Object.fromEntries(
      [baseline, shadow, treatment, repeat].map((arm) => [
        arm.arm,
        perfPhaseTotal(arm.performanceSamples, "buildingAlwaysClick"),
      ]),
    ),
    incrementalTreatmentVsP19Ms:
      perfPhaseTotal(treatment.performanceSamples, "buildingAlwaysClick") -
      perfPhaseTotal(baseline.performanceSamples, "buildingAlwaysClick"),
    clock: "eaDiagnosticsNow from the Chromium runner native clock",
    p34ModeledEstimateUsed: false,
  };
  const evidence = {
    experiment: "P36 productive-resource bootstrap chain",
    implementationCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    stage: "exact-controlled-replay",
    decision,
    treatmentRun: true,
    pinnedGame,
    gameSha256: hash(gameBytes),
    fixture:
      "test-artifacts/benchmark/slice0/saves/p18-standard-human-fixture.txt",
    fixtureSha256: hash(fixtureText),
    settings: "experiments/p18-standard-human-settings.json",
    settingsSha256: hash(JSON.stringify(settings)),
    seed,
    epoch,
    testBundleSha256: bundleSha256,
    debugExposeSet: false,
    debugGlobalsUsed: false,
    provenance: {
      startingReport: "P35 report 8b106f5d",
      p35Evidence: "2531fb6d",
      p35Regression: "5cb413a3",
      priorEvidenceSha256: relevantP35Hashes,
      P19ClicksKeptSeparate: true,
      p19StartupClicks: treatment.bootstrapEvents.length,
      p19HandoffClicks: treatment.handoffEvents.length,
    },
    feasibility: {
      preTreatmentDecision: "hypothesis-admitted",
      p19InitialResidents:
        p19Evidence.candidate.checkpoints.find(
          (value) => value.period === 10000,
        )?.population ?? null,
      p19InitialFarmers:
        p19Evidence.candidate.checkpoints.find(
          (value) => value.period === 10000,
        )?.native?.jobs?.farmer ?? null,
      p19InitialHousingCapacity: initialJobCapacity,
      p19FoodProduction:
        p19Evidence.candidate.checkpoints.find(
          (value) => value.period === 10000,
        )?.native?.foodProduction?.Farmer ?? null,
      p19FoodConsumption:
        p19Evidence.candidate.checkpoints.find(
          (value) => value.period === 10000,
        )?.native?.foodConsumption?.Human ?? null,
      shed: {
        target: P36_BOOTSTRAP_TARGETS.shed,
        observedAtP35: 272,
        firstMoneyAffordableAtP35: 448,
        priceAtFirstEligibility: { Money: 75, Lumber: 55, Stone: 45 },
        p19MaterialStockAtFirstEligibility: { Lumber: 20, Stone: 0 },
        calculatedMaterialClicks: 80,
        nativeEffect:
          "storage +300 Lumber and +300 Stone; no jobs, housing, or output",
      },
      quarry: {
        target: P36_BOOTSTRAP_TARGETS.quarry,
        p20_2NativeTargetAfterShed: { Lumber: 50, Stone: 10 },
        p20_2Clicks: 48,
        shedRequiredForQuarry: false,
        p19CurrentStorageCapEnoughForQuarry: true,
        calculatedWorstCaseMaterialClicks: 60,
        nativeEffect:
          "purchase adds Stone capacity and enables quarry_worker; does not assign worker or produce Stone itself",
      },
      jobHypothesis: {
        settingsAllowNativeQuarryWorker: settings.job_quarry_worker === true,
        nativeAutoJobsEnabled: settings.autoJobs === true,
        nativePriority: settings.job_p_quarry_worker,
        farmerPriority: settings.job_p_farmer,
        housingHeadroomAtP19: 0,
        path: "native autoJobs may transfer the third resident while retaining at least two Farmers; no extra housing or manual job action is allowed",
        sustainableFoodMustBeProvenInReplay: true,
      },
      exactMaterialClickSum: 140,
      ceiling: 140,
      margin: 0,
      repriceRule:
        "if live complete material shortage exceeds the remaining target/total ceiling, stop; never increase budget",
      priorP20_2ObservedSpend: {
        secondFarm: 13,
        shed: 79,
        quarry: 48,
        total: 140,
        quarryPurchased: false,
      },
    },
    treatmentPolicy: {
      fixedTargets: [P36_BOOTSTRAP_TARGETS.shed, P36_BOOTSTRAP_TARGETS.quarry],
      limits: P36_BOOTSTRAP_LIMITS,
      targetSelectionAuthority:
        "current live pre-Gather Construction order only",
      purchaseAuthority: "native Construction owner only",
      stopOnTargetChange: true,
      stopOnPriceOrGenerationChange: true,
      perClickPostcondition:
        "native Gather invocation must increase current stock before next validation fence",
      foodEmergencyHandlingIndependent: true,
      manualWorkers: false,
      directResourceMutation: false,
      directBuildingPurchase: false,
      targetSubstitution: false,
      genericAllocator: false,
    },
    replayInputs: {
      arms: [
        "A P19 accepted baseline",
        "B P19 plus P33 shadow",
        "C fixed Shed then Quarry",
        "C-repeat identical treatment",
      ],
      requestedCheckpoints: [
        ...new Set([...checkpoints, ...dynamicCheckpoints]),
      ].sort((a, b) => a - b),
      p19Intervention: {
        authorized: true,
        authorizationId: "p19-human-candidate-1",
        constructionHandoffEnabled: true,
      },
      shadowBudgets: { perCycle: 5, perTargetEpisode: 80, totalEpisode: 140 },
    },
    arms: [baseline, shadow, treatment, repeat],
    parity: {
      AtoB: p19ShadowParity,
      CtoCRepeat: treatmentRepeatParity,
      AtoCThroughFirstAuthorization: {
        firstAuthorizationPeriod: firstAuthorization?.period ?? null,
        comparison: preActionParity,
        matchedCheckpointState: firstAuthorizationBaseline?.state ?? null,
      },
      CtoAAfterFirstAction: baselineVsTreatment,
    },
    treatmentDivergencesFromA: treatmentDivergences,
    treatmentResults: {
      firstGather: firstGather ?? null,
      shedPurchased: shedPurchase ?? null,
      quarryFirstEligible: quarryEligibility ?? null,
      quarryPurchased: quarryPurchase ?? null,
      gatherClicks: {
        shed: shedClicks.length,
        quarry: quarryClicks.length,
        total: successfulGatherClicks.length,
        byResource: Object.fromEntries(
          ["Lumber", "Stone"].map((resourceId) => [
            resourceId,
            successfulGatherClicks.filter(
              (event) => event.resourceId === resourceId,
            ).length,
          ]),
        ),
      },
      policyEvents: treatment.p36.policyEvents,
      downstreamPopulationAndJobChanges: populationAndJobs,
      foodTimeSeries: treatmentStableFood,
      twoFarmersPlusQuarryWorkerObserved: twoFarmersWithQuarryWorker,
      foodSustainableAcrossSamples: sustainableFood,
      noFarmerReplacement: noFarmReplacementForQuarryWorker,
      positiveStoneProductionFromNativeJob: netProductiveGain,
      downstreamProgressionPreserved: downstreamProgression,
      noStarvationOrDeaths: noStarvation,
    },
    performance: {
      measurement: "actual diagnostics from perf:true exact Chromium runs",
      nativeControlCalls: Object.fromEntries(
        [baseline, shadow, treatment, repeat].map((arm) => [
          arm.arm,
          arm.nativeCalls.length,
        ]),
      ),
      incrementalRelevantNativeCallsVsA:
        treatment.nativeCalls.length - baseline.nativeCalls.length,
      relevantNativeCallsByClass: Object.fromEntries(
        [baseline, shadow, treatment, repeat].map((arm) => [
          arm.arm,
          {
            gathering: arm.nativeCalls.filter((entry) =>
              /^(undefined-food|city-lumber|undefined-stone)$/.test(
                entry.elementId,
              ),
            ).length,
            research: arm.nativeCalls.filter((entry) =>
              entry.elementId.startsWith("tech-"),
            ).length,
            constructions: arm.nativeCalls.filter(
              (entry) =>
                entry.method === "action" &&
                entry.elementId.startsWith("city-") &&
                entry.elementId !== "city-lumber",
            ).length,
            jobControls: arm.nativeCalls.filter((entry) =>
              entry.elementId.startsWith("civ-"),
            ).length,
          },
        ]),
      ),
      freshNativePriceProbes: treatment.p36.metrics?.freshPriceProbes ?? null,
      validationFences: treatment.p36.metrics?.validationFences ?? null,
      successfulGatherActions: successfulGatherClicks.length,
      gatheredResourceControlInvocations: Object.fromEntries(
        ["city-lumber", "undefined-stone"].map((id) => [
          id,
          treatment.controlUsage[`${id}.action`] ?? null,
        ]),
      ),
      buildingAlwaysClickPhase: p36BuildingPhase,
      p34Modeled583_3MsUsed: false,
      cpuTwoPercentProductionGate:
        "unresolved; this exact replay does not authorize production promotion",
    },
    decisionEvidence: {
      shedsAndQuarryNativePurchased: Boolean(shedPurchase && quarryPurchase),
      quarryNativeWorkerAssigned: Boolean(
        treatmentFinal.state.jobs.quarry_worker,
      ),
      foodSustainable: sustainableFood,
      noStarvation,
      preservedProductiveCapacity: downstreamProgression,
      causalPreActionParity: causalPreActionMatch,
      P19ToShadowExact: baselineShadowExact,
      CRepeatExact: treatmentReplayExact,
      boundedClicks: exactBudget,
      success: meaningfulSuccess,
      executionBlocked,
    },
  };
  assert.ok(baselineShadowExact, "P19 plus non-mutating shadow must match P19");
  assert.ok(treatmentReplayExact, "identical C replays must match exactly");
  assert.ok(
    causalPreActionMatch,
    "C must match P19 through the first authorization, or all checkpoints when no action is authorized",
  );
  assert.equal(treatment.bootstrapEvents.length, 10);
  assert.equal(treatment.handoffEvents.length, 10);
  assert.ok(successfulGatherClicks.length <= 140);
  assert.ok(shedClicks.length <= 80);
  assert.ok(quarryClicks.length <= 60);

  await writeFile(
    evidencePath,
    await prettier.format(JSON.stringify(evidence), { parser: "json" }),
  );
  process.stdout.write(
    `${JSON.stringify({
      evidencePath: path.relative(root, evidencePath).replaceAll("\\", "/"),
      decision,
      firstAuthorizationPeriod: firstAuthorization?.period ?? null,
      shedPurchasePeriod: shedPurchase?.period ?? null,
      quarryFirstEligibilityPeriod: quarryEligibility?.period ?? null,
      quarryPurchasePeriod: quarryPurchase?.period ?? null,
      clicks: evidence.treatmentResults.gatherClicks,
      final: [baseline, shadow, treatment, repeat].map((arm) => ({
        arm: arm.arm,
        period: arm.periods,
        population: arm.checkpoints.at(-1).state.population,
        farmers: arm.checkpoints.at(-1).state.jobs.farmer ?? 0,
        quarryWorkers: arm.checkpoints.at(-1).state.jobs.quarry_worker ?? 0,
        food: arm.checkpoints.at(-1).state.resources.Food?.amount ?? null,
        stoneOutput: arm.checkpoints.at(-1).production.stoneOutput,
        saveHash: arm.finalExportSha256,
      })),
      metrics: evidence.performance,
    })}\n`,
  );
} finally {
  await runner.close();
}
