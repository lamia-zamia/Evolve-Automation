/**
 * Reads the prices the game has just written onto its action elements.
 *
 * `setAction` renders an action as an outer `<div id="tech-mining" class="action">` wrapping an
 * `<a class="button is-dark res-Knowledge" data-Knowledge="6600">`: the id is on the wrapper and
 * the prices are on the button inside it, so the id comes from the matched element and the prices
 * from its whole subtree.
 *
 * The game writes each price twice, in the same loop — once as a `res-<Resource>` class and once
 * as a `data-<Resource>` attribute — and this reads both, because neither alone is enough:
 *
 * - **HTML attribute names are case-insensitive**, so `data-Knowledge` comes back as
 *   `data-knowledge` and `data-Helium_3` as `data-helium_3`. The underscore survives; the capitals
 *   do not, and the game's resource keys are capitalized.
 * - **Class names are case-sensitive**, so `res-Knowledge` still says `Knowledge`.
 *
 * So the resource names come from the classes and the amounts from the attribute of the matching
 * lower-cased name. Requiring both also excludes, structurally rather than by a name blacklist,
 * the two `data-` attributes in that subtree that are not prices: Vue's own `data-v-app` mount
 * marker, and the `data-req-<tech>` a prediction writes for an unmet requirement.
 *
 * The same pass reads the row's power switch. `setAction` appends a `span.on` and a `span.off`
 * directly to the wrapper for an action that has a switch, and for one that does not it appends
 * neither, so their presence is the game's own answer to a gate built entirely out of the
 * module-lexical definition. Unlike the prices these are element text, not attributes, and the
 * counts are read whole or not at all.
 */

import type {
  DrawnAction,
  DrawnActionState,
  GameDrawnActionsReader,
} from "../../ports/game-drawn-actions.ts";

/** The subset of a page element this adapter touches. */
interface DrawnElement {
  readonly id?: unknown;
  readonly textContent?: unknown;
  readonly attributes?: ArrayLike<{
    readonly name: string;
    readonly value: string;
  }>;
  querySelectorAll?(selector: string): ArrayLike<DrawnElement>;
}

interface DrawnActionsDocument {
  querySelectorAll(selector: string): ArrayLike<DrawnElement>;
}

export interface GameDrawnActionsDependencies {
  readonly getDocument: () => DrawnActionsDocument;
}

const DATA_PREFIX = "data-";

/** The class the game pairs with every price attribute, carrying the resource's real name. */
const RESOURCE_CLASS_PREFIX = "res-";

interface PriceMarkup {
  /** Resource names exactly as the game spells them, from the `res-` classes. */
  readonly names: Set<string>;
  /** Amounts by lower-cased resource name, from the `data-` attributes. */
  readonly amounts: Map<string, string>;
}

function collect(element: DrawnElement, markup: PriceMarkup): void {
  const attributes = element.attributes;
  if (attributes === undefined) return;
  for (let index = 0; index < attributes.length; index++) {
    const attribute = attributes[index];
    if (attribute === undefined) continue;
    const { name, value } = attribute;
    if (name === "class") {
      for (const token of value.split(/\s+/)) {
        if (token.startsWith(RESOURCE_CLASS_PREFIX)) {
          const resource = token.slice(RESOURCE_CLASS_PREFIX.length);
          if (resource.length > 0) markup.names.add(resource);
        }
      }
    } else if (name.startsWith(DATA_PREFIX)) {
      markup.amounts.set(name.slice(DATA_PREFIX.length), value);
    }
  }
}

/**
 * The row's power switch, when it drew one. `setAction` appends both spans directly to the
 * `.action` wrapper, so a child combinator reads this row's own pair and never a nested one, and
 * the pair is taken only whole: the game draws the two together and one alone would leave the
 * other operand reading a number that belongs to a different row.
 */
function readSwitchState(
  element: DrawnElement,
): Readonly<DrawnActionState> | undefined {
  const on = readSpanCount(element, ":scope > span.on");
  const off = readSpanCount(element, ":scope > span.off");
  if (on === undefined || off === undefined) return undefined;
  return Object.freeze({ on, off });
}

/**
 * One switch span's count. The game renders these with `v-html` of a bare number, except where a
 * holiday easter egg substitutes a string for a zero, so anything that is not a whole count above
 * or at zero leaves the state unread rather than coerced.
 */
function readSpanCount(
  element: DrawnElement,
  selector: string,
): number | undefined {
  let spans: ArrayLike<DrawnElement> | undefined;
  try {
    spans = element.querySelectorAll?.(selector);
  } catch {
    // A page whose element cannot answer a `:scope` selector reports no switch rather than
    // failing the whole panel read, which every other operand on this pass still depends on.
    return undefined;
  }
  if (spans === undefined || spans.length !== 1) return undefined;
  const text = spans[0]?.textContent;
  if (typeof text !== "string") return undefined;
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const count = Number(trimmed);
  return Number.isSafeInteger(count) ? count : undefined;
}

function readCost(element: DrawnElement): Record<string, number> {
  const markup: PriceMarkup = { names: new Set(), amounts: new Map() };
  collect(element, markup);
  const descendants = element.querySelectorAll?.("*");
  if (descendants !== undefined) {
    for (let index = 0; index < descendants.length; index++) {
      const descendant = descendants[index];
      if (descendant !== undefined) collect(descendant, markup);
    }
  }
  const cost: Record<string, number> = {};
  for (const resource of markup.names) {
    const raw = markup.amounts.get(resource.toLowerCase());
    if (raw === undefined) continue;
    const amount = Number(raw);
    // The game writes a price only when it is above zero, so anything else is not one.
    if (Number.isFinite(amount) && amount > 0) cost[resource] = amount;
  }
  return cost;
}

export function createGameDrawnActionsReader({
  getDocument,
}: GameDrawnActionsDependencies): GameDrawnActionsReader {
  return Object.freeze({
    read(selector: string): readonly Readonly<DrawnAction>[] {
      const elements = getDocument().querySelectorAll(selector);
      const actions: DrawnAction[] = [];
      for (let index = 0; index < elements.length; index++) {
        const element = elements[index];
        const id = element?.id;
        // An element the game drew without an id names nothing a caller could act on.
        if (
          element === undefined ||
          typeof id !== "string" ||
          id.length === 0
        ) {
          continue;
        }
        const state = readSwitchState(element);
        actions.push(
          Object.freeze({
            id,
            cost: Object.freeze(readCost(element)),
            ...(state === undefined ? {} : { state }),
          }),
        );
      }
      return Object.freeze(actions);
    },
    exists(selector: string): boolean {
      return getDocument().querySelectorAll(selector).length > 0;
    },
  });
}
