import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { createBuildOptions } from "../build-config.mjs";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routePath = "src/adapters/evolve/economy/market/captured-trade-routes.ts";
const baseCommit = "a092cb90";
const implementationCommit = "e04590d4";
const savePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/mad-tech-offered-blocked.json",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/current-full.json",
);
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const outputPath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p30-market-native-batching.json",
);
const scratch = path.join(root, "test-artifacts/benchmark/tmp/p30");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const readSourceAt = (commit) =>
  execFileSync("git", ["show", `${commit}:${routePath}`], {
    cwd: root,
    encoding: "utf8",
  });

const [
  saveText,
  settings,
  metadata,
  game,
  implementationSource,
  baselineSource,
] = await Promise.all([
  readFile(savePath, "utf8"),
  readFile(settingsPath, "utf8").then(JSON.parse),
  readFile(path.join(root, "src/userscript.meta.js"), "utf8"),
  readFile(gamePath),
  Promise.resolve().then(() => readSourceAt(implementationCommit)),
  Promise.resolve().then(() => readSourceAt(baseCommit)),
]);
assert.equal(
  digest(game),
  "05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7",
);

const replaceOnce = (source, before, after) => {
  const at = source.indexOf(before);
  assert.notEqual(
    at,
    -1,
    `P30 transform anchor missing: ${before.slice(0, 80)}`,
  );
  assert.equal(
    source.indexOf(before, at + before.length),
    -1,
    `P30 transform anchor ambiguous: ${before.slice(0, 80)}`,
  );
  return source.slice(0, at) + after + source.slice(at + before.length);
};

function instrument(source) {
  source = replaceOnce(
    source,
    `      const testSurface =
        typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
        __EA_TEST_SURFACE_ENABLED__ === true
          ? dependencies.testSurface
          : undefined;`,
    `      const __p30TestSurface =
        typeof __EA_TEST_SURFACE_ENABLED__ !== "undefined" &&
        __EA_TEST_SURFACE_ENABLED__ === true
          ? dependencies.testSurface
          : undefined;
      const testSurface = __p30TestSurface === undefined ? undefined : {
        ...__p30TestSurface,
        onTrace: (event) => {
          __p30Emit({ kind: "route-trace", event });
          __p30TestSurface.onTrace?.(event);
        },
      };`,
  );
  source = replaceOnce(
    source,
    "      const expected = new Map(captured.session.routeCounts);",
    "      const __p30ExecutionStartedAt = __p30Now();\n      const expected = new Map(captured.session.routeCounts);",
  );
  source = replaceOnce(
    source,
    '      testSurface?.onTrace?.({ kind: "complete", operations });',
    '      __p30Emit({ kind: "execution", elapsedMs: __p30Now() - __p30ExecutionStartedAt });\n      testSurface?.onTrace?.({ kind: "complete", operations });',
  );
  const loopAt = source.indexOf("for (const operation of operations)");
  assert.notEqual(loopAt, -1, "P30 operation loop missing");
  const invokeAt = source.indexOf(
    "const invoked = dependencies.controls.invoke(",
    loopAt,
  );
  assert.notEqual(invokeAt, -1, "P30 native invocation missing");
  const invokeEnd = source.indexOf(");", invokeAt) + 2;
  assert.ok(invokeEnd > invokeAt + 2, "P30 native invocation end missing");
  let call = source
    .slice(invokeAt, invokeEnd)
    .replace(
      "const invoked = dependencies.controls.invoke(",
      "const invoked = __p30Invoke(dependencies.controls,",
    );
  const close = call.lastIndexOf(")");
  const argumentsSource = call.slice(0, close).replace(/,\s*$/, "");
  call = `${argumentsSource}, resource, captured.session.market, operation${call.slice(close)}`;
  source = source.slice(0, invokeAt) + call + source.slice(invokeEnd);
  return `
const __p30Now = () => globalThis.eaDiagnosticsNow();
const __p30Emit = (event) => globalThis.__P30_EVENTS__.push(event);
const __p30Invoke = (controls, handle, method, args, resource, market, operation) => {
  const resourceBefore = resource.trade;
  const marketBefore = market.trade;
  const startedAt = __p30Now();
  const result = controls.invoke(handle, method, args);
  __p30Emit({ kind: "native-batch", method, resourceId: operation.resourceId, operation: { ...operation }, args: [...args], requestedCount: method === "zero" ? Math.abs(resourceBefore) : args[1] ?? 1, resourceBefore, resourceAfter: resource.trade, marketBefore, marketAfter: market.trade, returned: result.ok, elapsedMs: __p30Now() - startedAt });
  return result;
};
${source}`;
}

