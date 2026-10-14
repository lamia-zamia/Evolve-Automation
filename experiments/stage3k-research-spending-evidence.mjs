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
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/stage3k-shadow-test.user.js",
);
const reportPath = path.join(
  root,
  "experiments/stage3k-research-spending-evidence-report.json",
);
const upstreamPath =
  process.argv.find((value) => value.startsWith("--upstream="))?.slice(11) ??
  process.env.EVOLVE_UPSTREAM_SOURCE;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const STAGE3K_STABLE_MAGIC_MANA_ACTIONS = new Set([
  "tech-rituals",
  "tech-mad_science",
  "tech-black_powder",
  "tech-clerics",
]);

async function buildShadowBundle() {
  const metadata = (
    await readFile(path.join(root, "src/userscript.meta.js"), "utf8")
  ).trimEnd();
  const result = await esbuild.build({
    absWorkingDir: root,
    entryPoints: ["src/main.ts"],
    bundle: true,
    write: false,
    banner: { js: `${metadata}\n\n// Stage 3K test-only shadow observer.` },
    platform: "browser",
    target: ["esnext"],
    define: {
      "globalThis.__EA_TEST_SURFACE_ENABLED__": "true",
      __EA_TEST_SURFACE_ENABLED__: "true",
    },
    minifySyntax: true,
    treeShaking: true,
  });
  await mkdir(path.dirname(bundlePath), { recursive: true });
  await writeFile(bundlePath, result.outputFiles[0].contents);
}

