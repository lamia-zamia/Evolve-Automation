/**
 * Making the game build a tab's controls without leaving the player on that tab.
 *
 * When the game only mounts the tab it is showing, a control the
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

export interface TabDiscoveryOptions {
  /**
   * Runs once with the panel drawn, which is the only moment its rendered detail — ids, costs,
   * document order — is both present and freshly computed. It runs inside the pass, so it must not
   * wait, and throwing from it does not skip the restore.
   */
  readonly whileDrawn?: () => void;
  /**
   * Answers whether the panel this path names is drawn right now. It is consulted only when the
   * game is already showing that panel, to decide whether the pass can be skipped entirely; a path
   * the player is not on is always drawn.
   */
  readonly isPanelDrawn?: () => boolean;
  /**
   * Containers the draw fills that this pass never reads, so they can be dropped before the game
   * spends anything filling them. The game creates them partway through its own draw, so they are
   * named by the component whose binding is the first moment they exist.
   */
  readonly discard?: {
    /** The selector the game binds immediately before it fills the containers. */
    readonly afterBinding: string;
    /** Element ids inside the drawn panel. Anything outside it is refused. */
    readonly containers: readonly string[];
  };
}

export interface GameTabDiscovery {
  /**
   * Observes the panel `path` names, drawing it and restoring the tabs the player was on when it
   * is not the panel already in front of them.
   */
  discover(
    path: readonly Readonly<TabDiscoveryStep>[],
    options?: Readonly<TabDiscoveryOptions>,
  ): TabDiscoveryResult;
}
