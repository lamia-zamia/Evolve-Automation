import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { attributeResearchBottleneck } from "../src/domain/economy/research-bottleneck.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = path.resolve(
  root,
  process.argv[2] ?? "test-artifacts/benchmark/tmp/p12h-reviewed-replay.json",
);
const outputPath = path.resolve(
  root,
  process.argv[3] ?? "experiments/p12h-actual-progression-bottleneck.md",
);
const run = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const diagnosticPath = path.join(
  root,
  "test-artifacts/benchmark/tmp/p12h-mixed-time-diagnostic.json",
);
const diagnostic = JSON.parse(fs.readFileSync(diagnosticPath, "utf8"));
const capture = run.reachableCapture;
if (capture?.contractVersion !== 1 || !capture.exportSaveSha256)
  throw new Error("Input is missing a verified P12G capture contract.");
if (run.inputs?.testBundleSha256 !== capture.inputs?.testBundleSha256)
  throw new Error("Replay bundle does not match the verified capture.");
if (run.inputs?.testHarnessSha256 !== capture.inputs?.testHarnessSha256)
  throw new Error("Replay harness does not match the verified capture.");
if (diagnostic.before.savedStateSha256 !== diagnostic.after.savedStateSha256)
  throw new Error("Protected fresh draw changed saved economic state.");
if (
  diagnostic.captureExportSha256 !== capture.exportSaveSha256 ||
  diagnostic.testBundleSha256 !== run.inputs?.testBundleSha256 ||
  diagnostic.gameSnapshotSha256 !== capture.inputs?.gameSnapshotSha256 ||
  diagnostic.startingSaveSha256 !== capture.inputs?.startingSaveSha256 ||
  diagnostic.effectiveSettingsSha256 !==
    capture.inputs?.effectiveSettingsSha256 ||
  diagnostic.seed !== capture.inputs?.seed ||
  diagnostic.epoch !== capture.inputs?.epoch
)
  throw new Error("Fresh-draw diagnostic does not match the replay inputs.");
if (
  diagnostic.before.rootGeneration !== diagnostic.after.rootGeneration ||
  diagnostic.before.progressionEpoch !== diagnostic.after.progressionEpoch ||
  JSON.stringify(diagnostic.before.offer.cost) !==
    JSON.stringify(diagnostic.after.offer.cost) ||
  diagnostic.after.offer.nativeAffordable !== true
)
  throw new Error(
    "Fresh draw did not resolve with matching root, progression, price, and affordability.",
  );

const actionId =
  capture.currentOfferEvidence?.offer?.actionId ?? capture.offer?.elementId;
if (typeof actionId !== "string")
  throw new Error("Capture has no current action.");

function armObservations(arm) {
  const result = [];
  for (const sample of arm.samples ?? []) {
    const evidence = sample.researchDecisionEvidence;
    if (!evidence || evidence.offer?.elementId !== actionId) continue;
    const resources = Object.fromEntries(
      evidence.resources.map((resource) => [
        resource.resourceId,
        {
          amount: resource.holding,
          capacity: resource.capacity,
          netRate: resource.netRate,
        },
      ]),
    );
    result.push({
      period: evidence.period,
      rootGeneration: evidence.rootGeneration,
      progressionEpoch: evidence.progressionEpoch,
      current: evidence.catalogCurrent === true,
      permission: evidence.permission,
      eligibility: evidence.eligibility,
      queueEvidence: evidence.queueEvidence,
      offer: {
        actionId,
        generation: evidence.offer.generation,
        controlGeneration: evidence.targetControlGeneration,
        offerSetIdentity: evidence.offer.offerSetIdentity,
        cost: evidence.offer.cost,
        nativeAffordable: evidence.offer.nativeAffordable,
      },
      resources,
      commitments: { coverage: "unknown", items: [] },
      decision: { boundary: false },
      source: evidence,
    });
  }
  for (const sample of arm.samples ?? []) {
    for (const event of sample.researchDecisionEvidence?.ownerEvents ?? []) {
      const candidate = event.observed?.find(
        (entry) => entry.actionId === actionId,
      );
      if (!candidate || !Number.isSafeInteger(event.period)) continue;
      result.push({
        period: event.period,
        rootGeneration:
          event.rootGeneration ??
          sample.researchDecisionEvidence.rootGeneration,
        progressionEpoch:
          event.progressionEpoch ??
          sample.researchDecisionEvidence.progressionEpoch,
        current: event.catalogCurrent === true,
        permission: event.researchPermission,
        eligibility: event.targetEligibility,
        queueEvidence: event.queueEvidence,
        offer: {
          actionId,
          generation: candidate.offerGeneration,
          controlGeneration: candidate.offerGeneration,
          offerSetIdentity: candidate.offerSetIdentity,
          cost: candidate.cost,
          nativeAffordable: candidate.nativeAffordable,
        },
        resources: Object.fromEntries(
          Object.entries(candidate.observedResources ?? {}).map(
            ([id, value]) => [
              id,
              {
                amount: value.amount,
                capacity: value.max,
                netRate: value.rateOfChange,
              },
            ],
          ),
        ),
        commitments: { coverage: "unknown", items: [] },
        decision: {
          boundary: true,
          selectedActionId:
            event.disposition === "researched" ? actionId : undefined,
          invocationPeriod:
            event.disposition === "researched" ? event.period : undefined,
          nativeAffordable: candidate.nativeAffordable,
          resourceAffordable: candidate.resourceAffordable,
          reservation:
            candidate.reservation === "none" ? "none" : "unavailable",
        },
        source: { event, candidate },
      });
    }
  }
  return result.sort((a, b) => a.period - b.period);
}

