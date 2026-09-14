/**
 * Observes the page's keydown/keyup stream and modifier flags from mousemove so a transactional
 * game probe can restore a modifier or queue key exactly as it found it. The listener is installed
 * at document-start by the page capture, before the game's own native listeners. It does not
 * synthesize state and never writes to the document.
 */

import type { GameKeyStateReader } from "../../ports/game-key-state.ts";
import { finite, readProperty } from "../validation.ts";

interface KeyStateDocument {
  addEventListener?: (
    type: string,
    listener: (event: unknown) => void,
    options?: unknown,
  ) => void;
  removeEventListener?: (
    type: string,
    listener: (event: unknown) => void,
    options?: unknown,
  ) => void;
}

interface GameKeyStateMouseModifierBinding {
  readonly eventProperty: string;
  readonly key: string;
  readonly keyCode: number;
}

/** DeadSpace updates these same aliases from every mousemove, not only from keydown/keyup. */
const GAME_KEY_STATE_MOUSE_MODIFIER_BINDINGS: readonly GameKeyStateMouseModifierBinding[] =
  Object.freeze([
    Object.freeze({ eventProperty: "shiftKey", key: "Shift", keyCode: 16 }),
    Object.freeze({ eventProperty: "ctrlKey", key: "Control", keyCode: 17 }),
    Object.freeze({ eventProperty: "altKey", key: "Alt", keyCode: 18 }),
    Object.freeze({ eventProperty: "metaKey", key: "Meta", keyCode: 91 }),
  ]);

function observedKeys(event: unknown): readonly (string | number)[] {
  const key = readProperty(event, "key");
  const keyCode = finite(readProperty(event, "keyCode"));
  const keys: Array<string | number> = [];
  if (typeof key === "string" && key.length > 0) keys.push(key);
  if (keyCode !== undefined && keyCode > 0) keys.push(keyCode);
  return keys;
}

export function createGameKeyStateCapture(
  getDocument: () => unknown,
): GameKeyStateReader & { readonly uninstall: () => void } {
  const pressed = new Set<string | number>();
  const document = getDocument();
  if (typeof document !== "object" || document === null) {
    return Object.freeze({
      readPressed: () => undefined,
      uninstall: () => {},
    });
  }
  const pageDocument = document as KeyStateDocument;
  if (
    typeof pageDocument.addEventListener !== "function" ||
    typeof pageDocument.removeEventListener !== "function"
  ) {
    return Object.freeze({
      readPressed: () => undefined,
      uninstall: () => {},
    });
  }

  const onKeyDown = (event: unknown): void => {
    for (const key of observedKeys(event)) pressed.add(key);
  };
  const onKeyUp = (event: unknown): void => {
    for (const key of observedKeys(event)) pressed.delete(key);
  };
  const onMouseMove = (event: unknown): void => {
    for (const binding of GAME_KEY_STATE_MOUSE_MODIFIER_BINDINGS) {
      const isPressed = readProperty(event, binding.eventProperty) === true;
      if (isPressed) {
        pressed.add(binding.key);
        pressed.add(binding.keyCode);
      } else {
        pressed.delete(binding.key);
        pressed.delete(binding.keyCode);
      }
    }
  };
  const capturePhase = true;
  pageDocument.addEventListener("keydown", onKeyDown, capturePhase);
  pageDocument.addEventListener("keyup", onKeyUp, capturePhase);
  pageDocument.addEventListener("mousemove", onMouseMove, capturePhase);
  let uninstalled = false;
  return Object.freeze({
    readPressed(key: string | number): boolean {
      return pressed.has(key);
    },
    uninstall(): void {
      if (uninstalled) return;
      uninstalled = true;
      pageDocument.removeEventListener!("keydown", onKeyDown, capturePhase);
      pageDocument.removeEventListener!("keyup", onKeyUp, capturePhase);
      pageDocument.removeEventListener!("mousemove", onMouseMove, capturePhase);
      pressed.clear();
    },
  });
}