function plannerInstrument(source) {
  source = replaceOnce(
    source,
    "  outerLoop: for (\n    let i = 0;\n    i < priorityList.length && remainingRoutes > 0;\n    i++\n  ) {",
    "  let __p30Iterations = 0;\n  let __p30SortCalls = 0;\n  outerLoop: for (\n    let i = 0;\n    i < priorityList.length && remainingRoutes > 0;\n    i++\n  ) {",
  );
  source = replaceOnce(
    source,
    "    const trades = priorityList[i]!.sort(\n      (a, b) => a.autoTradeWeighting - b.autoTradeWeighting,\n    );",
    "    const trades = priorityList[i]!.sort(\n      (a, b) => a.autoTradeWeighting - b.autoTradeWeighting,\n    );\n    __p30SortCalls++;",
  );
  source = replaceOnce(
    source,
    "    assignLoop: while (trades.length > 0 && remainingRoutes > 0) {\n      const resource = trades.sort(resSorter)[0]!;",
    "    assignLoop: while (trades.length > 0 && remainingRoutes > 0) {\n      __p30Iterations++;\n      __p30SortCalls++;\n      const resource = trades.sort(resSorter)[0]!;",
  );
  source = replaceOnce(
    source,
    "  return Object.freeze({\n    operations: Object.freeze(operations.map((op) => Object.freeze(op))),",
    "  globalThis.__P30_PLANNER__?.({ iterations: __p30Iterations, sortCalls: __p30SortCalls, candidates: tradableResources.length, routeCapacity: maxTradeRoutes, routesUsed: tradeRoutesUsed, operations: operations.map((op) => ({ ...op })), moneyRate: currentMoneyPerSecond });\n  return Object.freeze({\n    operations: Object.freeze(operations.map((op) => Object.freeze(op))),",
  );
  return source;
}

const variantSources = {
  baseline: baselineSource,
  A: implementationSource,
  B: replaceOnce(
    implementationSource,
    "const MARKET_ROUTE_BATCH_SIZE = 100;",
    "const MARKET_ROUTE_BATCH_SIZE = Number.MAX_SAFE_INTEGER;",
  ),
};
await mkdir(scratch, { recursive: true });

async function buildBundle(name, source, diagnostic) {
  const outfile = path.join(
    scratch,
    `${name}${diagnostic ? "-profile" : ""}.user.js`,
  );
  const buildOptions = createBuildOptions({
    root,
    outfile,
    ...(diagnostic
      ? {
          banner: {
            js: `${metadata.trimEnd()}\n\nglobalThis.__P30_EVENTS__ = [];`,
          },
        }
      : {}),
    plugins: [
      {
        name: `p30-${name}-${diagnostic ? "profile" : "cpu"}`,
        setup(build) {
          build.onLoad({ filter: /captured-trade-routes\.ts$/ }, async () => ({
            contents: diagnostic ? instrument(source) : source,
            loader: "ts",
          }));
          if (diagnostic)
            build.onLoad(
              {
                filter:
                  /src[\\/]domain[\\/]economy[\\/]market[\\/]trade-routes\.ts$/,
              },
              async (args) => ({
                contents: plannerInstrument(await readFile(args.path, "utf8")),
                loader: "ts",
              }),
            );
        },
      },
    ],
  });
  if (diagnostic) {
    buildOptions.define["globalThis.__EA_TEST_SURFACE_ENABLED__"] = "true";
    buildOptions.define.__EA_TEST_SURFACE_ENABLED__ = "true";
  }
  await esbuild.build(buildOptions);
  return { path: outfile, sha256: digest(await readFile(outfile)) };
}

function percentile(values, q) {
  const sorted = values.toSorted((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)] ?? 0;
}

function batchUsage(batches) {
  const counts = { autoBuy: 0, autoSell: 0, zero: 0, threw: 0 };
  for (const batch of batches) {
    counts[batch.method] += 1;
    if (!batch.returned) counts.threw += 1;
  }
  return counts;
}

function expandLogicalTransitions(batches) {
  const transitions = [];
  let allBatchesComplete = true;
  for (const batch of batches) {
    const direction =
      batch.method === "autoBuy"
        ? 1
        : batch.method === "autoSell"
          ? -1
          : batch.resourceBefore > 0
            ? -1
            : 1;
    const count =
      batch.method === "zero"
        ? Math.abs(batch.resourceBefore)
        : batch.requestedCount;
    let resourceCount = batch.resourceBefore;
    let marketCount = batch.marketBefore;
    for (let index = 0; index < count; index += 1) {
      const next = resourceCount + direction;
      marketCount += Math.abs(next) - Math.abs(resourceCount);
      resourceCount = next;
      transitions.push({
        operation: batch.operation,
        resourceId: batch.resourceId,
        resourceCount,
        marketCount,
      });
    }
    if (
      !batch.returned ||
      resourceCount !== batch.resourceAfter ||
      marketCount !== batch.marketAfter
    )
      allBatchesComplete = false;
  }
  return { transitions, allBatchesComplete };
}

