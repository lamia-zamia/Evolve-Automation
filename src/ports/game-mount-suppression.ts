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
 *
 * One kind of component has to be exempt. A panel whose sub-panels are its own component's render
 * — the civilization tab, whose `#city`, `#space` and the rest are `b-tab-item` output — gives the
 * game nothing to draw into unless that one component is really mounted. Suppressing it does not
 * make the draw cheap, it makes the draw produce nothing, silently. A scope therefore names the
 * components it needs built, and everything else in it is still suppressed: the parent renders, the
 * hundreds of action components it then holds do not.
 */

export interface MountSuppressionScope {
  /**
   * Called with each component selector the game binds inside the scope. It is the only handle on
   * the middle of a draw: the game creates a panel's containers and fills them in one synchronous
   * call, so a container the caller does not want filled can only be named once it exists.
   */
  readonly onComponentBound?: ((selector: string) => void) | undefined;
  /**
   * Whether this one component must be built for real. Answer `true` only for a component whose
   * *render* the draw depends on; a component that merely displays what the draw already wrote is
   * exactly what suppression exists to skip.
   *
   * A component allowed through is mounted with real Vue and is torn down again when the scope
   * ends, so nothing it created outlives the pass.
   */
  readonly shouldMount?: ((selector: string) => boolean) | undefined;
}

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
  withoutMounting<T>(draw: () => T, scope?: Readonly<MountSuppressionScope>): T;
  /**
   * Temporarily restores real Vue mounting inside a suppressed draw. The escaped apps are not
   * owned by the discovery scope; this is for game actions that intentionally create a separate
   * component tree, such as Buefy's programmatic modal service.
   */
  withMountingEnabled<T>(draw: () => T): T;
}
