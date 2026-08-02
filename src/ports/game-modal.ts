/**
 * The game's modal windows, as far as automation needs them.
 *
 * The page shows at most one modal at a time. A control opens one, the modal
 * renders a title that identifies it, and the script acts inside it and closes
 * it again. Callers above this port know which control opens the window they
 * want and what it is called; they do not know how a modal is mounted, hidden,
 * or detected.
 */

/** Everything needed to open one modal window and act inside it. */
export interface GameModalRequest {
  /** Selector of the control that opens the modal when clicked. */
  readonly triggerSelector: string;
  /** Title the modal must report before `action` runs. */
  readonly title: string;
  /** Runs once inside the requested modal. The modal is closed afterwards. */
  readonly action: () => void;
}

/** A modal element the page has mounted. */
export interface GameModalElement {
  style: { display: string };
}

/** The single read a decision makes when an open modal would interfere with it. */
export interface GameModalStateReader {
  /** True while a modal is open, whether the player or the script opened it. */
  isOpen(): boolean;
}

export interface GameModalPort extends GameModalStateReader {
  /** True when `triggerSelector` matches a control that is present and not disabled. */
  canOpen(triggerSelector: string): boolean;
  /**
   * Open the requested modal. Does nothing when a modal is already open or the
   * trigger control is absent.
   */
  open(request: GameModalRequest): void;
  /** True while the script is waiting for a modal it opened to render its content. */
  isAwaitingScriptModal(): boolean;
  /**
   * Take ownership of a modal the script opened: hide it from the player and run
   * the pending action once its content identifies the requested window.
   */
  captureScriptModal(element: GameModalElement): void;
}
