// TRANSITIONAL: the game's modifier-key loop replays the page's own
// keydown/keyup/mousemove jQuery bindings, discovered through jQuery's
// private $_data() event cache. A page with no registered handler falls back
// to dispatching real KeyboardEvent on the document, and the Firefox sandbox
// clones each synthetic event back into the page before replay. Replace all
// of it when the Vue 3 update exposes the game's event loop directly.

import type {
  GameKeyboardHandlers,
  GameKeyboardHandlersPort,
} from "../../ports/game-keyboard-handlers.ts";
import { isRecord, readProperty, requireRecord } from "../validation.ts";

export interface GameKeyboardHandlersDependencies {
  /** The window whose jQuery copy owns the game's bindings. */
  readonly getWin: () => unknown;

  /** The document the game listens on, for the synthetic-event fallback. */
  readonly getDocument: () => unknown;

  /** The page's KeyboardEvent constructor, for the synthetic-event fallback. */
  readonly getKeyboardEvent: () => new (type: string, init: unknown) => unknown;

  /** Whether the Firefox sandbox requires cloning synthetic events into the page. */
  readonly getNeedSandboxBypass: () => boolean;

  readonly cloneIntoPage: (
    value: unknown,
    options?: Readonly<Record<string, unknown>>,
  ) => unknown;
}

/**
 * The binding jQuery stores for one event type (keydown/keyup/mousemove),
 * present, relocated into a tiny replayer.
 */
function readEventBinding(
  events: unknown,
  type: string,
): ((event: unknown) => void) | null {
  const bindings = readProperty(events, type);
  if (!Array.isArray(bindings)) {
    return null;
  }
  const handler = isRecord(bindings[0])
    ? readProperty(bindings[0], "handler")
    : undefined;
  if (typeof handler !== "function") {
    return null;
  }
  return (event: unknown) => Reflect.apply(handler, null, [event]);
}

export function createGameKeyboardHandlers(
  dependencies: GameKeyboardHandlersDependencies,
): GameKeyboardHandlersPort {
  const {
    getWin,
    getDocument,
    getKeyboardEvent,
    getNeedSandboxBypass,
    cloneIntoPage,
  } = dependencies;

  /** jQuery's private event cache for the document, when the page has one. */
  function readJQueryEventCache(): unknown {
    const win = requireRecord(getWin(), "window");
    const jquery = readProperty(win, "$");
    if (typeof readProperty(jquery, "_data") !== "function") {
      return undefined;
    }
    const cache = Reflect.apply(
      readProperty(jquery, "_data") as (document: unknown) => unknown,
      jquery,
      [getDocument()],
    );
    return readProperty(cache, "events");
  }

  /**
   * The browser fallback for a page with no registered handlers: re-dispatch
   * a real KeyboardEvent on the document the game listens on.
   */
  function synthesizeKeyEvent(type: string): (event: unknown) => void {
    return (event: unknown) => {
      const documentValue = requireRecord(getDocument(), "document");
      const dispatch = readProperty(documentValue, "dispatchEvent");
      if (typeof dispatch !== "function") {
        return;
      }
      const KeyboardEventConstructor = getKeyboardEvent();
      if (typeof KeyboardEventConstructor !== "function") {
        return;
      }
      const keyboardEvent = new KeyboardEventConstructor(type, event);
      Reflect.apply(dispatch, documentValue, [keyboardEvent]);
    };
  }

  return Object.freeze({
    hasKeydownBinding(): boolean {
      const bindings = readProperty(readJQueryEventCache(), "keydown");
      return Array.isArray(bindings) && bindings.length > 0;
    },

    readGameKeyboardHandlers(): GameKeyboardHandlers {
      const events = readJQueryEventCache();
      const keyDown = readEventBinding(events, "keydown");
      const keyUp = readEventBinding(events, "keyup");
      const moveAll = readEventBinding(events, "mousemove");

      // No usable jQuery bindings: fall back to synthetic keyboard events.
      if (!moveAll && (!keyDown || !keyUp)) {
        return {
          keyDown: synthesizeKeyEvent("keydown"),
          keyUp: synthesizeKeyEvent("keyup"),
          moveAll: null,
        };
      }

      if (!getNeedSandboxBypass()) {
        return { keyDown, keyUp, moveAll };
      }

      // The Firefox sandbox clones each synthetic event into the page so the
      // game's handlers see a genuine page-side object.
      const throughPage = (
        handler: ((event: unknown) => void) | null,
      ): ((event: unknown) => void) | null =>
        handler === null
          ? null
          : (event: unknown) => handler(cloneIntoPage(event));

      return {
        keyDown: throughPage(keyDown),
        keyUp: throughPage(keyUp),
        moveAll: throughPage(moveAll),
      };
    },
  });
}
