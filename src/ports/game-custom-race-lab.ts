/**
 * The game's own custom-race lab.
 *
 * A custom race is designed in the lab the ascension prestige opens, and the
 * lab is the only place the design exists before it is created. Callers above
 * this port decide what design they want and whether it is legal; how the lab
 * holds a design, and whether the lab is open at all, is this port's business.
 */
export interface CustomRaceLabDesign {
  /** The identity fields, already trimmed to what the caller wants stored. */
  readonly text: Readonly<Record<string, string>>;
  readonly genus: string;
  readonly traits: readonly string[];
  /** Rank per selected trait; traits absent from the map keep no rank. */
  readonly ranks: Readonly<Record<string, number>>;
  /** The trait Fanaticism is aimed at, or false when it is unused. */
  readonly fanaticism: unknown;
}

export interface GameCustomRaceLabPort {
  /**
   * The genus the open lab currently holds. Null means no lab is open, so
   * nothing can be designed.
   */
  currentGenus(): string | null;

  /** Whether the open lab offers a trait for selection. */
  offersTrait(traitId: string): boolean;

  /**
   * Writes a design into the open lab and lets it recost the design. Answers
   * the genes left over, which is negative when the design overspends the
   * budget, or null when there was no lab to write to.
   */
  applyDesign(design: CustomRaceLabDesign): number | null;
}
