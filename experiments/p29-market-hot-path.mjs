import assert from "node:assert/strict";
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
const savePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/mad-tech-offered-blocked.json",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/current-full.json",
);
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const outPath = path.join(root, "test-artifacts/benchmark/tmp/p29-stage1.json");
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p29-profile.user.js",
);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const replaceOnce = (source, before, after) => {
  const at = source.indexOf(before);
  assert.notEqual(
    at,
    -1,
    `P29 transform anchor missing: ${before.slice(0, 90)}`,
  );
  assert.equal(
    source.indexOf(before, at + before.length),
    -1,
    `P29 transform anchor ambiguous: ${before.slice(0, 90)}`,
  );
  return source.slice(0, at) + after + source.slice(at + before.length);
};
const [saveText, settings, metadata, game] = await Promise.all([
  readFile(savePath, "utf8"),
  readFile(settingsPath, "utf8").then(JSON.parse),
  readFile(path.join(root, "src/userscript.meta.js"), "utf8"),
  readFile(gamePath),
]);
assert.equal(
  digest(game),
  "05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7",
);
const buildOptions = createBuildOptions({
  root,
  outfile: bundlePath,
  banner: {
    js: `${metadata.trimEnd()}\n\n// P29 diagnostic-only Market phase profile.\nglobalThis.__P29_STATE__ = { roundedMs: 0, nativeMs: 0 };\nglobalThis.__P29_EVENTS__ = [];`,
  },
  plugins: [
    {
      name: "p29-market-phase-timing",
      setup(build) {
        build.onLoad({ filter: /captured-trade-routes\.ts$/ }, async (args) => {
          let source = await readFile(args.path, "utf8");
          source = replaceOnce(
            source,
            '      const captured = readRouteInput(dependencies, board, (reason) =>\n        testSurface?.onTrace?.({ kind: "capture-unavailable", reason }),\n      );',
            `      const captureStarted = __p29Now();
      const captured = readRouteInput(dependencies, board, (reason) =>
        testSurface?.onTrace?.({ kind: "capture-unavailable", reason }),
      );
      const captureElapsed = __p29Now() - captureStarted;
      __p29Emit({ kind: "capture", totalMs: captureElapsed, roundedMs: __p29State.roundedMs, nativeMs: __p29State.nativeMs, inputMs: captureElapsed - __p29State.roundedMs });
      __p29State.roundedMs = 0;
      __p29State.nativeMs = 0;`,
          );
          source = replaceOnce(
            source,
            "      const result = testDemandAccepted\n        ? planTradeRoutes(",
            "      const plannerStarted = __p29Now();\n      const result = testDemandAccepted\n        ? planTradeRoutes(",
          );
          source = replaceOnce(
            source,
            "      let operations = result.operations;",
            `      __p29Emit({ kind: "planner", elapsedMs: __p29Now() - plannerStarted });
      let operations = result.operations;`,
          );
          source = replaceOnce(
            source,
            "      const expected = new Map(captured.session.routeCounts);",
            "      const executeStarted = __p29Now();\n      const expected = new Map(captured.session.routeCounts);",
          );
          source = replaceOnce(
            source,
            '      testSurface?.onTrace?.({ kind: "complete", operations });',
            `      __p29Emit({ kind: "execution", elapsedMs: __p29Now() - executeStarted });
      testSurface?.onTrace?.({ kind: "complete", operations });`,
          );
          source = `const __p29Now = () => globalThis.eaDiagnosticsNow();\nconst __p29State = globalThis.__P29_STATE__;\nconst __p29Emit = (event) => globalThis.__P29_EVENTS__.push(event);\n${source}`;
          return { contents: source, loader: "ts" };
        });
        build.onLoad({ filter: /captured-trade-quote\.ts$/ }, async (args) => {
          let source = await readFile(args.path, "utf8");
          source = replaceOnce(
            source,
            '  const scan = mechanics.readRoundedValues(() => {\n    const result = controls.invoke(\n      control,\n      method,\n      method === "volume" ? [] : [resourceId],\n    );\n    invoked = result.ok;\n  });',
            `  const roundedStarted = __p29Now();
  const scan = mechanics.readRoundedValues(() => {
    const nativeStarted = __p29Now();
    const result = controls.invoke(control, method, method === "volume" ? [] : [resourceId]);
    __p29State.nativeMs += __p29Now() - nativeStarted;
    invoked = result.ok;
  });
  const roundedElapsed = __p29Now() - roundedStarted;
  __p29State.roundedMs += roundedElapsed;`,
          );
          source = `const __p29Now = () => globalThis.eaDiagnosticsNow();\nconst __p29State = globalThis.__P29_STATE__;\n${source}`;
          return { contents: source, loader: "ts" };
        });
        build.onLoad(
          {
            filter:
              /src[\\/]domain[\\/]economy[\\/]market[\\/]trade-routes\.ts$/,
          },
          async (args) => {
            let source = await readFile(args.path, "utf8");
            source = replaceOnce(
              source,
              "  outerLoop: for (\n    let i = 0;\n    i < priorityList.length && remainingRoutes > 0;\n    i++\n  ) {",
              "  let __p29Iterations = 0;\n  let __p29SortCalls = 0;\n  outerLoop: for (\n    let i = 0;\n    i < priorityList.length && remainingRoutes > 0;\n    i++\n  ) {",
            );
            source = replaceOnce(
              source,
              "    const trades = priorityList[i]!.sort(\n      (a, b) => a.autoTradeWeighting - b.autoTradeWeighting,\n    );",
              "    const trades = priorityList[i]!.sort(\n      (a, b) => a.autoTradeWeighting - b.autoTradeWeighting,\n    );\n    __p29SortCalls++;",
            );
            source = replaceOnce(
              source,
              "    assignLoop: while (trades.length > 0 && remainingRoutes > 0) {\n      const resource = trades.sort(resSorter)[0]!;",
              "    assignLoop: while (trades.length > 0 && remainingRoutes > 0) {\n      __p29Iterations++;\n      __p29SortCalls++;\n      const resource = trades.sort(resSorter)[0]!;",
            );
            source = replaceOnce(
              source,
              "  return Object.freeze({\n    operations: Object.freeze(operations.map((op) => Object.freeze(op))),",
              `  globalThis.__P29_PLANNER_METRICS__?.({ iterations: __p29Iterations, sortCalls: __p29SortCalls, candidates: tradableResources.length, routeCapacity: maxTradeRoutes, routesUsed: tradeRoutesUsed, operations: operations.map((op) => ({ ...op })), moneyRate: currentMoneyPerSecond });
  return Object.freeze({
    operations: Object.freeze(operations.map((op) => Object.freeze(op))),`,
            );
            return { contents: source, loader: "ts" };
          },
        );
      },
    },
  ],
});
buildOptions.define["globalThis.__EA_TEST_SURFACE_ENABLED__"] = "true";
buildOptions.define.__EA_TEST_SURFACE_ENABLED__ = "true";
await esbuild.build(buildOptions);
const bundleHash = digest(await readFile(bundlePath));
const runner = await createChromiumRunner();
const session = await runner.openSession({
  bundle: bundlePath,
  save: parseSave(saveText),
  settings,
  seed: 42,
  epoch: Date.parse("2026-09-21T00:00:00.000Z"),
  perf: true,
  nativeTrace: true,
});
try {
  await session.evaluate(() => {
    if (typeof globalThis.eaDiagnosticsNow !== "function")
      throw new Error("P29 runner diagnostics clock unavailable");
    window.__P29_PLANNER_METRICS__ = (metrics) =>
      window.__P29_EVENTS__.push({ kind: "planner-metrics", ...metrics });
  });
  await session.advance(800);
  const [diagnostics, state, save, events] = await Promise.all([
    session.diagnostics(),
    session.readState(),
    session.exportSave(),
    session.evaluate(() => window.__P29_EVENTS__),
  ]);
  const captures = events.filter((event) => event.kind === "capture");
  const elapsed = (kind, key) =>
    events
      .filter((event) => event.kind === kind)
      .reduce((total, event) => total + (event[key] ?? 0), 0);
  const captureTicks = captures.length;
  const roundedTotal = elapsed("capture", "roundedMs");
  const nativeTotal = elapsed("capture", "nativeMs");
  const stages = {
    routeInputPreparationAndValidationMs: Number(
      elapsed("capture", "inputMs").toFixed(3),
    ),
    nativeASellABuyExecutionMs: Number(nativeTotal.toFixed(3)),
    readRoundedValuesSetupObservationValidationRestorationMs: Number(
      (roundedTotal - nativeTotal).toFixed(3),
    ),
    purePlanTradeRoutesMs: Number(elapsed("planner", "elapsedMs").toFixed(3)),
    nativeRouteOperationsAndPostconditionsMs: Number(
      elapsed("execution", "elapsedMs").toFixed(3),
    ),
  };
  const quantile = (values, q) =>
    values.toSorted((left, right) => left - right)[
      Math.max(0, Math.ceil(values.length * q) - 1)
    ] ?? 0;
  const phaseSamplesMs = {
    routeInputPreparationAndValidation: captures.map((event) => event.inputMs),
    nativeASellABuyExecution: captures.map((event) => event.nativeMs),
    readRoundedValuesSetupObservationValidationRestoration: captures.map(
      (event) => event.roundedMs - event.nativeMs,
    ),
    purePlanTradeRoutes: events
      .filter((event) => event.kind === "planner")
      .map((event) => event.elapsedMs),
    nativeRouteOperationsAndPostconditions: events
      .filter((event) => event.kind === "execution")
      .map((event) => event.elapsedMs),
  };
  const phaseDistributionMs = Object.fromEntries(
    Object.entries(phaseSamplesMs).map(([phase, values]) => [
      phase,
      {
        p50: Number(quantile(values, 0.5).toFixed(5)),
        p95: Number(quantile(values, 0.95).toFixed(5)),
        max: Number(Math.max(...values).toFixed(5)),
      },
    ]),
  );
  const usage = Object.entries(diagnostics.controlUsage).filter(([key]) =>
    /market-.+\.a(Sell|Buy)$/.test(key),
  );
  const plannerMetrics = events.filter(
    (event) => event.kind === "planner-metrics",
  );
  const result = {
    fixture: "mad-tech-offered-blocked.json",
    settings: "current-full.json",
    seed: 42,
    epoch: "2026-09-21T00:00:00.000Z",
    periods: 800,
    workTicks: captureTicks,
    captureTicks,
    segmentTotalsMs: stages,
    perRoutePassMs: Object.fromEntries(
      Object.entries(stages).map(([key, value]) => [
        key,
        Number((value / captureTicks).toFixed(5)),
      ]),
    ),
    phaseDistributionMs,
    nativeQuoteCalls: usage,
    quoteCount: usage.reduce(
      (sum, [, item]) => sum + item.returned + item.threw,
      0,
    ),
    planner: {
      calls: plannerMetrics.length,
      allocationIterations: plannerMetrics.reduce(
        (sum, event) => sum + event.iterations,
        0,
      ),
      arraySortCalls: plannerMetrics.reduce(
        (sum, event) => sum + event.sortCalls,
        0,
      ),
      repeatedSelectionSorts: plannerMetrics.reduce(
        (sum, event) => sum + event.iterations,
        0,
      ),
      priorityGroupPreSorts: plannerMetrics.reduce(
        (sum, event) => sum + event.sortCalls - event.iterations,
        0,
      ),
      candidateCount: plannerMetrics.reduce(
        (sum, event) => sum + event.candidates,
        0,
      ),
      maxRouteCapacity: Math.max(
        ...plannerMetrics.map((event) => event.routeCapacity),
        0,
      ),
      routesUsed: plannerMetrics.reduce(
        (sum, event) => sum + event.routesUsed,
        0,
      ),
      operationCount: plannerMetrics.reduce(
        (sum, event) => sum + event.operations.length,
        0,
      ),
      operationTraceSha256: digest(
        JSON.stringify(
          plannerMetrics.map((event, index) => ({
            pass: index + 1,
            operations: event.operations,
            moneyRate: event.moneyRate,
          })),
        ),
      ),
      operationTrace: plannerMetrics.map((event, index) => ({
        pass: index + 1,
        operations: event.operations,
        moneyRate: event.moneyRate,
      })),
      sample: plannerMetrics.at(-1),
    },
    randomCalls: diagnostics.randomCalls,
    nativeControlCalls: Object.values(diagnostics.controlUsage).reduce(
      (sum, item) => sum + item.returned + item.threw,
      0,
    ),
    nativeInvocationSha256: digest(
      JSON.stringify(diagnostics.nativeInvocations),
    ),
    stateSha256: digest(JSON.stringify(state)),
    exportSha256: digest(save),
    bundleSha256: bundleHash,
    chromium: runner.browser.version,
    timingClock: "runner bridge eaDiagnosticsNow/native Performance.now",
    upstreamCommit: "db38e2af831907d49aeb5348d678d8d8745d6c3f",
    pinnedGameSha256: digest(game),
  };
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    JSON.stringify({
      outPath,
      stages,
      workTicks: diagnostics.workTicks,
      planner: result.planner,
    }),
  );
} finally {
  await session.close();
  await runner.close();
}
