/**
 * Banana Republic objective progress over the captured root.
 *
 * The facts are the ones `src/achieve.js` writes and reads for the banana feat: the five objective
 * flags under `global.stats.banana`, each keyed by the universe affix; the `global.stats.feat.banana`
 * star, which retires the smoothie objective outright; and the per-resource `trade` route counts the
 * smoothie objective is measured from. The decision itself stays in the pure policy in
 * `domain/civic/banana-republic.ts`.
 *
 * An absent affix key is `false`, not a malformed state: `achieve.js` tests
 * `global.stats.banana[b][affix]` for truthiness and writes the key only on completion, so demanding
 * one here would reject a run the game is perfectly happy to describe.
 */

import {
  BANANA_OBJECTIVE_IDS,
  type BananaObjectiveId,
  type BananaRepublicProgress,
} from "../../../domain/civic/banana-republic.ts";
import { readCapturedUniverseAffix } from "../captured-achievements.ts";
import { finiteNonNegative, isRecord, readProperty } from "../../validation.ts";

/**
 * `undefined` when the capture cannot describe the run — never a guess. The caller fails closed on
 * it, because the unification fork it gates is one-way.
 */
export function readCapturedBananaProgress(
  root: unknown,
): Readonly<BananaRepublicProgress> | undefined {
  const affix = readCapturedUniverseAffix(root);
  const stats = readProperty(root, "stats");
  const banana = readProperty(stats, "banana");
  if (!isRecord(banana)) return undefined;

  const objectives = {} as Record<BananaObjectiveId, boolean>;
  for (const objective of BANANA_OBJECTIVE_IDS) {
    const entry = readProperty(banana, objective);
    if (!isRecord(entry)) return undefined;
    objectives[objective] = readProperty(entry, affix) === true;
  }

  // The feat star is absent until the feat is earned once; that is zero, not malformed.
  const rawStar = readProperty(readProperty(stats, "feat"), "banana");
  const featStar = rawStar === undefined ? 0 : finiteNonNegative(rawStar);
  if (featStar === undefined) return undefined;

  const resources = readProperty(root, "resource");
  if (!isRecord(resources)) return undefined;
  const tradeRoutes: number[] = [];
  for (const id of Object.keys(resources)) {
    const resource = readProperty(resources, id);
    if (!isRecord(resource)) return undefined;
    if (!Object.hasOwn(resource, "trade")) continue;
    const trade = readProperty(resource, "trade");
    if (typeof trade !== "number" || !Number.isFinite(trade)) return undefined;
    tradeRoutes.push(trade);
  }

  return Object.freeze({
    objectives: Object.freeze(objectives),
    smoothie: Object.freeze({
      featStar,
      tradeRoutes: Object.freeze(tradeRoutes),
    }),
  });
}
