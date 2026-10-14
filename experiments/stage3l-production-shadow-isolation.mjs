import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "test-artifacts/benchmark/tmp/stage3l");
const reportPath = path.join(
  root,
  "experiments/stage3l-production-shadow-isolation-report.json",
);
const savePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const baselineBundle = path.join(outputDir, "afc4598e-production.user.js");
const currentBundle = path.join(outputDir, "current-production.user.js");
await mkdir(outputDir, { recursive: true });
await writeFile(
  baselineBundle,
  execFileSync("git", ["show", "afc4598e:evolve_automation.user.js"], {
    cwd: root,
    maxBuffer: 10_000_000,
  }),
);
await writeFile(
  currentBundle,
  await readFile(path.join(root, "evolve_automation.user.js")),
);

const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const saveText = await readFile(savePath, "utf8");
const effectiveSettings = {
  ...JSON.parse(await readFile(settingsPath, "utf8")),
  autoResearch: true,
};
const runner = await createChromiumRunner({
  game: gamePath,
  upstream: "D:/work/Evolve-DeadSpace",
});

async function replay(bundle) {
  const session = await runner.openSession({
    bundle,
    save: parseSave(saveText),
    settings: effectiveSettings,
    seed: 42,
    epoch: "2026-09-21T00:00:00.000Z",
    perf: true,
    forwardPerfSummary: true,
    nativeTrace: true,
    manaTrace: true,
  });
  try {
    await session.advance(200);
    const [state, diagnostics] = await Promise.all([
      session.readState(),
      session.diagnostics(),
    ]);
    const gather = diagnostics.nativeInvocations ?? [];
    const researchDrawCounts = Object.fromEntries(
      (diagnostics.perfSummaries ?? []).flatMap(([, , values]) =>
        Object.entries(values ?? {}).filter(
          ([name]) =>
            name.includes("research.catalog") ||
            name.includes("research.observation.sample"),
        ),
      ),
    );
    return {
      exportSha256: hash(JSON.stringify(state)),
      gatherClicks: gather.length,
      gatherManaSpent: gather.reduce(
        (total, event) => total + Math.max(0, -event.manaDelta),
        0,
      ),
      gatherTraceSha256: hash(JSON.stringify(gather)),
      researchDrawCounts,
      errors: diagnostics.errors ?? [],
    };
  } finally {
    await session.close();
  }
}

try {
  const baseline = await replay(baselineBundle);
  const current = await replay(currentBundle);
  assert.deepEqual(
    current,
    baseline,
    "production replay changed after shadow removal",
  );
  assert.deepEqual(current.errors, []);
  const report = {
    stage: "3L-production-shadow-isolation",
    baselineRevision: "afc4598e",
    periods: 200,
    inputs: {
      saveSha256: hash(saveText),
      effectiveSettingsSha256: hash(JSON.stringify(effectiveSettings)),
      seed: 42,
      epoch: "2026-09-21T00:00:00.000Z",
    },
    productionReplayEqual: true,
    baseline,
    current,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await runner.close();
}
