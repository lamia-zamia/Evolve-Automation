import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createBuildOptions } from "../build-config.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const location = (value) => resolve(root, value);
const fixtureRoot = location(
  option("fixtures", process.env.EA_FIXTURE_ROOT ?? "test-artifacts"),
);
const toolsRoot = location(
  option("tools", process.env.EA_TOOLS_ROOT ?? "tools"),
);
const execFileAsync = promisify(execFile);
const expectedGameCommit = "db38e2af831907d49aeb5348d678d8d8745d6c3f";
const expectedGameSha256 =
  "05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7";
const expectedRunnerCommit = "fb141c709bc019c99b9933f5974e80c5e43f825a";
const requireFile = async (path, label) => {
  try {
    await access(path);
  } catch {
    throw new Error(
      `Required P10 ${label} not found: ${path}. Set EA_FIXTURE_ROOT / EA_TOOLS_ROOT or pass --fixtures / --tools.`,
    );
  }
};
const runGit = async (...args) => {
  try {
    const { stdout } = await execFileAsync("git", ["-C", toolsRoot, ...args]);
    return stdout.trim();
  } catch (error) {
    throw new Error(
      `Cannot validate the pinned P10 runner in ${toolsRoot}: ${error.message}`,
      { cause: error },
    );
  }
};
const runnerPath = resolve(toolsRoot, "chromium-evolve-runner.mjs");
const gamePath = resolve(fixtureRoot, "game/evolve-deadspace.js");
const gameMetadataPath = `${gamePath}.json`;
await Promise.all([
  requireFile(runnerPath, "Chromium runner"),
  requireFile(gamePath, "game snapshot"),
  requireFile(gameMetadataPath, "game snapshot metadata"),
]);
const gameMetadata = JSON.parse(await readFile(gameMetadataPath, "utf8"));
const gameSha256 = createHash("sha256")
  .update(await readFile(gamePath))
  .digest("hex");
if (
  gameMetadata.sourceRef !== expectedGameCommit ||
  gameSha256 !== expectedGameSha256
) {
  throw new Error(
    `Pinned game snapshot mismatch: expected ${expectedGameCommit} / ${expectedGameSha256}; found ${gameMetadata.sourceRef ?? "unknown"} / ${gameSha256}.`,
  );
}
const runnerCommit = await runGit("rev-parse", "HEAD");
if (runnerCommit !== expectedRunnerCommit) {
  throw new Error(
    `Pinned Chromium runner mismatch: expected ${expectedRunnerCommit}; found ${runnerCommit}.`,
  );
}
const runnerChanges = await runGit(
  "status",
  "--porcelain",
  "--",
  "chromium-evolve-runner.mjs",
);
if (runnerChanges) {
  throw new Error(
    `Pinned Chromium runner is modified in ${toolsRoot}; restore chromium-evolve-runner.mjs before running P10.`,
  );
}
const esbuild = await import("esbuild");
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(runnerPath)
);
const metadata = (
  await readFile(resolve(root, "src/userscript.meta.js"), "utf8")
).trimEnd();
const savePaths = {
  late: resolve(
    fixtureRoot,
    "benchmark/slice0/saves/deadspace-late-2026-10-12.txt",
  ),
  mid: resolve(
    fixtureRoot,
    "benchmark/slice0/saves/stage2f-through-7600-export.json",
  ),
};
const settingsPath = resolve(
  fixtureRoot,
  "benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
);
await Promise.all([
  ...Object.values(savePaths).map((path) => requireFile(path, "save fixture")),
  requireFile(settingsPath, "settings fixture"),
]);
const game = gamePath;
const tracedBundle = resolve(
  root,
  "test-artifacts/perf-profile/p10-sample-lifecycle.user.js",
);
const outputPath = resolve(
  root,
  option("out", "test-artifacts/perf-profile/p10-sample-lifecycle.json"),
);

const runtimePhaseStart =
  "  const runPhase = <T>(name: string, body: () => T): T | undefined => {\n";
const runtimePhaseEnd = `      return undefined;
    }
  };
  // The demand sample both reads the construction cycle's observations and answers its storage`;
