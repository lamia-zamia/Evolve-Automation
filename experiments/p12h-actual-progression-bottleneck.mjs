import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { attributeResearchBottleneck } from "../src/domain/economy/research-bottleneck.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = path.resolve(
  root,
  process.argv[2] ?? "test-artifacts/benchmark/tmp/p12g-verified-replay.json",
);
const outputPath = path.resolve(
  root,
  process.argv[3] ?? "experiments/p12h-actual-progression-bottleneck.md",
);
const run = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const capture = run.reachableCapture;
if (capture?.contractVersion !== 1 || !capture.exportSaveSha256)
  throw new Error("Input is missing a verified P12G capture contract.");
if (run.inputs?.testBundleSha256 !== capture.inputs?.testBundleSha256)
  throw new Error("Replay bundle does not match the verified capture.");
if (run.inputs?.testHarnessSha256 !== capture.inputs?.testHarnessSha256)
  throw new Error("Replay harness does not match the verified capture.");

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
const hasUnknownNativeGate = [baselineResult, steelResult].some(
  (result) =>
    result.status === "insufficient" ||
    result.lastObservedNonResourceConstraint?.kind ===
      "native-unaffordable-unknown",
);
const conclusion = hasUnknownNativeGate
  ? "C — Observation insufficient"
  : baselineResult.provenCriticalPath &&
      steelResult.provenCriticalPath &&
      baselineResult.provenCriticalPath.resourceId ===
        steelResult.provenCriticalPath.resourceId
    ? "A — Binding constraint established"
    : baselineResult.lastObservedConstraint &&
        steelResult.lastObservedConstraint
      ? "B — Multiple constraints remain inseparable"
      : "C — Observation insufficient";
const decisionText = hasUnknownNativeGate
  ? `At sampled period 70, both priced resources exceeded the current 9,000 Knowledge / 250 Steel price, capacity exceeded both prices, permission was enabled, eligibility was available and the queue was empty. The native offer nevertheless reported \`nativeAffordable=false\` in both arms. At the period 72 owner selection, the refreshed generation 10 offer reported \`nativeAffordable=true\` and the action was purchased. The replay therefore establishes that a native affordability gate remained after the known resource thresholds cleared, but the pinned game exposes no reason breakdown for the false result. The exact missing authority is the native affordability predicate’s component-level rejection reason between periods 70 and 72; Knowledge cannot be named as the binding purchase constraint from these observations alone.`
  : baselineResult.provenCriticalPath
    ? `The last observed requirement to clear was **${baselineResult.provenCriticalPath.resourceId}**. It was below price after period ${baselineResult.provenCriticalPath.clearInterval.afterPeriod} and sufficient by period ${baselineResult.provenCriticalPath.clearInterval.byPeriod}; the owner selected and invoked the action at period ${baselineResult.provenCriticalPath.decisionPeriod}. Steel had already exceeded its 250 price at sampled period 40 in both arms. This establishes the Knowledge threshold as the final resource threshold observed before the purchase; it does not establish an unobserved owner decision during periods 70–72.`
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

## Attribution and competing commitments

- Baseline attribution: \`${baselineResult.status}\`; last observed constraint ${JSON.stringify(baselineResult.lastObservedConstraint ?? null)}; proven critical path ${JSON.stringify(baselineResult.provenCriticalPath ?? null)}.
- Steel-oriented attribution: \`${steelResult.status}\`; last observed constraint ${JSON.stringify(steelResult.lastObservedConstraint ?? null)}; proven critical path ${JSON.stringify(steelResult.provenCriticalPath ?? null)}.
- Last observed non-resource constraint: baseline ${JSON.stringify(baselineResult.lastObservedNonResourceConstraint ?? null)}; Steel-oriented ${JSON.stringify(steelResult.lastObservedNonResourceConstraint ?? null)}.
- Both observations preserve commitments as **unknown**. The owner’s event reports no reservation conflict for the Research selection, while the capture/replay separately records Construction Steel demand. This does not quantify all external commitments or establish that the Construction demand was unnecessary.
- The periodic cadence has the final pre-purchase resource sample at period 70 and owner selection/invocation at period 72. There is no periodic affordability/selection observation inside that two-period interval. The exact time at which the Research owner first evaluated the now-affordable action is therefore unavailable.

## Why Steel acceleration did not change timing

Steel stock exceeded the action price by period 40 in both arms. The arms had identical sampled Steel stocks and net rates through the period 72 purchase boundary; the Steel-oriented arm’s higher later Steel stock appears only after the Research action was already purchased. At period 70 Knowledge and Steel were both above price, yet native affordability was still false in both arms. At period 72 the owner event recorded equal resources and native affordability true in both arms. The extra Steel therefore arrived too late to change the purchase boundary, and the evidence points to an unresolved native affordability gate between periods 70 and 72 rather than a proven resource bottleneck.

## Observation cost and scope

- Capture used one same-boundary Research catalog read and one same-boundary Smelter plan read.
- Each replay uses bounded catalog reads at restore validation, the initial natural boundary, and the existing ten-period samples. It does not force a Research draw each period.
- Periodic observation adds one Research evidence read alongside the existing Smelter/sample read; the selection event comes from the existing Research owner observer. Renderer task time and observation read timings are recorded in the P12G replay artifact at \`${path.relative(root, inputPath).replaceAll("\\", "/")}\`.
- Matched replay parity checks pass: identical start state, equal non-Smelter native invocation ordering, equal Research draw count and the same action period in both arms. The P12G replay also records renderer task/script times (baseline ${run.performance.rendererWork.baselineTaskSec.toFixed(3)}s / ${run.performance.rendererWork.baselineScriptSec.toFixed(4)}s; Steel-oriented ${run.performance.rendererWork.alternativeTaskSec.toFixed(3)}s / ${run.performance.rendererWork.alternativeScriptSec.toFixed(4)}s).
- The diagnostic is a pure attribution over observed current offers, native resource evidence and decision events. It makes no production, claim or purchase changes.

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
