/**
 * Pure equivalent of the legacy `adjustTradeRoutes`. It replays the trade-route
 * assignment algorithm over an immutable snapshot and returns the ordered list of
 * MarketManager operations (zero/add/remove) plus the final Money rate-of-change
 * to write back. It performs no game reads or mutations; the composition root
 * applies the operations and the money rate.
 *
 * The algorithm — including the sort comparators, the priority-group ordering,
 * the entrepreneur unassign step, and the two-phase
 * adjust-toward-zero-then-rest ordering — is ported line-for-line so the
 * operation trace is byte-identical to the original for supported settings.
 */

export interface TradeResourceView {
  readonly id: string;
  readonly tradeRoutes: number;
  readonly autoTradeBuyEnabled: boolean;
  readonly autoTradeSellEnabled: boolean;
  readonly usefulRatio: number;
  readonly storageRatio: number;
  readonly tradeSellPrice: number;
  readonly tradeBuyPrice: number;
  readonly rateOfChange: number;
  readonly tradeRouteQuantity: number;
  readonly autoTradeWeighting: number;
  readonly autoTradePriority: number;
  readonly isRoutesUnlocked: boolean;
  readonly isDemanded: boolean;
}

export interface TradeMoneyView {
  readonly rateOfChange: number;
  readonly maxQuantity: number;
  readonly currentQuantity: number;
  readonly isDemanded: boolean;
}

export interface TradeRoutesSettings {
  readonly tradeRouteSellExcess: boolean;
  readonly tradeRouteMinimumMoneyPerSecond: number;
  readonly tradeRouteMinimumMoneyPercentage: number;
}

export interface TradeRoutesInput {
  readonly settings: TradeRoutesSettings;
  /** MarketManager.priorityList, in order. */
  readonly priorityList: readonly TradeResourceView[];
  readonly money: TradeMoneyView;
  readonly importRouteCap: number;
  readonly exportRouteCap: number;
  readonly maxTradeRoutes: number;
  readonly unmanagedTradeRoutes: number;
  readonly isBanana: boolean;
  readonly isEntrepreneur: boolean;
  readonly saveInflationMoney: boolean;
}

export type TradeOperation =
  | { readonly kind: "zero"; readonly resourceId: string }
  | {
      readonly kind: "add";
      readonly resourceId: string;
      readonly count: number;
    }
  | {
      readonly kind: "remove";
      readonly resourceId: string;
      readonly count: number;
    };

export interface TradeRoutesResult {
  readonly operations: readonly TradeOperation[];
  readonly moneyRate: number;
}

