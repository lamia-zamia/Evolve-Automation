export interface ResearchBottleneckObservation {
  readonly period: number;
  readonly rootGeneration: number;
  readonly progressionEpoch: string;
  readonly current: boolean;
  readonly permission: boolean | undefined;
  readonly eligibility:
    "eligible" | "excluded" | "unavailable" | "not-offered" | "unknown";
  readonly queueEvidence: "empty" | "conflict" | "unavailable";
  readonly offer:
    | Readonly<{
        actionId: string;
        generation: number;
        controlGeneration: number;
        offerSetIdentity?: string | undefined;
        cost: Readonly<Record<string, number>>;
        nativeAffordable?: boolean | undefined;
        /** Draw-bound price, verdict, and stock evidence; cached rows omit this when unproven. */
        affordabilityDraw?: Readonly<{
          observationId: string;
          period: number;
          rootGeneration: number;
          progressionEpoch: string;
          offerGeneration: number;
          cost: Readonly<Record<string, number>>;
          nativeAffordable?: boolean | undefined;
          resources: Readonly<
            Record<
              string,
              Readonly<{
                amount: number | undefined;
                capacity: number | undefined;
                netRate: number | undefined;
              }>
            >
          >;
        }>;
      }>
    | undefined;
  readonly resources: Readonly<
    Record<
      string,
      Readonly<{
        amount: number | undefined;
        capacity: number | undefined;
        netRate: number | undefined;
      }>
    >
  >;
  readonly resourcesObservationId?: string | undefined;
  readonly decision?: Readonly<{
    boundary: boolean;
    selectedActionId?: string | undefined;
    invocationPeriod?: number | undefined;
    nativeAffordable?: boolean | undefined;
    resourceAffordable?: boolean | undefined;
    affordabilityObservationId?: string | undefined;
    resourceObservationId?: string | undefined;
    offerGeneration?: number | undefined;
    rootGeneration?: number | undefined;
    progressionEpoch?: string | undefined;
    reservation?: "none" | "conflict" | "unavailable" | undefined;
  }>;
  readonly commitments?: Readonly<{
    coverage: "complete" | "partial" | "unknown";
    items: readonly Readonly<{
      owner: string;
      resourceId: string;
      amount: number;
    }>[];
  }>;
}

export interface ResearchBottleneckAttribution {
  readonly status: "attributed" | "insufficient" | "invalid";
  readonly reason?: string;
  readonly actionId?: string;
  readonly offerGeneration?: number;
  readonly offerPrice?: Readonly<Record<string, number>>;
  readonly observedPeriod?: number;
  readonly blockers: readonly Readonly<Record<string, unknown>>[];
  readonly lastObservedNonResourceConstraint?: Readonly<{
    kind: string;
    firstObservedPeriod: number;
    clearedByPeriod?: number | undefined;
    intervalAmbiguous: boolean;
  }>;
  readonly unknownCommitments: boolean;
  readonly lastObservedConstraint?: Readonly<{
    kind: "resource-shortage" | "capacity";
    resourceId: string;
    period: number;
    priorInsufficientPeriod?: number | undefined;
    intervalAmbiguous: boolean;
  }>;
  readonly provenCriticalPath?: Readonly<{
    kind: "resource-shortage" | "capacity";
    resourceId: string;
    clearInterval: Readonly<{
      afterPeriod?: number | undefined;
      byPeriod: number;
    }>;
    decisionPeriod: number;
  }>;
}

type Blocker = Readonly<Record<string, unknown>>;

function invalid(reason: string): ResearchBottleneckAttribution {
  return Object.freeze({
    status: "invalid",
    reason,
    blockers: Object.freeze([]),
    unknownCommitments: false,
  });
}

