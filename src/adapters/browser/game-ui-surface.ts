// TRANSITIONAL: the page's shared surfaces are the Vue 2 page's
// `documentElement`/`body` scrollport, its `hidden` visibility flag, the
// script's own `script_mechStats*` input skeleton, and the celestial lab's
// `#celestialLab .create button`. The Vue 3 page renders the scrollport and
// the script's forms through its own components; replace this adapter with
// the new surface contract when it does.

import type {
  GameMechStatsInput,
  GameUiSurfacePort,
} from "../../ports/game-ui-surface.ts";
import { isRecord, readProperty, requireRecord } from "../validation.ts";

export interface GameUiSurfaceDependencies {
  readonly getDocument: () => unknown;
}

/** The mech-stats panel's checkbox inputs, keyed by their element id. */
const MECH_CHECKBOX_IDS = [
  "script_mechStatsSpecial",
  "script_mechStatsGravity",
  "script_mechStatsEfficient",
  "script_mechStatsCompact",
] as const;

const MECH_STATS_SCOUTS_ID = "script_mechStatsScouts";
const LAB_CREATE_BUTTON = "#celestialLab .create button";

export function createGameUiSurface({
  getDocument,
}: GameUiSurfaceDependencies): GameUiSurfacePort {
  function documentSurface(): Record<string, unknown> {
    return requireRecord(getDocument(), "document");
  }

  /** Reads one element by id through the page's document. */
  function byId(id: string): unknown {
    const doc = documentSurface();
    const getElementById = readProperty(doc, "getElementById");
    return typeof getElementById === "function"
      ? Reflect.apply(getElementById, doc, [id])
      : null;
  }

  /** True only when `element` reports a checked box; absent or unchecked reports false. */
  function readChecked(id: string): boolean {
    const element = byId(id);
    return isRecord(element) && readProperty(element, "checked") === true;
  }

  function scrollElement(property: "documentElement" | "body"): unknown {
    return readProperty(documentSurface(), property);
  }

  /**
   * The page's live scroll offset. Reading `scrollTop` makes the browser flush
   * pending style and layout, and the refresh asks for it once per tick after a
   * whole automation pass has dirtied the DOM, so this read pays for that flush:
   * 1.28 ms/tick measured on a day-338 000 save, for a value only used on the
   * rare tick that recreates the script's own container. `readScrollTop` seeds
   * the cache with one such read and then lets the page report its own scrolling.
   */
  function readScrollTopLive(): number {
    const documentElement = scrollElement("documentElement");
    const body = scrollElement("body");
    const fromDocumentElement = isRecord(documentElement)
      ? readProperty(documentElement, "scrollTop")
      : undefined;
    const fromBody = isRecord(body)
      ? readProperty(body, "scrollTop")
      : undefined;
    const value = fromDocumentElement || fromBody;
    return typeof value === "number" ? value : 0;
  }

  /**
   * `null` until the first `readScrollTop`, which seeds it and subscribes. Scroll
   * events are dispatched from the rendering steps, where layout is already
   * clean, so refreshing the cache there costs no flush. Element scrolling does
   * not bubble, so this listener only sees the document's own scrollport.
   */
  let observedScrollTop: number | null = null;

  function observeScroll(): void {
    const doc = documentSurface();
    const addEventListener = readProperty(doc, "addEventListener");
    if (typeof addEventListener !== "function") {
      return;
    }
    Reflect.apply(addEventListener, doc, [
      "scroll",
      () => {
        observedScrollTop = readScrollTopLive();
      },
      { passive: true },
    ]);
  }

  function queryLabButton(): unknown {
    const doc = documentSurface();
    const querySelector = readProperty(doc, "querySelector");
    if (typeof querySelector !== "function") {
      return null;
    }
    return Reflect.apply(querySelector, doc, [LAB_CREATE_BUTTON]);
  }

  return Object.freeze({
    isPageVisible(): boolean {
      return readProperty(documentSurface(), "hidden") !== true;
    },

    readScrollTop(): number {
      if (observedScrollTop === null) {
        observedScrollTop = readScrollTopLive();
        observeScroll();
      }
      return observedScrollTop;
    },

    resetScrollTop(value: number): void {
      const documentElement = scrollElement("documentElement");
      const body = scrollElement("body");
      if (isRecord(documentElement)) {
        documentElement["scrollTop"] = value;
      }
      if (isRecord(body)) {
        body["scrollTop"] = value;
      }
      observedScrollTop = value;
    },

    readMechStatsInputs(): GameMechStatsInput {
      const scoutsElement = byId(MECH_STATS_SCOUTS_ID);
      const scouts =
        isRecord(scoutsElement) && typeof scoutsElement.value === "string"
          ? scoutsElement.value
          : "";
      return {
        special: readChecked(MECH_CHECKBOX_IDS[0]),
        gravity: readChecked(MECH_CHECKBOX_IDS[1]),
        efficient: readChecked(MECH_CHECKBOX_IDS[2]),
        compact: readChecked(MECH_CHECKBOX_IDS[3]),
        scouts,
      };
    },

    isLabCreateAvailable(): boolean {
      return isRecord(queryLabButton());
    },

    clickLabCreate(): void {
      const button = queryLabButton();
      if (!isRecord(button)) {
        return;
      }
      const click = readProperty(button, "click");
      if (typeof click === "function") {
        Reflect.apply(click, button, []);
      }
    },
  });
}
