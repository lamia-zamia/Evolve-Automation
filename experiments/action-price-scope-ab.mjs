// A/B of the per-cycle action price scope: `deadspace` production bundle (base) against this
// checkout's build (candidate), under the Stage 4F.3 authority (renderer-process CPU, renderer rows
// summed, CDP TaskDuration as the cross-check; ScriptDuration not used). The candidate was reverted
// (see action-price-scope-ab.md); to rerun, apply the saved candidate patch to a `deadspace`
// checkout, `npm run build` there, and run this script from that checkout.
//
//   node experiments/action-price-scope-ab.mjs parity [--periods 2000]
//   node experiments/action-price-scope-ab.mjs cpu [--repeats 6] [--saves early,mid,late]
//   node experiments/action-price-scope-ab.mjs hits
//
// parity: base, base again (same-bundle control), candidate per save; exports must match exactly and
// controlUsage may differ only in `buildQueue.setData`. cpu: fresh session per window, 400 warm-up +
// 800 measured periods (100 work ticks), arm order alternating per repeat. hits: candidate with
// `[EA perf]` on, reporting the scope's hit/miss/dropped tallies.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const option = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const mode = process.argv[2] ?? "parity";
const outDir = `${root}test-artifacts/perf-profile/price-scope`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const SLICE0 = `${root}test-artifacts/benchmark/slice0`;
const SAVES = {
  early: `${SLICE0}/saves/deadspace-early-day14.json`,
  mid: `${SLICE0}/saves/stage2f-through-7600-export.json`,
  late: `${SLICE0}/saves/deadspace-late-2026-10-12.txt`,
};
const saveNames = option("saves", "early,mid,late").split(",");
// The Stage 4F settings with autoPrestige off: the late save resets into a new game otherwise.
const settings = JSON.parse(
  await readFile(
    `${SLICE0}/settings/stage2e-integrated-mad-no-triggers.json`,
    "utf8",
  ),
);
settings.autoPrestige = false;
const settingsText = JSON.stringify(settings);

await mkdir(outDir, { recursive: true });
const basePath = `${outDir}/base.user.js`;
const candidatePath = `${outDir}/candidate.user.js`;
await writeFile(
  basePath,
  execFileSync("git", ["show", "deadspace:evolve_automation.user.js"], {
    cwd: root,
    maxBuffer: 64 << 20,
  }),
);
await writeFile(
  candidatePath,
  await readFile(`${root}evolve_automation.user.js`),
);
const bundles = { base: basePath, candidate: candidatePath };

const rendererCpu = async (runner) =>
  (await runner.processCpu())
    .filter((entry) => entry.type === "renderer")
    .reduce((sum, entry) => sum + entry.cpuSec, 0);

const usageTotals = (usage) =>
  Object.fromEntries(
    Object.entries(usage).map(([key, value]) => [
      key,
      value.returned + value.threw,
    ]),
  );

async function openArm(runner, arm, saveName, perf = false) {
  const save = parseSave(await readFile(SAVES[saveName], "utf8"));
  const session = await runner.openSession({
    bundle: bundles[arm],
    save,
    settings: settingsText,
    seed: 42,
    perf,
    forwardPerfSummary: perf,
  });
  const loaded = await session.readState();
  if (
    loaded.stats?.days !== save.stats?.days ||
    loaded.race?.species !== save.race?.species
  )
    throw new Error(`${saveName} did not load as itself`);
  return session;
}

async function parity(runner) {
  const periods = Number(option("periods", "2000"));
  const report = { periods, saves: {} };
  for (const saveName of saveNames) {
    const runs = {};
    for (const [label, arm] of [
      ["base", "base"],
      ["baseControl", "base"],
      ["candidate", "candidate"],
    ]) {
      const session = await openArm(runner, arm, saveName);
      try {
        await session.advance(periods);
        const exported = await session.exportSave();
        const diagnostics = await session.diagnostics();
        runs[label] = {
          exportSha256: sha256(exported),
          usage: usageTotals(diagnostics.controlUsage),
          errors: (diagnostics.events ?? [])
            .filter((event) => event.kind !== "log")
            .map((event) => event.text.slice(0, 160)),
          reloads: diagnostics.loads,
        };
      } finally {
        await session.close();
      }
    }
    const usageDiff = (left, right) =>
      [...new Set([...Object.keys(left), ...Object.keys(right)])]
        .filter((key) => left[key] !== right[key])
        .map((key) => ({ key, left: left[key], right: right[key] }));
    const candidateDiff = usageDiff(runs.base.usage, runs.candidate.usage);
    report.saves[saveName] = {
      controlExportEqual:
        runs.base.exportSha256 === runs.baseControl.exportSha256,
      controlUsageDiff: usageDiff(runs.base.usage, runs.baseControl.usage),
      candidateExportEqual:
        runs.base.exportSha256 === runs.candidate.exportSha256,
      candidateUsageDiffOtherThanSetData: candidateDiff.filter(
        (entry) => entry.key !== "buildQueue.setData",
      ),
      setData: {
        base: runs.base.usage["buildQueue.setData"] ?? 0,
        candidate: runs.candidate.usage["buildQueue.setData"] ?? 0,
      },
      errors: {
        base: [...new Set(runs.base.errors)],
        candidate: [...new Set(runs.candidate.errors)],
      },
      reloads: [runs.base.reloads, runs.candidate.reloads],
    };
    console.log(saveName, JSON.stringify(report.saves[saveName]));
  }
  return report;
}

