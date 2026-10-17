import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const toolsRoot = resolve(process.env.EA_TOOLS_ROOT ?? `${root}tools`);
const esbuild = await import(
  pathToFileURL(resolve(toolsRoot, "../node_modules/esbuild/lib/main.js"))
);
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(resolve(toolsRoot, "chromium-evolve-runner.mjs"))
);
const scenario = option("scenario", "late");
const scenarios = {
  late: {
    savePath:
      "D:/work/Evolve-Automation/test-artifacts/benchmark/slice0/saves/deadspace-late-2026-10-12.txt",
    defaultWarmup: 600,
  },
  mid: {
    savePath:
      "D:/work/Evolve-Automation/test-artifacts/benchmark/slice0/saves/stage2f-through-7600-export.json",
    defaultWarmup: 100,
  },
};
if (!(scenario in scenarios)) throw new Error(`Unknown scenario: ${scenario}`);
const savePath = scenarios[scenario].savePath;
const settingsPath =
  "D:/work/Evolve-Automation/test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json";
const game =
  "D:/work/Evolve-Automation/test-artifacts/game/evolve-deadspace.js";
const warmup = Number(
  option("warmup", String(scenarios[scenario].defaultWarmup)),
);
const periods = Number(option("periods", "64"));
const outPath = resolve(
  option(
    "out",
    `${root}test-artifacts/perf-profile/p1-native-price-trace.json`,
  ),
);
const actionCostsPath = "src/adapters/evolve/captured-action-costs.ts";
const runtimePath = "src/bootstrap/captured-runtime-control.ts";
const metadata = (
  await readFile(`${root}src/userscript.meta.js`, "utf8")
).trimEnd();
const instrumentation = `
window.__EA_P1_PRICE_TRACE__ = {
  armed: false,
  context: { cycle: 0, phase: "outside-runPhase", actionCostEpoch: null },
  events: [],
  arm() { this.armed = true; this.events.length = 0; },
  setContext(context) { this.context = context; },
  now() { return window.__EA_RUNNER__.nativeNow(); },
  record(event) { if (this.armed) this.events.push({ ...this.context, ...event }); },
  read() { return this.events.slice(); },
};`;
const instrumentedBundle = `${root}test-artifacts/perf-profile/p1-native-price-trace.user.js`;
const runPhaseMarker =
  "  const runPhase = <T>(name: string, body: () => T): T | undefined => {\n";
const runPhaseReplacement = `${runPhaseMarker}    const p1Trace = Reflect.get(globalThis, "__EA_P1_PRICE_TRACE__");
    if (p1Trace && typeof p1Trace.setContext === "function") {
      let epoch: unknown;
      try { epoch = actionCostEpoch; } catch { epoch = null; }
      Reflect.apply(p1Trace.setContext, p1Trace, [{ cycle: automationCycle, phase: name, actionCostEpoch: epoch }]);
    }
`;

await mkdir(dirname(instrumentedBundle), { recursive: true });
await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  outfile: instrumentedBundle,
  bundle: true,
  banner: {
    js: `${metadata}\n\n// Bounded test-only native price trace.\n${instrumentation}`,
  },
  charset: "utf8",
  format: "iife",
  legalComments: "inline",
  logLevel: "warning",
  platform: "browser",
  target: ["esnext"],
  minifySyntax: true,
  treeShaking: true,
  plugins: [
    {
      name: "p1-native-price-trace",
      setup(build) {
        build.onLoad(
          { filter: /captured-action-costs\.ts$/ },
          async ({ path }) => {
            let source = await readFile(path, "utf8");
            const oldSignature = `  actionId: string,\n  reportUnavailable: (actionId: string, reason: string) => void,\n): GameActionPrice | undefined {`;
            const newSignature = `  actionId: string,\n  probeKind: "readCost" | "readCosts",\n  reportUnavailable: (actionId: string, reason: string) => void,\n): GameActionPrice | undefined {`;
            if (!source.includes(oldSignature))
              throw new Error("probePrice signature anchor missing");
            source = source.replace(oldSignature, newSignature);
            const oldProbeBody =
              /  const result = controls\.invoke\(handle, "setData", \[index, COST_PREFIX\]\);\n  if \(!result\.ok\) \{[\s\S]*?\n  return price;/u;
            const newProbeBody = `  const trace = Reflect.get(globalThis, "__EA_P1_PRICE_TRACE__");
  const armed = trace !== null && typeof trace === "object" && Reflect.get(trace, "armed") === true;
  const now = armed ? Reflect.get(trace, "now") : undefined;
  const startedAt = typeof now === "function" ? Reflect.apply(now, trace, []) as number : undefined;
  let outcome: "success" | "unavailable" | "failed" = "failed";
  let price: GameActionPrice | undefined;
  try {
    const result = controls.invoke(handle, "setData", [index, COST_PREFIX]);
    if (!result.ok) {
      outcome = "unavailable";
      reportUnavailable(actionId, result.reason + ": " + (result.detail ?? ""));
      return undefined;
    }
    price = parsePrice(result.value);
    if (price === undefined) {
      outcome = "unavailable";
      reportUnavailable(actionId, "cost result was not a record");
    } else outcome = "success";
    return price;
  } catch (error) {
    outcome = "failed";
    throw error;
  } finally {
    if (armed) {
      const record = Reflect.get(trace, "record");
      const durationMs = typeof now === "function" && startedAt !== undefined
        ? Reflect.apply(now, trace, []) as number - startedAt
        : undefined;
      if (typeof record === "function")
        Reflect.apply(record, trace, [{ actionId, probeKind, outcome, durationMs, cost: price?.cost, pool: price?.pool, caller: new Error().stack }]);
    }
  }`;
            if (!oldProbeBody.test(source))
              throw new Error("native setData anchor missing");
            source = source.replace(oldProbeBody, newProbeBody);
            const callMarker = `          actionId,\n          reportUnavailable,`;
            const callBatchMarker = `              actionId,\n              reportUnavailable,`;
            if (
              !source.includes(callMarker) ||
              !source.includes(callBatchMarker)
            )
              throw new Error("readCost/readCosts call anchors missing");
            source = source.replace(
              callMarker,
              `          actionId,\n          "readCost",\n          reportUnavailable,`,
            );
            source = source.replace(
              callBatchMarker,
              `              actionId,\n              "readCosts",\n              reportUnavailable,`,
            );
            return { contents: source, loader: "ts" };
          },
        );
        build.onLoad(
          { filter: /captured-runtime-control\.ts$/ },
          async ({ path }) => {
            const source = await readFile(path, "utf8");
            if (!source.includes(runPhaseMarker))
              throw new Error("runPhase anchor missing");
            return {
              contents: source.replace(runPhaseMarker, runPhaseReplacement),
              loader: "ts",
            };
          },
        );
      },
    },
  ],
});

