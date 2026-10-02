/**
 * The parts the Dwarf Shipyard's own option markup offers.
 *
 * Upstream `ships.js:shipParts` is a per-dimension ordered list, and `truepath.js:drawShipYard()`
 * emits one option element per entry, in that order, each carrying the entry's position as its own
 * option index. That index is not decoration: `drawShipYard()` binds `avail(type, index, value)` and
 * upstream's `shipPartAvailable(part, idx, value, shipClass)` reads it as the unlock level being
 * tested — for several dimensions the index alone decides the answer — so a part's identity and its
 * index have to come from the same place the game emits them, together.
 *
 * This is the shape of that one place. Nothing here says which hulls, components, counts or indices
 * exist; the capture reads them out of markup the game produced, and a caller that needs a part's
 * index asks for the part.
 */
import type { GameControlHandle } from "./game-control-registry.ts";
export interface GameShipyardPart {
  /** The blueprint dimension the yard offers this option under. */
  readonly type: string;
  /** The part the option selects. */
  readonly value: string;
  /** The position `drawShipYard()` emitted the option at, and the one `avail()` is called with. */
  readonly index: number;
}

export interface GameShipyardPartCatalog {
  /**
   * Every dimension the yard's markup offered, in the markup's own first-appearance order. That is
   * `Object.keys(shipParts)` upstream, so the hull dimension still comes first — which is what makes
   * a blueprint built from these dimensions write its class change before the fields that change
   * rewrites.
   */
  readonly types: readonly string[];
  /** Every option the markup carried, in the markup's own order. */
  readonly parts: readonly GameShipyardPart[];
  /** The catalogued option for one part, or `undefined` when the yard never offered it. */
  optionFor(type: string, value: string): GameShipyardPart | undefined;
}

export interface GameShipyardPartCatalogSource {
  /**
   * The yard's catalog, or `undefined` while it cannot be read. Absence is not an empty catalogue:
   * a dimension with no options is a different thing from a yard whose options could not be read,
   * and only the first of those answers a question about what the yard offers.
   */
  catalog(): GameShipyardPartCatalog | undefined;
}

/**
 * What a yard draw offers this catalogue while its own host is still standing.
 *
 * Declared here rather than beside either adapter so that the shipyard, which renders the markup, and
 * the catalogue capture, which reads it, can be wired together without either importing the other's
 * module. Upstream emits every `shipParts` entry into `#shipPlans`, so that markup is the yard's
 * catalogue and exists only for the length of the draw that produced it.
 */
export interface GameShipyardPartCatalogSink {
  /**
   * Reads the `#shipPlans` a draw just produced. False when the markup could not be read, which is a
   * fault in the reading rather than in the yard.
   */
  captureFrom(element: unknown): boolean;
}

/**
 * The Dwarf Shipyard's establishment, as far as reading its catalogue is concerned: is there a yard to
 * ask, and can it draw one more time for a save whose options are no longer on the page.
 */
export interface GameShipyardCatalogYard {
  control(): GameControlHandle | undefined;
  established(control: GameControlHandle | undefined): boolean;
  establish(): GameControlHandle | undefined;
}