const runtimeCycleStart = "    automationCycle += 1;\n";
const invalidator =
  "  const invalidateDemandSample = (actionCostsMayChange = true) => {\n";
const demandBuild =
  "      if (demandThisCycle === undefined || demandSampleEpoch !== demandEpoch) {\n";
const candidateSetup =
  '  const setup = measure("autoBuild.beginCycle", () => reader.beginCycle());\n';
const resourceReader = "  pool?: string,\n): ResourceView {\n";
const phaseHooks = `    const p10 = Reflect.get(globalThis, "__EA_P10_SAMPLE_TRACE__");
    const previous = p10?.context;
    p10?.setContext({ cycle: automationCycle, phase: name });
    try {
`;
const phaseFinally = `      return undefined;
    }
    } finally {
      p10?.setContext(previous);
    }
  };
  // The demand sample both reads the construction cycle's observations and answers its storage`;

const record = (operation, fields = "") => `
  const p10 = Reflect.get(globalThis, "__EA_P10_SAMPLE_TRACE__");
  if (p10 !== null && typeof p10 === "object") {
    const record = Reflect.get(p10, "record");
    if (typeof record === "function") Reflect.apply(record, p10, [{ operation: ${JSON.stringify(operation)}, ${fields} }]);
  }
`;

const plugin = {
  name: "p10-sample-lifecycle-trace",
  setup(build) {
    build.onLoad(
      { filter: /captured-runtime-control\.ts$/ },
      async ({ path }) => {
        let source = await readFile(path, "utf8");
        for (const marker of [
          runtimePhaseStart,
          runtimePhaseEnd,
          runtimeCycleStart,
          invalidator,
          demandBuild,
        ])
          assert.ok(
            source.includes(marker),
            `missing runtime instrumentation anchor ${marker.slice(0, 40)}`,
          );
        source = source.replace(
          runtimePhaseStart,
          runtimePhaseStart + phaseHooks,
        );
        source = source.replace(runtimePhaseEnd, phaseFinally);
        source = source.replace(
          runtimeCycleStart,
          runtimeCycleStart +
            `    const p10 = Reflect.get(globalThis, "__EA_P10_SAMPLE_TRACE__"); p10?.setContext({ cycle: automationCycle, phase: "outside-runPhase" });\n`,
        );
        source = source.replace(
          invalidator,
          invalidator +
            record(
              "demand-invalidation",
              "actionCostsMayChange, caller: new Error().stack",
            ),
        );
        source = source.replace(
          demandBuild,
          demandBuild +
            record(
              "demand-sample-construction",
              "owner, epoch: demandEpoch, caller: new Error().stack",
            ),
        );
        return { contents: source, loader: "ts" };
      },
    );
    build.onLoad(
      { filter: /captured-affordability\.ts$/ },
      async ({ path }) => {
        let source = await readFile(path, "utf8");
        assert.ok(
          source.includes(resourceReader),
          "missing resource-view instrumentation anchor",
        );
        source = source.replace(
          resourceReader,
          resourceReader +
            record("resource-view-read", "resourceId: key, pool"),
        );
        return { contents: source, loader: "ts" };
      },
    );
    build.onLoad({ filter: /application[\\/]build\.ts$/ }, async ({ path }) => {
      let source = await readFile(path, "utf8");
      assert.ok(
        source.includes(candidateSetup),
        "missing candidate-set instrumentation anchor",
      );
      source = source.replace(
        candidateSetup,
        candidateSetup +
          record("build-candidate-set", "candidates: setup.candidates.length"),
      );
      return { contents: source, loader: "ts" };
    });
  },
};

