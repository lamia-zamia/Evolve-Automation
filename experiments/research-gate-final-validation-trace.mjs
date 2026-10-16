import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { patchResearchSnapshot } from "./research-fast-scratch.mjs";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i], process.argv[i + 1]);
const required = (name) => {
  const value = args.get(`--${name}`);
  if (!value) throw new Error(`missing --${name}`);
  return resolve(value);
};
const toolsDir =
  process.env.EA_TOOLS_DIR ??
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../Evolve-Automation/tools",
  );
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(resolve(toolsDir, "chromium-evolve-runner.mjs")).href
);
const sourcePath = required("game");
const settingsPath = required("settings");
const settings = await readFile(settingsPath, "utf8");
const out = required("out");
const periods = Number(args.get("--periods") ?? 800);
const warmup = Number(args.get("--warmup") ?? 400);
const conditionCall = `    if (c_action["condition"] && !c_action.condition()) {\n      return false;\n    }`;
const instrumentedCall = `    if (c_action["condition"]) {\n      const trace = window.__EA_RESEARCH_DRAW_TRACE__;\n      if (trace) trace.conditionCalls += 1;\n      if (!c_action.condition()) return false;\n    }`;
const source = await readFile(sourcePath, "utf8");
if (source.split(conditionCall).length !== 2)
  throw new Error("pinned condition call not unique");
const traceGame = resolve(dirname(out), "trace-research-game.js");
await mkdir(dirname(out), { recursive: true });
const traceSource = patchResearchSnapshot(source, {
  suppressCompleted: false,
  instrument: true,
}).replace(conditionCall, instrumentedCall);
await writeFile(traceGame, traceSource);
await writeFile(
  `${traceGame}.json`,
  await readFile(`${sourcePath}.json`, "utf8"),
);
const scenarios = [
  ["early", required("early")],
  ["mid", required("mid")],
  ["late", required("late")],
];
const arms = [
  ["A", required("a-bundle")],
  ["B2", required("b2-bundle")],
];
const records = [];
for (const [scenario, savePath] of scenarios) {
  for (const [arm, bundle] of arms) {
    const runner = await createChromiumRunner({
      game: traceGame,
      upstream: "D:/work/Evolve-DeadSpace",
    });
    let session;
    try {
      session = await runner.openSession({
        bundle,
        save: parseSave(await readFile(savePath, "utf8")),
        settings,
        seed: 42,
      });
      await session.advance(warmup);
      const warmedState = await session.readState();
      const initialReset = warmedState.stats?.reset;
      if (scenario === "late" && (warmedState.stats?.days ?? 0) < 100_000)
        throw new Error(
          `late save left its measured era during warmup: ${warmedState.stats?.days}`,
        );
      await session.evaluate(() => {
        window.__EA_RESEARCH_DRAW_TRACE__ = {
          draws: 0,
          offers: 0,
          completed: 0,
          callbackCount: 0,
          completedCallbackMs: 0,
          conditionCalls: 0,
        };
        window.__EA_RESEARCH_GATE_FALLBACKS__ = 0;
        window.__EA_RESEARCH_GATE_EVENTS__ = [];
        window.__EA_TEST_HOOKS__ = {
          ...(window.__EA_TEST_HOOKS__ ?? {}),
          researchConditionGateFallback() {
            window.__EA_RESEARCH_GATE_FALLBACKS__ += 1;
          },
          researchConditionGate(event) {
            window.__EA_RESEARCH_GATE_EVENTS__.push(event);
          },
        };
      });
      await session.advance(periods);
      const trace = await session.evaluate(() => ({
        draw: window.__EA_RESEARCH_DRAW_TRACE__,
        gate: window.__EA_RESEARCH_GATE_EVENTS__ ?? [],
        fallbacks: window.__EA_RESEARCH_GATE_FALLBACKS__ ?? 0,
      }));
      const diagnostics = await session.diagnostics();
      const state = await session.readState();
      if (
        scenario === "late" &&
        ((state.stats?.days ?? 0) < 100_000 ||
          state.stats?.reset !== initialReset)
      )
        throw new Error(
          `late save left its measured era during sampling: ${state.stats?.days}`,
        );
      const gate = trace.gate;
      records.push({
        scenario,
        arm,
        periods,
        workTicks: periods / (JSON.parse(settings).tickRate ?? 8),
        day: state.stats?.days,
        draw: trace.draw,
        gate: {
          invocations: gate.length,
          installed: gate.reduce((sum, event) => sum + event.installed, 0),
          invoked: gate.reduce((sum, event) => sum + event.invoked, 0),
          restored: gate.reduce((sum, event) => sum + event.restored, 0),
          replacementRestored: gate.reduce(
            (sum, event) => sum + event.replacementRestored,
            0,
          ),
          restorationFailures: gate.reduce(
            (sum, event) => sum + event.restorationFailures,
            0,
          ),
          emptyScopes: gate.filter((event) => event.installed === 0).length,
        },
        fallbackCount: trace.fallbacks,
        diagnostics: diagnostics.counts,
      });
      await writeFile(
        out,
        `${JSON.stringify({ runner: "exact chromium", traceGame, warmup, periods, seed: 42, records }, null, 2)}\n`,
      );
      console.log(JSON.stringify(records.at(-1)));
    } finally {
      await session?.close();
      await runner.close();
    }
  }
}
