import { createP36BootstrapPolicy } from "./p36-productive-resource-bootstrap-policy.mjs";

export const P38_DIAGNOSTIC_AUTHORIZATION = Object.freeze({
  id: "p38-test-only-quarry-lumber-gather-18",
  targetId: "city-rock_quarry",
  additionalGatherLimit: 18,
  perCycleLimit: 5,
  retainedStopPeriod: 688,
});

const materialIds = ["Lumber", "Stone"];
const priceIdentity = (price) =>
  JSON.stringify(
    Object.entries(price ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
const authorityIdentity = (contract) =>
  JSON.stringify([
    contract.targetId,
    priceIdentity(contract.price),
    contract.pool,
    contract.rootGeneration,
    contract.progressionGeneration,
    contract.controlGeneration,
  ]);

function completeAuthority(contract, root) {
  if (
    contract.targetId !== P38_DIAGNOSTIC_AUTHORIZATION.targetId ||
    contract.phase !== "pre-Gather" ||
    contract.resourceAuthority !== "native-gather-owner-controls" ||
    contract.publicationCurrent !== true ||
    contract.requestMatchesPublication !== true ||
    contract.currentSavingTargetMatchesPublication !== true ||
    contract.priceAuthorityValid !== true ||
    contract.ownerState?.orderingComplete !== true ||
    contract.ownerState?.autoBuild !== true ||
    contract.permissions?.autoBuild !== true ||
    contract.permissions?.controlAction !== true ||
    contract.queuesEmpty !== true ||
    contract.competingClaims !== false ||
    contract.pool !== "anywhere" ||
    !Number.isSafeInteger(contract.rootGeneration) ||
    typeof contract.progressionGeneration !== "string" ||
    !Number.isSafeInteger(contract.controlGeneration)
  )
    return false;
  if (
    Number(contract.price?.Lumber) !== 50 ||
    Number(contract.price?.Stone) !== 10 ||
    !Number.isFinite(Number(contract.stock?.Lumber)) ||
    !Number.isFinite(Number(contract.stock?.Stone))
  )
    return false;
  if (Number(root?.city?.rock_quarry?.count ?? 0) > 0) return false;
  return Object.entries(contract.price).every(([resourceId, amount]) =>
    materialIds.includes(resourceId)
      ? true
      : Number(root?.resource?.[resourceId]?.amount ?? 0) >= Number(amount),
  );
}

export function createP38QuarryDiagnosticAuthorization({
  arm,
  readP36Stop,
  readRoot,
  onEvent = () => {},
} = {}) {
  const active =
    arm === "B" || arm === "B-repeat" || arm === "C" || arm === "C-repeat";
  let clicks = 0;
  let stoppedReason;
  let authorizationSignature;
  let expectedStock;
  const observations = [];

  const snapshot = () => ({
    arm,
    authorizationId: P38_DIAGNOSTIC_AUTHORIZATION.id,
    clicks,
    remainingClicks:
      P38_DIAGNOSTIC_AUTHORIZATION.additionalGatherLimit - clicks,
    stoppedReason: stoppedReason ?? null,
  });

  const stop = (reason, details = {}) => {
    if (stoppedReason !== undefined) return;
    stoppedReason = reason;
    onEvent({ type: "p38-stopped", reason, ...details, ...snapshot() });
  };

  const p36BoundaryReady = (period) => {
    const evidence = readP36Stop?.();
    if (
      evidence?.reason !== "shortage-exceeds-remaining-budget" ||
      evidence?.targetId !== P38_DIAGNOSTIC_AUTHORIZATION.targetId ||
      evidence?.period !== P38_DIAGNOSTIC_AUTHORIZATION.retainedStopPeriod ||
      period <= evidence.period
    )
      return false;
    return true;
  };

  const recordObservation = (contract, root, period) => {
    const item = Object.freeze({
      period,
      targetId: contract.targetId,
      price: contract.price,
      stock: contract.stock,
      pool: contract.pool,
      rootGeneration: contract.rootGeneration,
      progressionGeneration: contract.progressionGeneration,
      controlGeneration: contract.controlGeneration,
      requestMatchesPublication: contract.requestMatchesPublication,
      currentSavingTargetMatchesPublication:
        contract.currentSavingTargetMatchesPublication,
      publicationCurrent: contract.publicationCurrent,
      priceAuthorityValid: contract.priceAuthorityValid,
      resourceAuthority: contract.resourceAuthority,
      ownerState: contract.ownerState,
      permissions: contract.permissions,
      queuesEmpty: contract.queuesEmpty,
      competingClaims: contract.competingClaims,
      obtainableCapacity: contract.obtainableCapacity,
      gatherControlBindings: contract.gatherControlBindings,
      completeAuthority: completeAuthority(contract, root),
    });
    observations.push(item);
    onEvent({ type: "authority-observed", ...item, ...snapshot() });
    return item;
  };

  const observe = (contract, root, period) => {
    if (!active || stoppedReason !== undefined) return;
    if (!p36BoundaryReady(period)) return;
    if (Number(root?.city?.rock_quarry?.count ?? 0) > 0) {
      stop("native-quarry-purchased", {
        period,
        price: contract.price,
        stock: contract.stock,
      });
      return;
    }
    if (contract.targetId !== P38_DIAGNOSTIC_AUTHORIZATION.targetId) {
      stop("native-target-changed", {
        period,
        targetId: contract.targetId,
        price: contract.price,
        stock: contract.stock,
      });
      return;
    }
    if (expectedStock !== undefined) {
      const currentLumber = Number(contract.stock?.Lumber);
      const currentStone = Number(contract.stock?.Stone);
      if (
        (Number.isFinite(currentLumber) &&
          currentLumber < expectedStock.Lumber) ||
        (Number.isFinite(currentStone) && currentStone < expectedStock.Stone)
      ) {
        stop("competing-purchase-consumed-resources", {
          period,
          expectedStock,
          currentStock: { Lumber: currentLumber, Stone: currentStone },
        });
        return;
      }
    }
    const signature = authorityIdentity(contract);
    if (
      authorizationSignature !== undefined &&
      signature !== authorizationSignature
    ) {
      stop("native-price-or-generation-changed", {
        period,
        previousAuthority: authorizationSignature,
        currentAuthority: signature,
      });
      return;
    }
    recordObservation(contract, root, period);
  };

  const isCurrent = (contract, root, period) =>
    active &&
    stoppedReason === undefined &&
    p36BoundaryReady(period) &&
    authorizationSignature === authorityIdentity(contract) &&
    completeAuthority(contract, root);

  const authorize = (contract, root, period) => {
    if (!active || stoppedReason !== undefined) return undefined;
    if (!p36BoundaryReady(period)) return undefined;
    if (Number(root?.city?.rock_quarry?.count ?? 0) > 0) {
      stop("native-quarry-purchased", {
        period,
        price: contract.price,
        stock: contract.stock,
      });
      return undefined;
    }
    if (contract.targetId !== P38_DIAGNOSTIC_AUTHORIZATION.targetId) {
      stop("native-target-changed", { period, targetId: contract.targetId });
      return undefined;
    }
    if (!completeAuthority(contract, root)) {
      stop("native-authority-incomplete", {
        period,
        targetId: contract.targetId,
        authority: recordObservation(contract, root, period),
      });
      return undefined;
    }
    const signature = authorityIdentity(contract);
    if (
      authorizationSignature !== undefined &&
      signature !== authorizationSignature
    ) {
      stop("native-price-or-generation-changed", { period });
      return undefined;
    }
    authorizationSignature ??= signature;

    const shortage = Object.fromEntries(
      materialIds.map((id) => [
        id,
        Math.max(
          0,
          Number(contract.price?.[id] ?? 0) - Number(contract.stock?.[id] ?? 0),
        ),
      ]),
    );
    const shortageClicks = Object.values(shortage).reduce(
      (sum, amount) => sum + amount,
      0,
    );
    if (shortageClicks === 0) {
      onEvent({
        type: "materials-ready",
        period,
        price: contract.price,
        stock: contract.stock,
        rootGeneration: contract.rootGeneration,
        progressionGeneration: contract.progressionGeneration,
        controlGeneration: contract.controlGeneration,
        ...snapshot(),
      });
      expectedStock = {
        Lumber: Number(contract.stock?.Lumber ?? 0),
        Stone: Number(contract.stock?.Stone ?? 0),
      };
      return undefined;
    }

    const remaining =
      P38_DIAGNOSTIC_AUTHORIZATION.additionalGatherLimit - clicks;
    if (shortageClicks > remaining) {
      stop("shortage-exceeds-diagnostic-authorization", {
        period,
        shortage,
        shortageClicks,
        remaining,
        price: contract.price,
        stock: contract.stock,
      });
      return undefined;
    }

    const clickBudget = Math.min(
      P38_DIAGNOSTIC_AUTHORIZATION.perCycleLimit,
      remaining,
      shortageClicks,
    );
    expectedStock = {
      Lumber: Number(contract.stock?.Lumber ?? 0),
      Stone: Number(contract.stock?.Stone ?? 0),
    };
    onEvent({
      type: "authorized",
      period,
      targetId: contract.targetId,
      authorizationId: P38_DIAGNOSTIC_AUTHORIZATION.id,
      authorizationType: "test-only-diagnostic",
      additionalClickLimit: P38_DIAGNOSTIC_AUTHORIZATION.additionalGatherLimit,
      clickBudget,
      shortage,
      price: contract.price,
      stock: contract.stock,
      authority: recordObservation(contract, root, period),
      ...snapshot(),
    });
    const activeSignature = authorizationSignature;
    return Object.freeze({
      clickBudget,
      onClick(event) {
        if (clicks >= P38_DIAGNOSTIC_AUTHORIZATION.additionalGatherLimit) {
          stop("diagnostic-click-limit-exceeded", {
            period,
            actionId: event.actionId,
            resourceId: event.resourceId,
          });
          return;
        }
        if (
          stoppedReason !== undefined ||
          activeSignature !== authorityIdentity(contract)
        ) {
          stop("authorization-expired-during-gather", {
            period,
            actionId: event.actionId,
            resourceId: event.resourceId,
          });
          return;
        }
        clicks += 1;
        const currentRoot = readRoot?.();
        const currentLumber = Number(
          currentRoot?.resource?.Lumber?.amount ?? Number.NaN,
        );
        const currentStone = Number(
          currentRoot?.resource?.Stone?.amount ?? Number.NaN,
        );
        const beforeStock = { ...expectedStock };
        if (Number.isFinite(currentLumber))
          expectedStock.Lumber = currentLumber;
        if (Number.isFinite(currentStone)) expectedStock.Stone = currentStone;
        const stockIncreased =
          event.resourceId === "Lumber"
            ? expectedStock.Lumber > beforeStock.Lumber
            : event.resourceId === "Stone"
              ? expectedStock.Stone > beforeStock.Stone
              : false;
        if (!stockIncreased) {
          stop("native-gather-stock-postcondition-failed", {
            period,
            actionId: event.actionId,
            resourceId: event.resourceId,
            beforeStock,
            afterStock: { ...expectedStock },
          });
          return;
        }
        onEvent({
          type: "gather-click",
          period,
          targetId: contract.targetId,
          authorizationId: P38_DIAGNOSTIC_AUTHORIZATION.id,
          actionId: event.actionId,
          resourceId: event.resourceId,
          beforeStock,
          afterStock: { ...expectedStock },
          stockIncreased,
          ...snapshot(),
        });
      },
    });
  };

  const onRejected = (event) => {
    if (
      !active ||
      stoppedReason !== undefined ||
      !p36BoundaryReady(event.period ?? 689)
    )
      return;
    stop("native-allocation-rejected", {
      targetId: event.targetId ?? null,
      workCycleId: event.workCycleId ?? null,
      rejectionReason: event.reason ?? null,
      period: event.period ?? null,
    });
  };

  return Object.freeze({
    observe,
    authorize,
    isCurrent,
    onRejected,
    snapshot,
    observations,
  });
}
