import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/p18-standard-human-fixture.txt",
);
const settingsPath = path.join(
  root,
  "experiments/p18-standard-human-settings.json",
);
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const metadataPath = path.join(root, "src/userscript.meta.js");
const outputPath = path.join(
  root,
  "experiments/p32-live-allocation-authority-evidence.json",
);
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p32-live-allocation-authority.user.js",
);
const epoch = "2026-09-21T00:00:00.000Z";
const seed = 44;
const periods = 5_000;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const [fixtureText, settingsText, gameBytes, metadata] = await Promise.all([
  readFile(fixturePath, "utf8"),
  readFile(settingsPath, "utf8"),
  readFile(gamePath),
  readFile(metadataPath, "utf8"),
]);
const settings = JSON.parse(settingsText);
assert.equal(settings.buildingAlwaysClick, false);
assert.equal(settings.autoBuild, true);

await mkdir(path.dirname(bundlePath), { recursive: true });
const build = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata.trimEnd()}\nwindow.__EA_TEST_HOOKS__ = { ...(window.__EA_TEST_HOOKS__ ?? {}), p32LiveAuthority: [], gatherIntervention: {}, constructionAllocationShadowBudgets: { perCycle: 5, perTargetEpisode: 80, totalEpisode: 140 } };`,
  },
  platform: "browser",
  target: ["esnext"],
  define: {
    "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
    __EA_TEST_SURFACE_ENABLED__: "true",
  },
  minifySyntax: true,
  treeShaking: true,
});
await writeFile(bundlePath, build.outputFiles[0].contents);

const runner = await createChromiumRunner({ game: gamePath });
let session;
try {
  const save = parseSave(fixtureText);
  save.settings.expose = true;
  session = await runner.openSession({
    bundle: bundlePath,
    save,
    settings,
    seed,
    epoch,
    nativeTrace: false,
  });
  for (let elapsed = 0; elapsed < periods; elapsed += 250)
    await session.advance(Math.min(250, periods - elapsed));

  const observed = await session.evaluate(() => ({
    period: window.__EA_RUNNER__?.periods?.() ?? null,
    summary: window.__EA_TEST_HOOKS__?.p32LiveAuthoritySummary ?? null,
    records: window.__EA_TEST_HOOKS__?.p32LiveAuthority ?? [],
    gatherIntervention: window.__EA_TEST_HOOKS__?.gatherIntervention ?? null,
  }));
  const records = observed.records;
  const positive = records.find((entry) => entry.shadow?.authorized === true);
  const publishedRecords = records.filter(
    (entry) =>
      !entry.shadow?.reasons?.includes("incomplete-ordering-publication"),
  );
  for (let index = 1; index < publishedRecords.length; index += 1) {
    assert.ok(
      publishedRecords[index].orderingGeneration >
        publishedRecords[index - 1].orderingGeneration,
      "each successful pre-Gather publication advances its own ordering generation",
    );
    assert.equal(
      publishedRecords[index].phase,
      "pre-Gather",
      "the order generation remains tied to the pre-Gather phase",
    );
  }
  const report = {
    implementationCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    pinnedGame: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
    fixture:
      "test-artifacts/benchmark/slice0/saves/p18-standard-human-fixture.txt",
    fixtureSha256: hash(fixtureText),
    settings: "experiments/p18-standard-human-settings.json",
    settingsSha256: hash(JSON.stringify(settings)),
    gameSha256: hash(gameBytes),
    testBundleSha256: hash(build.outputFiles[0].contents),
    periodsRequested: periods,
    periodObserved: observed.period,
    spendingRequested: false,
    shadowPolicyRequestPresent: false,
    budgetsObserved: { perCycle: 5, perTargetEpisode: 80, totalEpisode: 140 },
    summary: observed.summary,
    retainedSuccessfulPublicationCount: publishedRecords.length,
    orderingGenerationMonotonic: publishedRecords.every(
      (entry, index) =>
        index === 0 ||
        entry.orderingGeneration >
          publishedRecords[index - 1].orderingGeneration,
    ),
    positiveAuthority: positive ?? null,
    recentRecords: records,
    measurement: {
      scope:
        "test-only ordering stamp, snapshot publication, shadow evaluation",
      nativeControlCalls: observed.summary?.extraNativeControlCalls ?? null,
      nativeCatalogOrPriceProbes:
        observed.summary?.extraNativeCatalogOrPriceProbes ?? null,
      aggregateElapsedMs: observed.summary?.elapsedMs ?? null,
      meanElapsedMs:
        observed.summary?.evaluations > 0
          ? observed.summary.elapsedMs / observed.summary.evaluations
          : null,
    },
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  assert.equal(
    observed.period,
    periods,
    "the authentic fixture reached the requested period",
  );
  assert.ok(
    observed.summary?.evaluations > 0,
    "live ordering boundaries were shadow-checked",
  );
  assert.equal(report.spendingRequested, false);
  process.stdout.write(
    `${JSON.stringify({
      period: report.periodObserved,
      summary: report.summary,
      positive: positive && {
        period: positive.period ?? null,
        workCycleId: positive.workCycleId,
        orderingGeneration: positive.orderingGeneration,
        target: positive.target,
      },
      evidencePath: path.relative(root, outputPath).replaceAll("\\", "/"),
    })}\n`,
  );
} finally {
  await session?.close();
  await runner.close();
}
