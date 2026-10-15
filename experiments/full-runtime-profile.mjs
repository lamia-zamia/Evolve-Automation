// Full runtime performance attribution (experiment only; no production source change).
//
// Bundle variants are built from this checkout's src/ with the production esbuild options; the
// instrumented ones get test-only text injections at bundle time, so no measurement hook exists in
// committed source. `plain` must reproduce the production bundle byte for byte (checked).
//
//   node experiments/full-runtime-profile.mjs <mode> [--saves early,mid,late] [--repeats N]
//     [--warmup 400] [--periods 800] [--out-dir test-artifacts/perf-profile]
//
// Modes: bundles | validate | calibrate | baseline | latency | profile | phases | trace | realtime
// Authority (Stage 4F.3): renderer-process CPU (renderer rows summed) with CDP TaskDuration as the
// cross-check. ScriptDuration is recorded for reference only and is not a CPU measure here.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const mode = process.argv[2] ?? "bundles";
const outDir = `${root}${option("out-dir", "test-artifacts/perf-profile")}`;
const bundleDir = `${outDir}/bundles`;
const warmup = Number(option("warmup", "400"));
const periods = Number(option("periods", "800"));
const repeats = Number(option("repeats", "3"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const SLICE0 = `${root}test-artifacts/benchmark/slice0`;
export const SAVES = {
  early: `${SLICE0}/saves/deadspace-early-day14.json`,
  mid: `${SLICE0}/saves/stage2f-through-7600-export.json`,
  late: `${SLICE0}/saves/deadspace-late-2026-10-12.txt`,
};
const SETTINGS = option(
  "settings",
  `${SLICE0}/settings/stage2e-integrated-mad-no-triggers.json`,
);
const saveNames = option("saves", "early,mid,late").split(",");

// ---------------------------------------------------------------- bundle variants
const collectorSource = await readFile(
  `${root}experiments/full-runtime-profile-collector.js`,
  "utf8",
);

/** Exact-anchor replacement; throws when the anchor count is not what the injection expects. */
const replaceExact = (contents, anchor, replacement, expected = 1) => {
  const found = contents.split(anchor).length - 1;
  if (found !== expected)
    throw new Error(
      `anchor found ${found}x (expected ${expected}): ${anchor.slice(0, 80)}`,
    );
  return contents.replaceAll(anchor, replacement);
};
/** Wraps a top-level function declaration in a probe, preserving hoisting and `export`. */
const probeFunction = (contents, name) => {
  const pattern = new RegExp(`^(export )?function ${name}\\(`, "mu");
  if (!pattern.test(contents)) throw new Error(`no function ${name}`);
  return contents.replace(
    pattern,
    (_m, exported = "") =>
      `${exported}function ${name}(...__eaArgs: any[]): any { return globalThis.__eaProfile.call(${JSON.stringify(name)}, ${name}__eaProbed, this, __eaArgs); }\nfunction ${name}__eaProbed(`,
  );
};

const MARKER = {
  "src/adapters/evolve/worker-capture.ts": (c) =>
    replaceExact(
      c,
      "const result = Reflect.apply(listener, this, listenerArgs);\n          notify(listenerArgs[0]);\n          return result;",
      "const __eaP = globalThis.__eaProfile; const __eaT0 = __eaP.now();\n          const result = Reflect.apply(listener, this, listenerArgs);\n          const __eaT1 = __eaP.now();\n          notify(listenerArgs[0]);\n          __eaP.period(listenerArgs[0], __eaT0, __eaT1, __eaP.now());\n          return result;",
    ),
  "src/bootstrap/captured-runtime-control.ts": (c) =>
    replaceExact(
      c,
      "const runCycle = () => {",
      "const runCycle = () => globalThis.__eaProfile.cycle(runCycleBody__ea);\n  const runCycleBody__ea = () => {",
    ),
};
const FUNCTION_PROBES = {
  "src/application/market.ts": [
    "runMarketAutomation",
    "runMarketTradesAutomation",
  ],
  "src/adapters/evolve/economy/market/captured-trade-routes.ts": [
    "readRouteInput",
    "readRegionalRouteInput",
    "applyRegionalTradeRoutes",
    "routeSettingsSnapshot",
  ],
  "src/adapters/evolve/economy/market/captured-trade-quote.ts": [
    "readCapturedTradeQuote",
    "observeTradeRounding",
    "readCapturedRegionalVolume",
  ],
  "src/adapters/evolve/economy/market/captured-market-board.ts": [
    "marketDiscoveryEpoch",
  ],
  "src/domain/economy/market/trade-routes.ts": ["planTradeRoutes"],
};
const extraProbes = JSON.parse(option("probes", "{}"));
const PHASES = {
  ...MARKER,
  "src/adapters/browser/diagnostics.ts": (c) =>
    replaceExact(
      replaceExact(
        c,
        "    const sample = samples.get(phase) ??",
        "    globalThis.__eaProfile.phase(phase, durationMs);\n    const sample = samples.get(phase) ??",
      ),
      "    const counter = counters.get(name) ??",
      "    globalThis.__eaProfile.count(name, amount);\n    const counter = counters.get(name) ??",
    ),
  "src/utils/performance.ts": (c) =>
    replaceExact(
      c,
      "const elapsedMs = diagnostics.nowMs() - startedAtMs;",
      "const elapsedMs = diagnostics.nowMs() - startedAtMs; globalThis.__eaProfile.inclusive(phase, elapsedMs);",
      2,
    ),
  "src/adapters/evolve/economy/market/captured-market-board.ts": (c) =>
    replaceExact(
      probeFunction(c, "marketDiscoveryEpoch"),
      "    isCurrent,\n",
      '    isCurrent: globalThis.__eaProfile.wrap("board.isCurrent", isCurrent),\n',
    ),
  // Per-id tally of single-price probes, so a work tick's distinct ids can be counted.
  "src/adapters/evolve/captured-action-costs.ts": (c) =>
    replaceExact(
      c,
      "    readCost(actionId: string): GameActionPrice | undefined {\n",
      "    readCost(actionId: string): GameActionPrice | undefined {\n      globalThis.__eaProfile.count(`readCost.id:${actionId}`, 1);\n",
    ),
};
for (const [file, names] of Object.entries({
  ...FUNCTION_PROBES,
  ...extraProbes,
})) {
  if (file.endsWith("captured-market-board.ts")) continue;
  const previous = PHASES[file];
  PHASES[file] = (c) => names.reduce(probeFunction, previous ? previous(c) : c);
}

export async function buildVariant(variant) {
  const metadata = (
    await readFile(`${root}src/userscript.meta.js`, "utf8")
  ).trimEnd();
  const outfile = `${bundleDir}/${variant}.user.js`;
  await mkdir(bundleDir, { recursive: true });
  if (variant === "empty") {
    // Mode A: a userscript that runs nothing, so the page is served exactly as for the others.
    await writeFile(
      outfile,
      `${metadata}\n\n// Native-game-only arm: no automation code.\n`,
    );
    return outfile;
  }
  const injections =
    variant === "plain" ? {} : variant === "marker" ? MARKER : PHASES;
  const used = new Set();
  const plugin = {
    name: "full-runtime-profile",
    setup(build) {
      build.onLoad({ filter: /\.ts$/ }, async (args) => {
        const path = args.path.replaceAll("\\", "/");
        const key = Object.keys(injections).find((file) => path.endsWith(file));
        if (key === undefined) return undefined;
        used.add(key);
        return {
          contents: injections[key](await readFile(args.path, "utf8")),
          loader: "ts",
        };
      });
    },
  };
  const collector =
    variant === "plain"
      ? ""
      : `\n${collectorSource}\nglobalThis.__eaProfile.mode = ${JSON.stringify(variant)};`;
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: ["src/main.ts"],
    outfile,
    bundle: true,
    banner: {
      js: `${metadata}\n\n// Generated by npm run build. Edit files under src/ instead.${collector}`,
    },
    charset: "utf8",
    format: "iife",
    legalComments: "inline",
    logLevel: "warning",
    platform: "browser",
    target: ["esnext"],
    define: {
      "globalThis.__EA_TEST_SURFACE_ENABLED__": "false",
      __EA_TEST_SURFACE_ENABLED__: "false",
    },
    minifySyntax: true,
    treeShaking: true,
    plugins: [plugin],
  });
  const missing = Object.keys(injections).filter((file) => !used.has(file));
  if (missing.length > 0)
    throw new Error(`injection targets not bundled: ${missing.join(", ")}`);
  return outfile;
}

