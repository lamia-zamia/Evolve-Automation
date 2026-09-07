/**
 * Making the game build a tab's controls without leaving the player on that tab.
 *
 * With Preload Tab Content off, the game only ever mounts the tab it is showing, so a control the
 * automation has never seen rendered has never been captured. This is the one sanctioned way to
 * change that: ask the game to draw a tab, let it bind its own components, and put the player's
 * view back. It is a discovery pass, not a rendering strategy — nothing here keeps a tab mounted,
 * and nothing sweeps every tab on a tick.
 */

import type { CommandExecutionOutcome } from "../domain/commands.ts";

/**
 * One level of the game's tab tree. A path of these names a panel: the main tab first, then the
 * sub-tab within it when that panel's contents are gated on one.
 */
export interface TabDiscoveryStep {
  /** The game setting recording which tab of this level is selected, e.g. `civTabs`. */
  readonly setting: string;
  /** The captured control whose `swapTab` draws it. */
  readonly control: string;
  readonly index: number;
}

export interface TabDiscoveryResult {
  readonly outcome: CommandExecutionOutcome;
  /** Control ids the pass made available that were not captured before it ran. */
  readonly discovered: readonly string[];
}

export interface GameTabDiscovery {
  /**
   * Draws the panel `path` names, then restores the tabs the player was on. Succeeds with no
   * discoveries when the game is already showing every tab.
   *
   * `whileDrawn` runs once with the panel mounted, which is the only moment its rendered detail —
   * costs, affordability classes, document order — is both present and freshly computed. It runs
   * inside the pass, so it must not wait, and throwing from it does not skip the restore.
   */
  discover(
    path: readonly Readonly<TabDiscoveryStep>[],
    whileDrawn?: () => void,
  ): TabDiscoveryResult;
}
