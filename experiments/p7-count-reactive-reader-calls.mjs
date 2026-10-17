import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const toolsRoot = resolve(
  process.env.EA_TOOLS_ROOT ?? resolve(root, "../Evolve-Automation/tools"),
);
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(resolve(toolsRoot, "chromium-evolve-runner.mjs"))
);
const baseline = JSON.parse(
  await readFile(
    resolve(root, "test-artifacts/perf-profile/p7-baseline.json"),
    "utf8",
  ),
);
const settingsPath =
  "D:/work/Evolve-Automation/test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json";
const scenarios = [
  {
    name: "late-many-owners",
    savePath:
      "D:/work/Evolve-Automation/test-artifacts/benchmark/slice0/saves/deadspace-late-2026-10-12.txt",
  },
  {
    name: "mid-pre-space",
    savePath:
      "D:/work/Evolve-Automation/test-artifacts/benchmark/slice0/saves/stage2f-through-7600-export.json",
  },
];
const bundlePath = resolve(
  root,
  "test-artifacts/perf-profile/p7-counted.user.js",
);
const counterSpecs = [
  ["readProperty", "function readProperty("],
  [
    "readCapturedActionAvailability",
    "function readCapturedActionAvailability(",
  ],
  [
    "readCapturedActionControlAvailabilityForTab",
    "function readCapturedActionControlAvailabilityForTab(",
  ],
  ["readCapturedResourceView", "function readCapturedResourceView("],
  ["resolveResourceId", "function resolveResourceId("],
  ["readStorageResources", "function readStorageResources("],
  ["tallyRecord", "function tallyRecord("],
  ["nativeCostReader.readCost", "readCost(actionId) {"],
];
let bundle = await readFile(resolve(root, "evolve_automation.user.js"), "utf8");
for (const [name, marker] of counterSpecs) {
  const start = bundle.indexOf(marker);
  if (start < 0 || bundle.indexOf(marker, start + marker.length) >= 0)
    throw new Error(`Expected one generated declaration for ${name}`);
  const openParen = start + marker.indexOf("(");
  let depth = 0;
  let closeParen = -1;
  for (let index = openParen; index < bundle.length; index += 1) {
    if (bundle[index] === "(") depth += 1;
    else if (bundle[index] === ")") {
      depth -= 1;
      if (depth === 0) {
        closeParen = index;
        break;
      }
    }
  }
  const body = closeParen < 0 ? -1 : bundle.indexOf("{", closeParen + 1);
  if (body < 0) throw new Error(`Missing function body for ${name}`);
  const increment = `\n      globalThis.__P7_READ_COUNTS__ ??= Object.create(null);\n      globalThis.__P7_READ_COUNTS__[${JSON.stringify(name)}] = (globalThis.__P7_READ_COUNTS__[${JSON.stringify(name)}] ?? 0) + 1;`;
  bundle = `${bundle.slice(0, body + 1)}${increment}${bundle.slice(body + 1)}`;
}
await writeFile(bundlePath, bundle, "utf8");

const settings = JSON.parse(await readFile(settingsPath, "utf8"));
settings.autoPrestige = false;
const runner = await createChromiumRunner({
  game: "D:/work/Evolve-Automation/test-artifacts/game/evolve-deadspace.js",
});
const results = [];
try {
  for (const scenario of scenarios) {
    const save = parseSave(await readFile(scenario.savePath, "utf8"));
    const session = await runner.openSession({
      bundle: bundlePath,
      save,
      settings,
      seed: 42,
    });
    try {
      await session.advance(600);
      await session.page.evaluate(() => {
        globalThis.__P7_READ_COUNTS__ = Object.create(null);
      });
      await session.advance(1000);
      const [counts, exported, diagnostics] = await Promise.all([
        session.page.evaluate(() => globalThis.__P7_READ_COUNTS__ ?? {}),
        session.exportSave(),
        session.diagnostics(),
      ]);
      const expected = baseline.rawProfiles.find(
        (run) => run.scenario === scenario.name,
      );
      const controlsMatch =
        JSON.stringify(diagnostics.controlUsage) ===
        JSON.stringify(expected?.metrics.controlUsage);
      const exportSha256 = createHash("sha256").update(exported).digest("hex");
      results.push({
        scenario: scenario.name,
        totalPeriods: 1600,
        measuredPeriods: 1000,
        warmup: 600,
        measurement: 1000,
        seed: 42,
        readCounts: counts,
        exportSha256,
        exportMatchesProfile: exportSha256 === expected?.metrics.exportSha256,
        controlsMatchProfile: controlsMatch,
        distinctControlKinds: Object.keys(diagnostics.controlUsage).length,
        counts: diagnostics.counts,
        events: diagnostics.events,
        dialogs: diagnostics.dialogs,
      });
    } finally {
      await session.close();
    }
  }
} finally {
  await runner.close();
}

const outPath = resolve(
  root,
  "test-artifacts/perf-profile/p7-reader-call-counts.json",
);
await writeFile(outPath, `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify({ outPath, results }, null, 2));