async function buildAll() {
  const bundles = {};
  for (const variant of ["empty", "plain", "marker", "phases"]) {
    const path = await buildVariant(variant);
    bundles[variant] = { path, sha256: sha256(await readFile(path)) };
  }
  const production = sha256(await readFile(`${root}evolve_automation.user.js`));
  if (bundles.plain.sha256 !== production)
    throw new Error(
      `plain build ${bundles.plain.sha256} != production ${production}`,
    );
  bundles.production = {
    path: `${root}evolve_automation.user.js`,
    sha256: production,
  };
  return bundles;
}

// ---------------------------------------------------------------- shared measurement
const settingsText = await readFile(SETTINGS, "utf8");
// autoPrestige is pinned off in every arm: the late save is prestige-ready and resets within 160
// periods otherwise, which would replace the stage under measurement with a new game.
const settingsFor = (arm) => {
  const settings = JSON.parse(settingsText);
  settings.autoPrestige = false;
  // `--set autoMarket=true,...`: a documented configuration variant applied to every arm.
  for (const pair of (option("set", "") || "").split(",").filter(Boolean)) {
    const [key, value] = pair.split("=");
    settings[key] =
      value === "true"
        ? true
        : value === "false"
          ? false
          : Number.isNaN(Number(value))
            ? value
            : Number(value);
  }
  if (arm === "inactive") settings.masterScriptToggle = false;
  return JSON.stringify(settings);
};
const bundleFor = (bundles, arm, instrumented) =>
  arm === "native"
    ? bundles.empty.path
    : instrumented === "phases"
      ? bundles.phases.path
      : instrumented === "marker"
        ? bundles.marker.path
        : bundles.production.path;

