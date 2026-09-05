/**
 * The game's modifier-key loop, replayed with synthetic keyboard events.
 *
 * Until 1.5.0 the game registered its keydown/keyup/mousemove handlers with jQuery, and this
 * adapter reached into jQuery's private `$._data()` event cache to call them directly. At 1.5.0 the
 * game keeps its listeners as native `addEventListener` records in a module-private `WeakMap`, so
 * there is nothing to read and nothing to call: a real event on the document the game listens on is
 * the only way in, and it is the path the old code already fell back to when no binding was found.
 */

import type {
  GameKeyboardHandlers,
  GameKeyboardHandlersPort,
} from "../../ports/game-keyboard-handlers.ts";
import { readProperty, requireRecord } from "../validation.ts";

export interface GameKeyboardHandlersDependencies {
  /** The document the game listens on. */
  readonly getDocument: () => unknown;

  /** The page's KeyboardEvent constructor. */
  readonly getKeyboardEvent: () => new (type: string, init: unknown) => unknown;
}

export function createGameKeyboardHandlers(
  dependencies: GameKeyboardHandlersDependencies,
): GameKeyboardHandlersPort {
  const { getDocument, getKeyboardEvent } = dependencies;

  /** Re-dispatches a real KeyboardEvent of `type` on the document the game listens on. */
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
    readGameKeyboardHandlers(): GameKeyboardHandlers {
      return {
        keyDown: synthesizeKeyEvent("keydown"),
        keyUp: synthesizeKeyEvent("keyup"),
        // The game no longer exposes a combined modifier binding to replay, so the key manager
        // always drives each modifier key on its own.
        moveAll: null,
      };
    },
  });
}
