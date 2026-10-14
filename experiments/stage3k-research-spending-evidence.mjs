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
import { attestResearchManaDebit } from "../src/domain/progression/research-mana-attestation.ts";

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
function nativeManaMethod(source, actionId) {
  const actionOffset = source.indexOf(actionId);
  if (actionOffset < 0) return undefined;
  const methodOffset = source.indexOf("Mana()", actionOffset);
  const bodyStart = source.indexOf("{", methodOffset);
  if (methodOffset < 0 || bodyStart < 0) return undefined;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(methodOffset, index + 1);
    }
  }
  return undefined;
}
const normalizeFunctionText = (value) =>
  value
    ?.replaceAll('"', "'")
    .replaceAll(/\s+/gu, " ")
    .replaceAll(/\s*([{}])\s*/gu, "$1")
    .trim();
const magicModifierSnapshot = (state) => ({
  universe: state?.race?.universe,
  truePath: Boolean(state?.race?.truepath),
  loneSurvivor: Boolean(state?.race?.lone_survivor),
  kindlingKindred: Boolean(state?.race?.kindling_kindred),
  ironWood: Boolean(state?.race?.iron_wood),
  governance: state?.civic?.govern?.type,
  nexus: state?.tech?.nexus ?? 0,
  rogueMagic: state?.tech?.roguemagic ?? 0,
});
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
  assert.equal(
    d200.exportHash,
    "d683be0bf2a4ce69e407117388efdaa77ba3ca8bfafbf1f28cfbe13a8ee742cf",
  );
  assert.equal(d200.gather.length, 1700);
  assert.equal(
    d200.gather.reduce(
      (total, event) => total + Math.max(0, -event.manaDelta),
      0,
    ),
    183,
  );
  assert.equal(d200.gather[0]?.period, 72);

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
  assert.equal(d1000.gather.length, 8512);
  assert.equal(
    d1000.gather.reduce(
      (total, event) => total + Math.max(0, -event.manaDelta),
      0,
    ),
    1270,
  );
  assert.equal(d1000.state.tech?.high_tech, 2);
  assert.equal(d1000.state.tech?.explosives, 2);
  assert.deepEqual(
    d1000.researchAttempts
      .filter((event) =>
        ["tech-black_powder", "tech-dynamite"].includes(event.actionId),
      )
      .map(({ cycle, actionId }) => [cycle, actionId]),
    [
      [79, "tech-black_powder"],
      [80, "tech-dynamite"],
    ],
  );

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
      `${event.actionId} displayed price disagrees with observed stock delta`,
    );
    const callback = event.nativeManaCallback;
    assert.ok(
      ["observed", "stable"].includes(callback?.identityStatus),
      `${event.actionId} callback unavailable`,
    );
    assert.equal(callback?.actionId, event.actionId);
    assert.equal(
      callback?.nativeResearchObservationGeneration,
      event.offerGeneration,
    );
    assert.ok(callback?.actionIdentity !== undefined);
    assert.ok(callback?.costIdentity !== undefined);
    assert.ok(callback?.callbackIdentity !== undefined);
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
    const callback = event.nativeManaCallback;
    const debitAttestation = attestResearchManaDebit([
      {
        requirement: "upstream-runtime-identity",
        status: "unavailable",
        reason:
          "the unmodified page exposes no authoritative upstream commit identity",
      },
      {
        requirement: "native-action-binding",
        status:
          callback?.registryKey !== undefined &&
          callback.actionId === event.actionId
            ? "observed"
            : "unavailable",
        reason:
          "registry key and action ID are recorded, but the selected control object is not exposed",
      },
      {
        requirement: "offer-control-binding",
        status: "unavailable",
        reason:
          "offer and control generations do not prove object identity with the retained registry action",
      },
      {
        requirement: "mana-callback-identity",
        status:
          callback?.identityStatus === "observed" ? "observed" : "unavailable",
        reason:
          callback?.identityStatus === "observed"
            ? "descriptor-backed live callback identity observed; upstream module identity remains unbound"
            : callback?.reasons?.join("; ") ||
              "live callback identity unavailable",
      },
      {
        requirement: "cost-adjustment-chain",
        status: "unavailable",
        reason:
          "native modifier gates and captured multipliers are not atomically bound to the offer and debit",
      },
      {
        requirement: "debit-evaluation-stability",
        status: "unavailable",
        reason:
          "upstream reevaluates cost callbacks for quote, affordability, and debit",
      },
      {
        requirement: "current-route-and-progression",
        status:
          callback?.rootGeneration !== undefined && callback.progressionEpoch
            ? "observed"
            : "unavailable",
        reason:
          "root generation, progression epoch, and route are captured as context only",
      },
      {
        requirement: "observed-debit",
        status: stockDecrease === undefined ? "unavailable" : "observed",
        reason:
          stockDecrease === undefined
            ? "pre/post Mana stock delta is unavailable"
            : "pre/post Mana stock delta is observational and does not identify the internal debit",
      },
    ]);
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
      sourceInferredDebit: stableMagicManaAction
        ? event.displayedManaPrice
        : "unavailable; native internal cost calls are not exposed",
      nativeManaCallback: callback,
      callbackSourceSha256: callback?.callbackSource
        ? hash(callback.callbackSource)
        : undefined,
      liveCallbackIdentity: callback?.identityStatus ?? "unavailable",
      debitAttestation,
      debitEvidence: stableMagicManaAction
        ? "source-reviewed action ID; displayed price equals observed net stock decrease; live callback identity is unverified"
        : "pre/post stock only; debit attribution incomplete",
      internalCostEvaluations: event.internalCostEvaluations,
      grantCompleted: event.expectedGrantOccurred,
      activeClaims: event.claimState,
      fulfilledClaimId: event.fulfilledClaimId,
      couldHaveConsumedStockProtectedForAnotherObligation:
        event.couldHaveConsumedStockProtectedForAnotherObligation,
      category,
      evidenceCompleteness: stableMagicManaAction
        ? "source-reviewed action ID plus matching pre/post stock and grant; live callback identity unavailable"
        : "pre/post stock and grant observed; internal debit attribution incomplete",
    };
  });
  const pinnedSourceRoot = upstreamPath ?? "D:/work/Evolve-DeadSpace";
  const [pinnedSource, pinnedSnapshot] = await Promise.all([
    readFile(path.join(pinnedSourceRoot, "src/tech.js"), "utf8"),
    readFile(gamePath, "utf8"),
  ]);
  const callbackSourceComparisons = observations
    .filter((event) => STAGE3K_STABLE_MAGIC_MANA_ACTIONS.has(event.actionId))
    .map((event) => {
      const sourceMethod = nativeManaMethod(pinnedSource, event.actionId);
      const snapshotMethod = nativeManaMethod(pinnedSnapshot, event.actionId);
      const runtimeMethod = event.nativeManaCallback?.callbackSource;
      const normalizedSource = normalizeFunctionText(sourceMethod);
      const normalizedSnapshot = normalizeFunctionText(snapshotMethod);
      const normalizedRuntime = normalizeFunctionText(runtimeMethod);
      return {
        actionId: event.actionId,
        sourceSha256: sourceMethod ? hash(sourceMethod) : undefined,
        snapshotSha256: snapshotMethod ? hash(snapshotMethod) : undefined,
        runtimeSha256: runtimeMethod ? hash(runtimeMethod) : undefined,
        normalizedSourceMatchesSnapshot:
          normalizedSource !== undefined &&
          normalizedSource === normalizedSnapshot,
        normalizedRuntimeMatchesSource:
          normalizedRuntime !== undefined &&
          normalizedRuntime === normalizedSource,
        normalizedRuntimeMatchesSnapshot:
          normalizedRuntime !== undefined &&
          normalizedRuntime === normalizedSnapshot,
      };
    });
  const sourceAdjustmentAudit = [
    {
      stage: "truthAdjust",
      canChangeMana: true,
      decision:
        "reads True Path during adjustCosts; multiplier is captured by the wrapper, base callback runs later",
      fixtureEvidence:
        "Magic route context reports True Path false; no atomic quote-to-debit binding",
    },
    {
      stage: "loneAdjust",
      canChangeMana: true,
      decision:
        "reads Lone Survivor during adjustCosts; 0.28 multiplier is captured by the wrapper",
      fixtureEvidence:
        "save race is human with no Lone Survivor marker; live modifier state is not bound at debit",
    },
    {
      stage: "technoAdjust",
      canChangeMana: true,
      decision:
        "reads governance and calls technocracy effect during adjustCosts; rate depends on High Tech and is captured by the wrapper",
      fixtureEvidence:
        "save starts with anarchy; later quote/check/debit state is not atomically attested",
    },
    {
      stage: "nexusAdjust",
      canChangeMana: true,
      decision:
        "Nexus, Witch Hunter, and Rogue Magic gates and Nexus multiplier are read during adjustCosts; wrapped base callback runs later",
      fixtureEvidence:
        "save starts without Nexus/Rogue Magic levels; later callback and modifier inputs are not atomically attested",
    },
    {
      stage: "kindlingAdjust",
      canChangeMana: "conditional",
      decision:
        "only adjusts costs when the action has Lumber or Plywood and Kindling Kindred or Iron Wood is active",
      fixtureEvidence:
        "all four pinned action definitions have no Lumber or Plywood cost; excluded by source shape",
    },
    {
      stage: "quote-affordability-debit",
      canChangeMana: true,
      decision:
        "quote and affordability use adjusted callbacks; payCosts constructs them again, then checkCosts and debit evaluate the callback separately",
      fixtureEvidence:
        "the exact fixture observes quote and stock delta only; it does not bind callback results across these phases",
    },
    {
      stage:
        "bloatAdjust, inflationAdjust, extravagantAdjust, scienceAdjust, smolderAdjust, flierAdjust, pykreteAdjust, craftAdjust, dictatorAdjust, lMatAdjust, undergroundTradeAdjust, razedAdjust, rebarAdjust, heavyAdjust",
      canChangeMana: false,
      decision:
        "pinned source preserves Mana or transforms only other resource keys for these actions",
      fixtureEvidence: "source review only; not inferred from displayed prices",
    },
  ];
  assert.equal(
    new Set(callbackSourceComparisons.map((entry) => entry.actionId)).size,
    STAGE3K_STABLE_MAGIC_MANA_ACTIONS.size,
    "all four source-reviewed Mana callbacks must be observed",
  );
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
    stage: "3M",
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
    callbackSourceComparisons,
    sourceAdjustmentAudit,
    fixtureModifierSnapshots: {
      initial: magicModifierSnapshot(parseSave(saveText)),
      200: magicModifierSnapshot(d200.state),
      1000: magicModifierSnapshot(d1000.state),
    },
    callbackFingerprintLimits: [
      "Function text does not identify the upstream module or commit.",
      "Function text omits closure-captured values and imported dependencies.",
      "Function text does not bind adjustCosts wrappers or their captured multipliers.",
      "The quote, affordability check, and debit reevaluate callbacks at separate times.",
      "Only the pinned source and generated snapshot are available here; no alternate minified or deployed supported build is compared.",
    ],
    attestationDecision: {
      status: "unavailable",
      reason:
        "callback identity and source text are observed, but upstream identity, offer/control object binding, adjustment state, and quote-to-debit evaluation stability are not authoritative",
    },
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
