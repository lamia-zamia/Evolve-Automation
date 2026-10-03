/**
 * The Dwarf Shipyard's own part catalogue, read out of the option markup `drawShipYard()` produced.
 *
 * Upstream keeps the catalogue in one place, `ships.js:shipParts`: a per-dimension ordered list of
 * hulls, power plants, mounts, armour, engines, sensors and specials. `truepath.js:drawShipYard()`
 * emits one option per entry, in that order, as
 * `<b-dropdown-item class="${type} a${idx}" data-val="${value}" v-show="avail('${type}','${idx}','${value}')">`,
 * and binds `avail` straight to `ships.js:shipPartAvailable(part, idx, value, shipClass)`. The index
 * is therefore part of a part's identity and not a position this script may recompute: for most
 * dimensions `shipPartAvailable` compares `global.tech['syard_<part>'] > idx`, and on a few branches
 * the index alone is the whole answer. Guessing one — or searching for an index that happens to
 * answer `true` — would be a different question from the one the yard asks, so nothing here infers
 * an index at all: the number in the class attribute the game wrote is the number `avail()` gets.
 *
 * `setVal(type, value)` is deliberately *not* a route to the same knowledge. Upstream's `setVal` has
 * no availability gate, so calling it for a part the player has not unlocked still writes the
 * blueprint; a successful call proves the control was actionable, never that the yard offered the
 * part.
 *
 * **Three routes, one answer.** Preload mode and a yard the player is looking at both leave the real
 * `#shipPlans` in the document, and that markup is read passively — no draw, no panel, nothing
 * borrowed. A yard established from scratch produces the same markup inside its own hidden host, and
 * `CapturedOuterFleetShipyard.establish()` hands it here on the way out rather than the script
 * paying for a second draw to learn what the first one already rendered. And a yard the player
 * visited and then left keeps its captured `shipPlans` control but has no markup left to read, so
 * exactly one protected scratch draw runs through that same establishment machinery.
 * Scratch markup is parsed while its host exists, then cached only after the yard proves the whole
 * draw and restoration succeeded. A failed pass leaves no copied catalogue behind.
 *
 * A proven catalogue is cached for the page: `shipParts` is module-level game data, not save state,
 * so the only way it changes is a reload. Markup that cannot be read is refused rather than
 * guessed at — a duplicate value or index, an option with no `data-val`, an index that is not the
 * dimension's own next one, or two index tokens on one element each mean this script would be
 * answering about a different yard than the game's. Refusal is `undefined` and nothing else: no
 * catalogue with no dimensions in it is ever built, because an empty dimension list would answer
 * every downstream question by comparing nothing at all.
 */
import type {
  GameShipyardPart,
  GameShipyardPartCatalog,
  GameShipyardPartCatalogCandidate,
  GameShipyardPartCatalogSink,
  GameShipyardPartCatalogSource,
  GameShipyardPartDimensions,
  GameShipyardCatalogYard,
} from "../../../ports/game-shipyard-parts.ts";
import {
  CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
  CAPTURED_OUTER_FLEET_SHIPYARD_PANEL_ID,
  renderedElementInside,
} from "./captured-outer-fleet-shipyard.ts";
import { isRecord } from "../../validation.ts";

/**
 * The option index `drawShipYard()` writes into every option's class, as `a${idx}`. The dimension is
 * the class token immediately before it, which is the only place the pair survives: once Vue has
 * rendered the `b-dropdown-item` components, the element's own `dropdown-item` classes are merged in
 * ahead of the inherited ones, and a `v-show` binding leaves nothing of its own behind.
 */
const SHIPYARD_PART_INDEX_PATTERN = /^a(\d+)$/;

/** A blueprint dimension as `shipParts` names its key: an identifier, never a class list. */
const SHIPYARD_PART_TYPE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The attribute `drawShipYard()` gives each option's part. */
const SHIPYARD_PART_VALUE_ATTRIBUTE = "data-val";

/** No element here claims to be a part option. */
const NOT_A_PART_OPTION = -1;

/** An element claims two option indices at once, so its own class list cannot be read. */
const AMBIGUOUS_PART_OPTION = -2;

/** The slice of a rendered element this parser reads, and nothing else. */
interface ShipyardPartNode {
  getAttribute(name: string): string | null;
  querySelectorAll(selector: string): ArrayLike<ShipyardPartNode>;
}

/** One option as the yard emitted it: the dimension, the part, and the position it was emitted at. */
interface ShipyardPartOption {
  readonly type: string;
  readonly value: string;
  readonly index: number;
}

