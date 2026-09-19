/**
 * The one owner of the layered settings representation.
 *
 * The effective settings the tick reads are a thin object whose prototype is the raw persisted
 * record: its own properties are exactly the override decisions of the current pass, and every
 * other key resolves through inheritance. That is what makes an override pass cost microseconds
 * instead of copying roughly 3 700 keys, and it is why a layered object is a **lookup view** and
 * not a record.
 *
 * The consequence is sharp enough to state twice: spreading, `Object.keys`, `Object.entries`,
 * `Object.assign`, `JSON.stringify`, `structuredClone` and `hasOwnProperty` all see only the
 * overrides. A caller that genuinely needs a complete record calls `materializeSettings`; a caller
 * that only reads keys must keep using the layered object, because materializing is the expensive
 * operation the layering exists to avoid.
 */

/**
 * Points `layered` at `base` and drops the previous pass's own properties, leaving an object whose
 * own properties are exactly what the caller is about to decide.
 *
 * `base` is replaced outright by an import or a settings reset, so the prototype is re-pointed
 * whenever it no longer matches.
 */
export function layerSettingsOver(
  layered: Record<string, unknown>,
  base: Record<string, unknown>,
): void {
  // A caller that hands us the base object itself has nothing to layer over, and linking an object
  // to itself would throw.
  if (layered === base) return;
  if (Object.getPrototypeOf(layered) !== base) {
    Object.setPrototypeOf(layered, base);
  }
  for (const key of Object.keys(layered)) {
    delete layered[key];
  }
}

/**
 * A complete own-property snapshot of a layered settings object: every inherited key plus every
 * override, with the override winning.
 *
 * Only for callers that must enumerate or serialize the resolved record — an export, a diff, a
 * legacy surface that enumerates. Never in a hot path: it walks the whole prototype chain.
 */
export function materializeSettings(
  layered: Record<string, unknown>,
): Record<string, unknown> {
  const keys = new Set<string>();
  for (
    let level: object | null = layered;
    level !== null;
    level = Object.getPrototypeOf(level) as object | null
  ) {
    for (const key of Object.keys(level)) keys.add(key);
  }
  const materialized: Record<string, unknown> = {};
  for (const key of keys) materialized[key] = layered[key];
  return materialized;
}
