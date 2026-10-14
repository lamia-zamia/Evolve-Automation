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
  const computedRequirementObservations =
    run.periods > 200 ? [] : (run.hooks.computedRequirements ?? []);
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
  const computedRequirementCaptureWindows = perfSummaries.flatMap(
    ([, phases]) =>
      phases["research.computed-requirements.capture-and-draw"]?.count
        ? [phases["research.computed-requirements.capture-and-draw"]]
        : [],
  );
  return {
    periods: run.periods,
    finalExportHash: hash(JSON.stringify(run.state)),
    highTechLevel: run.state.tech?.high_tech ?? 0,
    explosivesLevel: run.state.tech?.explosives ?? 0,
    postMadScienceClaimEvaluation: (() => {
      const event = (events.selectionEvents ?? []).find(
        (entry) => entry.cycle === 9,
      );
      return event
        ? {
            status: event.status,
            reason: event.reason,
            mandatoryActionIds: event.mandatoryActionIds,
            alternativeGroups: event.alternativeGroups,
            prerequisiteReasons: event.prerequisiteReasons,
            evaluatedCandidates: (event.evaluatedCandidates ?? []).map(
              (candidate) => ({
                actionId: candidate.actionId,
                dependencyRelation: candidate.dependencyRelation,
                pathApplicability: candidate.pathApplicability,
                actionability: candidate.actionability,
                resourceAffordability: candidate.resourceAffordability,
                cost: candidate.cost,
                manaRequired: candidate.manaRequired,
                nonManaAffordable: candidate.nonManaAffordable,
                reasons: candidate.reasons,
              }),
            ),
          }
        : null;
    })(),
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
    claimLifecycleEvidence: events.lifecycle
      .filter(
        (event) =>
          event.state === "released" ||
          event.state === "completed" ||
          event.state === "invalidated" ||
          event.completedActionIds?.length > 0 ||
          event.releasedActionIds?.length > 0,
      )
      .map((event) => ({
        cycle: event.cycle,
        state: event.state,
        reason: event.reason,
        completedActionIds: event.completedActionIds,
        releasedActionIds: event.releasedActionIds,
        blockedActionIds: event.blockedActionIds,
        mandatoryActionIds: event.mandatoryActionIds,
      })),
    finalClaimSet: run.hooks.claimSet,
    finalSelection: run.hooks.selection
      ? {
          cycle: run.hooks.selection.cycle,
          status: run.hooks.selection.status,
          reason: run.hooks.selection.reason,
          mandatoryActionIds: run.hooks.selection.mandatoryActionIds,
          blockedActionIds: run.hooks.selection.blockedActionIds,
          evaluatedCandidates: run.hooks.selection.evaluatedCandidates?.map(
            (candidate) => ({
              actionId: candidate.actionId,
              cost: candidate.cost,
              nonManaAffordable: candidate.nonManaAffordable,
              frontier: candidate.frontier,
              ownerEligibility: candidate.ownerEligibility,
            }),
          ),
        }
      : null,
    finalResources: Object.fromEntries(
      ["Mana", "Knowledge", "Crystal", "Coal", "Lumber", "Stone"].map(
        (resourceId) => [resourceId, run.state.resource?.[resourceId]?.amount],
      ),
    ),
    finalTechLevels: Object.fromEntries(
      ["high_tech", "explosives", "uranium", "oil"].map((technologyId) => [
        technologyId,
        run.state.tech?.[technologyId] ?? 0,
      ]),
    ),
    finalResearchOffers: run.hooks.currentResearchOffers,
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
    computedRequirementCounts: Object.fromEntries(
      Object.entries(
        Object.groupBy(
          computedRequirementObservations,
          (entry) => entry.status,
        ),
      ).map(([status, entries]) => [status, entries.length]),
    ),
    computedRequirements: computedRequirementObservations,
    computedRequirementOfferStatus:
      run.hooks.computedRequirementOfferStatus ?? [],
    computedRequirementCaptureAndDrawMsByWindow:
      computedRequirementCaptureWindows.map((entry) => ({
        count: entry.count,
        totalMs: entry.totalMs,
        perTickMs: entry.perTickMs,
        maxMs: entry.maxMs,
      })),
    workTicks: run.diagnostics.workTicks,
    tickPhaseMsBy25TickWindow: tickWindows.map((entry) => entry.perTickMs),
  };
}

