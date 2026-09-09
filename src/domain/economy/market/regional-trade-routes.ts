/** Pure planner for DeadSpace's per-supply-pool black-market routes. */

export interface RegionalTradeResourceInput {
  readonly resourceId: string;
  readonly pool: string;
  readonly rateOfChange: number;
  readonly currentRoutes: number;
  readonly volume: number;
  readonly priority: number;
}

export interface RegionalTradeRoutesInput {
  readonly resources: readonly Readonly<RegionalTradeResourceInput>[];
  readonly maximumRoutes: number;
  readonly money: number;
  readonly reserve: number;
  readonly margin: number;
}

export type RegionalTradeOperation = {
  readonly kind: "add" | "remove";
  readonly resourceId: string;
  readonly pool: string;
  readonly count: number;
};

export interface RegionalTradeRoutesResult {
  readonly operations: readonly Readonly<RegionalTradeOperation>[];
}

interface Deficit {
  readonly resourceId: string;
  readonly pool: string;
  readonly shortfall: number;
  readonly priority: number;
  readonly want: number;
}

interface Spare {
  readonly resourceId: string;
  readonly pool: string;
  readonly priority: number;
  routes: number;
}

/**
 * Match the upstream governor's regional trader pass: fill pool shortages, reclaiming only
 * lower-priority surplus routes, while preserving the configured money reserve.
 */
export function planRegionalTradeRoutes(
  input: Readonly<RegionalTradeRoutesInput>,
): RegionalTradeRoutesResult {
  const deficits: Deficit[] = [];
  const spare: Spare[] = [];
  const operations: RegionalTradeOperation[] = [];
  let used = 0;

  for (const resource of input.resources) {
    if (resource.currentRoutes < 0 || resource.volume <= 0) continue;
    used += resource.currentRoutes;
    if (resource.rateOfChange < 0) {
      deficits.push({
        resourceId: resource.resourceId,
        pool: resource.pool,
        shortfall: -resource.rateOfChange,
        priority: resource.priority,
        want: Math.ceil(
          (-resource.rateOfChange + input.margin) / resource.volume,
        ),
      });
    } else if (
      resource.currentRoutes > 0 &&
      resource.rateOfChange - resource.currentRoutes * resource.volume >=
        input.margin
    ) {
      spare.push({
        resourceId: resource.resourceId,
        pool: resource.pool,
        priority: resource.priority,
        routes: resource.currentRoutes,
      });
    }
  }

  deficits.sort(
    (left, right) =>
      left.priority - right.priority || right.shortfall - left.shortfall,
  );
  spare.sort((left, right) => right.priority - left.priority);

  for (const deficit of deficits) {
    if (input.money <= input.reserve) break;
    const free = () => input.maximumRoutes - used;
    const needed = Math.min(deficit.want, Math.max(0, input.maximumRoutes));
    if (free() < needed) {
      for (const candidate of spare) {
        if (free() >= needed) break;
        if (
          candidate.routes <= 0 ||
          (candidate.pool === deficit.pool &&
            candidate.resourceId === deficit.resourceId)
        ) {
          continue;
        }
        const count = Math.min(candidate.routes, needed - free());
        if (count <= 0) continue;
        candidate.routes -= count;
        used -= count;
        operations.push({
          kind: "remove",
          resourceId: candidate.resourceId,
          pool: candidate.pool,
          count,
        });
      }
    }
    const count = Math.min(needed, Math.max(0, free()));
    if (count <= 0) continue;
    used += count;
    operations.push({
      kind: "add",
      resourceId: deficit.resourceId,
      pool: deficit.pool,
      count,
    });
  }

  return Object.freeze({
    operations: Object.freeze(
      operations.map((operation) => Object.freeze(operation)),
    ),
  });
}