async function cpu(runner) {
  const repeats = Number(option("repeats", "6"));
  const report = { repeats, windows: [] };
  for (const saveName of saveNames) {
    for (let repeat = 0; repeat < repeats; repeat++) {
      const order =
        repeat % 2 === 0 ? ["base", "candidate"] : ["candidate", "base"];
      for (const arm of order) {
        const session = await openArm(runner, arm, saveName);
        try {
          await session.advance(400);
          const cpuBefore = await rendererCpu(runner);
          const before = await session.metrics();
          await session.advance(800);
          const after = await session.metrics();
          const cpuAfter = await rendererCpu(runner);
          const window = {
            saveName,
            repeat,
            order: order[0] === "base" ? "base-first" : "candidate-first",
            arm,
            rendererCpuSec: Number((cpuAfter - cpuBefore).toFixed(3)),
            taskDurationSec: Number(
              (after.TaskDuration - before.TaskDuration).toFixed(4),
            ),
          };
          report.windows.push(window);
          console.log(JSON.stringify(window));
        } finally {
          await session.close();
        }
      }
    }
  }
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  report.summary = {};
  for (const saveName of saveNames) {
    const pairs = [];
    for (let repeat = 0; repeat < repeats; repeat++) {
      const find = (arm) =>
        report.windows.find(
          (w) =>
            w.saveName === saveName && w.repeat === repeat && w.arm === arm,
        );
      const base = find("base");
      const candidate = find("candidate");
      pairs.push({
        order: base.order,
        cpuSavingMsPerTick:
          ((base.rendererCpuSec - candidate.rendererCpuSec) * 1000) / 100,
        taskSavingMsPerTick:
          ((base.taskDurationSec - candidate.taskDurationSec) * 1000) / 100,
        baseCpuSec: base.rendererCpuSec,
      });
    }
    const byOrder = (order) => pairs.filter((pair) => pair.order === order);
    report.summary[saveName] = {
      pairs,
      medianCpuSavingMsPerTick: {
        "base-first": median(
          byOrder("base-first").map((p) => p.cpuSavingMsPerTick),
        ),
        "candidate-first": median(
          byOrder("candidate-first").map((p) => p.cpuSavingMsPerTick),
        ),
      },
      taskSameDirectionEveryPair: pairs.every(
        (pair) =>
          Math.sign(pair.taskSavingMsPerTick) ===
          Math.sign(pair.cpuSavingMsPerTick),
      ),
      baseMedianCpuSec: median(pairs.map((pair) => pair.baseCpuSec)),
    };
    console.log(saveName, JSON.stringify(report.summary[saveName]));
  }
  return report;
}

async function hits(runner) {
  const report = { saves: {} };
  for (const saveName of saveNames) {
    const session = await openArm(runner, "candidate", saveName, true);
    try {
      await session.advance(400 + 800);
      const { perfSummaries } = await session.diagnostics();
      const totals = {};
      let ticks = 0;
      for (const [label, , counts] of perfSummaries) {
        ticks += Number(/(\d+) work ticks/.exec(label)?.[1] ?? 0);
        for (const [name, value] of Object.entries(counts ?? {}))
          if (name.startsWith("action-cost."))
            totals[name] = (totals[name] ?? 0) + value.total;
      }
      report.saves[saveName] = { workTicks: ticks, totals };
      console.log(saveName, JSON.stringify(report.saves[saveName]));
    } finally {
      await session.close();
    }
  }
  return report;
}

const runner = await createChromiumRunner();
let report;
try {
  report = await { parity, cpu, hits }[mode](runner);
} finally {
  await runner.close();
}
report.inputs = {
  ...runner.inputs,
  browser: runner.browser.version,
  base: sha256(await readFile(basePath)),
  candidate: sha256(await readFile(candidatePath)),
  settingsOverrides: "autoPrestige=false",
};
const path = `${outDir}/${mode}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
await writeFile(path, `${JSON.stringify(report, null, 1)}\n`);
console.log(`wrote ${path}`);
