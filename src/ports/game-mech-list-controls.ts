/**
 * The game's own mech list.
 *
 * A single panel (`mechList`) lists the built mechs. It scraps one mech by
 * id through its `scrap` method and reorders them by driving the Sortable
 * reorder handler the game mounts on the list's element. The caller above
 * this port describes the scrap and the target ordering in stable terms and
 * never names the Vue method, the list element, or the Sortable instance;
 * how the panel is addressed is this port's business.
 */
export interface GameMechScrapRequest {
  /** The element id the game gives the mech list. */
  readonly elementId: string;

  /** The id of the mech to scrap, as the mech bay numbers its mechs. */
  readonly mechId: number;
}

export interface GameMechDragRequest {
  /** The element id the game gives the mech list. */
  readonly elementId: string;

  /** The list index the mech is dragged from. */
  readonly oldIndex: number;

  /** The list index the mech is dragged to. */
  readonly newIndex: number;
}

export interface GameMechListControlsPort {
  /** Whether the game currently renders the mech list. */
  isRendered(elementId: string): boolean;

  /**
   * Scraps a mech on the list. False means the list panel was not
   * actionable.
   */
  scrapMech(request: GameMechScrapRequest): boolean;

  /**
   * Reorders a mech within the list. False means the list panel or its
   * Sortable handler was not actionable.
   */
  dragMech(request: GameMechDragRequest): boolean;
}