const diagnosticBundles = {};
const cpuBundles = {};
for (const name of ["baseline", "A", "B"]) {
  diagnosticBundles[name] = await buildBundle(name, variantSources[name], true);
  cpuBundles[name] = await buildBundle(name, variantSources[name], false);
}

const runner = await createChromiumRunner();
const diagnostic = {};
try {
  for (const name of ["baseline", "A", "B"]) {
    const session = await runner.openSession({
      bundle: diagnosticBundles[name].path,
      save: parseSave(saveText),
      settings,
      seed: 42,
      epoch: Date.parse("2026-09-21T00:00:00.000Z"),
      perf: true,
      callbackProfile: true,
      nativeTrace: true,
    });
    try {
      await session.evaluate(() => {
        if (typeof globalThis.eaDiagnosticsNow !== "function")
          throw new Error("P30 diagnostics clock unavailable");
        window.__P30_PLANNER__ = (metrics) =>
          window.__P30_EVENTS__.push({ kind: "planner", ...metrics });
      });
      await session.advance(800);
      const [diagnosticsResult, state, save, events] = await Promise.all([
        session.diagnostics(),
        session.readState(),
        session.exportSave(),
        session.evaluate(() => window.__P30_EVENTS__),
      ]);
      await session.evaluate(() =>
        document.getElementById("16-label")?.click(),
      );
      const marketUi = await session.evaluate(() =>
        [...document.querySelectorAll("#market .trade .current")].map(
          (node) => ({
            row: node.closest(".market-item")?.id,
            text: node.textContent?.trim(),
            className: node.className,
          }),
        ),
      );
      const planner = events.filter((event) => event.kind === "planner");
      const batches = events.filter((event) => event.kind === "native-batch");
      const routeTraceErrors = events
        .filter(
          (entry) =>
            entry.kind === "route-trace" &&
            ["capture-unavailable", "skipped", "refused"].includes(
              entry.event.kind,
            ),
        )
        .map(({ event }) => ({ kind: event.kind, reason: event.reason }));
      const logical = expandLogicalTransitions(batches);
      diagnostic[name] = {
        bundle: diagnosticBundles[name],
        periods: diagnosticsResult.periods,
        workTicks: diagnosticsResult.workTicks,
        routeControlCalls: batchUsage(batches),
        nativeExecutionMs: Number(
          batches.reduce((sum, batch) => sum + batch.elapsedMs, 0).toFixed(4),
        ),
        routeExecutionMs: Number(
          events
            .filter((event) => event.kind === "execution")
            .reduce((sum, event) => sum + event.elapsedMs, 0)
            .toFixed(4),
        ),
        callbackLatencyMs: {
          p50: Number(
            percentile(
              diagnosticsResult.callbackDurationsMs.map(
                (entry) => entry.durationMs,
              ),
              0.5,
            ).toFixed(5),
          ),
          p95: Number(
            percentile(
              diagnosticsResult.callbackDurationsMs.map(
                (entry) => entry.durationMs,
              ),
              0.95,
            ).toFixed(5),
          ),
          max: Number(
            Math.max(
              ...diagnosticsResult.callbackDurationsMs.map(
                (entry) => entry.durationMs,
              ),
              0,
            ).toFixed(5),
          ),
        },
        plannerOperationOrder: planner.map((entry) => entry.operations),
        plannerOperationSha256: digest(
          JSON.stringify(planner.map((entry) => entry.operations)),
        ),
        logicalTransitions: logical.transitions,
        allBatchesComplete: logical.allBatchesComplete,
        routeTraceErrors,
        randomCalls: diagnosticsResult.randomCalls,
        stateSha256: digest(JSON.stringify(state)),
        exportSha256: digest(save),
        marketUi,
        marketUiRows: marketUi.length,
        runnerEvents: diagnosticsResult.events,
      };
    } finally {
      await session.close();
    }
  }
} finally {
  await runner.close();
}

