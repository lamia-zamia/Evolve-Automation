/**
 * The game's own action controls: the buttons that build a structure, run a
 * mission, or switch powered instances on and off.
 *
 * Automation asks whether the game offers a control, runs it, and moves powered
 * instances between on and off. Callers above this port name a control by the
 * element id the game gives it. Which component call performs an action, how
 * many calls a count takes, and how the game's tooltip is kept from being
 * rewritten by a click are this port's business.
 *
 * The star dock's part controls exist only while its modal is open, so a caller
 * captures them while they are rendered and runs them afterwards.
 */
export interface GameActionPowerRequest {
  /** The element the game gives this action's control. */
  readonly elementId: string;

  /** How many instances to switch. Counts of zero or less switch none. */
  readonly count: number;
}

export interface GameActionControlsPort {
  /** Whether the game currently renders this action's control. */
  isRendered(elementId: string): boolean;

  /**
   * Runs the action once, preferring a captured control over a rendered one.
   * False means the control was not actionable.
   */
  activate(elementId: string): boolean;

  /** Whether an action tooltip is on screen. */
  isTooltipShown(): boolean;

  /** Switches instances on. False means the control was not actionable. */
  powerOn(request: GameActionPowerRequest): boolean;

  /** Switches instances off. False means the control was not actionable. */
  powerOff(request: GameActionPowerRequest): boolean;

  /**
   * Keeps hold of a control that exists only while its modal is open, so later
   * calls can still run it. False means there was nothing to capture.
   */
  capture(elementId: string): boolean;

  /** Whether a captured control is being held for this element. */
  isCaptured(elementId: string): boolean;
}