const baselineArm = run.counterfactuals?.nativeBaseline;
const steelArm = run.counterfactuals?.alternative;
if (!baselineArm || !steelArm)
  throw new Error("Replay is missing a matched arm.");
const baseline = armObservations(baselineArm);
const steel = armObservations(steelArm);
const baselineResult = attributeResearchBottleneck(baseline);
const steelResult = attributeResearchBottleneck(steel);
if (baselineResult.status === "invalid" || steelResult.status === "invalid")
  throw new Error(
    `Invalid timeline: ${baselineResult.reason ?? steelResult.reason}`,
  );
const invocation = (arm) =>
  (arm?.samples ?? [])
    .flatMap((sample) => sample.newResearchInvocations ?? [])
    .filter(
      (entry) => entry.elementId === actionId && entry.method === "action",
    );
const baselineInvocations = invocation(baselineArm);
const steelInvocations = invocation(steelArm);
if (
  run.counterfactuals.matchedStart !== true ||
  run.counterfactuals.nonSmelterOrderedNativeInvocationsEqual !== true ||
  run.counterfactuals.researchDrawCountEqual !== true
)
  throw new Error("Matched-run production parity evidence failed.");
const purchaseEvents = (arm) =>
  arm
    .flatMap((entry) => (entry.source?.event ? [entry.source.event] : []))
    .filter(
      (event) =>
        event.actionId === actionId && event.disposition === "researched",
    );
const baselinePurchase = purchaseEvents(baseline).at(-1);
const steelPurchase = purchaseEvents(steel).at(-1);
const selectedCandidate = (purchase) =>
  purchase?.observed?.find((entry) => entry.actionId === actionId);
const baselineCandidate = selectedCandidate(baselinePurchase);
const steelCandidate = selectedCandidate(steelPurchase);
const diagnosticStock = diagnostic.before.resourceSamples
  .filter(({ resourceId }) =>
    Object.hasOwn(diagnostic.before.offer.cost, resourceId),
  )
  .map(({ resourceId, holding }) => `${resourceId} ${holding.toFixed(2)}`)
  .join(", ");
const uniqueInvocationPeriods = (events) => [
  ...new Set(events.map((entry) => entry.period)),
];
const periodRows = (arm) =>
  arm
    .filter((entry) => entry.decision?.boundary !== true)
    .map((entry) => {
      const pairs = Object.entries(entry.offer.cost).map(([id, price]) => {
        const resource = entry.resources[id];
        return `${id} ${resource?.amount?.toFixed(2) ?? "unknown"}/${price} (cap ${resource?.capacity ?? "unknown"}; net ${resource?.netRate ?? "unknown"}/period)`;
      });
      return `| ${entry.period} | ${entry.offer.generation} / ${entry.source.offer.offerObservationId} | ${pairs.join("; ")} | ${entry.offer.nativeAffordable ?? "unknown"}; ${entry.permission}; ${entry.eligibility}; ${entry.queueEvidence} |`;
    })
    .join("\n");

