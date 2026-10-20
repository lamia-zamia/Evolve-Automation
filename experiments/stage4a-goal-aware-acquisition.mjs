import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import {
  createChromiumRunner,
  parseSave,
} from "../tools/chromium-evolve-runner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gamePath = path.join(root, "test-artifacts/game/evolve-deadspace.js");
const saveArgument = process.argv.find((argument) =>
  argument.startsWith("--save="),
);
const savePath = path.resolve(
  root,
  saveArgument?.slice("--save=".length) ??
    "test-artifacts/benchmark/slice0/saves/stage2f-fixed-progression-export.json",
);
const settingsPath = path.join(
  root,
  "test-artifacts/benchmark/slice0/settings/stage2e-integrated-mad-no-triggers.json",
);
const bundlePath = path.join(
  root,
  "test-artifacts/benchmark/tmp/stage4a-test.user.js",
);
const outputArgument = process.argv.find((argument) =>
  argument.startsWith("--out="),
);
const outputPath = path.resolve(
  root,
  outputArgument?.slice("--out=".length) ??
    "test-artifacts/benchmark/tmp/stage4a-goal-aware-acquisition.json",
);
const upstreamCommit = "db38e2af831907d49aeb5348d678d8d8745d6c3f";
const startCommit = "978619241a35cf9854e1eb3ddd7f29c57911dd46";
const shortProbe = process.argv.includes("--short-probe");
const windowPeriodsArgument = process.argv.find((argument) =>
  argument.startsWith("--window-periods="),
);
const windowPeriods = windowPeriodsArgument
  ? Number(windowPeriodsArgument.slice("--window-periods=".length))
  : undefined;
if (
  windowPeriods !== undefined &&
  (!Number.isSafeInteger(windowPeriods) || windowPeriods <= 0)
)
  throw new Error("--window-periods must be a positive integer");
const activePeriod = shortProbe ? 1 : windowPeriods === undefined ? 8_000 : 0;
const checkpoints = shortProbe
  ? [1, 100]
  : windowPeriods === undefined
    ? [8_000, 8_001, 8_008, 9_000, 10_000, 12_000, 16_000, 20_000]
    : [windowPeriods];
const scenariosArgument = process.argv.find((argument) =>
  argument.startsWith("--scenarios="),
);
const scenarioNames = (scenariosArgument?.slice("--scenarios=".length) ?? "B,F")
  .split(",")
  .filter(Boolean);
if (scenarioNames.some((scenario) => !["B", "F", "G", "J"].includes(scenario)))
  throw new Error("--scenarios accepts only B,F,G,J");
const debugMode = process.argv.includes("--debug");
const phaseInstrumentation = !process.argv.includes("--disable-perf");
const calibrationArgument = process.argv.find((argument) =>
  argument.startsWith("--calibration-ms-per-call="),
);
const calibrationMsPerCall = calibrationArgument
  ? Number(calibrationArgument.slice("--calibration-ms-per-call=".length))
  : 0;
if (
  !Number.isFinite(calibrationMsPerCall) ||
  calibrationMsPerCall < 0 ||
  calibrationMsPerCall > 20
)
  throw new Error("--calibration-ms-per-call must be between 0 and 20");
const disableAutoMad = process.argv.includes("--disable-auto-mad");
const sampleMissedOpportunities = process.argv.includes(
  "--sample-missed-opportunities",
);
const stage4fProbeArgument = process.argv.find((argument) =>
  argument.startsWith("--stage4f-probe="),
);
const stage4fProbe = stage4fProbeArgument?.slice("--stage4f-probe=".length);
if (
  stage4fProbe !== undefined &&
  ![
    "research-before-fresh",
    "research-after-fresh",
    "market-route-count",
  ].includes(stage4fProbe)
)
  throw new Error("unsupported Stage 4F probe");
const activeCheckpoints = shortProbe
  ? checkpoints
  : windowPeriods !== undefined
    ? checkpoints
    : debugMode
      ? stage4fProbe === "market-route-count"
        ? [8_000, 8_001, 8_008, 8_016]
        : [8_000, 8_001, 8_008]
      : checkpoints;
const snapshotPeriods = [
  ...new Set([
    ...(shortProbe
      ? [1, 100]
      : windowPeriods !== undefined
        ? [windowPeriods]
        : [
            8_000,
            8_001,
            ...Array.from({ length: 121 }, (_, index) => 8_000 + index * 100),
            20_000,
          ]),
  ]),
];
const measurementSnapshots = windowPeriods === undefined ? snapshotPeriods : [];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

if (
  execFileSync("git", ["branch", "--show-current"], {
    cwd: root,
    encoding: "utf8",
  }).trim() !== "deadspace"
)
  throw new Error("Stage 4A must run on deadspace");
