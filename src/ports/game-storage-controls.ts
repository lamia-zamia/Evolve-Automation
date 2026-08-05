/**
 * The game's own storage panels.
 *
 * Storage is built on one shared panel that constructs crates and containers
 * and states how much each one holds, and one stack row per resource that
 * assigns the built units to that resource. Callers above this port name a
 * stack row by the element id the game gives it and name the resource the row
 * stores; how many component calls a count takes, which method performs them,
 * and where the panel states its capacities, is this port's business.
 */
export interface GameStorageStackRequest {
  /** The element the game gives this resource's stack row. */
  readonly elementId: string;

  /** The resource the row stores. */
  readonly id: string;

  /** How many units to move. Counts of zero or less move nothing. */
  readonly count: number;
}

export interface GameStorageControlsPort {
  /** Whether the game currently renders the shared construction panel. */
  isConstructionRendered(): boolean;

  /**
   * How much one crate holds, as the panel states it. Zero means the panel was
   * not offering the figure, which no caller can size an expansion against.
   */
  crateCapacity(): number;

  /** How much one container holds. Zero means the panel stated nothing. */
  containerCapacity(): number;

  /** Builds crates. False means the panel was not actionable. */
  constructCrates(count: number): boolean;

  /** Builds containers. False means the panel was not actionable. */
  constructContainers(count: number): boolean;

  /**
   * Whether the game currently renders a resource's stack row. The game only
   * mounts the rows of the storage tab on screen, so a caller that must move a
   * unit anyway asks this first and falls back to the game model itself.
   */
  isStackRendered(elementId: string): boolean;

  /** Gives a resource more crates. False means the row was not actionable. */
  assignCrates(request: GameStorageStackRequest): boolean;

  /** Takes crates back from a resource. False means the row was not actionable. */
  unassignCrates(request: GameStorageStackRequest): boolean;

  /** Gives a resource more containers. False means the row was not actionable. */
  assignContainers(request: GameStorageStackRequest): boolean;

  /**
   * Takes containers back from a resource. False means the row was not
   * actionable.
   */
  unassignContainers(request: GameStorageStackRequest): boolean;
}
