export interface GalaxyMarketOfferInput {
  readonly index: number;
  readonly buyResourceId: string;
  readonly sellResourceId: string;
  readonly weighting: number;
  readonly priority: number;
  readonly demanded: boolean;
  readonly useful: boolean;
  readonly sellDemanded: boolean;
  readonly sellStorageRatio: number;
  readonly current: number;
}

export interface GalaxyMarketInput {
  readonly initialized: boolean;
  readonly maximum: number;
  readonly minimumIngredientRatio: number;
  readonly offers: readonly GalaxyMarketOfferInput[];
}

export interface GalaxyMarketAdjustment {
  readonly offerIndex: number;
  readonly buyResourceId: string;
  readonly sellResourceId: string;
  readonly expectedCurrent: number;
  readonly delta: number;
}

export interface GalaxyMarketDecision {
  readonly expectedMaximum: number;
  readonly adjustments: readonly GalaxyMarketAdjustment[];
}

/** Pure port of the legacy priority-group and weighted freighter allocator. */
export function planGalaxyMarket(
  input: Readonly<GalaxyMarketInput>,
): GalaxyMarketDecision | null {
  if (!input.initialized) return null;

  const priorityGroups = new Map<number, GalaxyMarketOfferInput[]>();
  const targets = new Map<string, number>();
  for (const offer of input.offers) {
    if (offer.weighting > 0) {
      const priority = offer.demanded
        ? Math.max(offer.priority, 100)
        : offer.priority;
      if (priority !== 0) {
        const group = priorityGroups.get(priority) ?? [];
        group.push(offer);
        priorityGroups.set(priority, group);
      }
    }
    // Legacy storage is keyed by the purchased resource rather than offer.
    targets.set(offer.buyResourceId, 0);
  }

  const priorityList = [...priorityGroups.entries()]
    .sort(([left], [right]) => right - left)
    .map(([, group]) => group);
  const supplementary = priorityGroups.get(-1);
  if (supplementary !== undefined && priorityList.length > 1) {
    const supplementaryIndex = priorityList.indexOf(supplementary);
    priorityList.splice(supplementaryIndex, 1);
    priorityList[0]?.push(...supplementary);
  }

  let remaining = input.maximum;
  for (
    let groupIndex = 0;
    groupIndex < priorityList.length && remaining > 0;
    groupIndex++
  ) {
    const offers = [...(priorityList[groupIndex] ?? [])].sort(
      (left, right) => left.weighting - right.weighting,
    );
    while (remaining > 0) {
      const beforeDistribution = remaining;
      const totalWeight = offers.reduce(
        (sum, offer) => sum + offer.weighting,
        0,
      );
      for (
        let index = offers.length - 1;
        index >= 0 && remaining > 0;
        index--
      ) {
        const offer = offers[index];
        if (offer === undefined) continue;
        const requested = Math.min(
          remaining,
          Math.max(
            1,
            Math.floor((beforeDistribution / totalWeight) * offer.weighting),
          ),
        );
        const assigned =
          offer.useful &&
          !offer.sellDemanded &&
          offer.sellStorageRatio >= input.minimumIngredientRatio
            ? requested
            : 0;
        if (assigned > 0) {
          remaining -= assigned;
          targets.set(
            offer.buyResourceId,
            (targets.get(offer.buyResourceId) ?? 0) + assigned,
          );
        }
        if (assigned < requested) offers.splice(index, 1);
      }
      if (beforeDistribution === remaining) break;
    }
  }

  return Object.freeze({
    expectedMaximum: input.maximum,
    adjustments: Object.freeze(
      input.offers.map((offer) =>
        Object.freeze({
          offerIndex: offer.index,
          buyResourceId: offer.buyResourceId,
          sellResourceId: offer.sellResourceId,
          expectedCurrent: offer.current,
          delta: (targets.get(offer.buyResourceId) ?? 0) - offer.current,
        }),
      ),
    ),
  });
}