const rendererCpu = async (runner) =>
  (await runner.processCpu())
    .filter((entry) => entry.type === "renderer")
    .reduce((sum, entry) => sum + entry.cpuSec, 0);

const summarizeState = (state) => ({
  day: state.stats?.days,
  species: state.race?.species,
  resets: state.stats?.reset,
  techCount: Object.keys(state.tech ?? {}).length,
  cityStructures: Object.keys(state.city ?? {}).length,
  spaceStructures: Object.keys(state.space ?? {}).length,
  knowledge: state.resource?.Knowledge?.amount,
  money: state.resource?.Money?.amount,
});

const loadedSaves = {};
async function loadSave(name) {
  if (loadedSaves[name]) return loadedSaves[name];
  const bytes = await readFile(SAVES[name]);
  const save = parseSave(bytes.toString("utf8"));
  loadedSaves[name] = {
    save,
    sha256: sha256(bytes),
    expected: summarizeState(save),
  };
  return loadedSaves[name];
}

/** Rejects a session whose loaded game is not the save (a fresh game, another species, an earlier day). */
function validateLoaded(expected, actual) {
  const problems = [];
  if (actual.species !== expected.species)
    problems.push(`species ${actual.species} != ${expected.species}`);
  if (!(actual.day >= expected.day))
    problems.push(`day ${actual.day} < ${expected.day}`);
  if (actual.techCount < expected.techCount)
    problems.push(`techs ${actual.techCount} < ${expected.techCount}`);
  if (actual.resets !== expected.resets)
    problems.push(`resets ${actual.resets} != ${expected.resets}`);
  return problems;
}

