import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const toolsRoot = fileURLToPath(new URL("..", import.meta.url));
const option = (name, fallback) => {
  const index = process.argv.findIndex((value) => value === `--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const root = resolve(option("root", toolsRoot));
const fromRoot = (value) => resolve(root, value);
const output = option("out", "test-artifacts/perf-profile/p4-on-cap.json");
const bundle = fromRoot(option("bundle", "evolve_automation.user.js"));
const savePath = option(
  "save",
  "test-artifacts/benchmark/slice0/saves/deadspace-late-2026-10-12.txt",
);
const settingsPath = option(
  "settings",
  "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
);
const game = fromRoot(
  option("game", "test-artifacts/game/evolve-deadspace.js"),
);
const periods = Number(option("periods", "1000"));
const warmup = Number(option("warmup", "600"));
const expectedWorkTicks = Number(option("expected-workticks", "125"));
const settings = JSON.parse(await readFile(fromRoot(settingsPath), "utf8"));
settings.autoPrestige = false;

const esbuild = await import("esbuild");
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(resolve(toolsRoot, "tools/chromium-evolve-runner.mjs"))
);
const metadata = (
  await readFile(fromRoot("src/userscript.meta.js"), "utf8")
).trimEnd();
const injectedProbe = `
globalThis.__EA_P4_NATIVE_PROBE__ = (() => {
  const reads = [];
  const calls = [];
  const failures = [];
  const tickDurations = [];
  const durations = Object.create(null);
  let nextId = 0;
  const period = () => globalThis.__EA_RUNNER__?.periods?.() ?? -1;
  const now = () => globalThis.eaDiagnosticsNow?.() ?? 0;
  return {
    reads, calls, failures, tickDurations, durations,
    measure(name, elapsedMs) {
      const row = durations[name] ?? { calls: 0, elapsedMs: 0 };
      row.calls += 1;
      row.elapsedMs += elapsedMs;
      durations[name] = row;
    },
    controlledMode: false,
    controlled: undefined,
    begin(stack, switchable) {
      const id = ++nextId;
      reads.push({ id, period: period(), stack, switchable, states: 0, startedAt: now() });
      return id;
    },
    call(id, elementId, elapsedMs, ok, value) {
      calls.push({ id, period: period(), elementId, elapsedMs, ok, value });
    },
    fail(id, elementId, reason) {
      failures.push({ id, period: period(), elementId, reason });
    },
    tick(durationMs) {
      tickDurations.push(durationMs);
    },
    finish(id, states) {
      const read = reads.find((item) => item.id === id);
      if (read) {
        read.states = states;
        this.measure("building-switch-state-reader", now() - read.startedAt);
      }
    },
    reset() {
      reads.length = 0;
      calls.length = 0;
      failures.length = 0;
      tickDurations.length = 0;
      for (const key of Object.keys(durations)) delete durations[key];
    },
  };
})();
`;

function instrument(source) {
  const replacements = [
    [
      "      const states = new Map<string, Readonly<BuildingSwitchState>>();",
      `      const p4Probe = globalThis["__EA_P4_NATIVE_PROBE__"];
      const p4Read = typeof p4Probe === "object" && p4Probe !== null && "begin" in p4Probe
        ? p4Probe.begin(
            p4Probe.controlledMode ? "" : (new Error().stack ?? ""),
            catalog.switches.size,
          )
        : undefined;
      const states = new Map<string, Readonly<BuildingSwitchState>>();`,
    ],
    [
      "      if (catalog.switches.size === 0) return states;",
      `      if (catalog.switches.size === 0) {
        if (p4Read !== undefined) p4Probe.finish(p4Read, states.size);
        return states;
      }`,
    ],
    [
      "        return states;\n      }\n      for (const [elementId, address]",
      "        if (p4Read !== undefined) p4Probe.finish(p4Read, states.size);\n        return states;\n      }\n      for (const [elementId, address]",
    ],
    [
      "        const handle = controls.resolve(elementId);",
      `        const p4ResolveStarted = globalThis["eaDiagnosticsNow"]?.() ?? 0;
        const handle = controls.resolve(elementId);
        if (p4Read !== undefined) p4Probe.measure("control-registry-resolve", (globalThis["eaDiagnosticsNow"]?.() ?? p4ResolveStarted) - p4ResolveStarted);`,
    ],
    [
      '        if (handle === undefined) {\n          tally.count("building-switch.on-cap-unavailable");',
      '        if (handle === undefined) {\n          if (p4Read !== undefined) p4Probe.fail(p4Read, elementId, "control-unavailable");\n          tally.count("building-switch.on-cap-unavailable");',
    ],
    [
      "        const result = controls.invoke(handle, ON_CAP_METHOD);",
      `        const p4Started = globalThis["eaDiagnosticsNow"]?.() ?? 0;
        const result = controls.invoke(handle, ON_CAP_METHOD);
        const p4Elapsed = (globalThis["eaDiagnosticsNow"]?.() ?? p4Started) - p4Started;
        if (p4Read !== undefined) p4Probe.measure("control-registry-invoke", p4Elapsed);
        if (p4Read !== undefined) p4Probe.call(p4Read, elementId, p4Elapsed, result.ok, result.value);`,
    ],
    [
      '        if (cap === undefined) {\n          tally.count("building-switch.on-cap-unavailable");',
      '        if (cap === undefined) {\n          if (p4Read !== undefined) p4Probe.fail(p4Read, elementId, result.ok ? "malformed-cap" : result.reason);\n          tally.count("building-switch.on-cap-unavailable");',
    ],
    [
      "      return states;\n    },\n  });",
      "      if (p4Read !== undefined) p4Probe.finish(p4Read, states.size);\n      return states;\n    },\n  });",
    ],
  ];
  for (const [before, after] of replacements) {
    if (!source.includes(before))
      throw new Error(`P4 source anchor missing: ${before.slice(0, 70)}`);
    source = source.replace(before, after);
  }
  return source;
}

function instrumentProgression(source) {
  const offerAnchor = "    const catalog = buildingUnlocks.read(regions);";
  const offerReplacement = `    const p4OfferStarted = globalThis["eaDiagnosticsNow"]?.() ?? 0;
    const catalog = buildingUnlocks.read(regions);
    const p4Probe = globalThis["__EA_P4_NATIVE_PROBE__"];
    p4Probe?.measure("building-offer-sample", (globalThis["eaDiagnosticsNow"]?.() ?? p4OfferStarted) - p4OfferStarted);
    if (catalog !== undefined && p4Probe?.controlled === undefined) {
      p4Probe.controlled = (readIterations = 100, membershipIterations = 1000000) => {
        const p4Now = () => globalThis["eaDiagnosticsNow"]?.() ?? 0;
        p4Probe.controlledMode = true;
        const p4ReadStarted = p4Now();
        for (let index = 0; index < readIterations; index += 1) buildingSwitchStates.read(catalog);
        p4Probe.measure("controlled-switch-reader", p4Now() - p4ReadStarted);
        const offered = [...catalog.unlocked];
        let hits = 0;
        const p4MembershipStarted = p4Now();
        for (let index = 0; index < membershipIterations; index += 1) {
          if (catalog.unlocked.has(offered[index % Math.max(1, offered.length)] ?? "__p4_missing__")) hits += 1;
        }
        p4Probe.measure("controlled-offer-set-membership", p4Now() - p4MembershipStarted);
        p4Probe.controlledMode = false;
        return { readIterations, membershipIterations, offeredCount: offered.length, hits, durations: { ...p4Probe.durations } };
      };
    }`;
  if (!source.includes(offerAnchor))
    throw new Error("P4 offer sample source anchor missing");
  source = source.replace(offerAnchor, offerReplacement);
  const membershipAnchor =
    "  const readCapturedBuildingUnlocked = (actionId: string, region: string) =>\n    readEstablishedBuildingOffers(new Set([region]))?.unlocked.has(actionId);";
  const membershipReplacement = `  const readCapturedBuildingUnlocked = (actionId: string, region: string) => {
    const p4LookupStarted = globalThis["eaDiagnosticsNow"]?.() ?? 0;
    const offers = readEstablishedBuildingOffers(new Set([region]));
    const p4MembershipStarted = globalThis["eaDiagnosticsNow"]?.() ?? p4LookupStarted;
    const answer = offers?.unlocked.has(actionId);
    const p4Ended = globalThis["eaDiagnosticsNow"]?.() ?? p4MembershipStarted;
    const p4Probe = globalThis["__EA_P4_NATIVE_PROBE__"];
    p4Probe?.measure("building-offer-cache-lookup", p4MembershipStarted - p4LookupStarted);
    p4Probe?.measure("building-offer-set-membership", p4Ended - p4MembershipStarted);
    return answer;
  };`;
  if (!source.includes(membershipAnchor))
    throw new Error("P4 offer membership source anchor missing");
  return source.replace(membershipAnchor, membershipReplacement);
}

function instrumentVueCapture(source) {
  const anchor = `      const value = Reflect.apply(
        target,
        syntheticReceiver(control, receiver),
        [...args],
      );`;
  const replacement = `      const p4NativeReceiver = syntheticReceiver(control, receiver);
      const p4NativeArgs = [...args];
      const p4NativeStarted = method === "on_cap" ? globalThis["eaDiagnosticsNow"]?.() ?? 0 : 0;
      const value = Reflect.apply(target, p4NativeReceiver, p4NativeArgs);
      if (method === "on_cap")
        globalThis["__EA_P4_NATIVE_PROBE__"]?.measure("native-on-cap-body", (globalThis["eaDiagnosticsNow"]?.() ?? p4NativeStarted) - p4NativeStarted);`;
  if (!source.includes(anchor))
    throw new Error("P4 native invocation source anchor missing");
  return source.replace(anchor, replacement);
}

const instrumentedBundle = fromRoot(
  "test-artifacts/perf-profile/p4-on-cap-instrumented.user.js",
);
await mkdir(fromRoot("test-artifacts/perf-profile"), { recursive: true });
const plugin = {
  name: "p4-on-cap-probe",
  setup(build) {
    build.onLoad(
      { filter: /captured-building-switch-states\.ts$/ },
      async (args) => ({
        contents: instrument(await readFile(args.path, "utf8")),
        loader: "ts",
      }),
    );
    build.onLoad(
      { filter: /captured-progression-control\.ts$/ },
      async (args) => ({
        contents: instrumentProgression(await readFile(args.path, "utf8")),
        loader: "ts",
      }),
    );
    build.onLoad({ filter: /vue-capture\.ts$/ }, async (args) => ({
      contents: instrumentVueCapture(await readFile(args.path, "utf8")),
      loader: "ts",
    }));
    build.onLoad({ filter: /diagnostics\.ts$/ }, async (args) => {
      const source = await readFile(args.path, "utf8");
      const anchor =
        "    if (!readPerformanceEnabled() || !Number.isFinite(durationMs)) {";
      const replacement = `    if (phase === "tick") globalThis["__EA_P4_NATIVE_PROBE__"]?.tick(durationMs);\n${anchor}`;
      if (!source.includes(anchor))
        throw new Error("P4 diagnostics source anchor missing");
      return { contents: source.replace(anchor, replacement), loader: "ts" };
    });
  },
};
await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  outfile: instrumentedBundle,
  bundle: true,
  banner: { js: `${metadata}\n\n${injectedProbe}` },
  charset: "utf8",
  format: "iife",
  legalComments: "inline",
  logLevel: "silent",
  platform: "browser",
  target: ["esnext"],
  define: {
    "globalThis.__EA_TEST_SURFACE_ENABLED__": "false",
    __EA_TEST_SURFACE_ENABLED__: "false",
    __EA_RESEARCH_CONDITION_GATE_ENABLED__: "false",
  },
  minifySyntax: true,
  treeShaking: true,
  plugins: [plugin],
});

const runner = await createChromiumRunner({ game });
try {
  const session = await runner.openSession({
    bundle: instrumentedBundle,
    save: parseSave(await readFile(fromRoot(savePath), "utf8")),
    settings,
    seed: 42,
    perf: true,
  });
  try {
    await session.advance(warmup);
    const baselinePeriod = await session.periods();
    const controlledCosts = await session.evaluate(
      () => window.__EA_P4_NATIVE_PROBE__.controlled?.(100, 1_000_000) ?? null,
    );
    await session.evaluate(() => window.__EA_P4_NATIVE_PROBE__.reset());
    await session.advance(periods);
    const probe = await session.evaluate(() => window.__EA_P4_NATIVE_PROBE__);
    const diagnostics = await session.diagnostics();
    if (probe.tickDurations.length !== expectedWorkTicks) {
      throw new Error(
        `Measured interval had ${probe.tickDurations.length} workticks; expected ${expectedWorkTicks}`,
      );
    }
    const buckets = new Map();
    for (const call of probe.calls) {
      const key = call.period;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const callsByRead = new Map();
    for (const call of probe.calls) {
      const row = callsByRead.get(call.id) ?? { calls: 0, elapsedMs: 0 };
      row.calls += 1;
      row.elapsedMs += call.elapsedMs;
      callsByRead.set(call.id, row);
    }
    const readRows = probe.reads.map((read) => ({
      ...read,
      ...(callsByRead.get(read.id) ?? { calls: 0, elapsedMs: 0 }),
    }));
    const exportText = await session.exportSave();
    const report = {
      game: await readFile(`${game}.json`, "utf8").catch(() => undefined),
      bundle: (await readFile(instrumentedBundle)).length,
      warmup,
      periods,
      seed: 42,
      measurementStartPeriod: baselinePeriod,
      measurementEndPeriod: await session.periods(),
      expectedWorkTicks,
      measuredWorkTicks: probe.tickDurations.length,
      totalOnCapInvocations: probe.calls.length,
      callsPerWorkTick:
        probe.tickDurations.length === 0
          ? undefined
          : probe.calls.length / probe.tickDurations.length,
      totalUnavailableControls: probe.failures.filter(
        (row) => row.reason === "control-unavailable",
      ).length,
      totalFailedOrMalformed: probe.failures.filter(
        (row) => row.reason !== "control-unavailable",
      ).length,
      callsByPeriod: Object.fromEntries(
        [...buckets.entries()].sort((a, b) => a[0] - b[0]),
      ),
      readObservations: readRows,
      unavailable: probe.failures,
      tickDurations: probe.tickDurations,
      diagnosticCosts: probe.durations,
      controlledCosts,
      controlUsage: diagnostics.controlUsage,
      consoleCounts: diagnostics.counts,
      diagnosticEvents: diagnostics.events,
      pageFailures: diagnostics.events.filter(
        ({ kind }) =>
          kind === "error" || kind === "pageerror" || kind === "rejection",
      ),
      workTicks: diagnostics.workTicks,
      perfSummaries: diagnostics.perfSummaries,
      exportSha256: createHash("sha256").update(exportText).digest("hex"),
    };
    await writeFile(fromRoot(output), `${JSON.stringify(report, null, 2)}\n`);
    console.log(
      JSON.stringify(
        {
          output: fromRoot(output),
          calls: report.totalOnCapInvocations,
          observations: readRows.length,
          unavailable: report.totalUnavailableControls,
          failures: report.totalFailedOrMalformed,
          exportSha256: report.exportSha256,
        },
        null,
        2,
      ),
    );
  } finally {
    await session.close();
  }
} finally {
  await runner.close();
}