function blockersAt(
  observation: ResearchBottleneckObservation,
): readonly Blocker[] {
  const offer = observation.offer;
  if (offer === undefined)
    return Object.freeze([Object.freeze({ kind: "not-offered" })]);

  const blockers: Blocker[] = [];
  if (observation.permission !== true)
    blockers.push({
      kind:
        observation.permission === false
          ? "permission-disabled"
          : "permission-unknown",
    });
  if (observation.eligibility !== "eligible")
    blockers.push({ kind: "eligibility", evidence: observation.eligibility });
  if (observation.queueEvidence !== "empty")
    blockers.push({
      kind: "research-queue",
      evidence: observation.queueEvidence,
    });

  for (const [resourceId, price] of Object.entries(offer.cost)) {
    const resource = observation.resources[resourceId];
    if (resource === undefined || !Number.isFinite(resource.amount)) {
      blockers.push({ kind: "resource-evidence-unknown", resourceId, price });
      continue;
    }
    if (resource.amount! < price)
      blockers.push({
        kind: "resource-shortage",
        resourceId,
        price,
        amount: resource.amount,
        deficit: price - resource.amount!,
        netRate: resource.netRate,
      });
    if (Number.isFinite(resource.capacity) && resource.capacity! < price)
      blockers.push({
        kind: "capacity",
        resourceId,
        price,
        capacity: resource.capacity,
      });
  }

  if (observation.decision?.reservation === "conflict")
    blockers.push({ kind: "competing-owner-commitment" });
  else if (observation.decision?.reservation === "unavailable")
    blockers.push({ kind: "competing-owner-commitment-unknown" });
  if (observation.commitments?.coverage !== "complete")
    blockers.push({
      kind: "other-commitments-unknown",
      coverage: observation.commitments?.coverage ?? "unknown",
    });
  for (const item of observation.commitments?.items ?? []) {
    if (item.amount > 0 && Object.hasOwn(offer.cost, item.resourceId))
      blockers.push({
        kind: "known-owner-commitment",
        owner: item.owner,
        resourceId: item.resourceId,
        amount: item.amount,
      });
  }

  const hasResourceBlocker = blockers.some(
    ({ kind }) =>
      kind === "resource-shortage" ||
      kind === "capacity" ||
      kind === "resource-evidence-unknown",
  );
  const draw = offer.affordabilityDraw;
  const drawEvidenceCurrent =
    draw !== undefined &&
    draw.observationId.length > 0 &&
    Number.isSafeInteger(draw.period) &&
    draw.period <= observation.period &&
    draw.rootGeneration === observation.rootGeneration &&
    draw.progressionEpoch === observation.progressionEpoch &&
    draw.offerGeneration === offer.generation &&
    draw.nativeAffordable === offer.nativeAffordable &&
    JSON.stringify(draw.cost) === JSON.stringify(offer.cost) &&
    Object.keys(offer.cost).every((resourceId) =>
      Number.isFinite(draw.resources[resourceId]?.amount),
    );
  const drawHasShortage =
    drawEvidenceCurrent &&
    Object.entries(offer.cost).some(
      ([resourceId, price]) =>
        draw.resources[resourceId]!.amount! < price ||
        (Number.isFinite(draw.resources[resourceId]!.capacity) &&
          draw.resources[resourceId]!.capacity! < price),
    );
  if (offer.nativeAffordable === false && !hasResourceBlocker)
    blockers.push({
      kind:
        drawEvidenceCurrent && !drawHasShortage
          ? "native-unaffordable-unknown"
          : "stale-affordability-evidence",
      ...(draw === undefined
        ? { freshness: "not-established" }
        : { drawObservationId: draw.observationId }),
    });
  if (
    observation.decision?.boundary === true &&
    observation.decision.nativeAffordable === false &&
    draw?.nativeAffordable === false &&
    !blockers.some(({ kind }) => kind === "native-unaffordable-unknown") &&
    !hasResourceBlocker &&
    observation.decision.affordabilityObservationId !== undefined &&
    observation.decision.affordabilityObservationId === draw?.observationId &&
    observation.decision.resourceObservationId ===
      observation.decision.affordabilityObservationId &&
    observation.resourcesObservationId ===
      observation.decision.resourceObservationId &&
    observation.decision.offerGeneration === offer.generation &&
    observation.decision.rootGeneration === observation.rootGeneration &&
    observation.decision.progressionEpoch === observation.progressionEpoch &&
    drawEvidenceCurrent &&
    !drawHasShortage
  )
    blockers.push({ kind: "native-unaffordable-unknown" });

  if (observation.decision?.boundary === true) {
    const decision = observation.decision;
    if (decision.selectedActionId === offer.actionId) {
      if (decision.invocationPeriod === undefined)
        blockers.push({ kind: "selected-not-invoked" });
    } else if (blockers.length === 0) {
      blockers.push({
        kind: "affordable-not-selected",
        selectedActionId: decision.selectedActionId,
      });
    }
  } else if (blockers.length === 0) {
    blockers.push({ kind: "decision-evidence-unavailable" });
  }
  return Object.freeze(blockers.map((blocker) => Object.freeze(blocker)));
}