const save = parseSave(await readFile(savePath, "utf8"));
const settings = JSON.parse(await readFile(settingsPath, "utf8"));
settings.autoPrestige = false;
const runner = await createChromiumRunner({ game });
try {
  const traced = await runner.openSession({
    bundle: instrumentedBundle,
    save,
    settings,
    seed: 42,
  });
  let traceEvents;
  let tracedExport;
  let tracedDiagnostics;
  try {
    await traced.advance(warmup);
    await traced.evaluate(() => window.__EA_P1_PRICE_TRACE__.arm());
    await traced.advance(periods);
    traceEvents = await traced.evaluate(() =>
      window.__EA_P1_PRICE_TRACE__.read(),
    );
    tracedExport = await traced.exportSave();
    tracedDiagnostics = await traced.diagnostics();
  } finally {
    await traced.close();
  }
  const baseline = await runner.openSession({
    bundle: resolve(root, "evolve_automation.user.js"),
    save,
    settings,
    seed: 42,
  });
  let baselineExport;
  let baselineDiagnostics;
  try {
    await baseline.advance(warmup);
    await baseline.advance(periods);
    baselineExport = await baseline.exportSave();
    baselineDiagnostics = await baseline.diagnostics();
  } finally {
    await baseline.close();
  }
  const workTicks = new Set(traceEvents.map((event) => event.cycle)).size;
  const byPhase = new Map();
  for (const event of traceEvents) {
    const key = `${event.phase}\u0000${event.probeKind}`;
    const current = byPhase.get(key) ?? {
      phase: event.phase,
      probeKind: event.probeKind,
      probes: 0,
      actions: new Set(),
      outcomes: {},
      durationMs: 0,
    };
    current.probes += 1;
    current.actions.add(event.actionId);
    current.outcomes[event.outcome] =
      (current.outcomes[event.outcome] ?? 0) + 1;
    current.durationMs += event.durationMs ?? 0;
    byPhase.set(key, current);
  }
  const seenByEpochAndAction = new Map();
  for (const event of traceEvents) {
    const key = `${event.actionCostEpoch}\u0000${event.actionId}`;
    seenByEpochAndAction.set(key, (seenByEpochAndAction.get(key) ?? 0) + 1);
  }
  const repeatedInSameEpoch = [...seenByEpochAndAction.values()].reduce(
    (total, count) => total + Math.max(0, count - 1),
    0,
  );
  const summary = {
    nativeProbes: traceEvents.length,
    workTicks,
    probesPerWorkTick: workTicks === 0 ? 0 : traceEvents.length / workTicks,
    uniqueActionIds: new Set(traceEvents.map((event) => event.actionId)).size,
    repeatedProbeCalls:
      traceEvents.length -
      new Set(
        traceEvents.map((event) => `${event.cycle}\u0000${event.actionId}`),
      ).size,
    repeatedWithinSameActionCostEpoch: repeatedInSameEpoch,
    outcomes: traceEvents.reduce((counts, event) => {
      counts[event.outcome] = (counts[event.outcome] ?? 0) + 1;
      return counts;
    }, {}),
    byPhase: [...byPhase.values()].map((row) => ({
      ...row,
      uniqueActionIds: row.actions.size,
      actions: [...row.actions].sort(),
      meanMeasuredNativeMs: row.probes === 0 ? 0 : row.durationMs / row.probes,
    })),
  };
  const report = {
    inputs: {
      scenario,
      gameSnapshot: runner.inputs.gameSnapshot,
      bundle: resolve(root, "evolve_automation.user.js"),
      savePath,
      settingsPath,
      autoPrestigeOverride: false,
      seed: 42,
      warmup,
      periods,
    },
    behavioralParity: {
      exportIdentical: tracedExport === baselineExport,
      controlUsageIdentical:
        JSON.stringify(tracedDiagnostics.controlUsage) ===
        JSON.stringify(baselineDiagnostics.controlUsage),
      setDataReturned: tracedDiagnostics.controlUsage?.["buildQueue.setData"],
      stateHash: createHash("sha256").update(tracedExport).digest("hex"),
    },
    summary,
    events: traceEvents,
  };
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 1)}\n`);
  console.log(
    JSON.stringify(
      { outPath, summary, behavioralParity: report.behavioralParity },
      null,
      1,
    ),
  );
} finally {
  await runner.close();
}
