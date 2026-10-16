import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const toolsDir =
  process.env.EA_TOOLS_DIR ??
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../Evolve-Automation/tools",
  );
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(resolve(toolsDir, "chromium-evolve-runner.mjs")).href
);

const input = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || process.argv[index + 1] === undefined)
    throw new Error(`missing --${name}`);
  return resolve(process.argv[index + 1]);
};
const savePath = input("save");
const settingsPath = input("settings");
const gamePath = input("game");
const bundlePath = input("bundle");
const warmup = Number(
  process.argv[process.argv.indexOf("--warmup") + 1] ?? 400,
);
const periods = Number(
  process.argv[process.argv.indexOf("--periods") + 1] ?? 800,
);
const save = parseSave(await readFile(savePath, "utf8"));
const settings = JSON.parse(await readFile(settingsPath, "utf8"));
const runner = await createChromiumRunner({
  game: gamePath,
  upstream: "D:/work/Evolve-DeadSpace",
});
const session = await runner.openSession({
  save,
  settings,
  bundle: bundlePath,
  seed: 42,
  callbackProfile: true,
});
try {
  await session.advance(warmup);
  const cdp = await session.page.target().createCDPSession();
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 250 });
  await session.evaluate(() => {
    window.__EA_RESEARCH_DRAW_TRACE__ = {
      draws: 0,
      offers: 0,
      completed: 0,
      callbackCount: 0,
      completedCallbackMs: 0,
    };
  });
  await cdp.send("Profiler.start");
  await session.advance(periods);
  const { profile } = await cdp.send("Profiler.stop");
  const trace = await session.evaluate(() => ({
    ...window.__EA_RESEARCH_DRAW_TRACE__,
  }));
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  const parent = new Map();
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  for (const node of profile.nodes)
    for (const child of node.children ?? []) parent.set(child, node.id);
  const inDraw = (id) => {
    for (let nodeId = id; nodeId !== undefined; nodeId = parent.get(nodeId)) {
      if (nodes.get(nodeId)?.callFrame.functionName === "drawTech") return true;
    }
    return false;
  };
  const inCallback = (id) => {
    const names = new Set(["addAction", "setAction"]);
    for (let nodeId = id; nodeId !== undefined; nodeId = parent.get(nodeId)) {
      if (names.has(nodes.get(nodeId)?.callFrame.functionName)) return true;
    }
    return false;
  };
  let drawSampleUs = 0;
  let callbackSampleUs = 0;
  samples.forEach((id, index) => {
    const delta = deltas[index] ?? 0;
    if (inDraw(id)) drawSampleUs += delta;
    if (inCallback(id)) callbackSampleUs += delta;
  });
  const latency = (await session.diagnostics()).callbackDurationsMs ?? [];
  const work = latency
    .filter(
      (sample) =>
        sample.period > warmup &&
        sample.period <= warmup + periods &&
        sample.period % settings.tickRate === 0,
    )
    .map((sample) => sample.durationMs)
    .sort((a, b) => a - b);
  const percentile = (values, p) =>
    values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)] ??
    null;
  const state = await session.readState();
  const report = {
    scenario: process.argv[process.argv.indexOf("--scenario") + 1] ?? "unknown",
    gamePath,
    gameSha256: createHash("sha256")
      .update(await readFile(gamePath))
      .digest("hex"),
    bundlePath,
    periods,
    warmup,
    trace,
    sampledCpuMs: {
      researchDrawTotal: Number((drawSampleUs / 1000).toFixed(2)),
      researchDrawPerDraw: trace.draws
        ? Number((drawSampleUs / 1000 / trace.draws).toFixed(3))
        : null,
      addActionSetActionTotal: Number((callbackSampleUs / 1000).toFixed(2)),
    },
    workCycleMs: {
      count: work.length,
      p50: percentile(work, 0.5),
      p95: percentile(work, 0.95),
      p99: percentile(work, 0.99),
      max: work.at(-1) ?? null,
    },
    endDay: state.stats?.days,
  };
  await writeFile(input("out"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
} finally {
  await session.close();
  await runner.close();
}
