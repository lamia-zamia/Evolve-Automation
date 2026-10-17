import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const toolsRoot = resolve(
  process.env.EA_TOOLS_ROOT ?? resolve(root, "../Evolve-Automation/tools"),
);
const { createChromiumRunner, parseSave } = await import(
  pathToFileURL(resolve(toolsRoot, "chromium-evolve-runner.mjs"))
);
const sourceRoot = resolve(root, "../Evolve-Automation");
const fixturesRoot = resolve(sourceRoot, "test-artifacts");
const game = resolve(
  option("game", resolve(fixturesRoot, "game/evolve-deadspace.js")),
);
const settingsPath = resolve(
  option(
    "settings",
    resolve(
      fixturesRoot,
      "benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
    ),
  ),
);
const scenarios = {
  late: resolve(
    option(
      "late-save",
      resolve(
        fixturesRoot,
        "benchmark/slice0/saves/deadspace-late-2026-10-12.txt",
      ),
    ),
  ),
  mid: resolve(
    option(
      "mid-save",
      resolve(
        fixturesRoot,
        "benchmark/slice0/saves/stage2f-through-7600-export.json",
      ),
    ),
  ),
};
const baseline = resolve(
  option("baseline", "test-artifacts/perf-profile/p6-baseline.user.js"),
);
const candidate = resolve(option("candidate", "evolve_automation.user.js"));
const periods = Number(option("periods", "1600"));
const warmup = Number(option("warmup", "600"));
const seed = Number(option("seed", "42"));
const output = resolve(
  option("out", "test-artifacts/perf-profile/p6-exact-parity.json"),
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const withoutAvailability = (usage) =>
  Object.fromEntries(
    Object.entries(usage).filter(([key]) => !key.endsWith(".on_cap")),
  );
const availabilityUsage = (usage) =>
  Object.fromEntries(
    Object.entries(usage).filter(([key]) => key.endsWith(".on_cap")),
  );
assert(Number.isInteger(warmup) && warmup >= 0);
assert(Number.isInteger(periods) && periods > warmup);
assert.equal(
  (periods - warmup) % 8,
  0,
  "measured window must align to work ticks",
);

const settings = JSON.parse(await readFile(settingsPath, "utf8"));
settings.autoPrestige = false;
const runner = await createChromiumRunner({ game });
const result = {
  gameSnapshot: runner.inputs.gameSnapshot,
  browser: runner.browser.version,
  baselineSha256: hash(await readFile(baseline)),
  candidateSha256: hash(await readFile(candidate)),
  warmupPeriods: warmup,
  measuredPeriods: periods - warmup,
  fixtures: [],
};

async function run(bundle, save) {
  const session = await runner.openSession({ bundle, save, settings, seed });
  try {
    await session.advance(warmup);
    await session.advance(periods - warmup);
    const [state, exportText, diagnostics] = await Promise.all([
      session.readState(),
      session.exportSave(),
      session.diagnostics(),
    ]);
    return {
      state,
      exportSha256: hash(exportText),
      controlUsage: diagnostics.controlUsage,
      diagnostics,
    };
  } finally {
    await session.close();
  }
}

try {
  for (const [name, savePath] of Object.entries(scenarios)) {
    const save = parseSave(await readFile(savePath, "utf8"));
    const [baselineA, baselineB, candidateRun] = await Promise.all([
      run(baseline, save),
      run(baseline, save),
      run(candidate, save),
    ]);
    assert.deepEqual(baselineA.state, baselineB.state, `${name} A/A export`);
    assert.deepEqual(
      baselineA.controlUsage,
      baselineB.controlUsage,
      `${name} A/A controls`,
    );
    assert.deepEqual(
      candidateRun.state,
      baselineA.state,
      `${name} candidate export`,
    );
    assert.deepEqual(
      withoutAvailability(candidateRun.controlUsage),
      withoutAvailability(baselineA.controlUsage),
      `${name} non-availability native controls`,
    );
    for (const [label, arm] of [
      ["baseline-A", baselineA],
      ["baseline-B", baselineB],
      ["candidate", candidateRun],
    ]) {
      assert.equal(
        arm.diagnostics.captureComplete,
        true,
        `${name} ${label} capture`,
      );
      assert.equal(
        arm.diagnostics.events.filter(({ kind }) =>
          ["error", "pageerror", "rejection"].includes(kind),
        ).length,
        0,
        `${name} ${label} errors`,
      );
    }
    result.fixtures.push({
      name,
      saveSha256: hash(await readFile(savePath)),
      baselineExportSha256: baselineA.exportSha256,
      candidateExportSha256: candidateRun.exportSha256,
      exactExportEqual: baselineA.exportSha256 === candidateRun.exportSha256,
      nonAvailabilityControlUsageEqual: true,
      captureComplete: true,
      errors: 0,
      workTicks: (periods - warmup) / 8,
      controlUsage: candidateRun.controlUsage,
      baselineAvailabilityUsage: availabilityUsage(baselineA.controlUsage),
      candidateAvailabilityUsage: availabilityUsage(candidateRun.controlUsage),
    });
  }
} finally {
  await runner.close();
}

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