for (const name of ["A", "B"]) {
  assert.equal(
    diagnostic[name].plannerOperationSha256,
    diagnostic.baseline.plannerOperationSha256,
    `${name} planned operation order differs from baseline`,
  );
  assert.deepEqual(
    diagnostic[name].logicalTransitions,
    diagnostic.baseline.logicalTransitions,
    `${name} logical route transitions differ from baseline`,
  );
  assert.equal(diagnostic[name].allBatchesComplete, true);
  assert.equal(diagnostic[name].randomCalls, diagnostic.baseline.randomCalls);
  assert.equal(diagnostic[name].stateSha256, diagnostic.baseline.stateSha256);
  assert.equal(diagnostic[name].exportSha256, diagnostic.baseline.exportSha256);
  assert.deepEqual(diagnostic[name].marketUi, diagnostic.baseline.marketUi);
}
assert.ok(diagnostic.A.marketUiRows > 0, "ordinary Market UI rows unavailable");
assert.deepEqual(diagnostic.baseline.routeControlCalls, {
  autoBuy: 3208,
  autoSell: 1371,
  zero: 4,
  threw: 0,
});
assert.equal(diagnostic.A.routeControlCalls.threw, 0);
assert.equal(diagnostic.B.routeControlCalls.threw, 0);
assert.deepEqual(
  diagnostic.A.routeTraceErrors,
  diagnostic.baseline.routeTraceErrors,
);
assert.deepEqual(
  diagnostic.B.routeTraceErrors,
  diagnostic.baseline.routeTraceErrors,
);

const cpuOrders = [
  ["baseline", "A", "B", "A-control"],
  ["B", "A", "baseline", "A-control"],
  ["baseline", "A", "B", "A-control"],
];
const cpuRuns = [];
if (process.argv.includes("--diagnostic-only")) {
  const prior = JSON.parse(await readFile(outputPath, "utf8"));
  cpuRuns.push(
    ...prior.cpuRuns.map(({ routeControlCalls: _ignored, ...run }) => run),
  );
} else {
  const cpuRunner = await createChromiumRunner();
  try {
    for (const [round, order] of cpuOrders.entries()) {
      for (const label of order) {
        const name = label === "A-control" ? "A" : label;
        const session = await cpuRunner.openSession({
          bundle: cpuBundles[name].path,
          save: parseSave(saveText),
          settings,
          seed: 42,
          epoch: Date.parse("2026-09-21T00:00:00.000Z"),
        });
        try {
          await session.advance(100);
          const beforePeriods = await session.periods();
          const beforeMetrics = await session.metrics();
          const beforeCpu = await cpuRunner.processCpu();
          await session.advance(800);
          const afterCpu = await cpuRunner.processCpu();
          const afterMetrics = await session.metrics();
          const afterPeriods = await session.periods();
          const beforeById = new Map(beforeCpu.map((row) => [row.id, row]));
          const rendererCpuSec = afterCpu
            .filter((row) => row.type === "renderer")
            .reduce(
              (sum, row) =>
                sum + row.cpuSec - (beforeById.get(row.id)?.cpuSec ?? 0),
              0,
            );
          cpuRuns.push({
            round: round + 1,
            label,
            variant: name,
            sameBundleControl: label === "A-control",
            bundleSha256: cpuBundles[name].sha256,
            periods: afterPeriods - beforePeriods,
            rendererCpuSec: Number(rendererCpuSec.toFixed(4)),
            rendererTaskSec: Number(
              (afterMetrics.TaskDuration - beforeMetrics.TaskDuration).toFixed(
                4,
              ),
            ),
            rendererScriptSec: Number(
              (
                afterMetrics.ScriptDuration - beforeMetrics.ScriptDuration
              ).toFixed(4),
            ),
          });
          console.log(
            `CPU round ${round + 1} ${label}: renderer ${rendererCpuSec.toFixed(2)} s; TaskDuration ${(afterMetrics.TaskDuration - beforeMetrics.TaskDuration).toFixed(2)} s`,
          );
        } finally {
          await session.close();
        }
      }
    }
  } finally {
    await cpuRunner.close();
  }
}

const result = {
  fixture: "mad-tech-offered-blocked.json",
  settings: "current-full.json",
  seed: 42,
  epoch: "2026-09-21T00:00:00.000Z",
  periodsPerMeasurement: 800,
  warmupPeriods: 100,
  chromium: runner.browser.version,
  gameCommit: "db38e2af831907d49aeb5348d678d8d8745d6c3f",
  gameSha256: digest(game),
  perUnitOracleCommit: baseCommit,
  diagnostic,
  cpuOrders,
  cpuRuns,
};
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  JSON.stringify({
    outputPath,
    chromium: result.chromium,
    diagnostic: Object.fromEntries(
      Object.entries(diagnostic).map(([name, entry]) => [
        name,
        {
          routeControlCalls: entry.routeControlCalls,
          nativeExecutionMs: entry.nativeExecutionMs,
          routeExecutionMs: entry.routeExecutionMs,
          callbackLatencyMs: entry.callbackLatencyMs,
          plannerOperationSha256: entry.plannerOperationSha256,
          stateSha256: entry.stateSha256,
          exportSha256: entry.exportSha256,
          marketUiRows: entry.marketUiRows,
        },
      ]),
    ),
    cpuRuns,
  }),
);
