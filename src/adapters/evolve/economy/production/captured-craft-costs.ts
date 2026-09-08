/**
 * Per-craft material costs, read back from the game's own cost renderer.
 *
 * DeadSpace keeps `craftCost()` module-private and published it only through the removed debug
 * bridge, so the costs are read from the captured `res<Resource>` row's own
 * `craftCost(resourceId, volume)` method. That method renders one `<div>{name} {amount}</div>` per
 * material, where the amount already carries the game's wasteful/high_pop/refinery adjustments and
 * the same `keyMultiplier()` factor the row's `craft(resourceId, volume)` applies to the volume it
 * crafts. A budget computed from these amounts is therefore exact for the volume actually crafted,
 * whatever the multiplier is, as long as it does not change between the two calls.
 *
 * The renderer prints the localized `global.resource[id].name`, so names are resolved back to ids
 * through the live root. The game deliberately gives its `Useless` challenge resource the name of a
 * hidden resource, so a name that matches more than one id is resolved to the displayed one, and an
 * unresolvable or duplicated material rejects the whole recipe rather than guessing.
 */

import type { GameControlRegistry } from "../../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../../ports/game-root-state.ts";
import { isRecord, readProperty } from "../../../validation.ts";

/** The game's resource rows are bound to `#res<Resource>`. */
export const CRAFT_ROW_PREFIX = "res";

const COST_ENTRY = /<div>([^<]*)<\/div>/g;

export interface CapturedCraftCostsDependencies {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
}

export interface CapturedCraftCosts {
  /**
   * Material cost per crafted volume unit, or `undefined` when the game did not report a recipe
   * this adapter can read.
   */
  read(resourceId: string): ReadonlyMap<string, number> | undefined;
}

function resolveResourceId(root: unknown, name: string): string | undefined {
  const resources = readProperty(root, "resource");
  if (!isRecord(resources)) return undefined;
  let match: string | undefined;
  let ambiguous = false;
  let displayed: string | undefined;
  let displayedAmbiguous = false;
  for (const id of Object.keys(resources)) {
    const resource = resources[id];
    if (readProperty(resource, "name") !== name) continue;
    if (match === undefined) match = id;
    else ambiguous = true;
    if (readProperty(resource, "display") === true) {
      if (displayed === undefined) displayed = id;
      else displayedAmbiguous = true;
    }
  }
  if (displayed !== undefined)
    return displayedAmbiguous ? undefined : displayed;
  return ambiguous ? undefined : match;
}

export function createCapturedCraftCosts({
  rootState,
  controls,
}: CapturedCraftCostsDependencies): CapturedCraftCosts {
  return Object.freeze({
    read(resourceId: string): ReadonlyMap<string, number> | undefined {
      const handle = controls.resolve(`${CRAFT_ROW_PREFIX}${resourceId}`);
      if (handle === undefined) return undefined;
      const result = controls.invoke(handle, "craftCost", [resourceId, 1]);
      if (!result.ok || typeof result.value !== "string") return undefined;

      const root = rootState.readRoot();
      const costs = new Map<string, number>();
      for (const entry of result.value.matchAll(COST_ENTRY)) {
        const text = entry[1] ?? "";
        const separator = text.lastIndexOf(" ");
        if (separator <= 0) return undefined;
        const amount = Number(text.slice(separator + 1));
        if (!Number.isFinite(amount) || amount <= 0) return undefined;
        const id = resolveResourceId(root, text.slice(0, separator));
        if (id === undefined || costs.has(id)) return undefined;
        costs.set(id, amount);
      }
      return costs.size > 0 ? costs : undefined;
    },
  });
}
