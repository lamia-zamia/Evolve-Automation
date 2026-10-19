/** Test-only gates for selecting a captured production allocation opportunity. */

import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const nonNegative = (value) => finite(value) && value >= 0;
const ownerKinds = new Set(["jobs", "smelter"]);
const pinnedCommit = "db38e2af831907d49aeb5348d678d8d8745d6c3f";

export function buildP12JCapturedCandidates(p12g, p12i) {
  const capture = p12g.reachableCapture;
  const jobs = p12i.sourceProvenance;
  if (
    p12g.inputs?.pinnedGame !== `pmotschmann/Evolve @ ${pinnedCommit}` ||
    p12i.inputs?.pinnedUpstreamCommit !== pinnedCommit ||
    p12g.inputs?.gameSnapshotSha256 !== p12i.inputs?.gameSnapshotSha256 ||
    capture?.saveSha256 !== jobs?.captureSha256 ||
    capture?.offer?.elementId !== jobs?.offer?.actionId ||
    JSON.stringify(capture?.offer?.cost) !== JSON.stringify(jobs?.offer?.cost)
  )
    throw new Error(
      "P12G/P12I observations do not share pinned action evidence",
    );

  const rootId = `${capture.saveSha256}:${capture.rootGeneration}:${capture.progressionEpoch}`;
  const currentAction = capture.offer;
  const currentResources = capture.currentState?.resources;
  const shortfalls = Object.entries(currentAction.cost ?? {}).flatMap(
    ([resourceId, amount]) => {
      const stock = currentResources?.[resourceId]?.amount;
      if (!finite(stock) || !finite(amount) || amount <= stock) return [];
      return [{ resourceId, amount: amount - stock }];
    },
  );
  const priceIdentity = `${currentAction.generation}:${JSON.stringify(currentAction.cost)}`;
  const action = {
    current: true,
    rootId,
    progressionCurrent: true,
    priceCurrent: true,
    priceIdentity,
    permitted: jobs.normalResearchPermission === true,
    affordable: currentAction.nativeAffordable === true,
    shortfalls,
  };
  const steelDelta = capture.preAdjustment?.decision?.smeltAdjustments?.find(
    ({ productionId }) => productionId === "Steel",
  )?.delta;
  const ironDelta = capture.preAdjustment?.decision?.smeltAdjustments?.find(
    ({ productionId }) => productionId === "Iron",
  )?.delta;
  const measuredEffects = p12g.counterfactuals?.pairedStockChanges;
  const smelterCapacity = {
    nativeMaximum: capture.preAdjustment?.input?.totalSmelters,
    totalAssigned:
      (capture.preAdjustment?.input?.ironCount ?? Number.NaN) +
      (capture.preAdjustment?.input?.steelCount ?? Number.NaN) +
      (capture.preAdjustment?.input?.iridiumCount ?? Number.NaN),
    targetAssigned: capture.preAdjustment?.input?.steelCount,
    targetMaximum: capture.preAdjustment?.input?.totalSmelters,
    requestedDelta: finite(steelDelta) ? steelDelta : Number.NaN,
    sourceAvailable: finite(ironDelta) ? Math.max(0, -ironDelta) : Number.NaN,
    sourceId: "Iron",
    sourceControlAvailable:
      capture.liveControl?.available === true &&
      capture.liveControl.methods?.includes("addMetal") === true &&
      capture.liveControl.methods?.includes("subMetal") === true,
    sourceProvenance:
      finite(ironDelta) && ironDelta < 0
        ? "same-boundary native Smelter plan"
        : undefined,
  };

  return [
    {
      id: "p12i-jobs-scientist",
      ownerKind: "jobs",
      rootId,
      priceIdentity,
      action,
      owner: {
        effectResourceIds: [],
        demandSatisfied: undefined,
        alreadyResponding: undefined,
        controlAvailable: undefined,
        permission: jobs.normalJobsPermission === true,
        expectedReversion: undefined,
        currentPlanKnown: false,
      },
      target: {
        nativeMaximum: jobs.assignments?.scientist?.maximum,
        assigned: jobs.assignments?.scientist?.workers,
        smartMaximumKnown: false,
        smartMaximum: null,
        permission: jobs.scientistJobPermission === true,
        controlAvailable: undefined,
        foundryCoupled: false,
        idleWorkers: jobs.assignments?.unemployed?.workers,
        defaultPoolWorkers: 0,
      },
      evidenceComplete: false,
    },
    {
      id: "p12g-smelter",
      ownerKind: "smelter",
      rootId,
      priceIdentity,
      action,
      owner: {
        effectResourceIds: (measuredEffects ?? [])
          .filter(({ marginalQuantity }) => finite(marginalQuantity))
          .map(({ resourceId }) => resourceId),
        demandSatisfied: false,
        alreadyResponding: finite(steelDelta) && steelDelta > 0,
        controlAvailable: capture.liveControl?.available === true,
        permission: capture.permissions?.autoSmelter === true,
        expectedReversion: false,
        currentPlanKnown: true,
        capacity: smelterCapacity,
      },
      evidenceComplete:
        Array.isArray(measuredEffects) && measuredEffects.length > 0,
    },
  ];
}