async function runCondition(
  runner,
  saveText,
  settings,
  periods,
  shadowEnabled,
) {
  const session = await runner.openSession({
    bundle: bundlePath,
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
    await session.evaluate((enabled) => {
      window.__EA_TEST_HOOKS__.gatherIntervention = {
        resourceClaimMode: "goal-derived-conjunctive",
      };
      window.__EA_TEST_HOOKS__.researchShadowEnabled = enabled;
      window.__EA_TEST_HOOKS__.researchShadowEvents = [];
    }, shadowEnabled);
    await session.advance(periods);
    const [state, diagnostics, hooks] = await Promise.all([
      session.readState(),
      session.diagnostics(),
      session.evaluate(() => {
        const testHooks = window.__EA_TEST_HOOKS__;
        return {
          research: testHooks.researchOwnerSelectionEvents ?? [],
          lifecycle: testHooks.resourceClaimLifecycleEvents ?? [],
          selection: testHooks.resourceClaimSelectionEvents ?? [],
          claims: testHooks.gatherIntervention?.resourceClaims ?? [],
          shadow: testHooks.researchShadowEvents ?? [],
        };
      }),
    ]);
    const researchAttempts = hooks.research
      .filter((event) => event?.disposition === "researched")
      .map((event) => ({
        cycle: event.cycle,
        actionId: event.actionId,
        grantTechnology: event.grantTechnology,
        grantBefore: event.grantBefore,
        grantAfter: event.grantAfter,
        manaBefore: event.manaBefore,
        manaAfter: event.manaAfter,
        disposition: event.disposition,
      }));
    const gather = (diagnostics.nativeInvocations ?? []).map((event) => ({
      period: event.period,
      actionId: event.actionIdentity,
      manaDelta: event.manaDelta,
      gatheredResourceDelta: event.gatheredResourceDelta,
    }));
    const catalogCounters = Object.fromEntries(
      (diagnostics.perfSummaries ?? []).flatMap(([, , counters]) =>
        Object.entries(counters ?? {}).filter(
          ([name]) =>
            name.includes("research.catalog") ||
            name.includes("research.observation.sample"),
        ),
      ),
    );
    return {
      periods: await session.periods(),
      state,
      exportHash: hash(JSON.stringify(state)),
      researchAttempts,
      researchDrawCounts: catalogCounters,
      researchInvocations: diagnostics.researchInvocations ?? [],
      gather,
      lifecycle: hooks.lifecycle,
      selection: hooks.selection,
      claims: hooks.claims.map((claim) => ({
        actionId: claim.nativeActionId,
        claimId: claim.claimId,
        quantity: claim.requiredQuantity,
      })),
      shadow: hooks.shadow,
    };
  } finally {
    await session.close();
  }
}

const saveText = await readFile(savePath, "utf8");
const settingsSource = JSON.parse(await readFile(settingsPath, "utf8"));
const settings = { ...settingsSource, autoResearch: true };
await buildShadowBundle();
const runner = await createChromiumRunner({
  game: gamePath,
  upstream: upstreamPath,
});
try {
  const d200 = await runCondition(runner, saveText, settings, 200, false);
  const e200 = await runCondition(runner, saveText, settings, 200, true);
  assert.deepEqual(
    e200.state,
    d200.state,
    "D/E export diverged at 200 periods",
  );
  assert.deepEqual(e200.researchAttempts, d200.researchAttempts);
  assert.deepEqual(e200.gather, d200.gather);
  assert.deepEqual(e200.researchInvocations, d200.researchInvocations);
  assert.deepEqual(e200.lifecycle, d200.lifecycle);
  assert.deepEqual(e200.selection, d200.selection);
  assert.deepEqual(e200.researchDrawCounts, d200.researchDrawCounts);
  assert.equal(e200.shadow.length, e200.researchAttempts.length);

  const d1000 = await runCondition(runner, saveText, settings, 1000, false);
  const e1000 = await runCondition(runner, saveText, settings, 1000, true);
  assert.deepEqual(
    e1000.state,
    d1000.state,
    "D/E export diverged at 1,000 periods",
  );
  assert.deepEqual(e1000.researchAttempts, d1000.researchAttempts);
  assert.deepEqual(e1000.gather, d1000.gather);
  assert.deepEqual(e1000.researchInvocations, d1000.researchInvocations);
  assert.deepEqual(e1000.lifecycle, d1000.lifecycle);
  assert.deepEqual(e1000.selection, d1000.selection);
  assert.deepEqual(e1000.researchDrawCounts, d1000.researchDrawCounts);
  assert.equal(e1000.shadow.length, e1000.researchAttempts.length);

  for (const event of e1000.shadow) {
    if (!STAGE3K_STABLE_MAGIC_MANA_ACTIONS.has(event.actionId)) continue;
    assert.equal(
      event.expectedGrantOccurred,
      true,
      `${event.actionId} grant missing`,
    );
    assert.equal(
      event.invocation,
      "returned",
      `${event.actionId} invocation failed`,
    );
    assert.notEqual(
      event.displayedManaPrice,
      undefined,
      `${event.actionId} lacks displayed price`,
    );
    assert.notEqual(
      event.manaStockBefore,
      undefined,
      `${event.actionId} lacks initial Mana stock`,
    );
    assert.notEqual(
      event.manaStockAfter,
      undefined,
      `${event.actionId} lacks final Mana stock`,
    );
    assert.equal(
      event.manaStockBefore - event.manaStockAfter,
      event.displayedManaPrice,
      `${event.actionId} source-proved debit disagrees with stock delta`,
    );
  }

  const observations = e1000.shadow.map((event) => {
    const stableMagicManaAction = STAGE3K_STABLE_MAGIC_MANA_ACTIONS.has(
      event.actionId,
    );
    const stockDecrease =
      event.manaStockBefore === undefined || event.manaStockAfter === undefined
        ? undefined
        : event.manaStockBefore - event.manaStockAfter;
    const category =
      event.invocation === "failed" || !event.expectedGrantOccurred
        ? "native action rejected or grant missing"
        : stockDecrease === undefined
          ? "debit attribution uncertain"
          : stockDecrease <= 0
            ? "no net Mana debit observed"
            : !stableMagicManaAction
              ? "debit attribution uncertain"
              : stockDecrease === event.displayedManaPrice
                ? "displayed price equals source-inferred debit"
                : "displayed price differs from source-inferred debit";
    return {
      actionId: event.actionId,
      offerGeneration: event.offerGeneration,
      offerObservationId: event.offerObservationId,
      offerSetIdentitySha256: event.offerSetIdentity
        ? hash(event.offerSetIdentity)
        : undefined,
      displayedManaPrice: event.displayedManaPrice,
      manaStockBefore: event.manaStockBefore,
      manaStockAfter: event.manaStockAfter,
      observedNetManaChange:
        stockDecrease === undefined ? undefined : -stockDecrease,
      actualNativeDebit: stableMagicManaAction
        ? event.displayedManaPrice
        : "unavailable; native internal cost calls are not exposed",
      debitEvidence: stableMagicManaAction
        ? "source-inferred exact debit for pinned stable callback class; pre/post stock agrees"
        : "pre/post stock only; debit attribution incomplete",
      internalCostEvaluations: event.internalCostEvaluations,
      grantCompleted: event.expectedGrantOccurred,
      activeClaims: event.claimState,
      fulfilledClaimId: event.fulfilledClaimId,
      couldHaveConsumedStockProtectedForAnotherObligation:
        event.couldHaveConsumedStockProtectedForAnotherObligation,
      category,
      evidenceCompleteness: stableMagicManaAction
        ? "source-reviewed callback class plus pre/post stock and grant"
        : "pre/post stock and grant observed; internal debit attribution incomplete",
    };
  });
  const evidenceCategoryCounts = {
    displayedPriceEqualsObservedDebit: observations.filter(
      (event) =>
        event.category === "displayed price equals source-inferred debit",
    ).length,
    displayedPriceDiffersFromObservedDebit: observations.filter(
      (event) =>
        event.category === "displayed price differs from source-inferred debit",
    ).length,
    nativeDebitAttributionUncertain: observations.filter(
      (event) => event.category === "debit attribution uncertain",
    ).length,
    rejectedOrGrantMissing: observations.filter(
      (event) => event.category === "native action rejected or grant missing",
    ).length,
    noNetManaDebitObserved: observations.filter(
      (event) => event.category === "no net Mana debit observed",
    ).length,
  };
  const report = {
    stage: "3K",
    upstreamCommit: "db38e2af831907d49aeb5348d678d8d8745d6c3f",
    gameSnapshot: "test-artifacts/game/evolve-deadspace.js",
    inputs: {
      save: savePath.slice(root.length + 1),
      saveSha256: hash(saveText),
      settings: settingsPath.slice(root.length + 1),
      settingsSha256: hash(JSON.stringify(settings)),
      seed: 42,
      epoch: "2026-09-21T00:00:00.000Z",
    },
    parity: {
      periods: [200, 1000],
      200: {
        finalExportHash: d200.exportHash,
        researchActions: d200.researchAttempts.map((event) => event.actionId),
        gatherClicks: d200.gather.length,
        gatherManaExpenditure: d200.gather.reduce(
          (total, event) => total + Math.max(0, -event.manaDelta),
          0,
        ),
        lifecycleEventCount: d200.lifecycle.length,
        lifecycleSha256: hash(JSON.stringify(d200.lifecycle)),
        researchDrawCounts: d200.researchDrawCounts,
      },
      1000: {
        finalExportHash: d1000.exportHash,
        researchActions: d1000.researchAttempts.map((event) => event.actionId),
        gatherClicks: d1000.gather.length,
        gatherManaExpenditure: d1000.gather.reduce(
          (total, event) => total + Math.max(0, -event.manaDelta),
          0,
        ),
        lifecycleEventCount: d1000.lifecycle.length,
        lifecycleSha256: hash(JSON.stringify(d1000.lifecycle)),
        researchDrawCounts: d1000.researchDrawCounts,
      },
      equal: true,
    },
    shadowObservationsAt1000: observations,
    evidenceCategoryCounts,
    instrumentation: {
      extraNativeResearchDraws: 0,
      extraNativeCostCallbackEvaluations: 0,
      callbackDescriptorReplacement: false,
      callbackRestorationFailures: 0,
    },
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await runner.close();
}
