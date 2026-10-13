import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
import { admitResourceClaim } from "../src/domain/economy/resources/resource-claims.ts";
import { evaluateResearchGoalCandidates } from "../src/domain/progression/research-goal-candidates.ts";
import { planNativeResearchPrerequisites } from "../src/domain/progression/research-prerequisite-planning.ts";

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
const upstreamPath =
  process.argv.find((value) => value.startsWith("--upstream="))?.slice(11) ??
  process.env.EVOLVE_UPSTREAM_SOURCE;
const pinnedUpstreamCommit = "db38e2af831907d49aeb5348d678d8d8745d6c3f";
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/stage3f-test.user.js",
);
const reportPath = path.resolve(
  process.argv.find((value) => value.startsWith("--out="))?.slice(6) ??
    path.join(root, "experiments/stage3f-mana-claim-manifest.json"),
);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const readHash = async (filePath) => hash(await readFile(filePath));

async function makeTestBundle() {
  const metadata = (
    await readFile(path.join(root, "src/userscript.meta.js"), "utf8")
  ).trimEnd();
  const result = await esbuild.build({
    absWorkingDir: root,
    entryPoints: ["src/main.ts"],
    bundle: true,
    write: false,
    banner: {
      js: `${metadata}\n\n// Generated for the exact-runner test surface.`,
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
  await mkdir(path.dirname(bundlePath), { recursive: true });
  await writeFile(bundlePath, result.outputFiles[0].contents);
}

function researchGraph(catalog, cycle) {
  const offerGenerations = new Map(
    catalog.offers.map(({ elementId, generation }) => [elementId, generation]),
  );
  const graph = planNativeResearchPrerequisites({
    targetActionId: "tech-mad",
    definitions: catalog.definitions.map((definition) => ({
      actionId: definition.actionId,
      grantTechnology: definition.grantTechnology,
      grantLevel: definition.grantLevel,
      prerequisites: definition.prerequisites,
      hasNativeCondition: definition.eligibility.hasNativeCondition,
      routeRestrictions: definition.eligibility.routeRestrictions,
      restrictions: definition.eligibility.restrictions,
    })),
    grantLevels: new Map(catalog.grantLevels),
    applicabilityByActionId: new Map(catalog.applicability),
    offeredActionIds: new Set(catalog.offers.map(({ elementId }) => elementId)),
    offerGenerations,
    cycle,
    progressionEpoch: catalog.progressionEpoch,
    rootGeneration: catalog.rootGeneration,
    maxDepth: 16,
    maxActions: 256,
  });
  const evaluation = evaluateResearchGoalCandidates({
    goalId: "prestige:mad",
    targetActionId: "tech-mad",
    goalSatisfied: graph.targetStatus === "satisfied",
    graph,
    cycle,
    progressionEpoch: catalog.progressionEpoch,
    rootGeneration: catalog.rootGeneration,
    offers: catalog.offers.map((offer, index) => ({
      actionId: offer.elementId,
      grantTechnology: offer.grantTechnology,
      grantLevel: offer.grantLevel,
      index,
      generation: offer.generation,
      cost: offer.cost,
      nativeAffordable: offer.nativeAffordable,
      reservationEvidence: "not-observed",
      explicitExclusionEvidence: "not-observed",
    })),
    baselineSelectedActionId: undefined,
  });
  return { graph, evaluation };
}

async function seededStage3eClaim(session) {
  const catalog = await session.evaluate(() =>
    window.__EA_TEST_HOOKS__.readCurrentResearchCatalog("tech-mad_science"),
  );
  assert.equal(catalog.current, true);
  assert.equal(catalog.selectedPrestige, "mad");
  assert.equal(catalog.researchPermission, true);
  assert.equal(catalog.triggersEnabled, false);
  assert.equal(catalog.queueEvidence, "empty");
  const { graph, evaluation } = researchGraph(catalog, 0);
  const candidate = evaluation.candidates.find(
    (entry) => entry.actionId === "tech-mad_science",
  );
  const offer = catalog.offers.find(
    (entry) => entry.elementId === "tech-mad_science",
  );
  assert.equal(candidate?.relevance, "verified-prerequisite");
  assert.ok(graph.actionableFrontier.includes("tech-mad_science"));
  assert.equal(catalog.targetEligibility, "eligible");
  assert.equal(catalog.targetControl?.generation, offer.generation);
  assert.ok(catalog.targetControl?.methods.includes("action"));
  const claim = admitResourceClaim({
    terminalGoalId: "prestige:mad",
    immediateGoalId: "research:tech-mad_science",
    owner: "goal-planner",
    provenance: "verified-native-prerequisite",
    prerequisiteRelation: "verified",
    nativeActionId: "tech-mad_science",
    targetGrantTechnology: offer.grantTechnology,
    targetGrantLevel: offer.grantLevel,
    resourceId: "Mana",
    poolId: "anywhere",
    requiredQuantity: offer.cost.Mana,
    observedStock: catalog.mana.amount,
    observedCapacity: catalog.mana.capacity,
    observedNativePrice: offer.cost.Mana,
    offerSetIdentity: offer.offerSetIdentity,
    offerObservationId: offer.offerObservationId,
    offerBindingGeneration: offer.generation,
    controlBinding: {
      elementId: offer.elementId,
      generation: offer.generation,
    },
    nativeOfferCurrent: true,
    nativeActionEligible: true,
    researchPermission: true,
    queueEvidence: catalog.queueEvidence,
    rootGeneration: catalog.rootGeneration,
    progressionGeneration: catalog.progressionEpoch,
    observationValid: catalog.current,
    precedence: "terminal-prerequisite",
    allocationAuthority: { kind: "independent" },
    forecastProductionPerSecond: catalog.mana.productionPerSecond,
    uncertaintyReasons: [],
    unavailableReasons: [],
  });
  assert.ok(claim);
  await session.evaluate((resourceClaim) => {
    window.__EA_TEST_HOOKS__.gatherIntervention = {
      resourceClaim,
      resourceClaimReservations: [],
    };
  }, claim);
  return {
    target: claim.nativeActionId,
    provenance: claim.provenance,
    offerObservationId: claim.offerObservationId,
    offerBindingGeneration: claim.offerBindingGeneration,
    resourceId: claim.resourceId,
    amount: claim.requiredQuantity,
    observedStock: claim.observedStock,
    graphFrontier: graph.actionableFrontier,
  };
}

function summarize(run, seededClaim) {
  const events = run.hooks;
  const gatherByAction = Object.groupBy(
    run.diagnostics.nativeInvocations ?? [],
    (event) => event.actionIdentity,
  );
  const gatherSummary = Object.fromEntries(
    Object.entries(gatherByAction).map(([actionId, entries]) => [
      actionId,
      {
        clicks: entries.length,
        manaSpent: entries.reduce(
          (sum, entry) => sum + Math.max(0, -entry.manaDelta),
          0,
        ),
        gathered: entries.reduce(
          (sum, entry) => sum + entry.gatheredResourceDelta,
          0,
        ),
      },
    ]),
  );
  const firstHighTechGrant =
    run.diagnostics.researchInvocations?.find(
      (event) => event.highTechAfter > event.highTechBefore,
    ) ?? null;
  const firstExplosivesGrant =
    events.research?.find(
      (event) =>
        event.grantTechnology === "explosives" &&
        event.grantAfter > event.grantBefore,
    ) ?? null;
  const highTechGrantSummary = firstHighTechGrant
    ? {
        period: firstHighTechGrant.period,
        actionId: firstHighTechGrant.elementId,
        highTechBefore: firstHighTechGrant.highTechBefore,
        highTechAfter: firstHighTechGrant.highTechAfter,
        manaBefore: firstHighTechGrant.manaBefore,
        manaAfter: firstHighTechGrant.manaAfter,
      }
    : null;
  const explosivesGrantSummary = firstExplosivesGrant
    ? {
        cycle: firstExplosivesGrant.cycle,
        actionId: firstExplosivesGrant.actionId,
        explosivesBefore: firstExplosivesGrant.grantBefore,
        explosivesAfter: firstExplosivesGrant.grantAfter,
        manaBefore: firstExplosivesGrant.manaBefore,
        manaAfter: firstExplosivesGrant.manaAfter,
      }
    : null;
  const completion = events.lifecycle.find(
    (event) => event.state === "completed",
  );
  const recovery = firstHighTechGrant
    ? (run.diagnostics.nativeInvocations ?? []).find(
        (event) => event.period > firstHighTechGrant.period,
      )
    : undefined;
  const recoverySummary = recovery
    ? {
        period: recovery.period,
        actionId: recovery.elementId,
        manaBefore: recovery.before.resources.Mana.amount,
        manaAfter: recovery.after.resources.Mana.amount,
        manaSpent: Math.max(0, -recovery.manaDelta),
        gatheredResourceDelta: recovery.gatheredResourceDelta,
      }
    : null;
  const summarizeSelection = (event) =>
    event
      ? {
          cycle: event.cycle,
          status: event.status,
          reason: event.reason,
          candidates: event.candidates,
          nativeActionId: event.nativeActionId,
          nativeActionIds: event.nativeActionIds,
          provenance: event.provenance,
          claims: event.claims,
          mandatoryActionIds: event.mandatoryActionIds,
          alternativeGroups: event.alternativeGroups,
          prerequisiteReasons: event.prerequisiteReasons,
          resourceId: event.resourceId,
          requiredQuantity: event.requiredQuantity,
          observedStock: event.observedStock,
          offerObservationId: event.offerObservationId,
          offerSetIdentitySha256: event.offerSetIdentity
            ? hash(event.offerSetIdentity)
            : undefined,
          offerBindingGeneration: event.offerBindingGeneration,
          controlBinding: event.controlBinding,
          researchPermission: event.researchPermission,
          playerQueues: event.playerQueues,
          nativeOfferCount: event.nativeOfferCount,
          rootGeneration: event.rootGeneration,
          progressionGeneration: event.progressionGeneration,
          evaluatedCandidates: (event.evaluatedCandidates ?? [])
            .filter((candidate) =>
              (event.candidates ?? []).includes(candidate.actionId),
            )
            .map((candidate) => ({
              actionId: candidate.actionId,
              relevance: candidate.relevance,
              dependencyRelation: candidate.dependencyRelation,
              pathApplicability: candidate.pathApplicability,
              actionability: candidate.actionability,
              evidenceFresh: candidate.evidenceFresh,
              resourceAffordability: candidate.resourceAffordability,
              cost: candidate.cost,
              manaAmount: candidate.manaAmount,
              manaRequired: candidate.manaRequired,
              nonManaAffordable: candidate.nonManaAffordable,
              frontier: candidate.frontier,
              offerObservationId: candidate.offerObservationId,
              offerSetIdentitySha256: candidate.offerSetIdentity
                ? hash(candidate.offerSetIdentity)
                : undefined,
              controlGeneration: candidate.controlGeneration,
              offerGeneration: candidate.offerGeneration,
              ownerEligibility: candidate.ownerEligibility,
              reasons: candidate.reasons,
            })),
        }
      : null;
  const perfSummaries = run.diagnostics.perfSummaries ?? [];
  const researchDrawCounts = Object.fromEntries(
    perfSummaries.flatMap(([, , counters]) =>
      Object.entries(counters ?? {}).filter(
        ([name]) =>
          name.includes("research.catalog") ||
          name.includes("research.observation.sample"),
      ),
    ),
  );
  const tickWindows = perfSummaries.flatMap(([, phases]) =>
    phases.tick?.count ? [phases.tick] : [],
  );
  return {
    periods: run.periods,
    finalExportHash: hash(JSON.stringify(run.state)),
    highTechLevel: run.state.tech?.high_tech ?? 0,
    selectedClaim:
      summarizeSelection(
        events.selectionEvents.find((event) => event.status === "selected") ??
          events.selection,
      ) ??
      seededClaim ??
      null,
    selectionTimeline: Object.values(
      Object.groupBy(
        events.selectionEvents,
        (event) =>
          `${event.status}|${event.reason}|${(event.candidates ?? []).join(",")}|${event.nativeActionId ?? ""}`,
      ),
    ).map((group) => ({
      status: group[0].status,
      reason: group[0].reason,
      candidates: group[0].candidates,
      remainingObligations: group[0].claims?.map((claim) => ({
        actionId: claim.nativeActionId,
        requiredQuantity: claim.requiredQuantity,
      })),
      firstCycle: group[0].cycle,
      lastCycle: group.at(-1).cycle,
      occurrences: group.length,
      firstOfferObservationId:
        group[0].evaluatedCandidates?.[0]?.offerObservationId,
      lastOfferObservationId:
        group.at(-1).evaluatedCandidates?.[0]?.offerObservationId,
    })),
    lifecycle: Object.values(
      Object.groupBy(
        events.lifecycle,
        (event) =>
          event.state + "|" + event.reason + "|" + (event.nativeActionId ?? ""),
      ),
    ).map((group) => ({
      state: group[0].state,
      reason: group[0].reason,
      nativeActionId: group[0].nativeActionId,
      firstCycle: group[0].cycle,
      lastCycle: group.at(-1).cycle,
      occurrences: group.length,
    })),
    claimLedger: {
      statusCounts: Object.fromEntries(
        Object.entries(
          Object.groupBy(events.ledgers, (event) => event.status),
        ).map(([status, rows]) => [status, rows.length]),
      ),
      sample: (() => {
        const sample = events.ledgers.find(
          (event) => event.claimState === "active",
        );
        return sample
          ? {
              currentMana: sample.currentMana,
              reservedCurrentStock: sample.reservedCurrentStock,
              remainingAccumulation: sample.remainingAccumulation,
              spendableStock: sample.spendableStock,
              status: sample.status,
              claimControlBinding: sample.claimControlBinding,
              currentControlBinding: sample.currentControlBinding,
            }
          : null;
      })(),
    },
    gatherClaimActions: {
      permitted: events.actions.filter(
        (event) => event.phase === "before-action",
      ).length,
      deferred: events.actions.filter((event) => event.phase === "deferred")
        .length,
      actualManaSpent: events.actions.reduce(
        (sum, event) => sum + (event.actualManaSpend ?? 0),
        0,
      ),
    },
    gatherSummary,
    firstNativeHighTechGrant: highTechGrantSummary,
    firstNativeExplosivesGrant: explosivesGrantSummary,
    firstGatherAfterGrant: recoverySummary,
    researchAttempts: events.research.map((event) => ({
      cycle: event.cycle,
      actionId: event.actionId,
      grantTechnology: event.grantTechnology,
      grantLevel: event.grantLevel,
      grantBefore: event.grantBefore,
      grantAfter: event.grantAfter,
      disposition: event.disposition,
      result: event.result,
      manaBefore: event.manaBefore,
      manaAfter: event.manaAfter,
      manaSpent: event.manaSpent,
    })),
    nativeResearchTrace: (events.research ?? []).map((event) => ({
      cycle: event.cycle,
      actionId: event.actionId,
      grantTechnology: event.grantTechnology,
      grantLevel: event.grantLevel,
      grantBefore: event.grantBefore,
      grantAfter: event.grantAfter,
      manaBefore: event.manaBefore,
      manaAfter: event.manaAfter,
      manaSpent: Math.max(0, event.manaBefore - event.manaAfter),
      disposition: event.disposition,
    })),
    researchDrawCounts,
    workTicks: run.diagnostics.workTicks,
    tickPhaseMsBy25TickWindow: tickWindows.map((entry) => entry.perTickMs),
  };
}

async function runVariant(runner, variant, bundlePath, save, settings) {
  const session = await runner.openSession({
    bundle: bundlePath,
    save: parseSave(save),
    settings,
    seed: 42,
    epoch: "2026-09-21T00:00:00.000Z",
    perf: true,
    forwardPerfSummary: true,
    nativeTrace: true,
    manaTrace: true,
  });
  try {
    if (variant === "C")
      await session.evaluate(() => {
        window.__EA_TEST_HOOKS__.gatherIntervention = {
          resourceClaimMode: "goal-derived-single",
        };
      });
    if (variant === "D")
      await session.evaluate(() => {
        window.__EA_TEST_HOOKS__.gatherIntervention = {
          resourceClaimMode: "goal-derived-conjunctive",
        };
      });
    let seededClaim;
    if (variant === "B") {
      while ((await session.periods()) < 200 && seededClaim === undefined) {
        await session.advance(1);
        const catalog = await session.evaluate(() =>
          window.__EA_TEST_HOOKS__.readCurrentResearchCatalog(
            "tech-mad_science",
          ),
        );
        if (
          catalog.current &&
          catalog.offers.some((offer) => offer.elementId === "tech-mad_science")
        )
          seededClaim = await seededStage3eClaim(session);
      }
      assert.ok(seededClaim, "manual Stage 3E offer never appeared");
    }
    await session.advance(200 - (await session.periods()));
    const state = await session.readState();
    const diagnostics = await session.diagnostics();
    const hooks = await session.evaluate(() => ({
      selection: window.__EA_TEST_HOOKS__.resourceClaimSelection,
      selectionEvents:
        window.__EA_TEST_HOOKS__.resourceClaimSelectionEvents ?? [],
      lifecycle: window.__EA_TEST_HOOKS__.resourceClaimLifecycleEvents ?? [],
      ledgers: window.__EA_TEST_HOOKS__.resourceClaimLedgerEvents ?? [],
      decisions: window.__EA_TEST_HOOKS__.resourceClaimDecisionEvents ?? [],
      actions: window.__EA_TEST_HOOKS__.resourceClaimActionEvents ?? [],
      research: window.__EA_TEST_HOOKS__.researchOwnerSelectionEvents ?? [],
      status: window.__EA_TEST_HOOKS__.resourceClaimStatus,
    }));
    return {
      variant,
      periods: await session.periods(),
      state,
      diagnostics,
      hooks,
      seededClaim,
      summary: summarize(
        {
          periods: await session.periods(),
          state,
          diagnostics,
          hooks: { ...hooks, research: hooks.research },
        },
        seededClaim,
      ),
    };
  } finally {
    await session.close();
  }
}

const saveText = await readFile(savePath, "utf8");
const settingsSource = JSON.parse(await readFile(settingsPath, "utf8"));
const effectiveSettings = { ...settingsSource, autoResearch: true };
const effectiveSettingsText = JSON.stringify(effectiveSettings);
await makeTestBundle();
const runner = await createChromiumRunner({
  game: gamePath,
  upstream: upstreamPath,
});
try {
  const baselineA = await runVariant(
    runner,
    "A",
    bundlePath,
    saveText,
    effectiveSettings,
  );
  const baselineARepeat = await runVariant(
    runner,
    "A",
    bundlePath,
    saveText,
    effectiveSettings,
  );
  assert.deepEqual(
    baselineA.state,
    baselineARepeat.state,
    "baseline A/A final exports diverged",
  );
  const seededB = await runVariant(
    runner,
    "B",
    bundlePath,
    saveText,
    effectiveSettings,
  );
  const derivedC = await runVariant(
    runner,
    "C",
    bundlePath,
    saveText,
    effectiveSettings,
  );
  const derivedD = await runVariant(
    runner,
    "D",
    bundlePath,
    saveText,
    effectiveSettings,
  );
  assert.equal(
    execFileSync(
      "git",
      [
        "-C",
        runner.inputs.upstream,
        "rev-parse",
        `${runner.inputs.gameSnapshot.commit}^{commit}`,
      ],
      { encoding: "utf8" },
    ).trim(),
    pinnedUpstreamCommit,
    "experiment game snapshot must match the exact pinned upstream commit",
  );
  const madScienceGrant = seededB.diagnostics.researchInvocations?.find(
    (event) => event.elementId === "tech-mad_science",
  );
  assert.ok(madScienceGrant, "B must natively purchase Mad Science");
  assert.equal(madScienceGrant.highTechBefore, 0);
  assert.equal(madScienceGrant.highTechAfter, 1);
  assert.equal(madScienceGrant.manaBefore - madScienceGrant.manaAfter, 50);
  assert.equal(derivedC.summary.selectedClaim?.status, "ambiguous");
  assert.deepEqual(derivedC.summary.selectedClaim?.candidates, [
    "tech-black_powder",
    "tech-mad_science",
  ]);
  assert.equal(
    derivedD.summary.selectedClaim?.status,
    "unavailable",
    "D must fail closed while a direct mandatory action has unresolved native alternatives",
  );
  const report = {
    protocol: "Stage 3G conjunctive prerequisite Mana claim experiment",
    runner: "tools/chromium-evolve-runner.mjs",
    execution: {
      command: "node experiments/stage3f-mana-claim.mjs",
      inputs:
        "Paths and SHA-256 hashes are recorded below; settings are loaded with autoResearch=true.",
      variants:
        "A/A baseline, manually seeded Stage 3E B, Stage 3F single-selection regression C, then Stage 3G conjunctive goal-derived D; each opens a fresh exact-runner session.",
      output: "experiments/stage3f-mana-claim-manifest.json (or --out=<path>)",
    },
    upstreamCommit: pinnedUpstreamCommit,
    gameSnapshotCommit: runner.inputs.gameSnapshot.commit,
    periods: 200,
    seed: 42,
    epoch: "2026-09-21T00:00:00.000Z",
    inputs: {
      gameSnapshot: {
        path: "test-artifacts/game/evolve-deadspace.js",
        sha256: await readHash(gamePath),
      },
      save: {
        path: "test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json",
        sha256: hash(saveText),
      },
      settings: {
        path: "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
        originalSha256: hash(await readFile(settingsPath)),
        effectiveSha256: hash(effectiveSettingsText),
      },
      testBundle: {
        path: "test-artifacts/benchmark/tmp/stage3f-test.user.js",
        sha256: await readHash(bundlePath),
      },
      runner: runner.inputs.runner,
    },
    conditions: {
      A: "no goal-directed Mana protection",
      B: "Stage 3E current claim seeded from tech-mad_science native evidence",
      C: "Stage 3F test-only single-selection mode; no target or admitted claim injected",
      D: "Stage 3G test-only independent claims; fail closed when a direct obligation has unresolved native alternatives",
    },
    preservedSettings: {
      autoResearch: effectiveSettings.autoResearch,
      autoAlchemy: effectiveSettings.autoAlchemy,
      autoPylon: effectiveSettings.autoPylon,
      autoBuild: effectiveSettings.autoBuild,
      autoJobs: effectiveSettings.autoJobs,
      autoCraftsmen: effectiveSettings.autoCraftsmen,
      autoCraft: effectiveSettings.autoCraft,
      autoFactory: effectiveSettings.autoFactory,
      autoStorage: effectiveSettings.autoStorage,
    },
    baselineAA: {
      finalExportEqual: true,
      exportHash: baselineA.summary.finalExportHash,
    },
    results: {
      A: baselineA.summary,
      B: seededB.summary,
      C: derivedC.summary,
      D: derivedD.summary,
    },
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  const formattedReport = await prettier.format(JSON.stringify(report), {
    filepath: reportPath,
  });
  await writeFile(reportPath, formattedReport);
  console.log(
    JSON.stringify(
      {
        reportPath,
        upstreamCommit: report.upstreamCommit,
        inputHashes: report.inputs,
        baselineAA: report.baselineAA,
        results: Object.fromEntries(
          Object.entries(report.results).map(([variant, result]) => [
            variant,
            {
              finalExportHash: result.finalExportHash,
              highTechLevel: result.highTechLevel,
              selectedClaim: result.selectedClaim && {
                status: result.selectedClaim.status,
                reason: result.selectedClaim.reason,
                nativeActionId: result.selectedClaim.nativeActionId,
                provenance: result.selectedClaim.provenance,
                resourceId: result.selectedClaim.resourceId,
                requiredQuantity: result.selectedClaim.requiredQuantity,
                observedStock: result.selectedClaim.observedStock,
                offerObservationId: result.selectedClaim.offerObservationId,
                offerBindingGeneration:
                  result.selectedClaim.offerBindingGeneration,
              },
              selectionTimeline: result.selectionTimeline,
              firstNativeHighTechGrant: result.firstNativeHighTechGrant,
              firstNativeExplosivesGrant: result.firstNativeExplosivesGrant,
              researchDrawCounts: result.researchDrawCounts,
              gatherSummary: result.gatherSummary,
            },
          ]),
        ),
      },
      null,
      2,
    ),
  );
} finally {
  await runner.close();
}
