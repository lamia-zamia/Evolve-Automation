/**
 * Reads a generated planet row's popover out of the live document.
 *
 * `popover()` binds `mouseover` to build `#popper` and `mouseout` to tear it down, so the read is
 * hover, sample, unhover — the same event pair a player produces, and the same `mouseover` the
 * planet click already dispatches. Nothing is left on screen.
 */

import type {
  DrawnPlanetDetail,
  DrawnPlanetGeologyRow,
  PlanetMetadataReader,
} from "../../ports/planet-metadata.ts";
import { isRecord, readProperty } from "../validation.ts";

const POPPER_SELECTOR = "#popper";
const TITLE_SELECTOR = ".aTitle";
const GEOLOGY_ROW_SELECTOR = ".pGeo";

export interface PlanetMetadataDependencies {
  readonly getDocument: () => unknown;
  readonly getMouseEventConstructor: () => unknown;
}

function elementText(value: unknown): string | undefined {
  const text = readProperty(value, "textContent");
  return typeof text === "string" ? text.trim() : undefined;
}

function queryAll(node: unknown, selector: string): unknown[] {
  const query = readProperty(node, "querySelectorAll");
  if (typeof query !== "function") return [];
  const result = Reflect.apply(query, node, [selector]);
  if (!isRecord(result)) return [];
  const length = readProperty(result, "length");
  if (typeof length !== "number") return [];
  const nodes: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    nodes.push((result as Record<number, unknown>)[index]);
  }
  return nodes;
}

function queryOne(node: unknown, selector: string): unknown {
  const query = readProperty(node, "querySelector");
  if (typeof query !== "function") return undefined;
  return Reflect.apply(query, node, [selector]) ?? undefined;
}

function hasClass(node: unknown, className: string): boolean {
  const list = readProperty(node, "classList");
  const contains = readProperty(list, "contains");
  if (typeof contains !== "function") return false;
  return Reflect.apply(contains, list, [className]) === true;
}

/** The `data-id` the game stamps on `#popper`, read either way a host exposes it. */
function readDataId(node: unknown): string | undefined {
  const fromDataset = readProperty(readProperty(node, "dataset"), "id");
  if (typeof fromDataset === "string") return fromDataset;
  const getAttribute = readProperty(node, "getAttribute");
  if (typeof getAttribute !== "function") return undefined;
  const value = Reflect.apply(getAttribute, node, ["data-id"]);
  return typeof value === "string" ? value : undefined;
}

/** `Copper: +18%` / `Copper: Bonus` — the label is what precedes the first colon. */
function readGeologyRow(node: unknown): DrawnPlanetGeologyRow | undefined {
  const text = elementText(node);
  if (text === undefined) return undefined;
  const colon = text.indexOf(":");
  if (colon <= 0) return undefined;
  const label = text.slice(0, colon).trim();
  const value = text.slice(colon + 1).trim();
  if (label === "") return undefined;
  const beneficial = hasClass(node, "has-text-advanced");
  if (!beneficial && !hasClass(node, "has-text-caution")) return undefined;
  const percentMatch = /^([+-]?\d+)%$/.exec(value);
  return Object.freeze({
    label,
    beneficial,
    percent: percentMatch === null ? undefined : Number(percentMatch[1]),
  });
}

export function createPlanetMetadataReader({
  getDocument,
  getMouseEventConstructor,
}: PlanetMetadataDependencies): PlanetMetadataReader {
  return Object.freeze({
    readPlanetDetail(elementId: string): DrawnPlanetDetail | undefined {
      const document = getDocument();
      const getElementById = readProperty(document, "getElementById");
      if (typeof getElementById !== "function") return undefined;
      const row = Reflect.apply(getElementById, document, [elementId]);
      if (!isRecord(row)) return undefined;
      const title = elementText(queryOne(row, TITLE_SELECTOR));
      if (title === undefined || title === "") return undefined;

      const MouseEventConstructor = getMouseEventConstructor();
      const dispatchEvent = readProperty(row, "dispatchEvent");
      if (
        typeof MouseEventConstructor !== "function" ||
        typeof dispatchEvent !== "function"
      ) {
        return undefined;
      }
      const dispatch = (type: string) => {
        Reflect.apply(dispatchEvent, row, [
          Reflect.construct(
            MouseEventConstructor as new (...args: unknown[]) => unknown,
            [type, {}],
          ),
        ]);
      };

      dispatch("mouseover");
      try {
        const popper = queryOne(document, POPPER_SELECTOR);
        // The popover is per-row and stamped with the row it belongs to; a stale one from an
        // earlier hover would describe the wrong planet.
        const ownerId = readDataId(popper);
        if (!isRecord(popper) || ownerId !== elementId) return undefined;
        const summary = elementText(queryOne(popper, "div"));
        if (summary === undefined) return undefined;
        const geology: DrawnPlanetGeologyRow[] = [];
        for (const node of queryAll(popper, GEOLOGY_ROW_SELECTOR)) {
          const parsed = readGeologyRow(node);
          // One unreadable deposit makes the whole planet unrankable; a partial geology would
          // score it against a rule the game did not apply.
          if (parsed === undefined) return undefined;
          geology.push(parsed);
        }
        return Object.freeze({
          elementId,
          title,
          summary,
          geology: Object.freeze(geology),
        });
      } finally {
        dispatch("mouseout");
      }
    },
  });
}
