/**
 * One blueprint, written the way the yard writes it.
 *
 * Upstream `shipPlans.setVal(type, part)` is not a plain assignment: for a class change it also
 * rewrites whatever that hull forces — a freighter loses its weapon and takes `extra_fuel`, an
 * explorer takes the emdrive and railgun and, at the right technology levels, neutronium, quantum and
 * elerium, a supply ship has no mount at all, and leaving a class that cannot carry the current
 * `special` gives it the class default. So the *order* in which a design's parts are applied decides
 * what the yard ends up holding, and a design priced in one order and built in another is priced for
 * a ship nobody is going to build.
 *
 * The order is therefore stated once here, from the blueprint's own key order, and both the real
 * build and the read-only price probe walk it. Neither of them decides anything about class: that
 * normalization belongs to the game and happens inside its own `setVal`.
 */

/** One part the yard is asked to select, as the caller will hand it to `shipPlans.setVal`. */
export interface OuterFleetBlueprintWrite {
  readonly type: string;
  readonly part: string;
}

/**
 * The blueprint fields the yard is configured from, in the blueprint's own key order.
 *
 * The ship's name is not a part, and a field the blueprint does not carry as a string — a fleet id, a
 * hull number — is not a part either, so both are left alone. Everything else is a part the yard
 * offers, whatever this module or its caller thinks of it.
 */
export function outerFleetBlueprintWrites(
  blueprint: Readonly<Record<PropertyKey, unknown>>,
): readonly OuterFleetBlueprintWrite[] {
  const writes: OuterFleetBlueprintWrite[] = [];
  for (const [type, part] of Object.entries(blueprint)) {
    if (type === "name" || typeof part !== "string") continue;
    writes.push(Object.freeze({ type, part }));
  }
  return Object.freeze(writes);
}