function shipyardPartNode(value: unknown): ShipyardPartNode | undefined {
  return isRecord(value) &&
    typeof value["getAttribute"] === "function" &&
    typeof value["querySelectorAll"] === "function"
    ? (value as unknown as ShipyardPartNode)
    : undefined;
}

function shipyardPartClassTokens(node: ShipyardPartNode): readonly string[] {
  const value = node.getAttribute("class");
  return value === null
    ? []
    : value.split(/\s+/).filter((token) => token !== "");
}

/**
 * Where in the class list this element's option index sits, or why there is not one to read.
 *
 * The index is one token of a class the game composed with its own, so a rendered option carries
 * several tokens and only one of them is the index. Two of them is not a shape the yard emits, and
 * the caller refuses the whole catalogue rather than pick one.
 */
function shipyardPartIndexPosition(tokens: readonly string[]): number {
  let position = NOT_A_PART_OPTION;
  for (let index = 0; index < tokens.length; index += 1) {
    if (!SHIPYARD_PART_INDEX_PATTERN.test(tokens[index] ?? "")) continue;
    if (position !== NOT_A_PART_OPTION) return AMBIGUOUS_PART_OPTION;
    position = index;
  }
  return position;
}

/**
 * The option one element carries, or `undefined` for an element that carries none — including one
 * that claims an option index and cannot be read as one.
 *
 * An element that carries an option index is read as an option whether or not the rest of it is
 * there, so a malformed one refuses the catalogue rather than disappearing from it: the yard either
 * emitted this option or it did not, and quietly dropping it would answer a question about a yard
 * with fewer parts than the game's.
 */
function readShipyardPartOption(
  node: ShipyardPartNode,
  tokens: readonly string[],
  position: number,
): ShipyardPartOption | undefined {
  if (position === AMBIGUOUS_PART_OPTION || position === 0) return undefined;
  const type = tokens[position - 1] ?? "";
  const part = node.getAttribute(SHIPYARD_PART_VALUE_ATTRIBUTE);
  const index = Number(
    SHIPYARD_PART_INDEX_PATTERN.exec(tokens[position] ?? "")?.[1] ?? "",
  );
  if (
    !SHIPYARD_PART_TYPE_PATTERN.test(type) ||
    part === null ||
    part === "" ||
    /\s/.test(part) ||
    !Number.isSafeInteger(index)
  ) {
    return undefined;
  }
  return Object.freeze({ type, value: part, index });
}

/**
 * Every option the markup carried, and whether each of them could be read.
 *
 * A markup this cannot account for is refused whole rather than in part: a half-read catalogue
 * would leave a caller asking `avail()` about an option the yard never emitted. An element that is
 * not a readable node is not an option the yard emitted either — the yard emits nothing but nodes.
 */
function readShipyardPartOptions(
  element: unknown,
): ShipyardPartOption[] | undefined {
  const root = shipyardPartNode(element);
  if (root === undefined) return undefined;
  const nodes: readonly unknown[] = [
    root,
    ...Array.from(root.querySelectorAll("*")),
  ];
  const options: ShipyardPartOption[] = [];
  for (const value of nodes) {
    const node = shipyardPartNode(value);
    if (node === undefined) return undefined;
    const tokens = shipyardPartClassTokens(node);
    const position = shipyardPartIndexPosition(tokens);
    if (position === NOT_A_PART_OPTION) continue;
    const option = readShipyardPartOption(node, tokens, position);
    if (option === undefined) return undefined;
    options.push(option);
  }
  return options;
}

/**
 * The dimensions the options named, or `undefined` when they named none.
 *
 * The empty case is refused rather than catalogued. A dimension list of no dimensions is not a yard
 * offering nothing — it is a yard this could not read, and every question asked over it answers
 * vacuously: an availability loop checks no fields, a match compares none, and a build postcondition
 * built from it constrains nothing at all. Refusing here means an unreadable yard has no dimension
 * list anywhere in this script, so the only way a caller can reach these questions is with a
 * catalogue the game's own markup produced.
 */
function provenShipyardPartDimensions(
  types: readonly string[],
): GameShipyardPartDimensions | undefined {
  const [first, ...rest] = types;
  return first === undefined ? undefined : Object.freeze([first, ...rest]);
}

/**
 * The catalogue the markup describes, or `undefined` when the markup cannot be one.
 *
 * Two integrity rules beyond the per-option reading, both about the index rather than the part.
 * A dimension's indices must be exactly its own `0 … n-1` in emission order — that is what
 * `shipParts[k].forEach(function(v, idx))` produces, and a repeat or a gap inside one dimension means
 * the positions `avail()` compares a technology level against are not the positions this catalogue
 * claims they are. And no two options may share a `(dimension, part)` pair, since one identity would
 * then have two positions and nothing here could say which the yard would use.
 */
