/**
 * One coarse value that changes whenever progression could have changed what a game panel offers.
 *
 * A tab-sampling pass costs a real `loadTab` draw, and the answer it brings back — the offered
 * technologies and their Knowledge prices, the A.R.P.A. projects and their per-percent costs —
 * does not move between progression events. This reader is what lets a cached sample decide
 * whether it is still current without paying for a draw to find out.
 *
 * The components are chosen from what the upstream draws actually read, verified against
 * `D:/work/Evolve-DeadSpace`: `checkTechPath` reads `race.truepath` / `race.iceage`,
 * `checkTechRequirements` reads `global.tech`, and `checkTechQualifications` reads `race`, `genes`,
 * `tech` and a per-tech `condition()` whose 103 bodies read `race`, `tech`, `stats`, `genes`,
 * `settings`, `civic` and a short tail of realm state. A.R.P.A. prices scale with
 * `global.arpa[id].rank`. Tech prices read only `race`, `city.ptrait` (fixed for a run), `civic`
 * and `tech` — no tech price moves with a resource amount or a building count, which is why none of
 * those appear here.
 *
 * It is deliberately coarse and deliberately incomplete. Coarse, because a false "changed" costs
 * one draw and a false "unchanged" costs correctness; the sums below move on any progression and
 * are cheap to take. Incomplete, because a few upstream conditions read genuinely volatile state
 * (`resource.Demonic_Essence.amount >= 1`, `interstellar.dyson_sphere.count >= 100`,
 * `eden.fortress.armory < 100`) and enumerating them here would be a list that rots against
 * upstream. The cache that consults this reader carries its own maximum age for exactly that
 * residue — see [docs/discovery-invalidation.md](../../../docs/discovery-invalidation.md).
 */

import type { GameRootStateSource } from "../../ports/game-root-state.ts";
import { isRecord, readProperty } from "../validation.ts";

/** A value that is equal across two reads exactly when no sampled panel's offers can have moved. */
export interface ProgressionEpochReader {
  read(): string;
  /** Releases the root-replacement subscription. */
  release(): void;
}

/** Key count and value sum of a game record, as one token. Absent reads as its own token. */
function tallyRecord(value: unknown): string {
  if (!isRecord(value)) return "-";
  const keys = Object.keys(value);
  let sum = 0;
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === "number" && Number.isFinite(entry)) sum += entry;
    else if (entry === true) sum += 1;
  }
  return `${keys.length}:${sum}`;
}

/** Key count alone, for a record whose values are not summable (traits carry strings). */
function countKeys(value: unknown): number {
  return isRecord(value) ? Object.keys(value).length : -1;
}

/** The sum of every A.R.P.A. rank, which is what the per-percent prices scale with. */
function tallyProjectRanks(value: unknown): number {
  if (!isRecord(value)) return -1;
  let sum = 0;
  for (const key of Object.keys(value)) {
    const rank = readProperty(value[key], "rank");
    if (typeof rank === "number" && Number.isFinite(rank)) sum += rank;
  }
  return sum;
}

/** A scalar rendered so `undefined`, `false` and `0` stay distinguishable from each other. */
function scalarToken(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : value === true
      ? "1"
      : value === false
        ? "0"
        : "-";
}

export function createProgressionEpochReader(
  rootState: GameRootStateSource,
): ProgressionEpochReader {
  // A prestige, a save load and a reactivity restore all arrive here, and any of them replaces
  // every offer on every panel. The reactive wrapper is cached by raw target, so the root may be
  // the same reference as before: the count is the event, not the identity.
  let rootReplacements = 0;
  const unsubscribe = rootState.subscribeRootReplaced(() => {
    rootReplacements += 1;
  });

  return Object.freeze({
    read(): string {
      const root = rootState.readRoot();
      if (root === undefined) return `${rootReplacements}|no-root`;
      const race = readProperty(root, "race");
      const stats = readProperty(root, "stats");
      const settings = readProperty(root, "settings");
      const civic = readProperty(root, "civic");
      return [
        rootReplacements,
        // The dominant gate on every tech and project offer. Monotone within a run, and it drops
        // on a reset, so the sum alone separates one run's progression from the next.
        tallyRecord(readProperty(root, "tech")),
        tallyRecord(readProperty(root, "genes")),
        // Trait values are not all numbers, so traits are counted rather than summed. A trait that
        // only changes rank keeps the same offers; one that appears or disappears does not.
        countKeys(race),
        scalarToken(readProperty(race, "species")),
        scalarToken(readProperty(race, "universe")),
        countKeys(readProperty(stats, "achieve")),
        scalarToken(readProperty(stats, "psykill")),
        // The script swaps the government form itself under autoGovernment, and a tech condition
        // reads it.
        scalarToken(readProperty(readProperty(civic, "govern"), "type")),
        scalarToken(readProperty(settings, "showCivic")),
        scalarToken(readProperty(settings, "showUnderground")),
        scalarToken(readProperty(settings, "showSurface")),
        tallyProjectRanks(readProperty(root, "arpa")),
      ].join("|");
    },
    release: unsubscribe,
  });
}
