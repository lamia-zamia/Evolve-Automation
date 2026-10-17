import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const option = (name, fallback) => {
  const inline = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`),
  );
  if (inline !== undefined) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const defaultToolsRoot = existsSync(resolve(root, "tools"))
  ? resolve(root, "tools")
  : resolve(root, "../Evolve-Automation/tools");
const toolsRoot = resolve(process.env.EA_TOOLS_ROOT ?? defaultToolsRoot);
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(resolve(toolsRoot, "chromium-evolve-runner.mjs"))
);
const scenarioArg = option("scenario", "both");
const scenarios = {
  late: {
    savePath:
      "D:/work/Evolve-Automation/test-artifacts/benchmark/slice0/saves/deadspace-late-2026-10-12.txt",
    name: "late-many-owners",
  },
  mid: {
    savePath:
      "D:/work/Evolve-Automation/test-artifacts/benchmark/slice0/saves/stage2f-through-7600-export.json",
    name: "mid-pre-space",
  },
};
const settingsPath =
  "D:/work/Evolve-Automation/test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json";
const game =
  "D:/work/Evolve-Automation/test-artifacts/game/evolve-deadspace.js";
const bundle = resolve(root, "evolve_automation.user.js");
const periods = Number(option("periods", "1000"));
const warmup = Number(option("warmup", "600"));
const repeats = Number(option("repeats", "2"));
const samplingIntervalUs = Number(option("sampling-us", "1000"));
const allocationProfile = option("allocation-profile", "false") === "true";
const outPath = resolve(
  option("out", `${root}test-artifacts/perf-profile/p2-renderer-cpu.json`),
);
const selectedScenarios =
  scenarioArg === "both" ? Object.keys(scenarios) : [scenarioArg];
if (selectedScenarios.some((name) => !(name in scenarios)))
  throw new Error(`Unknown scenario: ${scenarioArg}`);
if (
  !Number.isInteger(periods) ||
  periods <= 0 ||
  !Number.isInteger(warmup) ||
  warmup < 0
)
  throw new Error(
    "warmup and periods must be non-negative integer counts, with periods > 0",
  );
if (
  !Number.isInteger(repeats) ||
  repeats < 1 ||
  !Number.isInteger(samplingIntervalUs) ||
  samplingIntervalUs < 250
)
  throw new Error(
    "repeats must be positive and sampling interval must be at least 250 microseconds",
  );

const settings = JSON.parse(await readFile(settingsPath, "utf8"));
settings.autoPrestige = false;
const runner = await createChromiumRunner({ game });
const runs = [];
const rendererRows = (rows) =>
  rows.filter((entry) => entry.type === "renderer");
const rendererDelta = (before, after) => {
  const prior = new Map(
    rendererRows(before).map((entry) => [entry.id, entry.cpuSec]),
  );
  return rendererRows(after).reduce(
    (total, entry) => total + entry.cpuSec - (prior.get(entry.id) ?? 0),
    0,
  );
};

try {
  for (const scenarioName of selectedScenarios) {
    const scenario = scenarios[scenarioName];
    const saveText = await readFile(scenario.savePath, "utf8");
    const save = parseSave(saveText);
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      const session = await runner.openSession({
        bundle,
        save,
        settings,
        seed: 42,
      });
      let cdp;
      let allocationStarted = false;
      try {
        await session.advance(warmup);
        const cpuBefore = await runner.processCpu();
        const metricsBefore = await session.metrics();
        cdp = await session.page.createCDPSession();
        await cdp.send("Profiler.enable");
        await cdp.send("Profiler.setSamplingInterval", {
          interval: samplingIntervalUs,
        });
        if (allocationProfile) {
          await cdp.send("HeapProfiler.startSampling", {
            samplingInterval: 32768,
            includeObjectsCollected: false,
          });
          allocationStarted = true;
        }
        await cdp.send("Profiler.start");
        await session.advance(periods);
        const { profile } = await cdp.send("Profiler.stop");
        let allocations;
        if (allocationStarted) {
          allocations = await cdp.send("HeapProfiler.stopSampling");
          allocationStarted = false;
        }
        const metricsAfter = await session.metrics();
        const cpuAfter = await runner.processCpu();
        const [exported, state, diagnostics] = await Promise.all([
          session.exportSave(),
          session.readState(),
          session.diagnostics(),
        ]);
        runs.push({
          scenario: scenario.name,
          repeat,
          instrumented: "CDP V8 CPU sampling",
          samplingIntervalUs,
          periods,
          warmup,
          seed: 42,
          rendererCpuSec: Number(rendererDelta(cpuBefore, cpuAfter).toFixed(3)),
          taskDurationSec: Number(
            (metricsAfter.TaskDuration - metricsBefore.TaskDuration).toFixed(3),
          ),
          sampledProfile: profile,
          ...(allocations === undefined
            ? {}
            : { allocationProfile: allocations.profile }),
          profileDurationMs: Number(
            ((profile.endTime - profile.startTime) / 1000).toFixed(3),
          ),
          profileSampleCount: profile.samples?.length ?? 0,
          sampledTimeMs:
            (profile.timeDeltas ?? []).reduce((sum, delta) => sum + delta, 0) /
            1000,
          exportSha256: createHash("sha256").update(exported).digest("hex"),
          day: state.stats?.days,
          resetCount: state.stats?.reset,
          controlUsage: diagnostics.controlUsage,
          workTicks: diagnostics.workTicks,
          counts: diagnostics.counts,
          dialogs: diagnostics.dialogs,
        });
      } finally {
        if (allocationStarted)
          await cdp?.send("HeapProfiler.stopSampling").catch(() => undefined);
        if (cdp !== undefined) {
          await cdp.send("Profiler.disable").catch(() => undefined);
          await cdp.detach().catch(() => undefined);
        }
        await session.close();
      }
    }
  }
} finally {
  await runner.close();
}

function ownerOf(frame) {
  const url = frame.url ?? "";
  if (frame.functionName === "(program)") return "program";
  if (/evolve\/main\.js(?:$|\?)/u.test(url)) return "game";
  if (/evolve_automation|automation\.user\.js|userscript|bundle/u.test(url))
    return "automation";
  if (/vue(?:\.global\.prod|\.min)?\.js/u.test(url)) return "Vue";
  if (/fflate/u.test(url)) return "fflate";
  if (/sortable/u.test(url)) return "SortableJS";
  if (url === "") return "native";
  return "other";
}

function summarizeProfile(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes)
    for (const child of node.children ?? []) parent.set(child, node.id);
  const inclusive = new Map();
  const exclusive = new Map();
  const byScript = new Map();
  const stacks = new Map();
  const ownerSelf = new Map();
  const inclusiveSampleCounts = new Map();
  let sampledUs = 0;
  const samples = profile.samples ?? [];
  for (let index = 0; index < samples.length; index += 1) {
    const leafId = samples[index];
    const leaf = nodes.get(leafId);
    if (leaf === undefined) continue;
    const weight = profile.timeDeltas?.[index] ?? 1000;
    sampledUs += weight;
    const leafFrame = leaf.callFrame;
    const leafOwner = ownerOf(leafFrame);
    const leafKey = `${leafOwner}\u0000${leafFrame.url}\u0000${leafFrame.functionName || "(anonymous)"}`;
    exclusive.set(leafKey, (exclusive.get(leafKey) ?? 0) + weight);
    ownerSelf.set(leafOwner, (ownerSelf.get(leafOwner) ?? 0) + weight);
    const scriptKey = `${leafFrame.url || "<anonymous>"}\u0000${leafFrame.scriptId}`;
    byScript.set(scriptKey, (byScript.get(scriptKey) ?? 0) + weight);
    const frames = [];
    let cursor = leafId;
    while (cursor !== undefined) {
      const node = nodes.get(cursor);
      if (node === undefined) break;
      const frame = node.callFrame;
      const owner = ownerOf(frame);
      const key = `${owner}\u0000${frame.url}\u0000${frame.functionName || "(anonymous)"}`;
      inclusive.set(key, (inclusive.get(key) ?? 0) + weight);
      inclusiveSampleCounts.set(key, (inclusiveSampleCounts.get(key) ?? 0) + 1);
      frames.push({
        owner,
        functionName: frame.functionName || "(anonymous)",
        url: frame.url,
        lineNumber: frame.lineNumber,
        columnNumber: frame.columnNumber,
      });
      cursor = parent.get(cursor);
    }
    const stackKey = frames
      .map(
        (frame) =>
          `${frame.owner}:${frame.functionName}@${frame.url}:${frame.lineNumber + 1}`,
      )
      .join(" <- ");
    const stack = stacks.get(stackKey) ?? { weightUs: 0, frames };
    stack.weightUs += weight;
    stacks.set(stackKey, stack);
  }
  const top = (map, count = 40) =>
    [...map.entries()]
      .map(([key, weightUs]) => {
        const [owner, url, functionName] = key.split("\u0000");
        return {
          owner,
          script: url || "<anonymous>",
          functionName,
          sampledMs: Number((weightUs / 1000).toFixed(2)),
          shareOfSampledJs: sampledUs
            ? Number(((weightUs / sampledUs) * 100).toFixed(2))
            : 0,
        };
      })
      .sort((a, b) => b.sampledMs - a.sampledMs)
      .slice(0, count);
  return {
    sampleCount: samples.length,
    profileDurationMs: Number(
      ((profile.endTime - profile.startTime) / 1000).toFixed(2),
    ),
    weightedSampleTimeMs: Number((sampledUs / 1000).toFixed(2)),
    weightedSampleWindowCoveragePercent: Number(
      (
        (sampledUs / Math.max(1, profile.endTime - profile.startTime)) *
        100
      ).toFixed(2),
    ),
    ownerExclusiveMs: Object.fromEntries(
      [...ownerSelf].map(([key, value]) => [
        key,
        Number((value / 1000).toFixed(2)),
      ]),
    ),
    ownerExclusivePercent: Object.fromEntries(
      [...ownerSelf].map(([key, value]) => [
        key,
        Number(((value / Math.max(1, sampledUs)) * 100).toFixed(2)),
      ]),
    ),
    topScriptsExclusive: [...byScript.entries()]
      .map(([key, weightUs]) => ({
        script: key.split("\u0000")[0],
        sampledMs: Number((weightUs / 1000).toFixed(2)),
        shareOfSampledJs: Number(
          ((weightUs / Math.max(1, sampledUs)) * 100).toFixed(2),
        ),
      }))
      .sort((a, b) => b.sampledMs - a.sampledMs)
      .slice(0, 30),
    topFunctionsExclusive: top(exclusive),
    topFunctionsInclusive: top(inclusive),
    topStacks: [...stacks.values()]
      .map((item) => ({
        sampledMs: Number((item.weightUs / 1000).toFixed(2)),
        shareOfSampledJs: Number(
          ((item.weightUs / Math.max(1, sampledUs)) * 100).toFixed(2),
        ),
        frames: item.frames,
      }))
      .sort((a, b) => b.sampledMs - a.sampledMs)
      .slice(0, 50),
    functionInvocationSamples: [...inclusiveSampleCounts.entries()]
      .map(([key, sampleCount]) => ({
        key: key.split("\u0000").slice(0, 3).join(" / "),
        inclusiveSampleCount: sampleCount,
      }))
      .sort((a, b) => b.inclusiveSampleCount - a.inclusiveSampleCount)
      .slice(0, 50),
  };
}

function summarizeAllocationProfile(profile) {
  if (profile?.head === undefined) return undefined;
  const rows = new Map();
  const walk = (node) => {
    const frame = node.callFrame;
    const key = `${ownerOf(frame)}\u0000${frame.url ?? ""}\u0000${frame.functionName || "(anonymous)"}`;
    const row = rows.get(key) ?? {
      owner: ownerOf(frame),
      script: frame.url || "<anonymous>",
      functionName: frame.functionName || "(anonymous)",
      sampledBytes: 0,
    };
    row.sampledBytes += node.selfSize ?? 0;
    rows.set(key, row);
    for (const child of node.children ?? []) walk(child);
  };
  walk(profile.head);
  const totalBytes = [...rows.values()].reduce(
    (sum, row) => sum + row.sampledBytes,
    0,
  );
  return {
    sampledBytes: totalBytes,
    sampledAllocationCount: profile.samples?.length ?? 0,
    topAllocatedFunctions: [...rows.values()]
      .map((row) => ({
        ...row,
        shareOfSampledAllocationBytes: totalBytes
          ? Number(((row.sampledBytes / totalBytes) * 100).toFixed(2))
          : 0,
      }))
      .sort((a, b) => b.sampledBytes - a.sampledBytes)
      .slice(0, 40),
  };
}

const summaries = runs.map((run) => ({
  scenario: run.scenario,
  repeat: run.repeat,
  rendererCpuSec: run.rendererCpuSec,
  taskDurationSec: run.taskDurationSec,
  profile: (() => {
    const summary = summarizeProfile(run.sampledProfile);
    const withRendererShare = (rows) =>
      rows.map((row) => ({
        ...row,
        estimatedShareOfProfiledRendererCpu: Number(
          ((row.sampledMs / (run.rendererCpuSec * 1000)) * 100).toFixed(2),
        ),
      }));
    return {
      ...summary,
      topFunctionsExclusive: withRendererShare(summary.topFunctionsExclusive),
      topFunctionsInclusive: withRendererShare(summary.topFunctionsInclusive),
      topStacks: withRendererShare(summary.topStacks),
    };
  })(),
  ...(run.allocationProfile === undefined
    ? {}
    : { allocation: summarizeAllocationProfile(run.allocationProfile) }),
}));
const report = {
  runner: "chromium-exact",
  inputs: {
    ...runner.inputs,
    game,
    gameSnapshot: "db38e2af831907d49aeb5348d678d8d8745d6c3f",
    bundle,
    bundleSha256: createHash("sha256")
      .update(await readFile(bundle))
      .digest("hex"),
    settingsPath,
    autoPrestigeOverride: false,
    warmup,
    periods,
    seed: 42,
    samplingIntervalUs,
    repeats,
    allocationProfile,
    sampleCountsAreWeightedEstimates: true,
  },
  browser: runner.browser,
  runs: summaries,
  rawProfiles: runs.map(
    ({
      scenario,
      repeat,
      sampledProfile,
      allocationProfile: allocation,
      ...metrics
    }) => ({
      scenario,
      repeat,
      metrics,
      profile: sampledProfile,
      ...(allocation === undefined ? {} : { allocationProfile: allocation }),
    }),
  ),
};
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(report, null, 1)}\n`);
console.log(
  JSON.stringify(
    {
      outPath,
      runs: summaries.map(
        ({ scenario, repeat, rendererCpuSec, taskDurationSec, profile }) => ({
          scenario,
          repeat,
          rendererCpuSec,
          taskDurationSec,
          sampledMs: profile.weightedSampleTimeMs,
          weightedSampleWindowCoveragePercent:
            profile.weightedSampleWindowCoveragePercent,
          ownerExclusivePercent: profile.ownerExclusivePercent,
          topFunctions: profile.topFunctionsExclusive.slice(0, 8),
        }),
      ),
    },
    null,
    1,
  ),
);