export function attributeResearchBottleneck(
  observations: readonly ResearchBottleneckObservation[],
): ResearchBottleneckAttribution {
  if (observations.length === 0) return invalid("no observations");
  const ordered = [...observations].sort((a, b) => a.period - b.period);
  const firstOffered = ordered.find((entry) => entry.offer !== undefined);
  const actionId = firstOffered?.offer?.actionId;
  if (actionId === undefined)
    return invalid("no observation identifies an action");
  if (
    ordered.some(
      (entry, index) =>
        !Number.isSafeInteger(entry.period) ||
        (index > 0 && entry.period <= ordered[index - 1]!.period),
    )
  )
    return invalid("observation periods are invalid or duplicated");
  if (
    ordered.some(
      (entry) =>
        entry.current !== true ||
        entry.rootGeneration !== firstOffered!.rootGeneration ||
        entry.progressionEpoch !== firstOffered!.progressionEpoch ||
        (entry.offer !== undefined &&
          (entry.offer.actionId !== actionId ||
            entry.offer.controlGeneration !== entry.offer.generation)),
    )
  )
    return invalid("stale or mismatched offer, root, or progression evidence");
  if (
    ordered.some((entry) =>
      Object.values(entry.offer?.cost ?? {}).some(
        (price) => !Number.isFinite(price) || price < 0,
      ),
    )
  )
    return invalid("native offer price is malformed");

  const current = ordered.at(-1)!;
  const offer = current.offer ?? firstOffered!.offer!;
  const priceIdentity = JSON.stringify(offer.cost);
  const offerEpoch = ordered.filter((entry) => {
    if (entry.offer === undefined) return false;
    const candidate = entry.offer!;
    return (
      JSON.stringify(candidate.cost) === priceIdentity &&
      candidate.offerSetIdentity === offer.offerSetIdentity
    );
  });
  const currentBlockers = blockersAt(current);
  const nonResourceBlockers = new Map<
    string,
    { kind: string; firstObservedPeriod: number; lastObservedPeriod: number }
  >();
  const nonResourceKind = (kind: unknown): kind is string =>
    typeof kind === "string" &&
    kind !== "resource-shortage" &&
    kind !== "capacity" &&
    kind !== "resource-evidence-unknown" &&
    kind !== "other-commitments-unknown";
  for (const observation of ordered) {
    for (const blocker of blockersAt(observation)) {
      if (!nonResourceKind(blocker.kind)) continue;
      const identity = `${blocker.kind}:${String(blocker.resourceId ?? "")}`;
      const prior = nonResourceBlockers.get(identity);
      nonResourceBlockers.set(identity, {
        kind: blocker.kind,
        firstObservedPeriod: prior?.firstObservedPeriod ?? observation.period,
        lastObservedPeriod: observation.period,
      });
    }
  }
  const lastNonResource = [...nonResourceBlockers.values()].sort(
    (a, b) => b.lastObservedPeriod - a.lastObservedPeriod,
  )[0];
  const lastObservedNonResourceConstraint = lastNonResource
    ? {
        kind: lastNonResource.kind,
        firstObservedPeriod: lastNonResource.firstObservedPeriod,
        ...(lastNonResource.lastObservedPeriod < current.period
          ? { clearedByPeriod: current.period }
          : {}),
        intervalAmbiguous: lastNonResource.lastObservedPeriod < current.period,
      }
    : undefined;
  const unknownCommitments = current.commitments?.coverage !== "complete";
  const insufficientEvidence = currentBlockers.some(
    ({ kind, evidence }) =>
      kind === "decision-evidence-unavailable" ||
      kind === "resource-evidence-unknown" ||
      kind === "permission-unknown" ||
      kind === "native-unaffordable-unknown" ||
      kind === "stale-affordability-evidence" ||
      (kind === "eligibility" &&
        (evidence === "unknown" || evidence === "unavailable")) ||
      (kind === "research-queue" && evidence === "unavailable"),
  );
  const sawNativeUnknown = ordered.some((entry) =>
    blockersAt(entry).some(
      ({ kind }) => kind === "native-unaffordable-unknown",
    ),
  );

  const thresholdEvents: {
    kind: "resource-shortage" | "capacity";
    resourceId: string;
    period: number;
    priorInsufficientPeriod?: number;
  }[] = [];
  for (const resourceId of Object.keys(offer.cost)) {
    for (const kind of ["resource-shortage", "capacity"] as const) {
      let previousInsufficient: number | undefined;
      for (const observation of offerEpoch) {
        const resource = observation.resources[resourceId];
        const value =
          kind === "resource-shortage" ? resource?.amount : resource?.capacity;
        const sufficient =
          Number.isFinite(value) && value! >= offer.cost[resourceId]!;
        if (!sufficient) {
          previousInsufficient = observation.period;
          continue;
        }
        if (previousInsufficient !== undefined) {
          thresholdEvents.push({
            kind,
            resourceId,
            period: observation.period,
            priorInsufficientPeriod: previousInsufficient,
          });
        }
        break;
      }
    }
  }
  const lastPeriod = Math.max(...thresholdEvents.map(({ period }) => period));
  const last = thresholdEvents.filter(({ period }) => period === lastPeriod);
  const lastObservedConstraint =
    last.length === 1
      ? {
          ...last[0]!,
          intervalAmbiguous: false,
        }
      : last.length > 1
        ? {
            kind: "resource-shortage" as const,
            resourceId: last.map(({ resourceId }) => resourceId).join(","),
            period: lastPeriod,
            priorInsufficientPeriod: undefined,
            intervalAmbiguous: true,
          }
        : undefined;

  const decision = [...offerEpoch]
    .reverse()
    .find(
      (entry) =>
        entry.decision?.boundary === true &&
        entry.decision.selectedActionId === actionId &&
        entry.decision.invocationPeriod !== undefined,
    );
  const availabilityStayedClear = ordered.every((entry) =>
    blockersAt(entry).every(
      ({ kind }) =>
        kind === "resource-shortage" ||
        kind === "capacity" ||
        kind === "resource-evidence-unknown" ||
        kind === "other-commitments-unknown" ||
        kind === "stale-affordability-evidence" ||
        (kind === "decision-evidence-unavailable" &&
          entry.decision?.boundary !== true),
    ),
  );
  const provenCriticalPath =
    lastObservedConstraint !== undefined &&
    last.length === 1 &&
    decision !== undefined &&
    availabilityStayedClear &&
    currentBlockers.every(
      ({ kind }) =>
        kind !== "resource-shortage" &&
        kind !== "capacity" &&
        kind !== "permission-disabled" &&
        kind !== "eligibility" &&
        kind !== "research-queue" &&
        kind !== "native-unaffordable-unknown" &&
        kind !== "stale-affordability-evidence",
    )
      ? {
          kind: lastObservedConstraint.kind,
          resourceId: lastObservedConstraint.resourceId,
          clearInterval: {
            afterPeriod: lastObservedConstraint.priorInsufficientPeriod,
            byPeriod: lastObservedConstraint.period,
          },
          decisionPeriod: decision.decision!.invocationPeriod!,
        }
      : undefined;

  return Object.freeze({
    status:
      insufficientEvidence || sawNativeUnknown ? "insufficient" : "attributed",
    actionId,
    offerGeneration: offer.generation,
    offerPrice: offer.cost,
    observedPeriod: current.period,
    blockers: currentBlockers,
    unknownCommitments,
    ...(lastObservedNonResourceConstraint === undefined
      ? {}
      : {
          lastObservedNonResourceConstraint: Object.freeze(
            lastObservedNonResourceConstraint,
          ),
        }),
    ...(lastObservedConstraint === undefined
      ? {}
      : { lastObservedConstraint: Object.freeze(lastObservedConstraint) }),
    ...(provenCriticalPath === undefined
      ? {}
      : { provenCriticalPath: Object.freeze(provenCriticalPath) }),
  });
}
