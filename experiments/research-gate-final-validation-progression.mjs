import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i], process.argv[i + 1]);
const required = (n) => {
  const v = args.get(`--${n}`);
  if (!v) throw new Error(`missing --${n}`);
  return resolve(v);
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
const settings = await readFile(required("settings"), "utf8"),
  game = required("game"),
  out = required("out");
const scenarios = [
    ["early", required("early")],
    ["mid", required("mid")],
    ["late", required("late")],
  ],
  arms = [
    ["A", required("a-bundle")],
    ["B2", required("b2-bundle")],
  ],
  checkpoints = [1000, 2000, 3000, 4000],
  warmup = 400;
const records = [];
const summarize = (state) => ({
  day: state.stats?.days,
  reset: state.stats?.reset,
  tech: { ...state.tech },
  milestones: Object.fromEntries(
    [
      "mad",
      "blackhole",
      "ascend",
      "portals",
      "bioseed",
      "cataclysm",
      "universes",
    ].map((k) => [k, state.stats?.[k]]),
  ),
  resources: Object.fromEntries(
    Object.entries(state.resource ?? {}).map(([id, r]) => [id, r?.amount]),
  ),
  queue: state.queue,
  researchQueue: state.r_queue,
  city: state.city,
});
async function researchUi(session) {
  return await session.evaluate(() => {
    const tab = Array.from(
      document.querySelectorAll("#mainTabs .tabs li"),
    ).find((t) => /research/i.test(t.textContent ?? ""));
    tab?.querySelector("a")?.click();
    const rows = (selector) =>
      Array.from(document.querySelectorAll(selector), (row) => ({
        id: row.id,
        classes: row.className,
        price: Object.fromEntries(
          Array.from(row.querySelector(".button")?.attributes ?? [])
            .filter((a) => a.name.startsWith("data-"))
            .map((a) => [a.name, a.value]),
        ),
      }));
    return {
      foundResearchTab: tab !== undefined,
      offers: rows("#tech .action"),
      granted: rows("#oldTech .action"),
    };
  });
}
for (const [scenario, savePath] of scenarios) {
  for (const [arm, bundle] of arms) {
    const runner = await createChromiumRunner({
      game,
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
      const initial = await session.readState(),
        initialTech = { ...initial.tech };
      const points = [];
      let prior = 0;
      for (const checkpoint of checkpoints) {
        await session.advance(checkpoint - prior);
        prior = checkpoint;
        const state = await session.readState(),
          ui = await researchUi(session);
        const changes = Object.entries(state.tech ?? {})
          .filter(([id, level]) => level !== initialTech[id])
          .map(([id, level]) => ({
            id,
            from: initialTech[id] ?? 0,
            to: level,
          }));
        const diagnostics = await session.diagnostics();
        const cycle = (diagnostics.callbackDurationsMs ?? [])
          .filter(
            (s) =>
              s.period > warmup + checkpoint - 1000 &&
              s.period <= warmup + checkpoint &&
              s.period % 8 === 0,
          )
          .map((s) => s.durationMs)
          .sort((a, b) => a - b);
        const p = (p) =>
          cycle[Math.min(cycle.length - 1, Math.ceil(cycle.length * p) - 1)] ??
          null;
        points.push({
          periods: checkpoint,
          state: summarize(state),
          techChanges: changes,
          researchUi: ui,
          cycle: {
            count: cycle.length,
            p50: p(0.5),
            p95: p(0.95),
            p99: p(0.99),
            max: cycle.at(-1) ?? null,
          },
        });
      }
      const diagnostics = await session.diagnostics();
      records.push({
        scenario,
        arm,
        warmup,
        measuredPeriods: 4000,
        initial: summarize(initial),
        checkpoints: points,
        diagnostics: diagnostics.counts,
        controlUsage: diagnostics.controlUsage,
      });
      await mkdir(dirname(out), { recursive: true });
      await writeFile(
        out,
        JSON.stringify(
          {
            runner: "exact chromium",
            seed: 42,
            settings: required("settings"),
            records,
          },
          null,
          2,
        ) + "\n",
      );
      console.log(
        JSON.stringify({
          scenario,
          arm,
          day: points.at(-1).state.day,
          techChanges: points.at(-1).techChanges.length,
          offers: points.at(-1).researchUi.offers.length,
          granted: points.at(-1).researchUi.granted.length,
          errors: diagnostics.counts.error,
        }),
      );
    } finally {
      await session?.close();
      await runner.close();
    }
  }
}
