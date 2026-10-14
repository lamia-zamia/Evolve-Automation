import assert from "node:assert/strict";
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
const savePath = path.join(
  root,
  "test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
);
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const outputDir = path.join(root, "test-artifacts/benchmark/tmp/stage3l");
const worktreeRoot = process.argv
  .find((value) => value.startsWith("--worktrees="))
  ?.slice(12);
const revisions = [
  "9bda12ac",
  "0804c8e0",
  "7cdb9352",
  "72eed04a",
  "4070e464",
  "afc4598e",
];
const runRevisions = process.argv.includes("--current-only")
  ? ["current"]
  : revisions;
const periods = Number(
  process.argv.find((value) => value.startsWith("--periods="))?.slice(10) ??
    200,
);
const reportPath = path.join(
  root,
  runRevisions[0] === "current"
    ? `experiments/stage3l-current-${periods}-report.json`
    : "experiments/stage3l-revision-regression-report.json",
);
assert.ok(
  (runRevisions.length === 1 && runRevisions[0] === "current") || worktreeRoot,
  "Pass --worktrees=<isolated worktree root>",
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const saveText = await readFile(savePath, "utf8");
const settings = {
  ...JSON.parse(await readFile(settingsPath, "utf8")),
  autoResearch: true,
};
const gameSnapshotSha256 = hash(await readFile(gamePath));
const gameSnapshotMetadata = JSON.parse(
  await readFile(`${gamePath}.json`, "utf8"),
);
const metadata = (
  await readFile(path.join(root, "src/userscript.meta.js"), "utf8")
).trimEnd();
await mkdir(outputDir, { recursive: true });

async function buildBundle(revision) {
  const worktree =
    revision === "current" ? root : path.join(worktreeRoot, revision);
  const bundle = path.join(outputDir, `${revision}.user.js`);
  const result = await esbuild.build({
    absWorkingDir: worktree,
    entryPoints: ["src/main.ts"],
    bundle: true,
    write: false,
    banner: { js: `${metadata}\n\n// Stage 3L historical lifecycle probe.` },
    platform: "browser",
    target: ["esnext"],
    define: {
      "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
      __EA_TEST_SURFACE_ENABLED__: "true",
    },
    minifySyntax: true,
    treeShaking: true,
  });
  await writeFile(bundle, result.outputFiles[0].contents);
  return { bundle, bundleSha256: hash(result.outputFiles[0].contents) };
}

async function runRevision(runner, revision, bundle) {
  const session = await runner.openSession({
    bundle,
    save: parseSave(saveText),
    settings,
    seed: 42,
    epoch: "2026-09-21T00:00:00.000Z",
    perf: true,
    forwardPerfSummary: true,
    nativeTrace: true,
    manaTrace: true,
  });
  try {
    await session.evaluate(() => {
      window.__EA_TEST_HOOKS__.gatherIntervention = {
        resourceClaimMode: "goal-derived-conjunctive",
      };
      window.__EA_TEST_HOOKS__.researchOwnerSelectionEvents = [];
      window.__EA_TEST_HOOKS__.resourceClaimLifecycleEvents = [];
      window.__EA_TEST_HOOKS__.resourceClaimSelectionEvents = [];
    });
    await session.advance(periods);
    const [state, diagnostics, hooks] = await Promise.all([
      session.readState(),
      session.diagnostics(),
      session.evaluate(() => {
        const h = window.__EA_TEST_HOOKS__;
        return {
          research: h.researchOwnerSelectionEvents ?? [],
          lifecycle: h.resourceClaimLifecycleEvents ?? [],
          selection: h.resourceClaimSelectionEvents ?? [],
          ledger: h.resourceClaimLedgerEvents ?? [],
          lifecycleEvidence: h.resourceClaimLifecycleEvidenceEvents ?? [],
          claims: h.gatherIntervention?.resourceClaims ?? [],
        };
      }),
    ]);
    const research = hooks.research.filter(
      (event) => event?.disposition === "researched",
    );
    const gather = diagnostics.nativeInvocations ?? [];
    const manaSpentByGather = gather.reduce(
      (total, event) => total + Math.max(0, -event.manaDelta),
      0,
    );
    const lifecycleByCycle = Object.fromEntries(
      Object.entries(
        Object.groupBy(hooks.lifecycle, (event) => event.cycle),
      ).map(([cycle, events]) => [
        cycle,
        events.map((event) => ({
          state: event.state,
          reason: event.reason,
          nativeActionIds: event.nativeActionIds,
          completedActionIds: event.completedActionIds,
          releasedActionIds: event.releasedActionIds,
          blockedActionIds: event.blockedActionIds,
          rootGeneration: event.rootGeneration,
          progressionGeneration: event.progressionGeneration,
          previousOfferObservationId: event.previousOfferObservationId,
          offerObservationId: event.offerObservationId,
          previousOfferSetSha256: event.previousOfferSetIdentity
            ? hash(event.previousOfferSetIdentity)
            : undefined,
          offerSetSha256: event.offerSetIdentity
            ? hash(event.offerSetIdentity)
            : undefined,
          offerBindingGenerations: event.offerBindingGenerations,
        })),
      ]),
    );
    const counters = Object.fromEntries(
      (diagnostics.perfSummaries ?? []).flatMap(([, , values]) =>
        Object.entries(values ?? {}).filter(
          ([name]) =>
            name.includes("research.catalog") ||
            name.includes("research.observation.sample"),
        ),
      ),
    );
    return {
      revision,
      exportSha256: hash(JSON.stringify(state)),
      research: research.map((event) => ({
        cycle: event.cycle,
        actionId: event.actionId,
        grantTechnology: event.grantTechnology,
        grantBefore: event.grantBefore,
        grantAfter: event.grantAfter,
        manaBefore: event.manaBefore,
        manaAfter: event.manaAfter,
      })),
      gather: {
        clicks: gather.length,
        manaSpent: manaSpentByGather,
        first: gather[0] ?? null,
        last: gather.at(-1) ?? null,
      },
      lifecycleByCycle,
      selection: hooks.selection,
      ledger: hooks.ledger,
      lifecycleEvidence: hooks.lifecycleEvidence,
      claims: hooks.claims,
      nativeResearchInvocations: diagnostics.researchInvocations ?? [],
      drawCounters: counters,
      errors: diagnostics.errors ?? [],
    };
  } finally {
    await session.close();
  }
}

const runner = await createChromiumRunner({
  game: gamePath,
  upstream: "D:/work/Evolve-DeadSpace",
});
try {
  const results = [];
  for (const revision of runRevisions) {
    const built = await buildBundle(revision);
    const result = await runRevision(runner, revision, built.bundle);
    results.push({ ...result, bundleSha256: built.bundleSha256 });
    console.log(
      JSON.stringify({
        revision,
        exportSha256: result.exportSha256,
        research: result.research,
        gatherClicks: result.gather.clicks,
        gatherManaSpent: result.gather.manaSpent,
        lifecycleCycles: Object.keys(result.lifecycleByCycle).length,
        ledgerEvents: result.ledger.length,
      }),
    );
  }
  const report = {
    stage: "3L-phase1",
    upstreamCommit: "db38e2af831907d49aeb5348d678d8d8745d6c3f",
    gameSnapshot: {
      path: gamePath,
      sha256: gameSnapshotSha256,
      metadata: gameSnapshotMetadata,
    },
    inputs: {
      save: savePath,
      saveSha256: hash(saveText),
      settings: settingsPath,
      effectiveSettingsSha256: hash(JSON.stringify(settings)),
      seed: 42,
      epoch: "2026-09-21T00:00:00.000Z",
      periods,
      runnerOptions: {
        perf: true,
        nativeTrace: true,
        manaTrace: true,
        forwardPerfSummary: true,
      },
      bundleDefinition:
        "Stage 3K shadow evidence experiment esbuild options; test surface enabled; D intervention with goal-derived-conjunctive claims; shadow disabled",
    },
    attribution: {
      firstRegressionRevision: "0804c8e0",
      firstDivergentWorkCycle: 9,
      firstStage3IGatherPeriod: results[0].gather.first?.period,
      laterRevisionGatherClicks: results
        .slice(1)
        .map((result) => [result.revision, result.gather.clicks]),
    },
    results,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`report=${reportPath}`);
} finally {
  await runner.close();
}
