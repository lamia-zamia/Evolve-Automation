/**
 * Observes the page's keydown/keyup stream so a transactional game probe can restore a modifier
 * or queue key exactly as it found it. The listener is installed at document-start by the page
 * capture, before the game's own native listeners. It does not synthesize state and never writes
 * to the document.
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
  const capturePhase = true;
  pageDocument.addEventListener("keydown", onKeyDown, capturePhase);
  pageDocument.addEventListener("keyup", onKeyUp, capturePhase);
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
      pressed.clear();
    },
  });
}