async function window_(runner, session, run) {
  const cpuBefore = await rendererCpu(runner);
  const metricsBefore = await session.metrics();
  const periodsBefore = await session.periods();
  const started = performance.now();
  const inner = await run();
  const wallMs = performance.now() - started;
  const metricsAfter = await session.metrics();
  const cpuAfter = await rendererCpu(runner);
  const periodsAfter = await session.periods();
  return {
    periods: periodsAfter - periodsBefore,
    rendererCpuSec: Number((cpuAfter - cpuBefore).toFixed(3)),
    taskDurationSec: Number(
      (metricsAfter.TaskDuration - metricsBefore.TaskDuration).toFixed(4),
    ),
    scriptDurationSecReferenceOnly: Number(
      (metricsAfter.ScriptDuration - metricsBefore.ScriptDuration).toFixed(4),
    ),
    layoutDurationSec: Number(
      (metricsAfter.LayoutDuration - metricsBefore.LayoutDuration).toFixed(4),
    ),
    recalcStyleDurationSec: Number(
      (
        metricsAfter.RecalcStyleDuration - metricsBefore.RecalcStyleDuration
      ).toFixed(4),
    ),
    layoutCount: metricsAfter.LayoutCount - metricsBefore.LayoutCount,
    recalcStyleCount:
      metricsAfter.RecalcStyleCount - metricsBefore.RecalcStyleCount,
    wallMs: Math.round(wallMs),
    domNodesBefore: metricsBefore.Nodes,
    domNodes: metricsAfter.Nodes,
    jsHeapUsedMBBefore: Number((metricsBefore.JSHeapUsedSize / 1e6).toFixed(1)),
    jsHeapUsedMB: Number((metricsAfter.JSHeapUsedSize / 1e6).toFixed(1)),
    jsHeapTotalMB: Number((metricsAfter.JSHeapTotalSize / 1e6).toFixed(1)),
    inner,
  };
}

async function openMeasured(
  runner,
  bundles,
  {
    saveName,
    arm,
    instrumented = "none",
    perf = false,
    callbackProfile = false,
    nativeStopAt,
  },
) {
  const { save, expected } = await loadSave(saveName);
  const session = await runner.openSession({
    bundle: bundleFor(bundles, arm, instrumented),
    save,
    settings: settingsFor(arm),
    seed: 42,
    perf,
    callbackProfile,
    ...(nativeStopAt === undefined ? {} : { nativeStopAt }),
  });
  return { session, expected };
}

async function endState(session) {
  const exported = await session.exportSave();
  const state = await session.readState();
  const diagnostics = await session.diagnostics();
  const controlCalls = Object.values(diagnostics.controlUsage ?? {}).reduce(
    (sum, entry) => sum + entry.returned + entry.threw,
    0,
  );
  return {
    exportSha256: sha256(exported).slice(0, 16),
    resourceDigest: sha256(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(state.resource ?? {}).map(([k, v]) => [k, v?.amount]),
        ),
      ),
    ).slice(0, 16),
    techDigest: sha256(JSON.stringify(state.tech ?? {})).slice(0, 16),
    summary: summarizeState(state),
    controlCalls,
    controlUsage: diagnostics.controlUsage,
    counts: diagnostics.counts,
    errors: (diagnostics.events ?? [])
      .filter((e) => e.kind !== "log")
      .slice(0, 8),
    loads: diagnostics.loads,
    callbackDurationsMs: diagnostics.callbackDurationsMs,
    longTaskDurationsMs: diagnostics.longTaskDurationsMs,
  };
}

const orderFor = (arms, repeat) =>
  repeat % 2 === 0 ? arms : [...arms].reverse();

async function save_(name, report) {
  await mkdir(outDir, { recursive: true });
  const path = `${outDir}/${name}.json`;
  await writeFile(path, `${JSON.stringify(report, null, 1)}\n`);
  console.log(`wrote ${path}`);
  return path;
}