async function runVariant(
  runner,
  variant,
  bundlePath,
  save,
  settings,
  periodLimit = 200,
) {
  const parsedSave = typeof save === "string" ? parseSave(save) : save;
  const session = await runner.openSession({
    bundle: bundlePath,
    save: parsedSave,
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
    if (variant === "D" || variant.startsWith("D-"))
      await session.evaluate(() => {
        window.__EA_TEST_HOOKS__.gatherIntervention = {
          resourceClaimMode: "goal-derived-conjunctive",
        };
      });
    let seededClaim;
    if (variant === "B") {
      while (
        (await session.periods()) < periodLimit &&
        seededClaim === undefined
      ) {
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
    await session.advance(periodLimit - (await session.periods()));
    const state = await session.readState();
    const diagnostics = await session.diagnostics();
    const hooks = await session.evaluate(() => {
      const testHooks = window.__EA_TEST_HOOKS__;
      const catalog = testHooks.readCurrentResearchCatalog("tech-mad");
      const computedRequirements =
        catalog?.definitions?.flatMap(
          (definition) => definition.computedRequirements ?? [],
        ) ?? [];
      const offeredActionIds = new Set(
        catalog?.offers?.map((offer) => offer.elementId) ?? [],
      );
      return {
        selection: testHooks.resourceClaimSelection,
        selectionEvents: testHooks.resourceClaimSelectionEvents ?? [],
        lifecycle: testHooks.resourceClaimLifecycleEvents ?? [],
        ledgers: testHooks.resourceClaimLedgerEvents ?? [],
        decisions: testHooks.resourceClaimDecisionEvents ?? [],
        actions: testHooks.resourceClaimActionEvents ?? [],
        research: testHooks.researchOwnerSelectionEvents ?? [],
        status: testHooks.resourceClaimStatus,
        claimSet: {
          singularActionId:
            testHooks.gatherIntervention?.resourceClaim?.nativeActionId,
          actionIds: Array.isArray(testHooks.gatherIntervention?.resourceClaims)
            ? testHooks.gatherIntervention.resourceClaims.map(
                (claim) => claim?.nativeActionId,
              )
            : undefined,
        },
        currentResearchOffers: (catalog?.offers ?? [])
          .filter((offer) =>
            [
              "tech-anfo",
              "tech-mad",
              "tech-black_powder",
              "tech-dynamite",
              "tech-electricity",
            ].includes(offer.elementId),
          )
          .map((offer) => ({
            actionId: offer.elementId,
            grantTechnology: offer.grantTechnology,
            grantLevel: offer.grantLevel,
            cost: offer.cost,
            nativeAffordable: offer.nativeAffordable,
          })),
        computedRequirements,
        computedRequirementOfferStatus: computedRequirements.map((entry) => ({
          actionId: entry.actionId,
          captureGeneration: entry.captureGeneration,
          offered: offeredActionIds.has(entry.actionId),
        })),
        prerequisiteDeclarations:
          catalog?.definitions
            ?.filter((definition) =>
              [
                "tech-robotics",
                "tech-lasers",
                "tech-quantum_computing",
              ].includes(definition.actionId),
            )
            .map((definition) => ({
              actionId: definition.actionId,
              registryKey: definition.registryKey,
              prerequisites: definition.prerequisites,
            })) ?? [],
      };
    });
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
  const iceAgeSave = parseSave(saveText);
  iceAgeSave.race.iceage = true;
  const iceAgeContextRun = await runVariant(
    runner,
    "D-iceage",
    bundlePath,
    iceAgeSave,
    effectiveSettings,
    40,
  );
  const truepathSave = parseSave(saveText);
  truepathSave.race.truepath = true;
  const truepathContextRun = await runVariant(
    runner,
    "D-truepath",
    bundlePath,
    truepathSave,
    effectiveSettings,
    40,
  );
  const continuationPeriods = 1000;
  const baselineContinuation = await runVariant(
    runner,
    "A-later",
    bundlePath,
    saveText,
    effectiveSettings,
    continuationPeriods,
  );
  const derivedContinuation = await runVariant(
    runner,
    "D-later",
    bundlePath,
    saveText,
    effectiveSettings,
    continuationPeriods,
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
  assert.equal(
    baselineA.summary.finalExportHash,
    "8b2d7639e7f7917ce7a06dec295510c83a839269180e8f8356b5af5816d9fd0f",
    "A must preserve the committed Stage 3G baseline export",
  );
  assert.equal(
    seededB.summary.finalExportHash,
    "591f0dcbc3c1f98e8639977b1885c7a6cefa1d5db193f2fc3dae2b19d328ac3a",
    "B must preserve the committed Stage 3G seeded-claim export",
  );
  assert.equal(
    derivedC.summary.finalExportHash,
    baselineA.summary.finalExportHash,
    "C must retain its prior no-claim behavior",
  );
  assert.equal(derivedC.summary.selectedClaim?.status, "ambiguous");
  assert.deepEqual(derivedC.summary.selectedClaim?.candidates, [
    "tech-black_powder",
    "tech-mad_science",
  ]);
  const standardComputedRequirements = new Map(
    derivedD.summary.computedRequirements.map((entry) => [
      entry.actionId,
      entry,
    ]),
  );
  assert.deepEqual(
    standardComputedRequirements.get("tech-lasers")?.requirements,
    [
      { technologyId: "high_tech", requiredLevel: 8 },
      { technologyId: "supercollider", requiredLevel: 1 },
      { technologyId: "space", requiredLevel: 3 },
      { technologyId: "elerium", requiredLevel: 1 },
    ],
    "standard/Truepath draw must capture pinned native Lasers requirements",
  );
  assert.deepEqual(
    standardComputedRequirements.get("tech-quantum_computing")?.requirements,
    [
      { technologyId: "high_tech", requiredLevel: 10 },
      { technologyId: "nano", requiredLevel: 1 },
    ],
    "standard/Truepath draw must capture pinned native Quantum Computing requirements",
  );
  assert.deepEqual(
    derivedD.summary.computedRequirementOfferStatus
      .filter((entry) =>
        ["tech-lasers", "tech-quantum_computing"].includes(entry.actionId),
      )
      .map((entry) => [entry.actionId, entry.offered]),
    [
      ["tech-lasers", false],
      ["tech-quantum_computing", false],
    ],
    "the native draw must capture the unoffered higher High Tech alternatives",
  );
  assert.equal(
    standardComputedRequirements.get("tech-sequence_ecosystem")?.status,
    "observed",
    "valid camel-case technology identifiers are retained from native output",
  );
  const iceAgeObservedByAction = new Map(
    iceAgeContextRun.summary.computedRequirements.map((entry) => [
      entry.actionId,
      entry,
    ]),
  );
  assert.deepEqual(
    iceAgeObservedByAction.get("tech-lasers")?.requirements,
    [
      { technologyId: "high_tech", requiredLevel: 8 },
      { technologyId: "supercollider", requiredLevel: 1 },
      { technologyId: "surface_uranium", requiredLevel: 1 },
    ],
    "Ice Age draw must capture pinned native Lasers requirements",
  );
  assert.deepEqual(
    iceAgeObservedByAction.get("tech-quantum_computing")?.requirements,
    [{ technologyId: "high_tech", requiredLevel: 10 }],
    "Ice Age draw must capture pinned native Quantum Computing requirements",
  );
  for (const actionId of ["tech-lasers", "tech-quantum_computing"]) {
    assert.deepEqual(
      truepathContextRun.summary.computedRequirements.find(
        (entry) => entry.actionId === actionId,
      )?.requirements,
      standardComputedRequirements.get(actionId)?.requirements,
      `Truepath draw must match pinned non-Ice Age ${actionId} requirements`,
    );
  }
  const sameResearchDrawCountsAsC =
    JSON.stringify(derivedD.summary.researchDrawCounts) ===
    JSON.stringify(derivedC.summary.researchDrawCounts);
  assert.equal(
    derivedD.hooks.prerequisiteDeclarations.find(
      (entry) => entry.actionId === "tech-lasers",
    )?.prerequisites.kind,
    "conditional",
    "the computed result must not overwrite the retained static declaration",
  );
  assert.deepEqual(
    derivedD.summary.selectedClaim?.claims?.map((claim) => [
      claim.nativeActionId,
      claim.requiredQuantity,
      claim.allocationAuthority.kind,
    ]),
    [
      ["tech-black_powder", 100, "independent"],
      ["tech-mad_science", 50, "independent"],
    ],
    "both independently mandatory current Mana obligations must be admitted",
  );
  const derivedMadScienceGrant = derivedD.summary.nativeResearchTrace.find(
    (event) => event.actionId === "tech-mad_science",
  );
  assert.ok(
    derivedMadScienceGrant,
    "D must let native AutoResearch buy Mad Science",
  );
  assert.equal(derivedMadScienceGrant.grantBefore, 0);
  assert.equal(derivedMadScienceGrant.grantAfter, 1);
  assert.equal(derivedMadScienceGrant.manaSpent, 50);
  assert.equal(
    derivedD.summary.nativeResearchTrace.some(
      (event) => event.actionId === "tech-black_powder",
    ),
    false,
    "native AutoResearch did not buy Black Powder in the 200-period replay",
  );
  assert.equal(derivedD.summary.highTechLevel, 1);
  assert.equal(derivedD.summary.explosivesLevel, 0);
  assert.deepEqual(
    derivedD.summary.postMadScienceClaimEvaluation?.mandatoryActionIds,
    ["tech-black_powder", "tech-electricity"],
    "the next native MAD frontier remains Black Powder and Electricity after Mad Science",
  );
  const postGrantBlackPowder =
    derivedD.summary.postMadScienceClaimEvaluation?.evaluatedCandidates.find(
      (candidate) => candidate.actionId === "tech-black_powder",
    );
  const postGrantElectricity =
    derivedD.summary.postMadScienceClaimEvaluation?.evaluatedCandidates.find(
      (candidate) => candidate.actionId === "tech-electricity",
    );
  assert.equal(postGrantBlackPowder?.nonManaAffordable, false);
  assert.equal(postGrantElectricity?.nonManaAffordable, true);
  assert.equal(postGrantElectricity?.cost.Mana, undefined);
  const postGrantLifecycle = derivedD.summary.claimLifecycleEvidence.find(
    (event) => event.cycle === 9,
  );
  assert.deepEqual(postGrantLifecycle?.completedActionIds, [
    "tech-mad_science",
  ]);
  assert.deepEqual(postGrantLifecycle?.blockedActionIds, ["tech-black_powder"]);
  assert.deepEqual(postGrantLifecycle?.mandatoryActionIds, [
    "tech-black_powder",
    "tech-electricity",
  ]);
  assert.equal(derivedD.summary.finalClaimSet.singularActionId, undefined);
  assert.deepEqual(derivedD.summary.finalClaimSet.actionIds, []);
  assert.ok(
    (derivedD.diagnostics.nativeInvocations ?? []).some(
      (event) => event.period > 64 && event.elementId === "city-lumber",
    ),
    "D must execute real native Gather clicks after releasing the blocked protection",
  );
  assert.equal(
    derivedD.summary.gatherClaimActions.permitted > 0,
    true,
    "released claims must not leave Gather unavailable",
  );
  assert.equal(
    derivedD.summary.gatherClaimActions.deferred,
    0,
    "no stale claim may defer the recovered Gather budget",
  );
  assert.equal(baselineContinuation.summary.highTechLevel, 0);
  assert.ok(derivedContinuation.summary.highTechLevel >= 2);
  assert.ok(derivedContinuation.summary.explosivesLevel >= 1);
  for (const actionId of [
    "tech-black_powder",
    "tech-dynamite",
    "tech-electricity",
  ])
    assert.ok(
      derivedContinuation.summary.nativeResearchTrace.some(
        (event) => event.actionId === actionId,
      ),
      `D continuation must record native purchase of ${actionId}`,
    );
  const report = {
    protocol:
      "Stage 3I claim lifecycle replay with Stage 3H native computed-requirement evidence",
    runner: "tools/chromium-evolve-runner.mjs",
    execution: {
      command: "node experiments/stage3f-mana-claim.mjs",
      inputs:
        "Paths and SHA-256 hashes are recorded below; settings are loaded with autoResearch=true.",
      variants:
        "A/A baseline, manually seeded Stage 3E B, Stage 3F single-selection regression C, then Stage 3H conjunctive goal-derived D with Stage 3I lifecycle correction; each opens a fresh exact-runner session.",
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
      D: "Stage 3I test-only conjunctive claims; release stock protection only for verified non-Mana blockage or completed obligations, and fail closed on missing evidence",
      computedRequirementContexts:
        "Additional 40-period exact-runner contracts use the same pinned save with only race.iceage or race.truepath set to exercise the native action's route-dependent era selection.",
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
      computedRequirementsIceAge: iceAgeContextRun.summary,
      computedRequirementsTruepath: truepathContextRun.summary,
      continuationA: baselineContinuation.summary,
      continuationD: derivedContinuation.summary,
    },
    nativeComputedRequirementAudit: {
      source:
        "Scoped observation of native actionReqs calls made by drawTech; callback results compared against the pinned game's exact-runner execution.",
      productionEnabled: false,
      ordinaryResearchDrawCount: derivedD.summary.researchDrawCounts,
      sameDrawCountAsPreviousC: sameResearchDrawCountsAsC,
      observedRequirements: derivedD.summary.computedRequirements,
      capturedStaticDeclarations: derivedD.hooks.prerequisiteDeclarations,
      iceAgeRequirements: iceAgeContextRun.summary.computedRequirements.filter(
        (entry) =>
          entry.actionId === "tech-lasers" ||
          entry.actionId === "tech-quantum_computing",
      ),
      truepathRequirements:
        truepathContextRun.summary.computedRequirements.filter(
          (entry) =>
            entry.actionId === "tech-lasers" ||
            entry.actionId === "tech-quantum_computing",
        ),
    },
    nativeResearchSpendingAuthorityAudit: {
      selectionOwner:
        "src/domain/progression/research/research.ts::planResearch selects the first affordable, non-conflicting offer; src/adapters/evolve/progression/research/captured-research.ts samples and invokes that owner decision.",
      reservationContract:
        "src/domain/economy/resources/shared-spending-budget.ts is pure/test-only. It can account for an exact synchronous debit with fresh current stock, known commitments, same-observation invocation, and post-action reconciliation; the native Research owner is not integrated with it.",
      stage3HPreCorrectionTrace: [
        {
          cycle: 3,
          actionId: "tech-rituals",
          manaSpent: 25,
          authority:
            "selected by the existing Research owner; MAD obligation status and goal value were not established by the capture; spent while Gather claims were active but outside their fenced owner and without shared debit reconciliation",
        },
        {
          cycle: 8,
          actionId: "tech-mad_science",
          manaSpent: 50,
          authority:
            "verified mandatory prerequisite completion; exact native debit is still outside Stage 3D's Gather-only enforcement",
        },
        {
          cycle: 9,
          actionId: "tech-espionage",
          manaSpent: 0,
          authority: "selected by the existing Research owner; no Mana debit",
        },
        {
          cycle: 12,
          actionId: "tech-reinforced_crates",
          manaSpent: 0,
          authority: "selected by the existing Research owner; no Mana debit",
        },
        {
          cycle: 18,
          actionId: "tech-clerics",
          manaSpent: 100,
          authority:
            "selected by the existing Research owner; MAD dependency relation remained unknown; Stage 3H claims were suspended, and no cross-owner debit reconciliation ran",
        },
      ],
      actions: derivedD.summary.nativeResearchTrace.map((event) => ({
        cycle: event.cycle,
        actionId: event.actionId,
        manaSpent: event.manaSpent,
        authority:
          event.actionId === "tech-mad_science"
            ? "verified mandatory prerequisite completion"
            : event.manaSpent === 0
              ? "existing Research owner purchase; no Mana debit to reconcile"
              : event.actionId === "tech-rituals"
                ? "existing Research owner purchase; MAD obligation status and goal value are not established by this capture"
                : event.actionId === "tech-clerics"
                  ? "existing Research owner purchase; MAD dependency relation remains unknown"
                  : "existing Research owner purchase; goal value is not established by this capture",
      })),
      uncoveredPaths:
        "The pure Stage 3D contract could represent a known Research debit if the owner supplied an exact synchronous transaction with fresh current stock, complete known commitments, same-observation invocation, and native post-action reconciliation. None of those Research calls are integrated; native Research, passive production, Alchemy, queued/player commitments, and other actions can alter Mana outside Gather. Their debit path and action authority therefore remain unaccounted for here. Since the Stage 3I claims fence Gather only, these Research actions are not violations of an implemented Research-side allowance, but Rituals demonstrates the unresolved cross-owner gap while claims are active.",
    },
    continuationTargetAudit: {
      targetActionId: "tech-mad",
      nativeSource:
        "D:/work/Evolve-DeadSpace/src/tech.js, actions.tech.mad: reqs { uranium: 1, explosives: 3, high_tech: 7 } at pinned commit db38e2af831907d49aeb5348d678d8d8745d6c3f.",
      baselineTechLevels: baselineContinuation.summary.finalTechLevels,
      candidateTechLevels: derivedContinuation.summary.finalTechLevels,
      remainingNativeRequirements: [
        {
          technologyId: "high_tech",
          requiredLevel: 7,
          currentLevel: derivedContinuation.summary.finalTechLevels.high_tech,
        },
        {
          technologyId: "explosives",
          requiredLevel: 3,
          currentLevel: derivedContinuation.summary.finalTechLevels.explosives,
        },
        {
          technologyId: "uranium",
          requiredLevel: 1,
          currentLevel: derivedContinuation.summary.finalTechLevels.uranium,
        },
      ].filter(
        (requirement) => requirement.currentLevel < requirement.requiredLevel,
      ),
      result:
        "The bounded candidate reaches High Tech 2 and Explosives 2 by period 1,000, but does not satisfy the native MAD target. No next Research target is injected.",
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