execFileSync("git", ["merge-base", "--is-ancestor", startCommit, "HEAD"], {
  cwd: root,
  stdio: "ignore",
});
const [saveText, settingsText, metadata] = await Promise.all([
  readFile(savePath, "utf8"),
  readFile(settingsPath, "utf8"),
  readFile(path.join(root, "src/userscript.meta.js"), "utf8"),
]);
const settings = Object.freeze({
  ...JSON.parse(settingsText),
  ...(disableAutoMad ? { autoPrestige: false } : {}),
  autoSmelter: true,
  autoMarket: true,
  buyTitanium: true,
});
const policyBundle = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["experiments/stage4a-goal-aware-acquisition.ts"],
  bundle: true,
  write: false,
  format: "iife",
  globalName: "EAStage4a",
  platform: "browser",
  target: ["esnext"],
  minifySyntax: true,
  treeShaking: true,
});
const built = await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["src/main.ts"],
  bundle: true,
  write: false,
  banner: {
    js: `${metadata.trimEnd()}\n\n${policyBundle.outputFiles[0].text}\nwindow.__EA_TEST_HOOKS__ = window.__EA_TEST_HOOKS__ ?? {};`,
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
await writeFile(bundlePath, built.outputFiles[0].contents);

function installObservers(
  scenario,
  diagnosticSamplingEnabled,
  stage4fProbe,
  activeOnInstall,
  calibrationMsPerCall,
) {
  const hooks = window.__EA_TEST_HOOKS__;
  hooks.gatherIntervention = { resourceClaimMode: "goal-derived-conjunctive" };
  hooks.readPeriodForTest = () => window.__EA_RUNNER__.periods();
  hooks.researchOwnerSelectionEvents = [];
  hooks.stage4aScenario = scenario;
  hooks.preserveGoalDemandMoneyFloorForTest = ["G", "J"].includes(scenario);
  hooks.allowHistoricalGoalComparisonForTest = ["F", "G"].includes(scenario);
  hooks.stage4aActive = activeOnInstall;
  hooks.stage4aRecordFromNow = activeOnInstall;
  hooks.stage4aDecisions = [];
  hooks.stage4aProposedSignals = [];
  hooks.stage4aAcceptedSignals = [];
  hooks.stage4aTraceCounts = {};
  hooks.stage4aCaptureFailures = [];
  hooks.stage4aSelectionCalls = 0;
  hooks.stage4aSelectorProfile = {
    calls: 0,
    catalogCaptureTotalMs: 0,
    selectorTotalMs: 0,
    catalogCaptureMaxMs: 0,
    selectorMaxMs: 0,
  };
  hooks.stage4aSelectorFailures = [];
  hooks.stage4aCalibration = { calls: 0, elapsedMs: 0, checksum: 0 };
  hooks.stage4aPlans = [];
  hooks.stage4aApplied = [];
  hooks.stage4aControlEvents = [];
  hooks.stage4aLastDecisionKey = "";
  hooks.stage4aLastPlanKey = "";
  hooks.stage4fProbe = stage4fProbe;
  hooks.stage4fEvents = [];
  hooks.stage4fFenceEvents = [];
  hooks.stage4fFenceMeasurements = [];
  hooks.stage4fFreshSignal = undefined;
  hooks.stage4dPreflight = {
    noGoalCandidate: 0,
    noImportableShortfall: 0,
    alreadyAdequatelyDemanded: 0,
    candidatePlanUnchanged: 0,
    candidateCouldChangePlan: 0,
    incompleteEvidence: 0,
    freshRequested: 0,
    freshAccepted: 0,
    freshRejectedOrChanged: 0,
    freshCatalogUnavailable: 0,
    diagnosticFreshDraws: 0,
    diagnosticGoalCandidates: 0,
    diagnosticPlanChangingCandidates: 0,
    diagnosticMissedOpportunities: 0,
    diagnosticUnresolved: 0,
    diagnosticObservations: [],
    categories: [],
    diagnosticEveryNoHintCalls: 32,
    diagnosticSamplingEnabled,
    noHintCalls: 0,
  };
  hooks.selectGoalAwareMarketDemandForTest = (input, context) => {
    const period = window.__EA_RUNNER__.periods();
    let acceptedAuthoritySignal;
    hooks.stage4aSelectionCalls += 1;
    if (!["F", "G", "J"].includes(scenario) || !hooks.stage4aActive)
      return undefined;
    const now = () => window.eaDiagnosticsNow?.() ?? performance.now();
    const catalogStarted = now();
    const catalog = hooks.readCurrentResearchCatalog?.();
    const catalogCaptureMs = now() - catalogStarted;
    const selectorStarted = now();
    let decision;
    try {
      decision = window.EAStage4a.evaluateGoalAwareAcquisition(
        catalog,
        input,
        context,
      );
    } catch (error) {
      const reason = String(error);
      if (!hooks.stage4aSelectorFailures.includes(reason))
        hooks.stage4aSelectorFailures.push(reason);
      decision = {
        status: "unavailable",
        reason: `test selector failed: ${reason}`,
        candidates: [],
      };
    }
    const selectorMs = now() - selectorStarted;
    if (calibrationMsPerCall > 0) {
      const started = window.__EA_RUNNER__.nativeNow();
      const deadline = started + calibrationMsPerCall;
      let checksum = hooks.stage4aCalibration.checksum;
      while (window.__EA_RUNNER__.nativeNow() < deadline)
        checksum = (Math.imul(checksum, 1664525) + 1013904223) >>> 0;
      hooks.stage4aCalibration.checksum = checksum;
      hooks.stage4aCalibration.calls += 1;
      hooks.stage4aCalibration.elapsedMs +=
        window.__EA_RUNNER__.nativeNow() - started;
    }
    const profile = hooks.stage4aSelectorProfile;
    profile.calls += 1;
    profile.catalogCaptureTotalMs += catalogCaptureMs;
    profile.selectorTotalMs += selectorMs;
    profile.catalogCaptureMaxMs = Math.max(
      profile.catalogCaptureMaxMs,
      catalogCaptureMs,
    );
    profile.selectorMaxMs = Math.max(profile.selectorMaxMs, selectorMs);
    const key = JSON.stringify([
      decision.status,
      decision.selectedActionId,
      decision.selectedOfferGeneration,
      decision.resourceId,
      decision.targetQuantity,
      decision.shortfall,
      decision.reason,
    ]);
    if (
      key !== hooks.stage4aLastDecisionKey ||
      [8_000, 8_001, 8_008, 9_000, 10_000, 12_000, 16_000, 20_000].includes(
        period,
      )
    ) {
      hooks.stage4aDecisions.push({ period, ...decision });
      hooks.stage4aLastDecisionKey = key;
    }
    if (decision.status === "signal") {
      hooks.stage4aProposedSignals.push({
        period,
        selectedActionId: decision.selectedActionId,
        selectedOfferGeneration: decision.selectedOfferGeneration,
        resourceId: decision.resourceId,
        targetQuantity: decision.targetQuantity,
        shortfall: decision.shortfall,
      });
    }
    if (scenario === "J") {
      const preflight = hooks.stage4dPreflight;
      const hintedActionId = decision.selectedActionId;
      const hintedResourceId = decision.resourceId;
      let category;
      let requestedConditionalFresh = false;
      if (decision.status === "unavailable") {
        preflight.incompleteEvidence += 1;
        category = "incomplete-preliminary-evidence";
      } else if (decision.candidates.length === 0) {
        preflight.noGoalCandidate += 1;
        category = "no-goal-candidate";
      } else if (
        decision.status === "candidate-not-marketable" ||
        decision.status === "candidate-affordable"
      ) {
        preflight.noImportableShortfall += 1;
        category = "no-importable-shortfall";
      } else if (decision.status === "already-demanded") {
        preflight.alreadyAdequatelyDemanded += 1;
        category = "already-adequately-demanded";
      } else if (decision.status === "signal") {
        const changesPlan = window.EAStage4a.stage4dWouldDemandChangeMarketPlan(
          input,
          decision.resourceId,
        );
        if (changesPlan === undefined) {
          preflight.incompleteEvidence += 1;
          category = "incomplete-market-plan-evidence";
        } else if (!changesPlan) {
          preflight.candidatePlanUnchanged += 1;
          category = "candidate-does-not-change-market-plan";
        } else {
          preflight.candidateCouldChangePlan += 1;
          category = "candidate-could-change-market-plan";
          requestedConditionalFresh = true;
          preflight.freshRequested += 1;
          if (
            stage4fProbe === "research-before-fresh" &&
            hooks.stage4fEvents.length === 0
          ) {
            const offer = catalog?.offers?.find(
              (candidate) => candidate.elementId === hintedActionId,
            );
            const invoked = offer
              ? hooks.invokeResearchActionForTest?.(offer.elementId)
              : undefined;
            hooks.stage4fEvents.push({
              probe: stage4fProbe,
              point: "after-preliminary-selection-before-protected-draw",
              preliminary: {
                selectedActionId: hintedActionId,
                selectedOfferGeneration: decision.selectedOfferGeneration,
                resourceId: hintedResourceId,
                targetQuantity: decision.targetQuantity,
                shortfall: decision.shortfall,
              },
              nativeActionId: offer?.elementId,
              injectionSurface: invoked?.ok
                ? "captured native Research action control"
                : (invoked?.reason ?? "none"),
              invokeResult: invoked,
              queueEvidenceBefore: catalog?.queueEvidence,
            });
          }
          const freshStarted = now();
          const freshCatalog = hooks.readCurrentResearchCatalog?.(
            undefined,
            true,
          );
          const freshCaptureMs = now() - freshStarted;
          profile.catalogCaptureTotalMs += freshCaptureMs;
          profile.catalogCaptureMaxMs = Math.max(
            profile.catalogCaptureMaxMs,
            freshCaptureMs,
          );
          if (
            freshCatalog?.current !== true ||
            freshCatalog.source !== "protected-fresh-draw"
          ) {
            preflight.freshCatalogUnavailable += 1;
            decision = {
              status: "unavailable",
              reason: "protected fresh Research catalog unavailable",
              candidates: decision.candidates,
            };
            category = "fresh-catalog-unavailable";
          } else {
            const validationStarted = now();
            const validation = window.EAStage4a.evaluateGoalAwareAcquisition(
              freshCatalog,
              input,
              context,
            );
            const freshHolding = freshCatalog.resourceSamples?.find(
              (sample) => sample.resourceId === decision.resourceId,
            );
            const currentMarketResource = context.resources?.find(
              (resource) => resource.resourceId === decision.resourceId,
            );
            const validationMs = now() - validationStarted;
            profile.selectorTotalMs += validationMs;
            profile.selectorMaxMs = Math.max(
              profile.selectorMaxMs,
              validationMs,
            );
            const freshPlanStillChanges =
              validation.status === "signal"
                ? window.EAStage4a.stage4dWouldDemandChangeMarketPlan(
                    input,
                    validation.resourceId,
                  )
                : false;
            if (
              validation.status === "signal" &&
              validation.selectedActionId === decision.selectedActionId &&
              validation.resourceId === decision.resourceId &&
              freshHolding?.holding === currentMarketResource?.holding &&
              freshHolding?.capacity === currentMarketResource?.capacity &&
              freshPlanStillChanges === true
            ) {
              preflight.freshAccepted += 1;
              category = "fresh-candidate-accepted";
              decision = validation;
              const selectedOffer = freshCatalog.offers.find(
                (offer) => offer.elementId === validation.selectedActionId,
              );
              const selectedGrantLevel =
                selectedOffer === undefined
                  ? undefined
                  : (freshCatalog.grantLevels.find(
                      ([technology]) =>
                        technology === selectedOffer.grantTechnology,
                    )?.[1] ?? 0);
              const selectedApplicability = freshCatalog.applicability.find(
                ([actionId]) => actionId === validation.selectedActionId,
              )?.[1];
              const selectedGoalCandidate = validation.candidates.find(
                (candidate) =>
                  candidate.actionId === validation.selectedActionId,
              );
              if (
                selectedOffer === undefined ||
                typeof selectedOffer.offerObservationId !== "string" ||
                typeof selectedOffer.offerSetIdentity !== "string" ||
                selectedGrantLevel === undefined ||
                selectedApplicability === undefined ||
                selectedGoalCandidate === undefined
              ) {
                preflight.freshRejectedOrChanged += 1;
                category = "fresh-authority-evidence-incomplete";
                decision = {
                  status: "unavailable",
                  reason: category,
                  candidates: validation.candidates,
                };
              } else {
                if (stage4fProbe === "research-before-fresh") {
                  hooks.stage4fEvents[0] = {
                    ...hooks.stage4fEvents[0],
                    queueEvidenceAfter: freshCatalog.queueEvidence,
                    validation: {
                      status: validation.status,
                      selectedActionId: validation.selectedActionId,
                      selectedOfferGeneration:
                        validation.selectedOfferGeneration,
                      resourceId: validation.resourceId,
                      targetQuantity: validation.targetQuantity,
                      shortfall: validation.shortfall,
                    },
                  };
                }
                acceptedAuthoritySignal = Object.freeze({
                  ...validation,
                  goalId: validation.goalId,
                  goalActionId: validation.goalActionId,
                  rootGeneration: validation.rootGeneration,
                  progressionEpoch: validation.progressionEpoch,
                  selectedActionId: validation.selectedActionId,
                  selectedOfferGeneration: validation.selectedOfferGeneration,
                  resourceId: validation.resourceId,
                  targetQuantity: validation.targetQuantity,
                  shortfall: validation.shortfall,
                  researchPermission: freshCatalog.researchPermission,
                  selectedPrestige: freshCatalog.selectedPrestige,
                  triggersEnabled: freshCatalog.triggersEnabled,
                  offerObservationId: selectedOffer.offerObservationId,
                  offerSetIdentity: selectedOffer.offerSetIdentity,
                  grantTechnology: selectedOffer.grantTechnology,
                  grantLevel: selectedOffer.grantLevel,
                  grantLevelBefore: selectedGrantLevel,
                  researchPrice: selectedOffer.cost,
                  nativeAffordable: selectedOffer.nativeAffordable,
                  selectedApplicabilityStatus: selectedApplicability.status,
                  goalRelationship: `${selectedGoalCandidate.relevance}:${selectedGoalCandidate.pathApplicability}`,
                  goalChainIdentity:
                    selectedGoalCandidate.chainActionIds.join(">"),
                  grantLevels: freshCatalog.grantLevels,
                  offers: freshCatalog.offers,
                  queueEvidence: freshCatalog.queueEvidence,
                });
                hooks.stage4fFreshSignal = acceptedAuthoritySignal;
              }
            } else {
              preflight.freshRejectedOrChanged += 1;
              category =
                freshHolding?.holding !== currentMarketResource?.holding ||
                freshHolding?.capacity !== currentMarketResource?.capacity
                  ? "fresh-resource-evidence-changed"
                  : "fresh-candidate-rejected-or-changed";
              decision = {
                status: "unavailable",
                reason: `fresh validation changed candidate: ${validation.status}`,
                candidates: validation.candidates,
              };
            }
          }
        }
      }
      if (!requestedConditionalFresh) {
        preflight.noHintCalls += 1;
        if (
          preflight.diagnosticSamplingEnabled &&
          preflight.noHintCalls % preflight.diagnosticEveryNoHintCalls === 0
        ) {
          preflight.diagnosticFreshDraws += 1;
          const diagnosticCatalog = hooks.readCurrentResearchCatalog?.(
            undefined,
            true,
          );
          if (
            diagnosticCatalog?.current !== true ||
            diagnosticCatalog.source !== "protected-fresh-draw"
          ) {
            preflight.diagnosticUnresolved += 1;
            preflight.diagnosticObservations.push({
              period,
              outcome: "fresh-catalog-unresolved",
              preflightCategory: category,
            });
          } else {
            const freshOpportunity =
              window.EAStage4a.evaluateGoalAwareAcquisition(
                diagnosticCatalog,
                input,
                context,
              );
            const planChanges =
              freshOpportunity.status === "signal"
                ? window.EAStage4a.stage4dWouldDemandChangeMarketPlan(
                    input,
                    freshOpportunity.resourceId,
                  )
                : false;
            const hasFreshGoalCandidate =
              freshOpportunity.candidates.length > 0;
            if (hasFreshGoalCandidate) preflight.diagnosticGoalCandidates += 1;
            if (planChanges === true) {
              preflight.diagnosticPlanChangingCandidates += 1;
              preflight.diagnosticMissedOpportunities += 1;
            }
            preflight.diagnosticObservations.push({
              period,
              outcome:
                planChanges === true
                  ? "missed-plan-changing-opportunity"
                  : hasFreshGoalCandidate
                    ? "fresh-candidate-no-importable-shortfall-or-plan-change"
                    : "no-fresh-goal-candidate",
              preflightCategory: category,
              freshStatus: freshOpportunity.status,
              freshActionId: freshOpportunity.selectedActionId,
              freshResourceId: freshOpportunity.resourceId,
            });
          }
        }
      }
      preflight.categories.push({
        period,
        category,
        hintedActionId,
        hintedResourceId,
        status: decision.status,
      });
    }
    return acceptedAuthoritySignal ?? decision;
  };
  hooks.resolveTradeRouteOperationsForTest = (input, planned, context) => {
    const signal = hooks.stage4fFreshSignal;
    const probe = hooks.stage4fProbe;
    if (signal === undefined || probe === undefined) return undefined;
    hooks.stage4fFreshSignal = undefined;
    if (probe === "market-route-count") {
      if (hooks.stage4fEvents.some((event) => event.probe === probe))
        return undefined;
      const resourceId = input.priorityList.find(
        (resource) => resource.tradeRoutes > 0,
      )?.id;
      const before = resourceId
        ? hooks.capturedTradeRouteControlForTest?.inspect(resourceId)
        : undefined;
      const injected = resourceId
        ? hooks.capturedTradeRouteControlForTest?.removeOne(resourceId)
        : undefined;
      const after = resourceId
        ? hooks.capturedTradeRouteControlForTest?.inspect(resourceId)
        : undefined;
      hooks.stage4fEvents.push({
        probe,
        period: window.__EA_RUNNER__.periods(),
        acceptedFreshSignal: signal,
        appliedCountAtInjection: hooks.stage4aApplied.length,
        injectedResourceId: resourceId,
        before,
        injected,
        after,
        plannedOperations: planned.operations,
      });
      return undefined;
    }
    if (probe === "research-after-fresh") {
      const offer = signal.offers?.find(
        (candidate) => candidate.elementId === signal.selectedActionId,
      );
      const beforeOffers = signal.offers?.map(
        (candidate) => candidate.elementId,
      );
      const invoked = offer
        ? hooks.invokeResearchActionForTest?.(offer.elementId)
        : undefined;
      const changed = invoked?.ok
        ? hooks.readCurrentResearchCatalog?.(undefined, true)
        : undefined;
      const postMutationDecision = changed
        ? window.EAStage4a.evaluateGoalAwareAcquisition(changed, input, context)
        : undefined;
      hooks.stage4fEvents.push({
        probe,
        period: window.__EA_RUNNER__.periods(),
        acceptedFreshSignal: signal,
        acceptedGeneration: signal.selectedOfferGeneration,
        appliedCountAtInjection: hooks.stage4aApplied.length,
        injectedActionId: offer?.elementId,
        injectedGrantTechnology: offer?.grantTechnology,
        injectionSurface: invoked?.ok
          ? "captured native Research action control"
          : (invoked?.reason ?? "none"),
        invokeResult: invoked,
        grantLevelsBefore: signal.grantLevels,
        grantLevelsAfter: changed?.grantLevels,
        offersBefore: beforeOffers,
        offersAfter: changed?.offers?.map((candidate) => candidate.elementId),
        currentSelectedOffer: changed?.offers?.find(
          (candidate) => candidate.elementId === signal.selectedActionId,
        ),
        currentSelectedGeneration: changed?.offers?.find(
          (candidate) => candidate.elementId === signal.selectedActionId,
        )?.generation,
        permissionAfter: changed?.researchPermission,
        queueEvidenceAfter: changed?.queueEvidence,
        postMutationDecision,
        plannedOperations: planned.operations,
      });
    }
    return undefined;
  };
  hooks.recordTradeRouteTraceForTest = (event) => {
    const period = window.__EA_RUNNER__.periods();
    hooks.stage4aTraceCounts[event.kind] =
      (hooks.stage4aTraceCounts[event.kind] ?? 0) + 1;
    if (event.kind === "research-final-fence")
      hooks.stage4fFenceMeasurements.push({ period, ...event });
    if (
      event.kind === "capture-unavailable" &&
      !hooks.stage4aCaptureFailures.includes(event.reason)
    )
      hooks.stage4aCaptureFailures.push(event.reason);
    if (
      event.kind === "skipped" &&
      typeof event.reason === "string" &&
      ((hooks.stage4fProbe === "research-after-fresh" &&
        event.reason.startsWith("research-")) ||
        (hooks.stage4fProbe === "market-route-count" &&
          event.reason === "market-route-count-stale"))
    )
      hooks.stage4fFenceEvents.push({
        period,
        appliedCount: hooks.stage4aApplied.length,
        ...event,
      });
    if (event.kind === "plan" && hooks.stage4aRecordFromNow) {
      if (typeof event.testDemandResourceId === "string") {
        hooks.stage4aAcceptedSignals.push({
          period,
          resourceId: event.testDemandResourceId,
          moneyFloorPolicy: event.testDemandMoneyFloorPolicy,
          plannerChanged:
            JSON.stringify(event.plannerOperations) !==
            JSON.stringify(event.baselineOperations),
          plannedOperations: event.plannerOperations,
          desiredOperations: event.desiredOperations,
        });
      }
      const key = JSON.stringify([
        event.testDemandResourceId,
        event.desiredOperations,
        event.plannerOperations,
      ]);
      const checkpoint = [
        8_000, 8_001, 8_008, 9_000, 10_000, 12_000, 16_000, 20_000,
      ].includes(period);
      if (checkpoint || key !== hooks.stage4aLastPlanKey) {
        const target = event.testDemandResourceId;
        hooks.stage4aPlans.push({
          period,
          kind: event.kind,
          testDemandResourceId: target,
          routeCount: event.routeCount,
          maximumRoutes: event.maximumRoutes,
          moneyRate: event.moneyRate,
          moneyHolding: event.moneyHolding,
          moneyFloor: event.moneyFloor,
          operations: event.desiredOperations,
          baselineOperations: event.baselineOperations,
          plannerOperations: event.plannerOperations,
          pricesAndPriorities: checkpoint
            ? event.pricesAndPriorities
            : undefined,
          resources: checkpoint ? event.resources : undefined,
          resource: event.resources?.find(
            (resource) => resource.resourceId === target,
          ),
        });
        hooks.stage4aLastPlanKey = key;
      }
    } else if (hooks.stage4aRecordFromNow) {
      if (event.kind === "applied")
        hooks.stage4aApplied.push({ period, ...event });
      if (event.kind === "skipped" || event.kind === "capture-unavailable")
        hooks.stage4aControlEvents.push({ period, ...event });
    }
  };
}

function assignmentSnapshot(state) {
  return Object.entries(state.resource ?? {})
    .filter(
      ([id, resource]) =>
        id !== "Money" &&
        Number.isFinite(resource.trade) &&
        resource.trade !== 0,
    )
    .map(([resourceId, resource]) => ({ resourceId, routes: resource.trade }))
    .sort((left, right) => left.resourceId.localeCompare(right.resourceId));
}

function allResourceSnapshot(state) {
  return Object.fromEntries(
    Object.entries(state.resource ?? {}).map(([resourceId, resource]) => [
      resourceId,
      {
        amount: resource.amount,
        capacity: resource.max,
        rate: resource.diff,
        routes: resource.trade,
      },
    ]),
  );
}

function madEvidence(state) {
  return {
    techLevels: {
      highTech: state.tech?.high_tech,
      smelting: state.tech?.smelting,
      titanium: state.tech?.titanium,
      explosives: state.tech?.explosives,
      uranium: state.tech?.uranium,
      mad: state.tech?.mad,
    },
    factoryCount: state.city?.factory?.count,
    buildQueue: state.queue,
    researchQueue: state.r_queue,
    construction: {
      factory: state.city?.factory,
      government: state.city?.government,
      space: state.space,
    },
  };
}

const runner = await createChromiumRunner({
  game: gamePath,
  upstream: "D:/work/Evolve-DeadSpace",
});
if (runner.inputs.gameSnapshot.commit !== upstreamCommit.slice(0, 8)) {
  await runner.close();
  throw new Error(
    `Expected ${upstreamCommit}, got ${runner.inputs.gameSnapshot.commit}`,
  );
}
const result = {
  inputs: {
    branch: "deadspace",
    startingHead: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    upstreamCommit,
    snapshot: runner.inputs.gameSnapshot,
    runner: runner.inputs.runner,
    bundleSha256: sha256(built.outputFiles[0].contents),
    save: path.relative(root, savePath),
    saveSha256: sha256(saveText),
    settings: path.relative(root, settingsPath),
    settingsSha256: sha256(settingsText),
    effectiveSettingsSha256: sha256(JSON.stringify(settings)),
    effectiveOverrides: {
      ...(disableAutoMad ? { autoPrestige: false } : {}),
      autoMarket: true,
      autoSmelter: true,
      buyTitanium: settings.res_trade_buy_Titanium,
    },
    seed: 42,
    epoch: "2026-09-21T00:00:00.000Z",
    gatherIntervention: "goal-derived-conjunctive",
    missedOpportunitySampling: sampleMissedOpportunities
      ? "enabled every 32 no-hint calls"
      : "disabled",
    phaseInstrumentation,
    activeAfterPeriod: activePeriod,
    boundedWindowPeriods: windowPeriods,
    checkpoints: activeCheckpoints,
    snapshotPeriods: measurementSnapshots,
    calibrationMsPerCall,
    extensionRule:
      "Continue to p30000 when High Tech remains below 7 and all Money samples through p20000 plus current Money are positive.",
    demandSource:
      "one-cycle test-only signal from current native Research candidate price",
    moneyFloor: "unchanged native planTradeRoutes input settings and decision",
  },
  scenarios: [],
};

try {
  for (const scenario of scenarioNames) {
    const session = await runner.openSession({
      bundle: bundlePath,
      save: parseSave(saveText),
      settings,
      seed: 42,
      epoch: Date.parse(result.inputs.epoch),
      perf: phaseInstrumentation,
      callbackProfile: process.argv.includes("--callback-profile"),
      forwardPerfSummary: phaseInstrumentation,
      snapshotAt: measurementSnapshots,
    });
    try {
      await session.evaluate(
        installObservers,
        scenario,
        sampleMissedOpportunities,
        scenario === "J" ? stage4fProbe : undefined,
        activePeriod === 0,
        calibrationMsPerCall,
      );
      console.log(`${scenario}: opened exact Chromium session`);
      let period = 0;
      const outputCheckpoints = [];
      const lastResearchEvent = { index: 0 };
      const sample = async (at) => {
        const [state, catalog, hooks] = await Promise.all([
          session.readState(),
          session.evaluate(() =>
            window.__EA_TEST_HOOKS__.readCurrentResearchCatalog?.(),
          ),
          session.evaluate(() => ({
            decisions:
              window.__EA_TEST_HOOKS__.stage4aDecisions?.slice(-12) ?? [],
            plans: window.__EA_TEST_HOOKS__.stage4aPlans?.slice(-20) ?? [],
            applied: window.__EA_TEST_HOOKS__.stage4aApplied?.slice(-30) ?? [],
            controlEvents:
              window.__EA_TEST_HOOKS__.stage4aControlEvents?.slice(-30) ?? [],
            traceCounts: window.__EA_TEST_HOOKS__.stage4aTraceCounts ?? {},
            captureFailures:
              window.__EA_TEST_HOOKS__.stage4aCaptureFailures ?? [],
            selectionCalls: window.__EA_TEST_HOOKS__.stage4aSelectionCalls ?? 0,
            selectorFailures:
              window.__EA_TEST_HOOKS__.stage4aSelectorFailures ?? [],
            stage4dPreflight: window.__EA_TEST_HOOKS__.stage4dPreflight ?? {},
            stage4fEvents: window.__EA_TEST_HOOKS__.stage4fEvents ?? [],
            researchEvents:
              window.__EA_TEST_HOOKS__.researchOwnerSelectionEvents ?? [],
            lastResearch: window.__EA_TEST_HOOKS__.researchOwnerSelectionLast,
          })),
        ]);
        const researchEvents = hooks.researchEvents.slice(
          lastResearchEvent.index,
        );
        lastResearchEvent.index = hooks.researchEvents.length;
        return {
          period: at,
          resources: allResourceSnapshot(state),
          mad: madEvidence(state),
          market: {
            used: state.city?.market?.trade,
            capacity: state.city?.market?.mtrade,
            assignments: assignmentSnapshot(state),
            recentPlans: hooks.plans,
            recentApplied: hooks.applied,
            recentControlEvents: hooks.controlEvents,
            traceCounts: hooks.traceCounts,
            captureFailures: hooks.captureFailures,
            selectionCalls: hooks.selectionCalls,
            selectorFailures: hooks.selectorFailures,
          },
          nativeResearch: {
            current: catalog?.current,
            selectedPrestige: catalog?.selectedPrestige,
            rootGeneration: catalog?.rootGeneration,
            progressionEpoch: catalog?.progressionEpoch,
            offers: catalog?.offers,
            definitions: catalog?.definitions,
            grantLevels: catalog?.grantLevels,
            applicability: catalog?.applicability,
            queueEvidence: catalog?.queueEvidence,
            researchPermission: catalog?.researchPermission,
            eventsSincePriorCheckpoint: researchEvents,
            lastSelection: hooks.lastResearch,
          },
          goalDemand: hooks.decisions,
        };
      };

      const measurementStartedAt = performance.now();
      const [cpuBefore, metricsBefore] = await Promise.all([
        runner.processCpu(),
        session.metrics(),
      ]);
      const initialCountersReadAt = performance.now();
      for (const targetPeriod of activeCheckpoints) {
        if (targetPeriod <= period) continue;
        await session.advance(targetPeriod - period);
        period = targetPeriod;
        if (windowPeriods === undefined) {
          outputCheckpoints.push(await sample(period));
          console.log(`${scenario}: captured p${period}`);
        }
        if (period === activePeriod) {
          await session.evaluate(() => {
            window.__EA_TEST_HOOKS__.stage4aRecordFromNow = true;
            window.__EA_TEST_HOOKS__.stage4aActive = true;
          });
        }
      }
      let measurementEnd;
      const readFinalCounters = async () => {
        const measurementEndMarkerAt = performance.now();
        const finalCountersReadStartedAt = performance.now();
        const [cpuAfter, metricsAfter] = await Promise.all([
          runner.processCpu(),
          session.metrics(),
        ]);
        return {
          measurementEndMarkerAt,
          finalCountersReadStartedAt,
          finalCountersReadCompletedAt: performance.now(),
          cpuAfter,
          metricsAfter,
        };
      };
      if (windowPeriods !== undefined)
        measurementEnd = await readFinalCounters();
      const snapshots =
        windowPeriods === undefined ? await session.snapshots() : {};
      const moneySamples = Object.entries(snapshots)
        .map(([at, snapshot]) => ({
          period: Number(at),
          amount: parseSave(snapshot.exportSave).resource?.Money?.amount,
          randomCalls: snapshot.randomCalls,
        }))
        .filter((entry) => Number.isFinite(entry.amount));
      const sampledMoneyMinimum = moneySamples.reduce(
        (minimum, entry) => (entry.amount < minimum.amount ? entry : minimum),
        moneySamples[0] ?? { period: null, amount: null },
      );
      const stateAt20000 = await session.readState();
      let extensionDecision = {
        status: "not-needed",
        reason: "p20000 is not a checkpoint or selected goal is complete",
      };
      if (
        !debugMode &&
        period === 20_000 &&
        (stateAt20000.tech?.high_tech ?? 0) < 7 &&
        sampledMoneyMinimum.amount > 0 &&
        (stateAt20000.resource?.Money?.amount ?? 0) > 0
      ) {
        extensionDecision = {
          status: "extended",
          reason:
            "goal remains incomplete and sampled/current Money stayed positive through p20000",
        };
        const extendedCheckpoints = new Set([24_000, 28_000, 30_000]);
        for (
          let targetPeriod = 20_100;
          targetPeriod <= 30_000;
          targetPeriod += 100
        ) {
          await session.advance(100);
          period = targetPeriod;
          const state = await session.readState();
          moneySamples.push({
            period,
            amount: state.resource?.Money?.amount,
          });
          if (extendedCheckpoints.has(period)) {
            outputCheckpoints.push(await sample(period));
            console.log(`${scenario}: captured p${period}`);
          }
        }
      }
      if (windowPeriods !== undefined) {
        outputCheckpoints.push(await sample(period));
        console.log(`${scenario}: captured p${period}`);
      }
      // Full replays can extend from p20000 to p30000. Keep their established
      // snapshot/extension behavior and take final counters after that work.
      if (windowPeriods === undefined)
        measurementEnd = await readFinalCounters();
      const {
        measurementEndMarkerAt,
        finalCountersReadStartedAt,
        finalCountersReadCompletedAt,
        cpuAfter,
        metricsAfter,
      } = measurementEnd;
      const wallMs =
        (windowPeriods === undefined
          ? finalCountersReadStartedAt
          : measurementEndMarkerAt) - initialCountersReadAt;
      const diagnostics = await session.diagnostics();
      const calibration = await session.evaluate(
        () => window.__EA_TEST_HOOKS__.stage4aCalibration,
      );
      const state = await session.readState();
      const finalExport = await session.exportSave();
      const workCycleCallbacks = (diagnostics.callbackDurationsMs ?? [])
        .filter((entry) => entry.period % 8 === 0)
        .map((entry) => entry.durationMs)
        .sort((left, right) => left - right);
      const latencyAt = (fraction) =>
        workCycleCallbacks[
          Math.floor((workCycleCallbacks.length - 1) * fraction)
        ];
      const moneyMinimum = moneySamples.reduce(
        (minimum, entry) => (entry.amount < minimum.amount ? entry : minimum),
        moneySamples[0] ?? { period: null, amount: null },
      );
      const final = outputCheckpoints.at(-1);
      const researchSequence = await session.evaluate(
        () => window.__EA_TEST_HOOKS__.researchOwnerSelectionEvents ?? [],
      );
      const firstHunterPurchase = researchSequence.find(
        (event) =>
          event.actionId === "tech-hunter_process" &&
          event.disposition === "researched",
      );
      result.scenarios.push({
        scenario,
        checkpoints: outputCheckpoints,
        extensionDecision,
        final,
        firstHunterPurchase: firstHunterPurchase
          ? {
              period: firstHunterPurchase.period,
              cycle: firstHunterPurchase.cycle,
              grantAfter: firstHunterPurchase.grantAfter,
              disposition: firstHunterPurchase.disposition,
            }
          : undefined,
        money: {
          sampleCount: moneySamples.length,
          minimum: moneyMinimum.amount,
          minimumPeriod: moneyMinimum.period,
          final: final.resources.Money?.amount,
          denseSamples: moneySamples,
        },
        routePlans: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aPlans ?? [],
        ),
        demandDecisions: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aDecisions ?? [],
        ),
        proposedGoalDemandSignals: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aProposedSignals ?? [],
        ),
        acceptedGoalDemandSignals: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aAcceptedSignals ?? [],
        ),
        appliedRouteOperations: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aApplied ?? [],
        ),
        nativeControlEvents: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aControlEvents ?? [],
        ),
        traceCounts: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aTraceCounts ?? {},
        ),
        captureFailures: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aCaptureFailures ?? [],
        ),
        selectionCalls: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aSelectionCalls ?? 0,
        ),
        selectorProfile: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aSelectorProfile,
        ),
        selectorFailures: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4aSelectorFailures ?? [],
        ),
        stage4dPreflight: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4dPreflight ?? {},
        ),
        stage4fEvents: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4fEvents ?? [],
        ),
        stage4fFenceEvents: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4fFenceEvents ?? [],
        ),
        stage4fFenceMeasurements: await session.evaluate(
          () => window.__EA_TEST_HOOKS__.stage4fFenceMeasurements ?? [],
        ),
        researchSequence,
        diagnostics: {
          wallMs,
          measurementBoundary: {
            clock: "Node performance.now() monotonic milliseconds",
            start:
              "after setup and initial counters; immediately before first requested advance",
            startCounters: {
              readStartedAt: measurementStartedAt,
              readCompletedAt: initialCountersReadAt,
            },
            end:
              windowPeriods === undefined
                ? "after the final replay advance (including any extension); counters are queried before final diagnostics and export"
                : "immediately when final requested advance resolves; counters queried before exports or diagnostics",
            measurementEndMarkerAt,
            finalCountersReadStartedAt,
            finalCountersReadCompletedAt,
            requestedPeriods: windowPeriods ?? period,
            snapshotAtPeriods: measurementSnapshots,
            calibration,
          },
          rendererTaskSeconds:
            metricsAfter.TaskDuration - metricsBefore.TaskDuration,
          rendererScriptSeconds:
            metricsAfter.ScriptDuration - metricsBefore.ScriptDuration,
          processCpu: cpuAfter.map((entry) => {
            const before = cpuBefore.find((prior) => prior.id === entry.id);
            return {
              type: entry.type,
              id: entry.id,
              beforeCpuSec: before?.cpuSec,
              afterCpuSec: entry.cpuSec,
              cpuSec:
                before === undefined ? undefined : entry.cpuSec - before.cpuSec,
            };
          }),
          jsHeapBytes: metricsAfter.JSHeapUsedSize,
          domNodes: metricsAfter.Nodes,
          workTicks: diagnostics.workTicks,
          counts: diagnostics.counts,
          errors: diagnostics.errors,
          controlUsage: diagnostics.controlUsage,
          perfSummaries: diagnostics.perfSummaries,
          workCycleCallbackLatencyMs:
            workCycleCallbacks.length === 0
              ? undefined
              : {
                  count: workCycleCallbacks.length,
                  p50: latencyAt(0.5),
                  p95: latencyAt(0.95),
                  p99: latencyAt(0.99),
                  max: workCycleCallbacks.at(-1),
                },
        },
        finalAssignments: assignmentSnapshot(state),
        finalExportSha256: sha256(finalExport),
      });
    } finally {
      await session.close();
    }
  }
} finally {
  await runner.close();
}

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
for (const scenario of result.scenarios) {
  if (
    ["F", "G"].includes(scenario.scenario) &&
    !shortProbe &&
    !debugMode &&
    windowPeriods === undefined
  ) {
    assert.ok(
      scenario.proposedGoalDemandSignals.length > 0,
      `${scenario.scenario} must propose historical goal-demand signals`,
    );
    assert.ok(
      scenario.acceptedGoalDemandSignals.length > 0,
      `${scenario.scenario} historical signals must reach the Market planner`,
    );
  }
  if (
    scenario.scenario === "G" &&
    !shortProbe &&
    !debugMode &&
    windowPeriods === undefined
  ) {
    const distinctAcceptedPlans = scenario.routePlans.filter(
      (plan) => typeof plan.testDemandResourceId === "string",
    );
    const distinctChangedPlans = distinctAcceptedPlans.filter(
      (plan) =>
        JSON.stringify(plan.plannerOperations) !==
        JSON.stringify(plan.baselineOperations),
    );
    assert.equal(
      distinctAcceptedPlans.length,
      109,
      "G must match Stage 4B's 109 distinct accepted Market plan records",
    );
    assert.equal(
      distinctChangedPlans.length,
      109,
      "all 109 Stage 4B G plan records must differ from ordinary Market planning",
    );
  }
}
if (stage4fProbe === "research-after-fresh") {
  const scenario = result.scenarios.find((entry) => entry.scenario === "J");
  const injection = scenario?.stage4fEvents.find(
    (entry) => entry.probe === "research-after-fresh",
  );
  const fence = scenario?.stage4fFenceEvents.find(
    (entry) => entry.reason === "research-binding-generation-stale",
  );
  assert.equal(injection?.acceptedGeneration, 351);
  assert.equal(injection?.currentSelectedGeneration, 352);
  assert.ok(
    injection?.plannedOperations.some(
      (operation) => operation.resourceId === "Oil",
    ),
    "the stale batch must contain its intended Oil route operations",
  );
  assert.ok(fence, "final Research authority fence must reject generation 352");
  assert.equal(
    fence?.appliedCount,
    injection?.appliedCountAtInjection,
    "no Market route operation may run during the stale strategy batch",
  );
} else if (stage4fProbe === "market-route-count") {
  const scenario = result.scenarios.find((entry) => entry.scenario === "J");
  const injection = scenario?.stage4fEvents.find(
    (entry) => entry.probe === "market-route-count",
  );
  const fence = scenario?.stage4fFenceEvents.find(
    (entry) => entry.reason === "market-route-count-stale",
  );
  assert.equal(injection?.before?.routeCount, 93);
  assert.equal(injection?.after?.routeCount, 92);
  assert.ok(
    injection?.plannedOperations.length > 0,
    "the stale route-count probe must reject a non-empty planned batch",
  );
  assert.ok(fence, "Market route count change must refuse the planned batch");
  assert.equal(
    fence?.appliedCount,
    injection?.appliedCountAtInjection,
    "no operation from the stale route-count batch may execute",
  );
  assert.ok(
    scenario?.appliedRouteOperations.some(
      (operation) => operation.period > (injection?.period ?? Infinity),
    ),
    "the ordinary Market owner must apply a later current plan after the stale-batch refusal",
  );
}
console.log(
  JSON.stringify(
    {
      output: path.relative(root, outputPath),
      inputs: result.inputs,
      scenarios: result.scenarios.map((scenario) => ({
        scenario: scenario.scenario,
        extensionDecision: scenario.extensionDecision,
        money: scenario.money,
        milestones: scenario.checkpoints.map((entry) => ({
          period: entry.period,
          money: entry.resources.Money?.amount,
          titanium: entry.resources.Titanium?.amount,
          technology: entry.mad.techLevels,
          factoryCount: entry.mad.factoryCount,
          routeCount: entry.market.used,
          assignments: entry.market.assignments,
          demand: entry.goalDemand.at(-1),
        })),
        decisions: scenario.demandDecisions,
        workTicks: scenario.diagnostics.workTicks,
        wallMs: scenario.diagnostics.wallMs,
        rendererTaskSeconds: scenario.diagnostics.rendererTaskSeconds,
        rendererScriptSeconds: scenario.diagnostics.rendererScriptSeconds,
        goalDemand: {
          proposedSignals: scenario.proposedGoalDemandSignals.length,
          acceptedSignals: scenario.acceptedGoalDemandSignals.length,
          changedPlannerRecords: scenario.acceptedGoalDemandSignals.filter(
            (signal) => signal.plannerChanged,
          ).length,
          distinctAcceptedPlanRecords: scenario.routePlans.filter(
            (plan) => typeof plan.testDemandResourceId === "string",
          ).length,
          distinctChangedPlanRecords: scenario.routePlans.filter(
            (plan) =>
              typeof plan.testDemandResourceId === "string" &&
              JSON.stringify(plan.plannerOperations) !==
                JSON.stringify(plan.baselineOperations),
          ).length,
          nativeRouteOperations: scenario.appliedRouteOperations.length,
          finalFenceRecaptures: scenario.stage4fFenceMeasurements.length,
          finalFenceMs: scenario.stage4fFenceMeasurements.reduce(
            (total, entry) => total + (entry.durationMs ?? 0),
            0,
          ),
        },
      })),
    },
    null,
    2,
  ),
);
