import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { patchResearchSnapshot } from "./research-fast-scratch.mjs";

const toolsDir =
  process.env.EA_TOOLS_DIR ??
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../Evolve-Automation/tools",
  );
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(resolve(toolsDir, "chromium-evolve-runner.mjs")).href
);
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2)
  args.set(process.argv[index], process.argv[index + 1]);
const required = (name) => {
  const value = args.get(`--${name}`);
  if (!value) throw new Error(`missing --${name}`);
  return resolve(value);
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const inputGame = required("game");
const cGame = required("c-game");
const outDirectory = required("out-dir");
const sourceGame = await readFile(inputGame, "utf8");
const sourceSidecar = JSON.parse(await readFile(`${inputGame}.json`, "utf8"));
const conditionCall = `    if (c_action["condition"] && !c_action.condition()) {
      return false;
    }`;
const conditionTrace = `    if (c_action["condition"]) {
        const researchTrace = window.__EA_RESEARCH_DRAW_TRACE__;
        if (researchTrace) researchTrace.conditionCalls += 1;
        if (!c_action.condition()) return false;
    }`;
if (sourceGame.split(conditionCall).length !== 2)
  throw new Error(
    "Pinned checkTechQualifications condition call was not unique",
  );
const traceBaselineSource = patchResearchSnapshot(sourceGame, {
  suppressCompleted: false,
  instrument: true,
}).replace(conditionCall, conditionTrace);
const traceCSource = patchResearchSnapshot(await readFile(cGame, "utf8"), {
  suppressCompleted: true,
  instrument: true,
}).replace(conditionCall, conditionTrace);
await mkdir(outDirectory, { recursive: true });
const traceBaseline = resolve(outDirectory, "trace-original-game.js");
const traceC = resolve(outDirectory, "trace-c-game.js");
await writeFile(traceBaseline, traceBaselineSource);
await writeFile(
  `${traceBaseline}.json`,
  `${JSON.stringify({ ...sourceSidecar, experiment: "research-gate-trace" }, null, 2)}\n`,
);
await writeFile(traceC, traceCSource);
await writeFile(
  `${traceC}.json`,
  `${JSON.stringify({ ...sourceSidecar, experiment: "research-gate-trace-c" }, null, 2)}\n`,
);

const settingsPath = required("settings");
const settings = JSON.parse(await readFile(settingsPath, "utf8"));
const scenarios = [
  { name: "early", save: required("early") },
  { name: "mid", save: required("mid") },
  { name: "late", save: required("late") },
];
const variants = [
  { name: "A", game: traceBaseline, bundle: required("a-bundle") },
  { name: "B", game: traceBaseline, bundle: required("b-bundle") },
  { name: "B2", game: traceBaseline, bundle: required("b2-bundle") },
  { name: "B3", game: traceBaseline, bundle: required("b3-bundle") },
  { name: "C", game: traceC, bundle: required("c-bundle") },
];
const warmup = Number(args.get("--warmup") ?? 400);
const periods = Number(args.get("--periods") ?? 800);
const records = [];
for (const scenario of scenarios) {
  for (const variant of variants) {
    const runner = await createChromiumRunner({
      game: variant.game,
      upstream: "D:/work/Evolve-DeadSpace",
    });
    let session;
    try {
      session = await runner.openSession({
        bundle: variant.bundle,
        save: parseSave(await readFile(scenario.save, "utf8")),
        settings: JSON.stringify(settings),
        seed: 42,
      });
      await session.advance(warmup);
      await session.evaluate(() => {
        window.__EA_RESEARCH_DRAW_TRACE__ = {
          draws: 0,
          offers: 0,
          completed: 0,
          callbackCount: 0,
          completedCallbackMs: 0,
          conditionCalls: 0,
        };
        window.__EA_RESEARCH_GATE_EVENTS__ = [];
        window.__EA_TEST_HOOKS__ = {
          ...(window.__EA_TEST_HOOKS__ ?? {}),
          researchConditionGate(event) {
            window.__EA_RESEARCH_GATE_EVENTS__.push(event);
          },
        };
      });
      const cdp = await session.page.target().createCDPSession();
      await cdp.send("HeapProfiler.enable");
      await cdp.send("HeapProfiler.startSampling", {
        samplingInterval: 16384,
        includeObjectsCollectedByMajorGC: true,
        includeObjectsCollectedByMinorGC: true,
      });
      await session.advance(periods);
      const allocation = await cdp.send("HeapProfiler.getSamplingProfile");
      await cdp.send("HeapProfiler.stopSampling");
      const allocationBytesByFunction = new Map();
      const visitAllocationTree = (node) => {
        const name = node.callFrame?.functionName || "(anonymous)";
        const bytes = node.selfSize ?? 0;
        allocationBytesByFunction.set(
          name,
          (allocationBytesByFunction.get(name) ?? 0) + bytes,
        );
        for (const child of node.children ?? []) visitAllocationTree(child);
      };
      visitAllocationTree(allocation.profile.head);
      const allocationSamples = [...allocationBytesByFunction]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 40)
        .map(([functionName, sampledBytes]) => ({
          functionName,
          sampledBytes,
        }));
      const trace = await session.evaluate(() => ({
        draw: window.__EA_RESEARCH_DRAW_TRACE__,
        gate: window.__EA_RESEARCH_GATE_EVENTS__ ?? [],
      }));
      const diagnostics = await session.diagnostics();
      const state = await session.readState();
      records.push({
        scenario: scenario.name,
        variant: variant.name,
        periods,
        trace: trace.draw,
        gate: {
          invocations: trace.gate.length,
          installed: trace.gate.reduce(
            (sum, event) => sum + event.installed,
            0,
          ),
          invoked: trace.gate.reduce((sum, event) => sum + event.invoked, 0),
          restored: trace.gate.reduce((sum, event) => sum + event.restored, 0),
          restorationFailures: trace.gate.reduce(
            (sum, event) => sum + event.restorationFailures,
            0,
          ),
          events: trace.gate,
        },
        allocationSamples,
        endDay: state.stats?.days,
        diagnostics: diagnostics.counts,
      });
      const outputPath = resolve(outDirectory, "trace-counts.json");
      await writeFile(outputPath, `${JSON.stringify(records, null, 2)}\n`);
      console.log(
        JSON.stringify({
          scenario: scenario.name,
          variant: variant.name,
          trace: records.at(-1).trace,
          gate: records.at(-1).gate.invocations,
          endDay: records.at(-1).endDay,
        }),
      );
      await cdp.detach();
    } finally {
      await session?.close();
      await runner.close();
    }
  }
}
console.log(
  JSON.stringify(
    {
      gameSha256: hash(sourceGame),
      cGameSha256: hash(await readFile(cGame)),
      settingsPath,
      records: records.length,
      output: resolve(outDirectory, "trace-counts.json"),
    },
    null,
    2,
  ),
);
