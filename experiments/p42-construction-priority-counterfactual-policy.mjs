export const P42_INTERVENTION_IDENTITY = Object.freeze({
  fixtureName: "p18-standard-human-fixture.txt",
  fixtureSha256:
    "2d2def2ecad5ae015c0dc825747da105bb90dbd0c405ed0ae5fe672755e0c684",
  pinnedGame: "pmotschmann/Evolve@db38e2af831907d49aeb5348d678d8d8745d6c3f",
  pinnedGameSha256:
    "05dcbca74aaf499b4b640b8bcd699038eb48e9208a253aa4f3a5f99fa0f1faf7",
  seed: 44,
  epoch: "2026-09-21T00:00:00.000Z",
});

export const P42_EXPECTED = Object.freeze({
  period: 720,
  workCycleId: 90,
  orderingGeneration: 90,
  publishedWorkCycleId: 89,
  previousTarget: "city-farm",
  previousCost: Object.freeze({ Lumber: 27, Stone: 14 }),
  quarryTarget: "city-rock_quarry",
  quarryCost: Object.freeze({ Lumber: 50, Stone: 10 }),
  quarryStock: Object.freeze({ Lumber: 50, Stone: 10 }),
  p36GatherActions: 139,
  p38AuthorizationId: "p38-test-only-quarry-lumber-gather-18",
  p38GatherLimit: 18,
});

const exactCost = (actual, expected) =>
  actual !== null &&
  typeof actual === "object" &&
  Object.keys(actual).length === Object.keys(expected).length &&
  Object.entries(expected).every(
    ([resourceId, amount]) => actual[resourceId] === amount,
  );

const reject = (reason) => Object.freeze({ qualified: false, reason });

export function qualifyP42ConstructionReservation(input) {
  if (input.enabled !== true || !["B", "B-repeat"].includes(input.arm))
    return reject("intervention-disabled-for-arm");

  for (const [key, expected] of Object.entries(P42_INTERVENTION_IDENTITY)) {
    if (input.identity?.[key] !== expected)
      return reject(`exact-replay-identity-mismatch:${key}`);
  }
  if (input.authorizationHistoryMatched !== true)
    return reject("p36-stop-or-p38-authorization-history-mismatch");
  if (input.preSubstitutionBoundaryCaptured !== true)
    return reject("pre-substitution-boundary-unavailable");
  if (input.p36GatherActions !== P42_EXPECTED.p36GatherActions)
    return reject("p36-gather-action-count-mismatch");
  if (
    input.p38Authorization?.id !== P42_EXPECTED.p38AuthorizationId ||
    input.p38Authorization?.additionalGatherLimit !==
      P42_EXPECTED.p38GatherLimit
  )
    return reject("p38-authorization-mismatch");

  const owner = input.ownerContext;
  if (owner?.period !== P42_EXPECTED.period) return reject("wrong-period");
  if (
    owner?.workCycleId !== P42_EXPECTED.workCycleId ||
    owner?.orderingGeneration !== P42_EXPECTED.orderingGeneration ||
    input.currentCandidate?.orderingGeneration !==
      P42_EXPECTED.orderingGeneration
  )
    return reject("wrong-owner-or-ordering-generation");
  if (input.publishedWorkCycleId !== P42_EXPECTED.publishedWorkCycleId)
    return reject("wrong-completed-publication");

  if (
    input.currentCandidate?.candidateKey !== P42_EXPECTED.quarryTarget ||
    !exactCost(input.currentCandidate?.cost, P42_EXPECTED.quarryCost)
  )
    return reject("current-construction-candidate-is-not-current-quarry");

  const order = input.quarryOrder;
  if (
    order?.key !== P42_EXPECTED.quarryTarget ||
    order?.orderingIndex !== 0 ||
    order?.weighting !== 300 ||
    order?.important !== false ||
    order?.knowledge !== false
  )
    return reject("quarry-is-not-first-current-candidate");
  if (!exactCost(order?.cost, P42_EXPECTED.quarryCost))
    return reject("quarry-price-changed");
  if (
    owner.rootGeneration !== input.currentAuthority?.rootGeneration ||
    order.authority?.rootGeneration !== input.currentAuthority?.rootGeneration
  )
    return reject("root-generation-stale-or-replaced");
  if (
    owner.progressionGeneration !==
      input.currentAuthority?.progressionGeneration ||
    order.authority?.progressionGeneration !==
      input.currentAuthority?.progressionGeneration
  )
    return reject("progression-generation-stale");
  if (
    !Number.isSafeInteger(order.authority?.controlGeneration) ||
    order.authority.controlGeneration !==
      input.currentAuthority?.controlGeneration ||
    input.currentAuthority?.controlElementId !== P42_EXPECTED.quarryTarget ||
    input.currentAuthority?.controlActionAvailable !== true
  )
    return reject("quarry-control-generation-stale-or-unavailable");

  const nativeQueue = input.nativeQueue;
  const scriptReservations = input.scriptReservations;
  if (nativeQueue?.available !== true || scriptReservations?.available !== true)
    return reject("reservation-source-unavailable");
  if (!Array.isArray(nativeQueue.targets) || nativeQueue.targets.length !== 0)
    return reject("native-queue-claim-present");
  if (
    !Array.isArray(scriptReservations.targets) ||
    scriptReservations.targets.length !== 1 ||
    scriptReservations.targets[0]?.name !== P42_EXPECTED.previousTarget ||
    scriptReservations.targets[0]?.cause !== "Saving" ||
    scriptReservations.targets[0]?.pool !== undefined ||
    !exactCost(scriptReservations.targets[0]?.cost, P42_EXPECTED.previousCost)
  )
    return reject("farm-reservation-or-competing-claim-mismatch");

  if (
    input.stock?.Lumber !== P42_EXPECTED.quarryStock.Lumber ||
    input.stock?.Stone !== P42_EXPECTED.quarryStock.Stone
  )
    return reject("quarry-stock-changed-or-unavailable");

  return Object.freeze({
    qualified: true,
    reason: "exact-p720-construction-owner-cycle",
    replacement: Object.freeze({
      name: P42_EXPECTED.quarryTarget,
      cause: "Saving",
      cost: Object.freeze({ ...order.cost }),
    }),
  });
}

export function applyP42ConstructionReservation(input) {
  const qualification = qualifyP42ConstructionReservation(input);
  const targets = input.scriptReservations?.targets ?? [];
  if (!qualification.qualified)
    return Object.freeze({
      applied: false,
      reason: qualification.reason,
      targets,
    });

  return Object.freeze({
    applied: true,
    reason: qualification.reason,
    targets: Object.freeze(
      targets.map((target) =>
        target.name === P42_EXPECTED.previousTarget
          ? qualification.replacement
          : target,
      ),
    ),
  });
}

export function shouldReleaseP42ConstructionReservation({
  ownerCycleApplied,
  ownerContext,
  released,
}) {
  return (
    ownerCycleApplied === true &&
    released !== true &&
    (ownerContext?.period !== P42_EXPECTED.period ||
      ownerContext?.workCycleId !== P42_EXPECTED.workCycleId ||
      ownerContext?.orderingGeneration !== P42_EXPECTED.orderingGeneration)
  );
}