function buildShipyardPartCatalog(
  options: readonly ShipyardPartOption[],
): GameShipyardPartCatalog | undefined {
  if (options.length === 0) return undefined;
  const parts: GameShipyardPart[] = [];
  const types: string[] = [];
  const indicesByType = new Map<string, number[]>();
  const byIdentity = new Map<string, GameShipyardPart>();
  for (const option of options) {
    const part: GameShipyardPart = Object.freeze({
      type: option.type,
      value: option.value,
      index: option.index,
    });
    if (byIdentity.has(`${part.type} ${part.value}`)) return undefined;
    byIdentity.set(`${part.type} ${part.value}`, part);
    const indices = indicesByType.get(part.type);
    if (indices === undefined) {
      types.push(part.type);
      indicesByType.set(part.type, [part.index]);
    } else {
      indices.push(part.index);
    }
    parts.push(part);
  }
  for (const indices of indicesByType.values()) {
    for (let position = 0; position < indices.length; position += 1) {
      if (indices[position] !== position) return undefined;
    }
  }
  const dimensions = provenShipyardPartDimensions(types);
  if (dimensions === undefined) return undefined;
  return Object.freeze({
    types: dimensions,
    parts: Object.freeze(parts),
    optionFor(type: string, value: string): GameShipyardPart | undefined {
      return byIdentity.get(`${type} ${value}`);
    },
  });
}

/**
 * The catalogue inside one `#shipPlans`, or `undefined` when that element is not a yard this can
 * read. Pure over its argument: it touches the element it is handed and nothing else.
 */
export function parseShipyardPartCatalog(
  element: unknown,
): GameShipyardPartCatalog | undefined {
  const options = readShipyardPartOptions(element);
  return options === undefined ? undefined : buildShipyardPartCatalog(options);
}

export interface CapturedOuterFleetPartsDependencies {
  readonly getDocument: () => unknown;
  /** The yard, for the one protected draw a save that has lost its markup is owed. */
  readonly yard: GameShipyardCatalogYard;
  /** Reports a fault in this capture's reading, never a game fault. */
  readonly onCaptureError?: (detail: string) => void;
}

export function createCapturedOuterFleetParts(
  dependencies: CapturedOuterFleetPartsDependencies,
): GameShipyardPartCatalogSource & GameShipyardPartCatalogSink {
  let proven: GameShipyardPartCatalog | undefined;
  // One scratch draw for the page. The catalogue is then cached, so this bounds the cost of a save
  // whose options cannot be read at all rather than buying the same failed draw every question.
  let drew = false;
  let reported = false;

  /** One line per page: an unreadable yard is a standing condition, not a new fault each question. */
  function reportUnreadable(): void {
    if (reported) return;
    reported = true;
    dependencies.onCaptureError?.(
      "the shipyard's own part options could not be read",
    );
  }

  /**
   * The catalogue the game has really rendered, read without borrowing anything from the page.
   *
   * The element is answered separately from its catalogue, because the two say different things: a
   * yard with no `#shipPlans` on the page is off-tab and may still be worth a draw, while a yard that
   * has one this cannot read has already said everything a draw of the same function would say.
   */
  function renderedCatalog():
    | {
        readonly catalog: GameShipyardPartCatalog | undefined;
      }
    | undefined {
    const plans = renderedElementInside(
      dependencies.getDocument(),
      CAPTURED_OUTER_FLEET_SHIPYARD_PANEL_ID,
      CAPTURED_OUTER_FLEET_SHIPYARD_CONTROL,
    );
    if (plans === undefined) return undefined;
    const catalog = parseShipyardPartCatalog(plans);
    if (catalog === undefined) reportUnreadable();
    return Object.freeze({ catalog });
  }

  return Object.freeze({
    stageFrom(element: unknown): GameShipyardPartCatalogCandidate | undefined {
      const catalog = parseShipyardPartCatalog(element);
      if (catalog === undefined) {
        reportUnreadable();
        return undefined;
      }
      return Object.freeze({
        commit(): void {
          proven = catalog;
        },
      });
    },

    catalog(): GameShipyardPartCatalog | undefined {
      if (proven !== undefined) return proven;
      const rendered = renderedCatalog();
      if (rendered !== undefined) {
        proven = rendered.catalog;
        return proven;
      }
      // A yard the save has already captured but whose markup has gone — the player visited it and
      // moved on, and nothing has asked for a draw since. Establishing the yard again is the only
      // route to the same markup, and it is the yard's own protected pass rather than a new one.
      if (drew || !dependencies.yard.established(dependencies.yard.control())) {
        return undefined;
      }
      drew = true;
      dependencies.yard.establish();
      return proven;
    },
  });
}
