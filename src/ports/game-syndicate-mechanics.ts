/**
 * The running game's own Truepath Syndicate result for one region.
 *
 * `syndicate(region, true)` is private to the shipped bundle and has no read-only display of its
 * remaining-defense ratio, so this is the narrow answer Outer Fleet is allowed to ask for. Both
 * numbers are the game's own arithmetic: nothing here restates the divisor, the patrol scaling, the
 * sensor compression, the ground defenses, the rival hostility or the regional caps.
 */
import type { CapturedGameRead } from "./captured-game-mechanics.ts";

export interface GameSyndicateSample {
  /**
   * The game's `p`: the remaining Syndicate defense ratio, `1 - +(piracy / divisor).toFixed(4)`.
   * At most 1 — piracy is never negative — and far below 1 for a well-defended region.
   */
  readonly p: number;
  /**
   * The game's `s`: the effective sensor reading the region sees its pirates through, before the
   * scan display's own percentage formatting.
   */
  readonly s: number;
}

export interface GameSyndicateMechanics {
  /**
   * One region's current result, or a non-value answer when the running game's own mechanics could
   * not be reached for it. A caller must fail closed on anything but `value`: there is no defensible
   * substitute, because an unanswered ratio and a defended region are opposite answers.
   */
  read(region: string): CapturedGameRead<GameSyndicateSample>;
}