// ---------------------------------------------------------------- modes
async function runArms({
  instrumented,
  perf = false,
  callbackProfile = false,
  arms = ["native", "inactive", "active"],
  onWindow,
  label,
}) {
  const bundles = await buildAll();
  const runner = await createChromiumRunner();
  const report = {
    mode: label,
    inputs: {
      ...runner.inputs,
      bundles,
      settings: {
        path: SETTINGS,
        sha256: sha256(settingsText),
        overrides: `autoPrestige=false,${option("set", "")}`,
      },
      saves: {},
    },
    browser: runner.browser,
    warmup,
    periods,
    runs: [],
  };
  try {
    for (const saveName of saveNames) {
      const loaded = await loadSave(saveName);
      report.inputs.saves[saveName] = {
        path: SAVES[saveName],
        sha256: loaded.sha256,
        expected: loaded.expected,
      };
      for (let repeat = 0; repeat < repeats; repeat++) {
        for (const arm of orderFor(arms, repeat)) {
          // `active@perf`, `active@marker`, `active@phases`: the same arm with one measurement layer added.
          const [baseArm, variant] = arm.split("@");
          const layer =
            variant === "marker" || variant === "phases"
              ? variant
              : instrumented;
          const { session, expected } = await openMeasured(runner, bundles, {
            saveName,
            arm: baseArm,
            instrumented: layer,
            perf: perf || variant === "perf" || variant === "phases",
            callbackProfile,
          });
          try {
            const loadedState = summarizeState(await session.readState());
            const problems = validateLoaded(expected, loadedState);
            await session.advance(warmup);
            if (layer !== "none" && baseArm !== "native")
              await session.evaluate(() => globalThis.__eaProfile.reset());
            const measured = await window_(runner, session, async () =>
              onWindow
                ? onWindow(session, { saveName, arm, repeat })
                : session.advance(periods),
            );
            const collected =
              layer !== "none" && baseArm !== "native"
                ? await session.evaluate(() => globalThis.__eaProfile.read())
                : null;
            const run = {
              saveName,
              arm,
              repeat,
              bundleSha256: session.bundle.sha256,
              loadedState,
              problems,
              ...measured,
              end: await endState(session),
              collected,
            };
            report.runs.push(run);
            console.log(
              JSON.stringify({
                saveName,
                arm,
                repeat,
                problems,
                periods: run.periods,
                cpu: run.rendererCpuSec,
                task: run.taskDurationSec,
                wallMs: run.wallMs,
                day: run.end.summary.day,
                loads: run.end.loads,
              }),
            );
          } finally {
            await session.close();
          }
        }
      }
    }
  } finally {
    await runner.close();
  }
  return report;
}

