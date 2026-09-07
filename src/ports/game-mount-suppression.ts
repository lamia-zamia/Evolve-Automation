/**
 * Letting the game draw a panel without paying for the Vue tree behind it.
 *
 * A discovery draw exists to make the game evaluate its own offer rules and write its own markup.
 * Both happen before the game binds a component: `setAction` has already run the qualification
 * predicates, called `adjustCosts`, and written the id and price markup by the time it calls
 * `vBind`, and `vBind` in turn only needs the object it gets back from `Vue.createApp` to answer
 * `use`, `mount` and `unmount`. Compiling and mounting that component is therefore cost the
 * discovery never reads.
 *
 * Inside a scope the game's components are still recorded — the selector and the game-owned method
 * closures are taken from the options, not from the mounted instance — so controls discovered this
 * way stay callable after the temporary markup is gone.
 *
 * The scope is deliberately small: the player's own view is rebuilt with real Vue, outside it.
 */

export interface GameMountSuppression {
  /**
   * False when nothing can be suppressed — no Vue was ever hooked, or the capture has been
   * uninstalled. A caller must reject rather than fall back to a full render on the normal tick.
   */
  readonly available: boolean;
  /**
   * Runs `draw` with temporary component mounting suppressed, and restores real mounting before
   * returning, including when `draw` throws. Scopes nest; mounting resumes when the outermost one
   * ends. Throws when `available` is false.
   */
  withoutMounting<T>(draw: () => T): T;
}