const sourceInputs = capture.inputs;
const hasCoherentNativeUnknown = [baselineResult, steelResult].some((result) =>
  result.blockers.some(({ kind }) => kind === "native-unaffordable-unknown"),
);
const conclusion =
  diagnostic.after.offer.nativeAffordable === true
    ? "A — Cached affordability explains the discrepancy"
    : hasCoherentNativeUnknown
      ? "B — Genuine native affordability discrepancy remains"
      : baselineResult.provenCriticalPath &&
          steelResult.provenCriticalPath &&
          baselineResult.provenCriticalPath.resourceId ===
            steelResult.provenCriticalPath.resourceId
        ? "A — Binding resource threshold established"
        : baselineResult.lastObservedConstraint &&
            steelResult.lastObservedConstraint
          ? "B — Multiple constraints remain inseparable"
          : "C — Observation insufficient";
const decisionText =
  diagnostic.after.offer.nativeAffordable === true
    ? `The period-70 replay sample paired a cached generation ${diagnostic.before.offer.generation} false verdict with later resource holdings of ${diagnosticStock}. In an isolated replay from the same verified capture and settings, a protected fresh draw at period ${diagnostic.drawBoundaryPeriod} kept root generation ${diagnostic.before.rootGeneration}, progression epoch, action identity and native price unchanged. The fresh generation ${diagnostic.after.offer.generation} verdict was true against the current stock. The apparent contradiction is therefore explained by cached affordability evidence being joined to newer holdings; generation-9 draw-time holdings were not recorded, so they are not inferred. Knowledge was the last resource threshold to clear: it was below 9,000 at period ${baselineResult.lastObservedConstraint?.priorInsufficientPeriod ?? 60} and at or above 9,000 by period ${baselineResult.lastObservedConstraint?.period ?? 70}. Steel had already cleared its 250 threshold by period 40. The ordinary paired replay selected and invoked Research at period 72, consistent with the observed stock accumulation and subsequent owner selection. This establishes the final resource threshold, not the entire terminal MAD critical path.`
    : hasCoherentNativeUnknown
      ? `A fresh same-boundary draw still reports unaffordability despite complete current native cost and resource evidence. The remaining discrepancy is in that coherent native verdict; the cached period-70 sample alone does not establish it.`
      : baselineResult.provenCriticalPath
        ? `The last observed requirement to clear was **${baselineResult.provenCriticalPath.resourceId}**. It was below price after period ${baselineResult.provenCriticalPath.clearInterval.afterPeriod} and sufficient by period ${baselineResult.provenCriticalPath.clearInterval.byPeriod}; the owner selected and invoked the action at period ${baselineResult.provenCriticalPath.decisionPeriod}. This establishes the final resource threshold, not the entire terminal MAD critical path.`
        : `Both arms retain multiple blockers or an observation gap, so the replay does not establish one critical path. The latest observed threshold and decision evidence are reported below.`;

