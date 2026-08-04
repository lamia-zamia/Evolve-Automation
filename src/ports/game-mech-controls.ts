/**
 * The game's own mech assembly panel.
 *
 * A single panel (`mechAssembly`) configures and then constructs a mech from a
 * size, a chassis, one weapon per hardpoint, one equip per slot, and an
 * infernal flag, then builds it. The caller above this port describes the
 * completed mech in stable terms and never names the Vue methods that step the
 * panel; how the panel is configured, and that `build` must complete the
 * sequence, is this port's business.
 */
export interface GameMechAssemblyRequest {
  /** The element id the game gives the assembly panel. */
  readonly elementId: string;

  /** The size class of the mech. */
  readonly size: string;

  /** The chassis type of the mech. */
  readonly chassis: string;

  /** One weapon id per hardpoint slot, in slot order. */
  readonly hardpoints: readonly string[];

  /** One equip id per equip slot, in slot order. */
  readonly equips: readonly string[];

  /** Whether the assembled mech uses infernal materials. */
  readonly infernal: boolean;
}

export interface GameMechControlsPort {
  /** Whether the game currently renders the assembly panel. */
  isRendered(elementId: string): boolean;

  /**
   * Configures and builds the mech on the assembly panel. False means the
   * panel was not actionable.
   */
  assembleMech(request: GameMechAssemblyRequest): boolean;
}