export function planTradeRoutes(
  input: Readonly<TradeRoutesInput>,
): TradeRoutesResult {
  const { settings } = input;
  const money = input.money;
  const operations: TradeOperation[] = [];

  const sellWeight = settings.tradeRouteSellExcess
    ? (resource: TradeResourceView) =>
        resource.usefulRatio >= 1
          ? resource.tradeSellPrice * 1000
          : resource.usefulRatio
    : (resource: TradeResourceView) =>
        resource.storageRatio >= 0.99
          ? resource.tradeSellPrice * 1000
          : resource.usefulRatio;

  const tradableResources = input.priorityList
    .filter(
      (r) =>
        r.isRoutesUnlocked && (r.autoTradeBuyEnabled || r.autoTradeSellEnabled),
    )
    .sort((a, b) => sellWeight(b) - sellWeight(a));

  // `requiredTradeRoutes[id] === undefined` distinguishes "not a candidate" from
  // a zero assignment, so a Map (with an explicit undefined-check) is used.
  const requiredTradeRoutes = new Map<string, number>();
  const viewsById = new Map<string, TradeResourceView>();
  for (const resource of tradableResources) {
    viewsById.set(resource.id, resource);
  }

  let currentMoneyPerSecond = money.rateOfChange;
  let tradeRoutesUsed = 0;
  const importRouteCap = input.importRouteCap;
  const exportRouteCap = input.exportRouteCap;
  const maxTradeRoutes = input.maxTradeRoutes;
  const unmanagedTradeRoutes = input.unmanagedTradeRoutes;
  const saveInflationMoney = input.saveInflationMoney;

  // Fill trade routes with selling
  for (const resource of tradableResources) {
    if (!resource.autoTradeSellEnabled) {
      continue;
    }
    requiredTradeRoutes.set(resource.id, 0);

    if (
      tradeRoutesUsed >= maxTradeRoutes ||
      (input.isBanana && tradeRoutesUsed > 0) ||
      (settings.tradeRouteSellExcess
        ? resource.usefulRatio < 1
        : resource.storageRatio < 0.99)
    ) {
      continue;
    }

    const routesToAssign = Math.min(
      exportRouteCap,
      maxTradeRoutes - tradeRoutesUsed,
      Math.floor(resource.rateOfChange / resource.tradeRouteQuantity),
    );
    if (routesToAssign > 0) {
      tradeRoutesUsed += routesToAssign;
      requiredTradeRoutes.set(
        resource.id,
        (requiredTradeRoutes.get(resource.id) ?? 0) - routesToAssign,
      );
      currentMoneyPerSecond += resource.tradeSellPrice * routesToAssign;
    }
  }

  if (saveInflationMoney) {
    for (const resource of tradableResources) {
      if (resource.autoTradeBuyEnabled) {
        requiredTradeRoutes.set(
          resource.id,
          requiredTradeRoutes.get(resource.id) ?? 0,
        );
      }
    }
  }
  let minimumAllowedMoneyPerSecond = Math.min(
    money.maxQuantity - money.currentQuantity,
    Math.max(
      settings.tradeRouteMinimumMoneyPerSecond,
      (settings.tradeRouteMinimumMoneyPercentage / 100) * currentMoneyPerSecond,
    ),
  );

  // Init adjustment, and sort groups by priorities
  const priorityGroups: Record<string, TradeResourceView[]> = {};
  for (const resource of tradableResources) {
    if (!resource.autoTradeBuyEnabled) {
      continue;
    }
    requiredTradeRoutes.set(
      resource.id,
      requiredTradeRoutes.get(resource.id) ?? 0,
    );
    if (saveInflationMoney) {
      continue;
    }

    if (
      resource.autoTradeWeighting <= 0 ||
      (settings.tradeRouteSellExcess
        ? resource.usefulRatio > 0.99
        : resource.storageRatio > 0.98)
    ) {
      continue;
    }

    let priority = resource.autoTradePriority;
    if (resource.isDemanded) {
      priority = Math.max(priority, 100);
      if (!money.isDemanded) {
        // Resource demanded, money not demanded - ignore min money, and spend as much as possible
        minimumAllowedMoneyPerSecond = 0;
      }
    } else if (priority < 100 && priority !== -1 && money.isDemanded) {
      // Don't buy resources with low priority when money is demanded
      continue;
    }

    if (priority !== 0) {
      const group = priorityGroups[priority] ?? [];
      priorityGroups[priority] = group;
      group.push(resource);
    }
  }
  const priorityList = Object.keys(priorityGroups)
    .sort((a, b) => Number(b) - Number(a))
    .map((key) => priorityGroups[key]!);
  const negativeGroup = priorityGroups["-1"];
  if (negativeGroup && priorityList.length > 1) {
    const negativeIndex = priorityList.indexOf(negativeGroup);
    priorityList.splice(negativeIndex, 1);
    priorityList[0]!.push(...negativeGroup);
  }

  // Calculate amount of routes per resource
  const required = (id: string): number => requiredTradeRoutes.get(id) ?? 0;
  const resSorter = (a: TradeResourceView, b: TradeResourceView) =>
    required(a.id) / a.autoTradeWeighting -
      required(b.id) / b.autoTradeWeighting ||
    b.autoTradeWeighting - a.autoTradeWeighting;
  let remainingRoutes: number;
  let unassignStep: number;
  if (input.isEntrepreneur) {
    remainingRoutes = tradeRoutesUsed - unmanagedTradeRoutes;
    unassignStep = 2;
  } else {
    remainingRoutes = maxTradeRoutes;
    unassignStep = 1;
  }
  outerLoop: for (
    let i = 0;
    i < priorityList.length && remainingRoutes > 0;
    i++
  ) {
    const trades = priorityList[i]!.sort(
      (a, b) => a.autoTradeWeighting - b.autoTradeWeighting,
    );
    assignLoop: while (trades.length > 0 && remainingRoutes > 0) {
      const resource = trades.sort(resSorter)[0]!;
      // TODO: Fast assign for single resource

      if (required(resource.id) >= importRouteCap) {
        trades.shift();
        continue;
      }
      // Stop if next route will lower income below allowed minimum
      if (
        currentMoneyPerSecond - resource.tradeBuyPrice <
        minimumAllowedMoneyPerSecond
      ) {
        break outerLoop;
      }

      if (tradeRoutesUsed < maxTradeRoutes) {
        // Still have unassigned routes
        currentMoneyPerSecond -= resource.tradeBuyPrice;
        tradeRoutesUsed++;
        remainingRoutes--;
        requiredTradeRoutes.set(resource.id, required(resource.id) + 1);
      } else {
        // No free routes, remove selling
        let continued = false;
        for (const otherId of requiredTradeRoutes.keys()) {
          const currentRequired = requiredTradeRoutes.get(otherId);
          if (currentRequired === undefined) {
            continue;
          }
          const otherResource = viewsById.get(otherId)!;
          if (currentRequired >= 0 || resource === otherResource) {
            continue;
          }

          if (
            currentMoneyPerSecond -
              otherResource.tradeSellPrice -
              resource.tradeBuyPrice >
              minimumAllowedMoneyPerSecond &&
            remainingRoutes >= unassignStep
          ) {
            currentMoneyPerSecond -= otherResource.tradeSellPrice;
            currentMoneyPerSecond -= resource.tradeBuyPrice;
            requiredTradeRoutes.set(otherId, required(otherId) + 1);
            requiredTradeRoutes.set(resource.id, required(resource.id) + 1);
            remainingRoutes -= unassignStep;
            continued = true;
            break;
          }
        }
        if (continued) {
          continue assignLoop;
        }
        // Couldn't remove route, stop asigning
        break outerLoop;
      }
    }
  }

  // Adjust our trade routes - always adjust towards zero first to free up trade routes
  const adjustmentTradeRoutes: (number | undefined)[] = [];
  tradableResources.forEach((resource, i) => {
    if (!requiredTradeRoutes.has(resource.id)) {
      return;
    }
    const adjustment = required(resource.id) - resource.tradeRoutes;
    adjustmentTradeRoutes[i] = adjustment;

    if (required(resource.id) === 0 && resource.tradeRoutes !== 0) {
      operations.push({ kind: "zero", resourceId: resource.id });
      adjustmentTradeRoutes[i] = 0;
    } else if (adjustment > 0 && resource.tradeRoutes < 0) {
      operations.push({
        kind: "add",
        resourceId: resource.id,
        count: adjustment,
      });
      adjustmentTradeRoutes[i] = 0;
    } else if (adjustment < 0 && resource.tradeRoutes > 0) {
      operations.push({
        kind: "remove",
        resourceId: resource.id,
        count: -1 * adjustment,
      });
      adjustmentTradeRoutes[i] = 0;
    }
  });

  // Adjust our trade routes - we've adjusted towards zero, now adjust the rest
  tradableResources.forEach((resource, i) => {
    if (!requiredTradeRoutes.has(resource.id)) {
      return;
    }
    const adjustment = adjustmentTradeRoutes[i];
    if (adjustment !== undefined && adjustment > 0) {
      operations.push({
        kind: "add",
        resourceId: resource.id,
        count: adjustment,
      });
    } else if (adjustment !== undefined && adjustment < 0) {
      operations.push({
        kind: "remove",
        resourceId: resource.id,
        count: -1 * adjustment,
      });
    }
  });

  return Object.freeze({
    operations: Object.freeze(operations.map((op) => Object.freeze(op))),
    moneyRate: currentMoneyPerSecond,
  });
}