const banner = `window.__EA_P10_SAMPLE_TRACE__ = (() => {
  const state = { armed: false, context: { cycle: 0, phase: "startup" }, counts: Object.create(null), events: [] };
  const countDom = (method) => {
    if (!state.armed) return;
    const phase = state.context.phase;
    const key = phase + "\\u0000dom\\u0000" + method;
    state.counts[key] = (state.counts[key] ?? 0) + 1;
  };
  for (const [prototype, methods] of [[Document.prototype, ["querySelector", "querySelectorAll", "getElementById"]], [Element.prototype, ["querySelector", "querySelectorAll"]]]) {
    for (const method of methods) {
      const original = prototype[method];
      prototype[method] = function(...args) {
        countDom(method);
        return Reflect.apply(original, this, args);
      };
    }
  }
  return {
    get context() { return state.context; },
    setContext(context) { state.context = context; },
    arm() { state.armed = true; state.counts = Object.create(null); state.events.length = 0; },
    record(event) {
      if (!state.armed) return;
      const key = state.context.phase + "\\u0000" + event.operation;
      state.counts[key] = (state.counts[key] ?? 0) + 1;
      if (event.operation === "demand-invalidation" || event.operation === "demand-sample-construction" || event.operation === "build-candidate-set") state.events.push({ ...state.context, ...event });
    },
    read() { return { counts: { ...state.counts }, events: state.events.slice() }; },
  };
})();`;

await mkdir(dirname(tracedBundle), { recursive: true });
await esbuild.build(
  createBuildOptions({
    root,
    outfile: tracedBundle,
    banner: { js: `${metadata}\n\n${banner}` },
    logLevel: "warning",
    plugins: [plugin],
  }),
);
const productionBundle = resolve(root, "evolve_automation.user.js");
const settings = JSON.parse(await readFile(settingsPath, "utf8"));
settings.autoPrestige = false;
const runner = await createChromiumRunner({ game });
const fixtures = [];
try {
  for (const [name, savePath] of Object.entries(savePaths)) {
    const save = parseSave(await readFile(savePath, "utf8"));
    const traced = await runner.openSession({
      bundle: tracedBundle,
      save,
      settings,
      seed: 42,
      nativeTrace: true,
    });
    let trace;
    let tracedExport;
    let tracedDiagnostics;
    try {
      await traced.advance(600);
      await traced.page.evaluate(() =>
        globalThis.__EA_P10_SAMPLE_TRACE__.arm(),
      );
      await traced.advance(1000);
      [trace, tracedExport, tracedDiagnostics] = await Promise.all([
        traced.page.evaluate(() => globalThis.__EA_P10_SAMPLE_TRACE__.read()),
        traced.exportSave(),
        traced.diagnostics(),
      ]);
    } finally {
      await traced.close();
    }
    const ordinary = await runner.openSession({
      bundle: productionBundle,
      save,
      settings,
      seed: 42,
      nativeTrace: true,
    });
    let ordinaryExport;
    let ordinaryDiagnostics;
    try {
      await ordinary.advance(600);
      await ordinary.advance(1000);
      [ordinaryExport, ordinaryDiagnostics] = await Promise.all([
        ordinary.exportSave(),
        ordinary.diagnostics(),
      ]);
    } finally {
      await ordinary.close();
    }
    const hash = createHash("sha256").update(tracedExport).digest("hex");
    assert.equal(
      tracedExport,
      ordinaryExport,
      `${name}: traced export differs`,
    );
    assert.deepEqual(
      tracedDiagnostics.controlUsage,
      ordinaryDiagnostics.controlUsage,
      `${name}: control usage differs`,
    );
    assert.deepEqual(
      tracedDiagnostics.nativeInvocations,
      ordinaryDiagnostics.nativeInvocations,
      `${name}: native invocation sequence differs`,
    );
    fixtures.push({
      name,
      seed: 42,
      autoPrestige: false,
      warmupPeriods: 600,
      measuredPeriods: 1000,
      workticks: 125,
      exportSha256: hash,
      parity: {
        export: true,
        controlUsage: true,
        nativeInvocationSequence: true,
      },
      ...trace,
    });
  }
} finally {
  await runner.close();
}

await writeFile(
  outputPath,
  `${JSON.stringify({ gameSnapshot: runner.inputs.gameSnapshot, fixtures }, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      outputPath,
      fixtures: fixtures.map(({ name, exportSha256, counts }) => ({
        name,
        exportSha256,
        counts,
      })),
    },
    null,
    2,
  ),
);