export function assessAllocationOpportunity(evidence) {
  const reasons = [];
  const action = evidence.action;
  const target = evidence.target;
  const source = evidence.source;
  const owner = evidence.owner;

  if (typeof evidence.id !== "string" || evidence.id.length === 0)
    reasons.push("missing-candidate-identity");
  if (!ownerKinds.has(evidence.ownerKind)) reasons.push("unknown-owner-kind");
  if (
    action?.current !== true ||
    typeof evidence.rootId !== "string" ||
    evidence.rootId.length === 0 ||
    typeof action.rootId !== "string" ||
    action.rootId.length === 0 ||
    action.rootId !== evidence.rootId
  )
    reasons.push("changed-root-or-action");
  if (action?.progressionCurrent !== true) reasons.push("changed-progression");
  if (
    action?.priceCurrent !== true ||
    typeof evidence.priceIdentity !== "string" ||
    evidence.priceIdentity.length === 0 ||
    typeof action.priceIdentity !== "string" ||
    action.priceIdentity.length === 0 ||
    action.priceIdentity !== evidence.priceIdentity
  )
    reasons.push("changed-native-price");
  if (action?.permitted === false) reasons.push("action-not-permitted");
  else if (action?.permitted !== true)
    reasons.push("action-permission-unknown");
  if (action?.affordable === true) reasons.push("resource-already-sufficient");
  else if (action?.affordable !== false)
    reasons.push("native-affordability-unknown");
  if (
    !Array.isArray(action?.shortfalls) ||
    action.shortfalls.length === 0 ||
    action.shortfalls.some(
      (shortfall) =>
        typeof shortfall?.resourceId !== "string" ||
        shortfall.resourceId.length === 0 ||
        !finite(shortfall.amount) ||
        shortfall.amount <= 0,
    )
  )
    reasons.push("missing-current-resource-constraint");

  if (evidence.budgetExhausted === true) reasons.push("budget-exhausted");
  if (evidence.evidenceComplete !== true)
    reasons.push("missing-effect-or-authority-evidence");
  if (
    owner?.effectResourceIds?.some((id) =>
      action?.shortfalls?.some((shortfall) => shortfall.resourceId === id),
    ) !== true
  )
    reasons.push("unsupported-resource-effect");
  if (owner?.demandSatisfied === true)
    reasons.push("production-owner-already-satisfies-demand");
  else if (owner?.demandSatisfied !== false)
    reasons.push("production-owner-demand-unknown");
  if (owner?.alreadyResponding === true)
    reasons.push("production-owner-already-responding");
  else if (owner?.alreadyResponding !== false)
    reasons.push("production-owner-response-unknown");
  if (owner?.controlAvailable === false)
    reasons.push("native-control-unavailable");
  else if (owner?.controlAvailable !== true)
    reasons.push("native-control-availability-unknown");
  if (owner?.permission === false) reasons.push("owner-not-permitted");
  else if (owner?.permission !== true) reasons.push("owner-permission-unknown");
  if (typeof owner?.expectedReversion !== "boolean")
    reasons.push("ordinary-owner-reversion-unknown");
  if (owner?.expectedReversion === true)
    reasons.push("ordinary-owner-will-revert");
  if (evidence.ownerKind === "jobs" && owner?.currentPlanKnown !== true)
    reasons.push("ordinary-owner-plan-unknown");
  if (evidence.ownerKind === "smelter") {
    const capacity = owner?.capacity;
    if (
      !finite(capacity?.nativeMaximum) ||
      !nonNegative(capacity?.totalAssigned) ||
      capacity.totalAssigned > capacity.nativeMaximum ||
      !nonNegative(capacity?.targetAssigned) ||
      !nonNegative(capacity?.targetMaximum) ||
      capacity.targetAssigned > capacity.targetMaximum ||
      !finite(capacity?.requestedDelta) ||
      capacity.requestedDelta <= 0 ||
      !nonNegative(capacity?.sourceAvailable)
    ) {
      reasons.push("native-allocation-capacity-unknown");
    } else {
      const nativeFree = Math.max(
        0,
        capacity.nativeMaximum - capacity.totalAssigned,
      );
      const targetFree = Math.min(
        nativeFree,
        capacity.targetMaximum - capacity.targetAssigned,
      );
      const sourceSupported =
        capacity.sourceAvailable === 0 ||
        (typeof capacity.sourceId === "string" &&
          capacity.sourceId.length > 0 &&
          capacity.sourceControlAvailable === true &&
          typeof capacity.sourceProvenance === "string" &&
          capacity.sourceProvenance.length > 0);
      if (!sourceSupported)
        reasons.push("allocation-source-obligations-unknown");
      else if (targetFree + capacity.sourceAvailable < capacity.requestedDelta)
        reasons.push("native-allocation-capacity-insufficient");
    }
  }

  if (evidence.ownerKind === "jobs" && target === undefined)
    reasons.push("missing-job-target-evidence");
  if (target !== undefined) {
    if (
      !finite(target.nativeMaximum) ||
      target.nativeMaximum < -1 ||
      !nonNegative(target.assigned)
    )
      reasons.push("unknown-native-job-capacity");
    else if (
      target.nativeMaximum >= 0 &&
      target.assigned >= target.nativeMaximum
    )
      reasons.push("native-job-cap-reached");
    if (target.smartMaximumKnown !== true)
      reasons.push("unknown-effective-smart-maximum");
    else if (target.smartMaximum !== null) {
      if (!finite(target.smartMaximum))
        reasons.push("unknown-effective-smart-maximum");
      else if (target.assigned >= target.smartMaximum)
        reasons.push("smart-maximum-reached");
    }
    if (target.permission === false) reasons.push("target-job-not-permitted");
    else if (target.permission !== true)
      reasons.push("target-job-permission-unknown");
    if (target.controlAvailable === false)
      reasons.push("native-target-control-unavailable");
    else if (target.controlAvailable !== true)
      reasons.push("native-target-control-availability-unknown");
    if (target.foundryCoupled === true && target.couplingRepresented !== true)
      reasons.push("foundry-coupling-not-represented");

    const idleKnown = nonNegative(target.idleWorkers);
    const defaultPoolKnown = nonNegative(target.defaultPoolWorkers);
    if (!idleKnown) reasons.push("idle-worker-count-unknown");
    if (!defaultPoolKnown) reasons.push("default-pool-count-unknown");
    const idle = idleKnown ? target.idleWorkers : 0;
    const defaultPool = defaultPoolKnown ? target.defaultPoolWorkers : 0;
    if (idle + defaultPool < 1) {
      if (source === undefined) reasons.push("no-idle-or-default-pool-worker");
      else if (
        !nonNegative(source.assigned) ||
        !nonNegative(source.protectedMinimum) ||
        source.protectedMinimum > source.assigned ||
        source.permission !== true ||
        source.currentPolicyKnown !== true ||
        source.ownerPlanKnown !== true
      )
        reasons.push("source-obligations-not-established");
      else if (source.assigned - source.protectedMinimum < 1)
        reasons.push("source-assignment-protected");
    }
  }

  return Object.freeze({
    id: evidence.id,
    actionable: reasons.length === 0,
    reasons: Object.freeze([...new Set(reasons)].sort()),
  });
}