async function calibrate() {
  const bundles = await buildAll();
  const runner = await createChromiumRunner();
  const report = {
    mode: "calibrate",
    browser: runner.browser,
    inputs: runner.inputs,
    runs: [],
  };
  try {
    const { session } = await openMeasured(runner, bundles, {
      saveName: "mid",
      arm: "active",
      instrumented: "marker",
    });
    try {
      await session.advance(200);
      // Named page-side workloads: a synchronous burn inside Runtime.evaluate, and the same burn in
      // a MessageChannel task after an await, which is how the bridge dispatches periods.
      await session.evaluate(() => {
        globalThis.__eaCalibrationBurn = (ms) => {
          const now = globalThis.__EA_RUNNER__.nativeNow;
          const end = now() + ms;
          let x = 0;
          while (now() < end)
            for (let i = 0; i < 1000; i++) x = (x * 1664525 + 1013904223) >>> 0;
          return x;
        };
        globalThis.__eaCalibrationTask = (ms) =>
          new Promise((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () =>
              resolve(globalThis.__eaCalibrationBurn(ms));
            channel.port2.postMessage(null);
          });
        // The bridge's own shape: await a MessageChannel task, then run in the promise continuation.
        globalThis.__eaCalibrationContinuation = async (ms) => {
          await new Promise((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => resolve();
            channel.port2.postMessage(null);
          });
          return globalThis.__eaCalibrationBurn(ms);
        };
      });
      const cdp = await session.page.createCDPSession();
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
      const paths = ["sync-evaluate", "message-task", "continuation"];
      for (const path of [...paths, ...paths.map((p) => `${p}-profiled`)]) {
        for (let index = 0; index < 3; index++) {
          const profiled = path.endsWith("profiled");
          if (profiled) await cdp.send("Profiler.start");
          const measured = await window_(runner, session, () =>
            session.evaluate(
              (kind) =>
                kind === "message"
                  ? globalThis.__eaCalibrationTask(250)
                  : kind === "continuation"
                    ? globalThis.__eaCalibrationContinuation(250)
                    : globalThis.__eaCalibrationBurn(250),
              path.split("-")[0],
            ),
          );
          let sampledMs = null;
          if (profiled) {
            const { profile } = await cdp.send("Profiler.stop");
            const ids = new Set(
              profile.nodes
                .filter((n) =>
                  n.callFrame.functionName.includes("__eaCalibrationBurn"),
                )
                .map((n) => n.id),
            );
            const self = new Map();
            for (let s = 0; s < profile.samples.length; s++)
              self.set(
                profile.samples[s],
                (self.get(profile.samples[s]) ?? 0) +
                  (profile.timeDeltas[s] ?? 0),
              );
            const byId = new Map(profile.nodes.map((n) => [n.id, n]));
            report.calibrationTopSelf ??= [];
            report.calibrationTopSelf.push({
              path,
              top: [...self]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4)
                .map(([id, us]) => [
                  byId.get(id).callFrame.functionName || "(anon)",
                  byId.get(id).callFrame.url.slice(-30),
                  Math.round(us / 1000),
                ]),
              totalSampledMs:
                profile.timeDeltas.reduce((a, b) => a + b, 0) / 1000,
            });
            const burnNodes = new Set();
            const children = new Map(
              profile.nodes.map((n) => [n.id, n.children ?? []]),
            );
            const visit = (id) => {
              burnNodes.add(id);
              for (const child of children.get(id)) visit(child);
            };
            for (const id of ids) visit(id);
            let total = 0;
            for (let s = 0; s < profile.samples.length; s++)
              if (burnNodes.has(profile.samples[s]))
                total += profile.timeDeltas[s] ?? 0;
            sampledMs = total / 1000;
          }
          report.runs.push({
            path,
            index,
            sampledBurnMs: sampledMs,
            ...measured,
          });
          console.log(JSON.stringify(report.runs.at(-1)));
        }
      }
      report.clock = await session.evaluate(() =>
        globalThis.__eaProfile.clockCostUs(),
      );
      report.probeOverhead = await session.evaluate(() => {
        const p = globalThis.__eaProfile;
        const noop = (a) => a + 1;
        const wrapped = p.wrap("calibration.noop", noop);
        const now = globalThis.__EA_RUNNER__.nativeNow;
        const n = 200_000;
        let t = now();
        for (let i = 0; i < n; i++) noop(i);
        const plainUs = ((now() - t) * 1000) / n;
        t = now();
        for (let i = 0; i < n; i++) wrapped(i);
        const probedUs = ((now() - t) * 1000) / n;
        return { plainUs, probedUs, overheadUs: probedUs - plainUs };
      });
      console.log(
        JSON.stringify({ clock: report.clock, probe: report.probeOverhead }),
      );
    } finally {
      await session.close();
    }
  } finally {
    await runner.close();
  }
  return report;
}

/** Profiles one bounded window per save and arm with the V8 sampling profiler on the game page. */
async function profile() {
  const interval = Number(option("interval", "250"));
  return runArms({
    label: `profile-${interval}us`,
    instrumented: "none",
    arms: option("arms", "native,inactive,active").split(","),
    async onWindow(session, { saveName, arm, repeat }) {
      const cdp = await session.page.createCDPSession();
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval });
      await cdp.send("Profiler.start");
      await session.advance(periods);
      const { profile: cpuProfile } = await cdp.send("Profiler.stop");
      await cdp.detach();
      await mkdir(`${outDir}/cpuprofiles`, { recursive: true });
      const path = `${outDir}/cpuprofiles/${saveName}-${arm}-r${repeat}.cpuprofile`;
      await writeFile(path, JSON.stringify(cpuProfile));
      return {
        cpuprofile: path,
        samples: cpuProfile.samples.length,
        intervalUs: interval,
      };
    },
  });
}

async function trace() {
  const tracePeriods = Number(option("trace-periods", "200"));
  return runArms({
    label: "trace",
    instrumented: "none",
    arms: option("arms", "native,active").split(","),
    async onWindow(session, { saveName, arm, repeat }) {
      await mkdir(`${outDir}/traces`, { recursive: true });
      const path = `${outDir}/traces/${saveName}-${arm}-r${repeat}.json`;
      await session.page.tracing.start({
        path,
        categories: [
          "devtools.timeline",
          "disabled-by-default-devtools.timeline",
          "v8",
          "blink.user_timing",
        ],
      });
      await session.advance(tracePeriods);
      await session.page.tracing.stop();
      return { trace: path, periods: tracePeriods };
    },
  });
}

