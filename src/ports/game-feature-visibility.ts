/**
 * Whether the game is currently offering one of its features.
 *
 * Several automation decisions gate on "has the game put this control on the
 * page yet" — the government panel before the first government can be chosen,
 * a foreign power's espionage options, an evolution action, a market row's
 * buy/sell orders. Callers above this port name the control they mean; how the
 * page withholds a feature is this port's business.
 */
export interface GameFeatureVisibilityPort {
  /**
   * True when an element matching `selector` exists and the page is showing it.
   * An absent element is not visible, so a caller never has to guard the read.
   */
  isVisible(selector: string): boolean;
}