const md = `# P12H — Actual progression bottleneck

## Decision

**${conclusion}**

${decisionText}

## Replay provenance

- Verified capture contract: v${capture.contractVersion}; capture period ${capture.capturePeriod}.
- Upstream: \`${sourceInputs.pinnedUpstreamCommit}\`; game snapshot SHA256 \`${sourceInputs.gameSnapshotSha256}\`.
- Starting save SHA256 \`${sourceInputs.startingSaveSha256}\`; settings SHA256 \`${sourceInputs.effectiveSettingsSha256}\`.
- Seed ${sourceInputs.seed}; epoch ${sourceInputs.epoch}; capture export SHA256 \`${capture.exportSaveSha256}\`.
- Observation identity: \`${capture.observationIdentity}\`; Smelter observation: \`${capture.smelterObservation?.identity ?? "unavailable"}\`.
- Action: \`${actionId}\`; price: ${JSON.stringify(capture.currentOfferEvidence?.offer?.cost ?? capture.offer?.cost)}.
- Current capture demand: ${JSON.stringify(capture.currentDemandEvidence)}. Replay demand was checked against the restored native state in each arm.

## Matched resource and Research observations

Each resource row is a periodic sample. The invocation is a separate native event at period ${baselinePurchase?.period ?? "unknown"} in baseline and ${steelPurchase?.period ?? "unknown"} in the Steel-oriented arm. The bridge emits two trace rows for that same native action call.

### Baseline

| Period | Offer generation / observation | Priced resource stock / price (capacity; net rate) | Native affordable; permission; eligibility; queue |
|---:|---|---|---|
${periodRows(baseline)}

### Steel-oriented

| Period | Offer generation / observation | Priced resource stock / price (capacity; net rate) | Native affordable; permission; eligibility; queue |
|---:|---|---|---|
${periodRows(steel)}

At the Research owner selection, baseline used offer generation ${baselineCandidate?.offerGeneration ?? "unknown"} (observation \`${baselineCandidate?.offerObservationId ?? "unknown"}\`) with price ${JSON.stringify(baselineCandidate?.cost ?? {})}; Steel-oriented used generation ${steelCandidate?.offerGeneration ?? "unknown"} (observation \`${steelCandidate?.offerObservationId ?? "unknown"}\`) with price ${JSON.stringify(steelCandidate?.cost ?? {})}. Native affordability was **${baselineCandidate?.nativeAffordable ?? "unavailable"}** / **${steelCandidate?.nativeAffordable ?? "unavailable"}** and recorded observed resources were ${JSON.stringify(baselineCandidate?.observedResources ?? {})} / ${JSON.stringify(steelCandidate?.observedResources ?? {})}. At the owner boundary, current-catalog validity, Research permission, eligibility and queue were ${baselinePurchase?.catalogCurrent ?? "unknown"}, ${baselinePurchase?.researchPermission ?? "unknown"}, ${baselinePurchase?.targetEligibility ?? "unknown"}, ${baselinePurchase?.queueEvidence ?? "unknown"} / ${steelPurchase?.catalogCurrent ?? "unknown"}, ${steelPurchase?.researchPermission ?? "unknown"}, ${steelPurchase?.targetEligibility ?? "unknown"}, ${steelPurchase?.queueEvidence ?? "unknown"}. Reservation evidence was \`${baselineCandidate?.reservation ?? "unavailable"}\` / \`${steelCandidate?.reservation ?? "unavailable"}\`; both selections were recorded as \`${baselinePurchase?.disposition ?? "unavailable"}\` / \`${steelPurchase?.disposition ?? "unavailable"}\`. There was one native action invocation per arm at periods ${uniqueInvocationPeriods(baselineInvocations).join(", ") || "none"} / ${uniqueInvocationPeriods(steelInvocations).join(", ") || "none"}; two bridge trace rows represent each invocation.

### What each freshness signal means

- **Timeline periods:** periods in the tables are when the cached offer and current resources were read. The offer observation ID, generation, native price and verdict originated at a native Research draw. For generations 3–9, the exact render period and draw-time holdings are not present in the replay. Generation 10 was directly redrawn and observed at period 70 in the isolated diagnostic; its draw-boundary stock was Knowledge ${diagnostic.after.resourceSamples.find(({ resourceId }) => resourceId === "Knowledge")?.holding} and Steel ${diagnostic.after.resourceSamples.find(({ resourceId }) => resourceId === "Steel")?.holding}.
- **Offer binding freshness:** generation ${diagnostic.before.offer.generation} matched the current target control at the cached read, and generation ${diagnostic.after.offer.generation} matched after redraw. This establishes which control is callable. It does not establish when the row's affordability class was computed.
- **Root/progression freshness:** both diagnostic reads used root generation ${diagnostic.before.rootGeneration} and progression epoch \`${diagnostic.before.progressionEpoch}\`. Those stayed current across the draw.
- **Affordability calculation time:** pinned \`drawTech()\` calls \`setAction()\`; \`setAction()\` assigns \`cna\` from \`checkAffordable(c_action, false, ...)\`, which evaluates \`adjustCosts()\` and \`checkCosts()\` against the then-current supply pool. The captured \`nativeAffordable\` field is read from that rendered row's same-draw \`cna\` verdict. The row keeps that verdict until the next native draw. The cached generation-9 draw timestamp and its draw-time holdings were not recorded.
- **Current resource sample time:** \`readCurrentOfferedTechs()\` returns the held offer after checking progression epoch and binding generations. \`readCurrentResearchCatalog()\` joins those offers to a separate read of the current root's resources. A current binding and current root therefore do not make the cached \`cna\` verdict contemporaneous with those newer holdings.

The isolated period-70 diagnostic read cached generation 9 as false, then made exactly one protected fresh native draw. It produced offer observation \`${diagnostic.after.offer.offerObservationId}\`, generation ${diagnostic.after.offer.generation}, at the same price and same root/progression, with \`nativeAffordable=true\`. The diagnostic stock sample was unchanged before and after the draw; the saved-state SHA-256 was unchanged. The draw rebound the Research offer controls from generation ${diagnostic.before.offer.generation} to ${diagnostic.after.offer.generation}. This resolves the apparent contradiction without claiming generation 9's draw-time holdings.

## Attribution and competing commitments

- Baseline attribution: \`${baselineResult.status}\`; last observed constraint ${JSON.stringify(baselineResult.lastObservedConstraint ?? null)}; proven critical path ${JSON.stringify(baselineResult.provenCriticalPath ?? null)}.
- Steel-oriented attribution: \`${steelResult.status}\`; last observed constraint ${JSON.stringify(steelResult.lastObservedConstraint ?? null)}; proven critical path ${JSON.stringify(steelResult.provenCriticalPath ?? null)}.
- Last observed non-resource constraint: baseline ${JSON.stringify(baselineResult.lastObservedNonResourceConstraint ?? null)}; Steel-oriented ${JSON.stringify(steelResult.lastObservedNonResourceConstraint ?? null)}.
- Both observations preserve commitments as **unknown**. The owner’s event reports no reservation conflict for the Research selection, while the capture/replay separately records Construction Steel demand. This does not quantify all external commitments or establish that the Construction demand was unnecessary.
- The periodic replay has its final pre-purchase sample at period 70 and owner selection/invocation at period 72. The action is selected two periods after the stock threshold is observed clear. The exact draw-time stock for generation 9 and exact first evaluation time are unavailable; a current protected draw at period 70 shows that no additional native gate is needed to explain the verdict change.

## Why Steel acceleration did not change timing

Steel stock exceeded the action price by period 40 in both arms. The arms had identical sampled Steel stocks and net rates through the period 72 purchase boundary; the Steel-oriented arm’s higher later Steel stock appears only after the Research action was already purchased. At period 70 the cached generation-9 verdict was false even though the later stock sample exceeded both prices. A current generation-10 draw at the same state returned true, while both paired replay arms selected and purchased at period 72. Steel had cleared by period 40; Knowledge was below 9,000 at period 60 and above it by period 70. The interval **(60, 70]** is the final observed resource-threshold interval. This establishes the Knowledge threshold as the last priced resource to clear, not the full terminal MAD critical path.

## Observation cost and scope

- Capture used one same-boundary Research catalog read and one same-boundary Smelter plan read.
- Each ordinary replay uses bounded catalog reads at restore validation, the initial natural boundary, and the existing ten-period samples. The separate isolated diagnostic used one additional protected Research draw only.
- Periodic observation adds one Research evidence read alongside the existing Smelter/sample read; the selection event comes from the existing Research owner observer. Renderer task time and observation read timings are recorded in the P12G replay artifact at \`${path.relative(root, inputPath).replaceAll("\\", "/")}\`.
- Matched replay parity checks pass: identical start state, equal non-Smelter native invocation ordering, equal Research draw count and the same action period in both arms. The P12G replay also records renderer task/script times (baseline ${run.performance.rendererWork.baselineTaskSec.toFixed(3)}s / ${run.performance.rendererWork.baselineScriptSec.toFixed(4)}s; Steel-oriented ${run.performance.rendererWork.alternativeTaskSec.toFixed(3)}s / ${run.performance.rendererWork.alternativeScriptSec.toFixed(4)}s).
- The single diagnostic draw created one new Research offer observation across ${diagnostic.nativeOfferObservationCount} offers and rebound ${diagnostic.reboundOfferControlCount} offer controls (generation 9 to 10), left the saved economic state and sampled resources unchanged, and added ${((diagnostic.after.metrics.TaskDuration ?? 0) - (diagnostic.before.metrics.TaskDuration ?? 0)).toFixed(3)} s renderer TaskDuration and ${((diagnostic.after.metrics.ScriptDuration ?? 0) - (diagnostic.before.metrics.ScriptDuration ?? 0)).toFixed(6)} s ScriptDuration in this runner measurement. It made no Research purchase, production change, claim, reservation or job change. Ordinary Research behavior and draw frequency are unchanged.

## Reproduction

Input artifact: \`${path.relative(root, inputPath).replaceAll("\\", "/")}\`. The replay verifies capture contract, game/save/settings inputs, offer validity and matched arm restore evidence before this report is generated.
`;
fs.writeFileSync(outputPath, md);
console.log(
  JSON.stringify(
    { outputPath, actionId, baselineResult, steelResult },
    null,
    2,
  ),
);
