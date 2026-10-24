export const P36_BOOTSTRAP_LIMITS = Object.freeze({
  shed: 80,
  quarry: 60,
  total: 140,
  perCycle: 5,
});

export const P36_BOOTSTRAP_TARGETS = Object.freeze({
  shed: "city-shed",
  quarry: "city-rock_quarry",
});

const materialIds = ["Lumber", "Stone"];

const canonicalPrice = (price) =>
  JSON.stringify(
    Object.entries(price ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );

const requestSignature = (contract) =>
  JSON.stringify([
    contract.targetId,
    canonicalPrice(contract.price),
    contract.rootGeneration,
  ]);

const authoritySignature = (contract) =>
  JSON.stringify([contract.progressionGeneration, contract.controlGeneration]);

const ownedCount = (root, id) => Number(root?.city?.[id]?.count ?? 0);
const readPeriod = () =>
  Number(globalThis.window?.__EA_RUNNER__?.periods?.() ?? 0);

export function createP36BootstrapPolicy({ onEvent = () => {} } = {}) {
  let stage = "shed";
  let armed = false;
  let stageStarted = false;
  let signature;
  let currentAuthoritySignature;
  let stageClicks = 0;
  let totalClicks = 0;
  let stoppedReason;
  const episodes = [];

  const targetFor = () => P36_BOOTSTRAP_TARGETS[stage];
  const limitFor = () => P36_BOOTSTRAP_LIMITS[stage];
  const snapshot = () => ({
    stage,
    stageClicks,
    totalClicks,
    armed,
    stoppedReason: stoppedReason ?? null,
  });

  const stop = (reason, details = {}) => {
    if (stoppedReason === undefined) {
      stoppedReason = reason;
      armed = false;
      onEvent({ type: "stopped", reason, ...details, ...snapshot() });
    }
  };

  const advanceNativeStage = (root, period) => {
    if (stage === "shed" && ownedCount(root, "shed") >= 1) {
      onEvent({
        type: "native-purchase-verified",
        targetId: P36_BOOTSTRAP_TARGETS.shed,
        period,
        shedCount: ownedCount(root, "shed"),
        ...snapshot(),
      });
      stage = "quarry";
      armed = false;
      stageStarted = false;
      signature = undefined;
      currentAuthoritySignature = undefined;
      stageClicks = 0;
      onEvent({ type: "stage-advanced", period, stage, ...snapshot() });
    }
    if (stage === "quarry" && ownedCount(root, "rock_quarry") >= 1) {
      onEvent({
        type: "native-purchase-verified",
        targetId: P36_BOOTSTRAP_TARGETS.quarry,
        period,
        quarryCount: ownedCount(root, "rock_quarry"),
        ...snapshot(),
      });
      stage = "complete";
      armed = false;
      stageStarted = false;
      signature = undefined;
      currentAuthoritySignature = undefined;
      onEvent({ type: "complete", period, ...snapshot() });
    }
  };

  const inspectTarget = (contract, root, period) => {
    advanceNativeStage(root, period);
    if (stoppedReason !== undefined || stage === "complete") return false;
    const expectedTargetId = targetFor();

    // Native Farm orders before the first live Shed order are intentionally ignored.
    // Once a stage is armed, losing its exact native target is terminal for spending.
    if (contract.targetId !== expectedTargetId) {
      if (stageStarted)
        stop("unexpected-native-target", {
          expectedTargetId,
          actualTargetId: contract.targetId ?? null,
          period,
        });
      return false;
    }

    if (stageStarted && requestSignature(contract) !== signature)
      stop("native-request-authority-changed", {
        targetId: contract.targetId,
        period,
      });
    return stoppedReason === undefined;
  };

  const current = (contract, root) => {
    const period = readPeriod();
    advanceNativeStage(root, period);
    return (
      stoppedReason === undefined &&
      stage !== "complete" &&
      armed &&
      contract.targetId === targetFor() &&
      requestSignature(contract) === signature &&
      authoritySignature(contract) === currentAuthoritySignature &&
      contract.phase === "pre-Gather" &&
      contract.publicationCurrent === true &&
      contract.requestMatchesPublication === true &&
      contract.currentSavingTargetMatchesPublication === true &&
      contract.priceAuthorityValid === true &&
      contract.ownerState?.autoBuild === true &&
      contract.queuesEmpty === true &&
      contract.permissions?.autoBuild === true &&
      contract.permissions?.controlAction === true &&
      contract.competingClaims === false &&
      (stage !== "shed" || ownedCount(root, "shed") === 0) &&
      (stage !== "quarry" ||
        (ownedCount(root, "shed") >= 1 &&
          ownedCount(root, "rock_quarry") === 0))
    );
  };

  return Object.freeze({
    inspect(contract, root, period) {
      return inspectTarget(contract, root, period);
    },
    onRejected({ targetId, reason, workCycleId }) {
      if (stageStarted)
        stop("authority-expired", {
          targetId: targetId ?? null,
          rejectionReason: reason,
          workCycleId,
        });
    },
    authorize(contract, root, period) {
      if (!inspectTarget(contract, root, period)) return undefined;
      const expectedTargetId = targetFor();
      if (contract.targetId !== expectedTargetId) return undefined;

      const shortage = Object.fromEntries(
        materialIds.map((id) => [
          id,
          Math.max(
            0,
            Number(contract.price?.[id] ?? 0) -
              Number(contract.stock?.[id] ?? 0),
          ),
        ]),
      );
      const shortageClicks = Object.values(shortage).reduce(
        (sum, amount) => sum + amount,
        0,
      );
      if (shortageClicks <= 0) return undefined;

      const nextSignature = requestSignature(contract);
      if (!armed) {
        const remainingStage = limitFor() - stageClicks;
        const remainingTotal = P36_BOOTSTRAP_LIMITS.total - totalClicks;
        if (shortageClicks > Math.min(remainingStage, remainingTotal)) {
          stop("shortage-exceeds-remaining-budget", {
            targetId: expectedTargetId,
            shortage,
            shortageClicks,
            remainingStage,
            remainingTotal,
            period,
          });
          return undefined;
        }
        signature = nextSignature;
        currentAuthoritySignature = authoritySignature(contract);
        armed = true;
        stageStarted = true;
        episodes.push({
          targetId: expectedTargetId,
          period,
          price: contract.price,
          shortage,
          clickStart: totalClicks,
        });
        onEvent({
          type: "authorized",
          targetId: expectedTargetId,
          period,
          price: contract.price,
          stock: contract.stock,
          shortage,
          ...snapshot(),
        });
      } else if (nextSignature !== signature) {
        stop("native-request-authority-changed", {
          targetId: expectedTargetId,
          period,
        });
        return undefined;
      }
      currentAuthoritySignature = authoritySignature(contract);

      const clickBudget = Math.min(
        P36_BOOTSTRAP_LIMITS.perCycle,
        limitFor() - stageClicks,
        P36_BOOTSTRAP_LIMITS.total - totalClicks,
      );
      if (clickBudget <= 0) {
        stop("click-budget-exhausted", {
          targetId: expectedTargetId,
          period,
        });
        return undefined;
      }
      const activeSignature = signature;
      return {
        clickBudget,
        onClick(event) {
          if (
            stoppedReason !== undefined ||
            stage === "complete" ||
            requestSignature(contract) !== activeSignature
          ) {
            stop("authority-expired-during-gather", {
              targetId: contract.targetId,
              actionId: event.actionId,
              resourceId: event.resourceId,
            });
            return;
          }
          stageClicks += 1;
          totalClicks += 1;
          onEvent({
            type: "gather-click",
            targetId: expectedTargetId,
            period: readPeriod() || period,
            resourceId: event.resourceId,
            actionId: event.actionId,
            ...snapshot(),
          });
          if (
            stageClicks >= limitFor() ||
            totalClicks >= P36_BOOTSTRAP_LIMITS.total
          ) {
            armed = false;
            onEvent({
              type: "stage-budget-exhausted",
              targetId: expectedTargetId,
              ...snapshot(),
            });
          }
        },
      };
    },
    isCurrent(contract, root) {
      return current(contract, root);
    },
    snapshot,
    episodes,
  });
}
