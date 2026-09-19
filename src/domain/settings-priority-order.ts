/**
 * The priority-ordering mechanics every ordered settings table shares.
 *
 * Market resources, storage resources, A.R.P.A. projects, buildings and smelter fuels all store
 * their order as one number per entity under a section-specific key, and all three operations —
 * sort by it, rewrite it from the catalog, rewrite it from a drag — were written out five times.
 * The key naming stays with each section; only the mechanics live here.
 */

/** A stored priority is honoured only when it is a finite number; otherwise catalog order wins. */
function storedPriority(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Catalog order, reordered by stored priority. The sort is stable in both directions: entries
 * with no usable priority keep their catalog position, and ties break on it too.
 */
export function sortByStoredPriority<TEntry>(
  entries: readonly TEntry[],
  raw: Readonly<Record<string, unknown>>,
  prioritySettingName: (entry: TEntry) => string,
): readonly TEntry[] {
  return Object.freeze(
    entries
      .map((entry, index) => ({
        entry,
        index,
        priority: storedPriority(raw[prioritySettingName(entry)], index),
      }))
      .sort(
        (left, right) =>
          left.priority - right.priority || left.index - right.index,
      )
      .map(({ entry }) => entry),
  );
}

/** "Reset priorities": the catalog's own order becomes 0..n-1. */
export function writeDefaultPriorityOrder(
  raw: Record<string, unknown>,
  ids: readonly string[],
  prioritySettingName: (id: string) => string,
): void {
  ids.forEach((id, index) => {
    raw[prioritySettingName(id)] = index;
  });
}

/**
 * A drag's requested order becomes 0..n-1. Ids the catalog does not know are ignored rather than
 * written, so a stale row in the DOM cannot create a priority key for an entity that is gone.
 */
export function writeExplicitPriorityOrder(
  raw: Record<string, unknown>,
  requestedIds: readonly string[],
  knownIds: Iterable<string>,
  prioritySettingName: (id: string) => string,
): void {
  const known = knownIds instanceof Set ? knownIds : new Set(knownIds);
  requestedIds.forEach((id, index) => {
    if (known.has(id)) raw[prioritySettingName(id)] = index;
  });
}
