export const P53_QUARRY_REQUEST = Object.freeze({
  requestId: "p53-test-only-city-rock-quarry-v1",
  generation: 1,
  active: true,
  origin: "test-only",
  targetBuildingId: "city-rock_quarry",
  maximumPurchases: 1,
  maximumTotalAuthorizedResourceDebit: Object.freeze({
    Lumber: 50,
    Stone: 10,
  }),
  scope: Object.freeze({
    period: 720,
    workCycleId: 90,
    orderingGeneration: 90,
  }),
  expiresAt: Object.freeze({ period: 720, workCycleId: 90 }),
  targetPermission: true,
  priorityReplacement: Object.freeze({
    permitted: true,
    displacedTargetId: "city-farm",
    displacedPublicationWorkCycleId: 89,
  }),
  nativeExecutionPermission: true,
  materialGatheringPermission: false,
  jobsAssignmentPermission: false,
  playerSelected: false,
  productionAuthorized: false,
  testAuthorization: true,
});

export const P53_CONTROLLED_ARMS = Object.freeze(["C", "C-repeat"]);
export const P54_CONTROLLED_ARMS = Object.freeze(["D", "D-repeat"]);

export function qualifyP53QuarryRequest(request, arm) {
  if (!P53_CONTROLLED_ARMS.includes(arm) && !P54_CONTROLLED_ARMS.includes(arm))
    return Object.freeze({
      qualified: false,
      reason: "not-construction-owned-arm",
    });
  for (const [key, expected] of Object.entries(P53_QUARRY_REQUEST)) {
    const actual = request?.[key];
    if (key === "maximumTotalAuthorizedResourceDebit") {
      if (
        actual?.Lumber !== expected.Lumber ||
        actual?.Stone !== expected.Stone ||
        Object.keys(actual ?? {}).length !== 2
      )
        return Object.freeze({
          qualified: false,
          reason: `request-mismatch:${key}`,
        });
    } else if (
      key === "scope" ||
      key === "expiresAt" ||
      key === "priorityReplacement"
    ) {
      if (
        actual?.period !== expected.period ||
        actual?.workCycleId !== expected.workCycleId ||
        actual?.orderingGeneration !== expected.orderingGeneration ||
        actual?.permitted !== expected.permitted ||
        actual?.displacedTargetId !== expected.displacedTargetId ||
        actual?.displacedPublicationWorkCycleId !==
          expected.displacedPublicationWorkCycleId ||
        Object.keys(actual ?? {}).length !== Object.keys(expected).length
      )
        return Object.freeze({
          qualified: false,
          reason: `request-mismatch:${key}`,
        });
    } else if (actual !== expected) {
      return Object.freeze({
        qualified: false,
        reason: `request-mismatch:${key}`,
      });
    }
  }
  return Object.freeze({
    qualified: true,
    reason: "bounded-construction-owner-test-request",
  });
}
