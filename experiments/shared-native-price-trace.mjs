import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? fallback : args[index + 1];
};
const saveName = option("save", "late");
const savePath = option(
  "save-path",
  `${root}test-artifacts/benchmark/slice0/saves/deadspace-late-2026-10-12.txt`,
);
const settingsPath = option(
  "settings",
  `${root}test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json`,
);
const outputPath = option(
  "out",
  `${root}test-artifacts/perf-profile/shared-price-trace-${saveName}.json`,
);
const warmupPeriods = Number(option("warmup", "600"));
const samplePeriods = Number(option("periods", "120"));
const maxCycles = Number(option("cycles", "8"));
const metadata = (
  await readFile(`${root}src/userscript.meta.js`, "utf8")
).trimEnd();
const hook = `
window.__EA_TEST_HOOKS__ = window.__EA_TEST_HOOKS__ || {};
(() => {
  const events = [];
  const identities = new WeakMap();
  let nextIdentity = 1;
  let firstCycle;
  let armed = false;
  const identity = value => {
    if ((typeof value !== "object" && typeof value !== "function") || value === null) return null;
    let id = identities.get(value);
    if (id === undefined) { id = nextIdentity++; identities.set(value, id); }
    return id;
  };
  const row = value => {
    if (!value || typeof value !== "object") return value;
    return { id: value.id, action: value.action, type: value.type, q: value.q, qs: value.qs };
  };
  let previousByAction = new Map();
  window.__EA_TEST_HOOKS__.recordNativePriceRequest = event => {
    if (!armed) return;
    firstCycle ??= event.cycle;
    if (event.cycle >= firstCycle + ${maxCycles}) return;
    const rootId = identity(event.root);
    const queueId = identity(event.queue);
    const queueState = event.queueState.map(row);
    const price = event.price;
    const previous = previousByAction.get(event.actionId);
    const priceMatchesPrevious = previous !== undefined && JSON.stringify(previous.price) === JSON.stringify(price);
    events.push({
      sequence: events.length,
      cycle: event.cycle,
      phase: event.phase,
      actionCostEpoch: event.actionCostEpoch,
      rootId,
      queueId,
      queueState,
      actionId: event.actionId,
      caller: event.caller,
      available: price !== undefined,
      cost: price?.cost,
      pool: price?.pool,
      failure: event.failure,
      previousCycle: previous?.cycle,
      previousPhase: previous?.phase,
      mutationSincePrevious: previous === undefined ? null : {
        epochChanged: previous.actionCostEpoch !== event.actionCostEpoch,
        rootChanged: previous.rootId !== rootId,
        queueChanged: previous.queueId !== queueId,
        queueStateChanged: JSON.stringify(previous.queueState) !== JSON.stringify(queueState),
      },
      priceMatchesPrevious,
    });
    previousByAction.set(event.actionId, {
      cycle: event.cycle,
      phase: event.phase,
      actionCostEpoch: event.actionCostEpoch,
      rootId,
      queueId,
      queueState,
      price,
    });
  };
  window.__EA_PRICE_TRACE__ = {
    arm: () => { armed = true; firstCycle = undefined; events.length = 0; previousByAction = new Map(); },
    read: () => events.slice(),
  };
})();`;
const bundlePath = `${root}test-artifacts/perf-profile/shared-price-trace.user.js`;
await mkdir(dirname(bundlePath), { recursive: true });
await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  outfile: bundlePath,
  bundle: true,
  banner: {
    js: `${metadata}\n\n// Test-only bounded native price attribution.\n${hook}`,
  },
  charset: "utf8",
  format: "iife",
  legalComments: "inline",
  logLevel: "warning",
  platform: "browser",
  target: ["esnext"],
  define: {
    "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
    __EA_TEST_SURFACE_ENABLED__: "true",
  },
  minifySyntax: true,
  treeShaking: true,
});

const save = parseSave(await readFile(savePath, "utf8"));
const settings = JSON.parse(await readFile(settingsPath, "utf8"));
settings.autoPrestige = false;
const runner = await createChromiumRunner();
try {
  const session = await runner.openSession({
    bundle: bundlePath,
    save,
    settings,
    seed: 42,
  });
  try {
    await session.advance(warmupPeriods);
    await session.evaluate(() => window.__EA_PRICE_TRACE__.arm());
    await session.advance(samplePeriods);
    const events = await session.evaluate(() =>
      window.__EA_PRICE_TRACE__.read(),
    );
    const traceExport = await session.exportSave();
    const traceDiagnostics = await session.diagnostics();
    const baseline = await runner.openSession({
      bundle: `${root}evolve_automation.user.js`,
      save,
      settings,
      seed: 42,
    });
    let behavioralParity;
    try {
      await baseline.advance(warmupPeriods + samplePeriods);
      const baselineExport = await baseline.exportSave();
      const baselineDiagnostics = await baseline.diagnostics();
      behavioralParity = {
        exportIdentical: baselineExport === traceExport,
        controlUsageIdentical:
          JSON.stringify(baselineDiagnostics.controlUsage) ===
          JSON.stringify(traceDiagnostics.controlUsage),
        baselineBuildQueueSetData:
          baselineDiagnostics.controlUsage?.buildQueue?.setData,
        traceBuildQueueSetData:
          traceDiagnostics.controlUsage?.buildQueue?.setData,
      };
    } finally {
      await baseline.close();
    }
    const report = {
      saveName,
      periods: samplePeriods,
      maxCycles,
      bundle: session.bundle,
      gameSnapshot: runner.inputs.gameSnapshot,
      behavioralParity,
      events,
    };
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 1)}\n`);
    console.log(
      JSON.stringify({
        outputPath,
        requests: events.length,
        cycles: [...new Set(events.map((event) => event.cycle))],
      }),
    );
  } finally {
    await session.close();
  }
} finally {
  await runner.close();
}
