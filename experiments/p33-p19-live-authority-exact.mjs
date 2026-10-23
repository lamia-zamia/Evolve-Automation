import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import * as prettier from "prettier";

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
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p33-live-authority.user.js",
);
const evidencePath = path.join(
  root,
  "experiments/p33-p19-live-authority-evidence.json",
);
const fixtureSha256 =
  "2d2def2ecad5ae015c0dc825747da105bb90dbd0c405ed0ae5fe672755e0c684";
const seed = 44;
const epoch = "2026-09-21T00:00:00.000Z";
const checkpoints = [8, 48, 56, 64, 72, 96, 112, 272, 1_000, 5_000];
const hash = (value) => createHash("sha256").update(value).digest("hex");

const [fixtureText, settingsText, gameBytes, metadata] = await Promise.all([
  readFile(fixturePath, "utf8"),
  readFile(settingsPath, "utf8"),
  readFile(gamePath),
  readFile(metadataPath, "utf8"),
]);
const settings = JSON.parse(settingsText);
assert.equal(hash(fixtureText), fixtureSha256);
assert.equal(settings.buildingAlwaysClick, false);
assert.equal(settings.autoBuild, true);

await mkdir(path.dirname(bundlePath), { recursive: true });
const build = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata.trimEnd()}\nwindow.__EA_TEST_HOOKS__ = { ...(window.__EA_TEST_HOOKS__ ?? {}), constructionSavingTargetObservations: [], civilizationBootstrapEvents: [], civilizationHandoffEvents: [], p32LiveAuthority: [], readRunnerPeriod() { return window.__EA_RUNNER__?.periods?.() ?? null; }, captureConstructionSavingTargetForTest(target, authority) { this.constructionSavingTargetObservations.push({ period: window.__EA_RUNNER__?.periods?.() ?? null, target, authority }); } };`,
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

async function capture(session, period) {
  const [state, diagnostics, hooks] = await Promise.all([
    session.readState(),
    session.diagnostics(),
    session.evaluate(() => {
      const testHooks = window.__EA_TEST_HOOKS__;
      return {
        targets: testHooks?.constructionSavingTargetObservations ?? [],
        bootstrap: testHooks?.civilizationBootstrapEvents ?? [],
        handoff: testHooks?.civilizationHandoffEvents ?? [],
        shadow: testHooks?.p32LiveAuthority ?? [],
        summary: testHooks?.p32LiveAuthoritySummary ?? null,
      };
    }),
  ]);
  const species = state.race?.species;
  return {
    period,
    saveSha256: hash(await session.exportSave()),
    state: {
      race: state.race,
      days: state.stats?.days ?? null,
      starved: state.stats?.starved ?? null,
      deaths: state.stats?.died ?? null,
      population: state.resource?.[species]?.amount ?? null,
      resources: Object.fromEntries(
        ["Food", "Lumber", "Stone", "Money", "Knowledge"].map((id) => [
          id,
          state.resource?.[id]
            ? {
                amount: state.resource[id].amount,
                max: state.resource[id].max,
                diff: state.resource[id].diff ?? null,
              }
            : null,
        ]),
      ),
      buildings: Object.fromEntries(
        Object.entries(state.city ?? {})
          .filter(([, value]) => Number(value?.count) > 0)
          .map(([id, value]) => [id, value.count]),
      ),
      jobs: Object.fromEntries(
        Object.entries(state.civic ?? {})
          .filter(([, value]) => Number(value?.workers) > 0)
          .map(([id, value]) => [id, value.workers]),
      ),
    },
    controlUsage: diagnostics.controlUsage ?? {},
    nativeCalls: (diagnostics.nativeInvocations ?? [])
      .filter(
        (entry) =>
          entry.method === "action" &&
          (/^(undefined-food|city-lumber|undefined-stone)$/.test(
            entry.elementId ?? "",
          ) ||
            /^(tech-|city-)/.test(entry.elementId ?? "")),
      )
      .map(({ period: callPeriod, elementId }) => ({
        period: callPeriod,
        elementId,
      })),
    randomCalls: diagnostics.randomCalls,
    rngState: diagnostics.rngState,
    hooks,
  };
}

async function replay(arm) {
  const save = parseSave(fixtureText);
  const session = await runner.openSession({
    bundle: bundlePath,
    save,
    settings,
    seed,
    epoch,
    nativeTrace: true,
  });
  try {
    if (arm !== "A")
      await session.evaluate((shadowEnabled) => {
        const hooks = window.__EA_TEST_HOOKS__;
        hooks.gatherIntervention = {
          civilizationBootstrap: {
            authorized: true,
            authorizationId: "p19-human-candidate-1",
          },
          constructionHandoffEnabled: true,
          civilizationBootstrapObserver(event) {
            hooks.civilizationBootstrapEvents.push({
              period: window.__EA_RUNNER__?.periods?.() ?? null,
              ...event,
            });
          },
          civilizationHandoffObserver(event) {
            hooks.civilizationHandoffEvents.push({
              period: window.__EA_RUNNER__?.periods?.() ?? null,
              ...event,
            });
          },
        };
        if (shadowEnabled)
          hooks.constructionAllocationShadowBudgets = {
            perCycle: 5,
            perTargetEpisode: 80,
            totalEpisode: 140,
          };
      }, arm === "C");

    const captured = [];
    let elapsed = 0;
    for (const targetPeriod of checkpoints) {
      await session.advance(targetPeriod - elapsed);
      elapsed = targetPeriod;
      captured.push(await capture(session, targetPeriod));
    }
    const final = captured.at(-1);
    const allTargets = final.hooks.targets;
    const transitions = [];
    for (const entry of allTargets) {
      const previous = transitions.at(-1);
      if (
        !previous ||
        JSON.stringify(previous.target) !== JSON.stringify(entry.target)
      )
        transitions.push(entry);
    }
    return {
      arm,
      periods: 5_000,
      checkpoints: captured.map(({ hooks, ...checkpoint }) => ({
        ...checkpoint,
        targetObservationCount: hooks.targets.length,
        latestTargetObservation: hooks.targets.at(-1) ?? null,
        bootstrapEventCount: hooks.bootstrap.length,
        handoffEventCount: hooks.handoff.length,
        shadowSummary: hooks.summary,
      })),
      targetTransitions: transitions,
      bootstrapEvents: final.hooks.bootstrap,
      handoffEvents: final.hooks.handoff,
      shadowSummary: final.hooks.summary,
      shadowRecords: arm === "C" ? final.hooks.shadow : [],
      finalControlUsage: final.controlUsage,
      nativeCallsAtP5000: final.nativeCalls,
      rng: { calls: final.randomCalls, state: final.rngState },
    };
  } finally {
    await session.close();
  }
}

try {
  const arms = [];
  for (const arm of ["A", "B", "C"]) arms.push(await replay(arm));
  const [ordinary, p19, observed] = arms;
  const byPeriod = (arm) =>
    new Map(arm.checkpoints.map((item) => [item.period, item]));
  const p19Checkpoints = byPeriod(p19);
  const shadowCheckpoints = byPeriod(observed);
  let progressionChanged = false;
  let firstTargetAfterProgressionChange = null;
  let previousProgressionGeneration;
  for (const record of observed.shadowRecords) {
    if (
      previousProgressionGeneration !== undefined &&
      record.progressionGeneration !== previousProgressionGeneration
    )
      progressionChanged = true;
    if (progressionChanged && record.target) {
      firstTargetAfterProgressionChange = record;
      break;
    }
    previousProgressionGeneration = record.progressionGeneration;
  }
  const p19Parity = p19.checkpoints.map((checkpoint) => {
    const comparison = shadowCheckpoints.get(checkpoint.period);
    return {
      period: checkpoint.period,
      nativeCallsEqual:
        JSON.stringify(checkpoint.nativeCalls) ===
        JSON.stringify(comparison.nativeCalls),
      stateEqual:
        JSON.stringify(checkpoint.state) === JSON.stringify(comparison.state),
      controlUsageEqual:
        JSON.stringify(checkpoint.controlUsage) ===
        JSON.stringify(comparison.controlUsage),
      rngEqual:
        JSON.stringify(checkpoint.rngState) ===
          JSON.stringify(comparison.rngState) &&
        checkpoint.randomCalls === comparison.randomCalls,
      exportHashEqual: checkpoint.saveSha256 === comparison.saveSha256,
    };
  });
  const evidence = {
    implementationCommit: (await import("node:child_process"))
      .execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      })
      .trim(),
    pinnedGame: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
    gameSha256: hash(gameBytes),
    fixture:
      "test-artifacts/benchmark/slice0/saves/p18-standard-human-fixture.txt",
    fixtureSha256: hash(fixtureText),
    settings: "experiments/p18-standard-human-settings.json",
    settingsSha256: hash(JSON.stringify(settings)),
    testBundleSha256: hash(build.outputFiles[0].contents),
    seed,
    epoch,
    debugExposeSet: false,
    debugGlobalsUsed: false,
    p19Intervention: {
      source: "experiments/p19-civilization-bootstrap-exact.mjs",
      civilizationBootstrap: {
        authorized: true,
        authorizationId: "p19-human-candidate-1",
      },
      constructionHandoffEnabled: true,
      nativePolicyBudgetsChanged: false,
    },
    syntheticAdverseRegressions: [
      "target with no gatherable shortage",
      "non-gatherable Money cost unaffordable",
      "stale progression generation",
      "missing or replaced native Gather/target controls",
      "Build queue conflict",
      "reservation evidence unknown/conflicting",
      "active or unavailable handoff",
      "competing resource claim",
    ],
    checkpointsRequested: checkpoints,
    arms,
    p19VsShadowParity: p19Parity,
    policyRequestPresence: {
      armCRequests: observed.shadowRecords.filter(
        (record) => record.targetSelection?.policyRequestPresent === true,
      ).length,
      note: "counted independently from shadow eligibility; no allocation callback is installed",
    },
    authorityCounts: {
      positiveEligible: observed.shadowRecords.filter(
        (record) => record.shadow?.authorized,
      ).length,
      targetObservedRejected: observed.shadowRecords.filter(
        (record) => record.target && !record.shadow?.authorized,
      ).length,
      rejectionReasons: observed.shadowSummary?.rejectionReasons ?? {},
      firstPositive:
        observed.shadowRecords.find(
          (record) => record.target && record.shadow?.authorized,
        ) ?? null,
      firstProgressionStaleRejection:
        observed.shadowRecords.find((record) =>
          record.shadow?.reasons?.includes("stale-progression-generation"),
        ) ?? null,
      firstTargetAfterProgressionChange,
      firstRejectedTarget:
        observed.shadowRecords.find(
          (record) => record.target && !record.shadow?.authorized,
        ) ?? null,
    },
    measurement: {
      shadowInvocations: observed.shadowSummary?.shadowInvocations ?? null,
      reservationCapturePasses:
        observed.shadowSummary?.reservationCapturePasses ?? null,
      extraNativeCatalogOrPriceProbes:
        observed.shadowSummary?.extraNativeCatalogOrPriceProbes ?? null,
      unmeasuredCatalogOrPriceProbeCycles:
        observed.shadowSummary?.unmeasuredCatalogOrPriceProbeCycles ?? null,
      controlCallParity: p19Parity.every((entry) => entry.controlUsageEqual),
      priceSource:
        "the captured current pre-Gather Construction order; no independent execution-time native price probe is performed",
      reservationSource:
        "existing captured queue reservation authority; a nonempty queue may require native cost/catalog reads, counted above",
    },
  };
  assert.equal(ordinary.checkpoints.at(-1).period, 5_000);
  assert.equal(ordinary.checkpoints.at(-1).state.population, 0);
  assert.ok(
    ordinary.targetTransitions.every((entry) => entry.target === null),
    "ordinary P18 baseline remains the negative control with no Construction target",
  );
  assert.ok(
    p19.bootstrapEvents.some((event) => event.period === 8),
    "P19 startup bootstrap is installed and runs at p8",
  );
  assert.ok(
    p19.targetTransitions.some((entry) => entry.target?.name === "city-farm"),
    "P19 must publish a genuine Farm target",
  );
  assert.equal(
    p19.bootstrapEvents.length,
    10,
    "P19 must preserve its ten-click startup budget",
  );
  assert.ok(
    p19.bootstrapEvents.every((event) => event.period === 8),
    "P19 startup clicks retain their p8 timing",
  );
  assert.equal(
    p19.handoffEvents.length,
    10,
    "P19 must preserve its ten-click Construction handoff budget",
  );
  assert.ok(
    p19Parity.every(
      (entry) =>
        entry.nativeCallsEqual &&
        entry.stateEqual &&
        entry.controlUsageEqual &&
        entry.rngEqual &&
        entry.exportHashEqual,
    ),
    "the shadow must preserve P19 native and exported state at every checkpoint",
  );
  assert.ok(p19Checkpoints.has(5_000));
  const p19At5000 = p19Checkpoints.get(5_000).state;
  const p19ProgressionPreserved =
    p19At5000.population === 3 &&
    p19At5000.jobs.farmer === 3 &&
    p19At5000.buildings.farm === 1 &&
    p19At5000.starved === 0 &&
    p19At5000.deaths === 0;
  const genuineLiveTargetObserved = observed.shadowRecords.some(
    (record) => record.target?.id === "city-farm",
  );
  const positiveRecords = observed.shadowRecords.filter(
    (record) => record.target && record.shadow?.authorized,
  );
  const positiveEligibleTargetObserved = positiveRecords.length > 0;
  const mandatoryAuthorityProvenanceValid = positiveRecords.every(
    (record) =>
      record.targetAuthority ===
        "successful-current-pre-Gather-order-publication" &&
      record.priceAuthority === "current-pre-gather-construction-order" &&
      record.reservations?.authority === "captured-queue-reservation-source" &&
      record.reservations.status === "clear" &&
      record.handoff?.authority === "p19-civilization-bootstrap-state" &&
      record.handoff.status === "inactive" &&
      record.claimsAuthority ===
        "gatherIntervention.resourceClaims-and-resourceClaim" &&
      record.rootGeneration === record.currentRootGeneration &&
      record.progressionGeneration === record.currentProgressionGeneration,
  );
  const decision =
    !p19ProgressionPreserved ||
    !genuineLiveTargetObserved ||
    (positiveEligibleTargetObserved && !mandatoryAuthorityProvenanceValid)
      ? "C"
      : positiveEligibleTargetObserved
        ? "A"
        : "B";
  evidence.decision = {
    outcome: decision,
    p19ProgressionPreserved,
    genuineLiveTargetObserved,
    positiveEligibleTargetObserved,
    mandatoryAuthorityProvenanceValid,
    liveEligibilityDoesNotRequestSpending: true,
    cpuTwoPercentRequirement: "unresolved",
  };
  await writeFile(
    evidencePath,
    await prettier.format(JSON.stringify(evidence), { parser: "json" }),
  );
  process.stdout.write(
    `${JSON.stringify({
      evidencePath: path.relative(root, evidencePath).replaceAll("\\", "/"),
      p5000: arms.map((arm) => ({
        arm: arm.arm,
        population: arm.checkpoints.at(-1).state.population,
        exportHash: arm.checkpoints.at(-1).saveSha256,
      })),
      transitions: observed.targetTransitions.map(({ period, target }) => ({
        period,
        target,
      })),
      shadowSummary: observed.shadowSummary,
      parity: p19Parity,
      decision,
    })}\n`,
  );
} finally {
  await runner.close();
}