/** Real-time pacing: the page's own timers and timer Worker, 250 ms per period. */
async function realtime() {
  const bundles = await buildAll();
  const runner = await createChromiumRunner();
  const realPeriods = Number(option("real-periods", "400"));
  const report = {
    mode: "realtime",
    inputs: { ...runner.inputs, bundles },
    browser: runner.browser,
    runs: [],
  };
  try {
    for (const saveName of saveNames) {
      for (const arm of option("arms", "native,active").split(",")) {
        const { session, expected } = await openMeasured(runner, bundles, {
          saveName,
          arm,
          instrumented: arm === "native" ? "none" : "marker",
          nativeStopAt: warmup,
        });
        try {
          await session.waitForNativePeriods();
          await session.evaluate(() => {
            globalThis.__eaLongTasks = [];
            new PerformanceObserver((list) => {
              for (const e of list.getEntries())
                globalThis.__eaLongTasks.push([
                  Number(e.startTime.toFixed(1)),
                  Number(e.duration.toFixed(1)),
                ]);
            }).observe({ type: "longtask" });
            globalThis.__eaProfile?.reset();
          });
          const loadedState = summarizeState(await session.readState());
          const measured = await window_(runner, session, async () => {
            await session.setNativeStopAtPeriods(warmup + realPeriods);
            return session.waitForNativePeriods();
          });
          const collected = await session.evaluate(() => ({
            profile: globalThis.__eaProfile?.read() ?? null,
            longTasks: globalThis.__eaLongTasks,
          }));
          report.runs.push({
            saveName,
            arm,
            loadedState,
            problems: validateLoaded(expected, loadedState),
            ...measured,
            end: await endState(session),
            collected,
          });
          console.log(
            JSON.stringify({
              saveName,
              arm,
              periods: measured.periods,
              cpu: measured.rendererCpuSec,
              wallMs: measured.wallMs,
              longTasks: collected.longTasks.length,
            }),
          );
        } finally {
          await session.close();
        }
      }
    }
  } finally {
    await runner.close();
  }
  return report;
}

async function validate() {
  const bundles = await buildAll();
  const runner = await createChromiumRunner();
  const out = {
    mode: "validate",
    inputs: { ...runner.inputs, bundles },
    saves: {},
  };
  try {
    for (const saveName of saveNames) {
      const { session, expected } = await openMeasured(runner, bundles, {
        saveName,
        arm: "active",
        instrumented: "marker",
      });
      try {
        const loaded = summarizeState(await session.readState());
        const started = performance.now();
        await session.advance(160);
        const after = await endState(session);
        out.saves[saveName] = {
          expected,
          loaded,
          problems: validateLoaded(expected, loaded),
          after: after.summary,
          msFor160: Math.round(performance.now() - started),
          loads: after.loads,
          errors: after.errors,
        };
        console.log(JSON.stringify({ saveName, ...out.saves[saveName] }));
      } finally {
        await session.close();
      }
    }
  } finally {
    await runner.close();
  }
  return out;
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const modes = {
  bundles: async () => ({ mode: "bundles", bundles: await buildAll() }),
  validate,
  calibrate,
  baseline: () => runArms({ label: "baseline", instrumented: "none" }),
  latency: () =>
    runArms({
      label: "latency",
      instrumented: "marker",
      callbackProfile: true,
    }),
  profile,
  phases: () =>
    runArms({
      label: "phases",
      instrumented: "phases",
      perf: true,
      arms: ["active"],
    }),
  // Measurement-layer overhead on the active arm: production, production with [EA perf], marker, phases.
  overhead: () =>
    runArms({
      label: "overhead",
      instrumented: "none",
      arms: ["active", "active@perf", "active@marker", "active@phases"],
    }),
  trace,
  realtime,
};
if (!modes[mode]) throw new Error(`unknown mode ${mode}`);
const result = await modes[mode]();
await save_(`${option("label", mode)}-${stamp}`, result);