/** Selects complete actionable evidence; stable identity only breaks exact ties. */
export function selectAllocationOpportunity(
  evidenceRows,
  { maxCandidates = 32 } = {},
) {
  if (!Number.isSafeInteger(maxCandidates) || maxCandidates < 0)
    throw new RangeError("maxCandidates must be a non-negative safe integer");
  const considered = evidenceRows.slice(0, maxCandidates);
  const assessments = considered.map(assessAllocationOpportunity);
  const actionable = assessments
    .filter(({ actionable: canAct }) => canAct)
    .sort((left, right) => left.id.localeCompare(right.id));
  const budgetExhausted = evidenceRows.length > maxCandidates;
  return Object.freeze({
    assessments: Object.freeze(assessments),
    selectedId: budgetExhausted ? undefined : actionable[0]?.id,
    tiedIds: Object.freeze(
      budgetExhausted ? [] : actionable.map(({ id }) => id),
    ),
    potentialIds: Object.freeze(actionable.map(({ id }) => id)),
    budgetExhausted,
  });
}

const entryPath = process.argv[1] && path.resolve(process.argv[1]);
if (entryPath === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const inputPath = (name, fallback) =>
    path.resolve(
      root,
      process.argv
        .find((arg) => arg.startsWith(`--${name}=`))
        ?.slice(name.length + 3) ?? fallback,
    );
  const [p12g, p12i] = await Promise.all([
    readFile(
      inputPath(
        "p12g",
        "test-artifacts/benchmark/tmp/p12g-controlled-production-marginal.json",
      ),
      "utf8",
    ).then(JSON.parse),
    readFile(
      inputPath(
        "p12i",
        "test-artifacts/benchmark/tmp/p12i-knowledge-job-counterfactual.json",
      ),
      "utf8",
    ).then(JSON.parse),
  ]);
  const startedAt = performance.now();
  const candidates = buildP12JCapturedCandidates(p12g, p12i);
  const result = selectAllocationOpportunity(candidates);
  const validationMs = performance.now() - startedAt;
  process.stdout.write(
    `${JSON.stringify({ ...result, candidateCount: candidates.length, validationMs }, null, 2)}\n`,
  );
}
