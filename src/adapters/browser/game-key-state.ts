/**
 * Observes the page's keydown/keyup stream and modifier flags from mousemove so a transactional
 * game probe can restore a modifier or queue key exactly as it found it, and mirrors the multiplier
 * latch upstream keeps in module-private state. The listener is installed at document-start by the
 * page capture, before the game's own native listeners. It does not synthesize state and never
 * writes to the document.
 *
 * Two answers come out of that one stream, and they are deliberately different questions:
 * `readPressed` reports which keys are physically down right now, while `readMultiplierLatch`
 * reports what `vars.js:keyMultiplier()` will multiply by. Upstream does not compute the second
 * from the first — see the latch fold below for why that is not a reconstruction this adapter may
 * make.
 */

import type {
  GameKeyboardState,
  GameMultiplierLatchName,
} from "../../ports/game-key-state.ts";
import { GAME_MULTIPLIER_LATCH_NAMES } from "../../ports/game-key-state.ts";
import type { GameRootStateSource } from "../../ports/game-root-state.ts";
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

export interface GameKeyStateCaptureOptions {
  /** The captured root: the only settings authority this adapter reads, and the latch reset point. */
  readonly roots?: GameRootStateSource;
  /**
   * The mapping the game currently configures for one multiplier latch, read at the moment of each
   * observed event. `undefined` leaves that latch unanswerable rather than guessed.
   */
  readonly readMultiplierMapping?: (
    name: GameMultiplierLatchName,
  ) => string | number | undefined;
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

/**
 * The single value pinned `main.js` compares against a mapping: `let key = e.key || e.keyCode`.
 *
 * Unlike `observedKeys`, which records both spellings for physical state, this is one value or
 * nothing — a numeric mapping is only ever matched by a `keyCode` event whose `key` is empty, never
 * by a named key that happens to carry the same code.
 */
function mappedEventKey(event: unknown): string | number | undefined {
  const key = readProperty(event, "key");
  if (typeof key === "string" && key.length > 0) return key;
  return finite(readProperty(event, "keyCode"));
}

export function createGameKeyStateCapture(
  getDocument: () => unknown,
  options: GameKeyStateCaptureOptions = {},
): GameKeyboardState & { readonly uninstall: () => void } {
  const pressed = new Set<string | number>();
  /**
   * Upstream's private `vars.js:keyMap`, folded event by event. Absent means no answer yet: either
   * the page never exposed a comparable mapping, or the captured root was replaced.
   */
  const latched = new Map<GameMultiplierLatchName, boolean>();
  const readMultiplierMapping = options.readMultiplierMapping;
  let capturedRoot = options.roots?.readRoot();

  /**
   * Runs one event's worth of upstream latch semantics over the mappings as configured *now*.
   *
   * Pinned `main.js` gives the game three rules that never consult each other: keydown sets a latch
   * whose current mapping strictly equals the event key, keyup clears the same comparison, and every
   * mousemove overwrites a mapping that is one of the four modifier aliases with that modifier's
   * flag. Nothing else can clear a latch, so a mapping changed while its key is down leaves the
   * latch set — that is upstream's own stale-latch behavior and it is preserved deliberately: the
   * question is what `keyMultiplier()` will answer, not what a cleaner keyboard would answer.
   *
   * Each latch starts at upstream's own initial `false`, but only once the page exposes the mapping
   * this fold would compare against; before that it stays absent, so a caller about to mutate fails
   * closed instead of guessing. A different captured root clears the whole fold rather than inheriting
   * another root's authority.
   */
  function foldMultiplierLatches(
    apply: (name: GameMultiplierLatchName, mapping: string | number) => void,
  ): void {
    if (readMultiplierMapping === undefined) return;
    for (const name of GAME_MULTIPLIER_LATCH_NAMES) {
      const mapping = readMultiplierMapping(name);
      if (mapping === undefined) continue;
      if (!latched.has(name)) latched.set(name, false);
      apply(name, mapping);
    }
  }

  const document = getDocument();
  if (typeof document !== "object" || document === null) {
    return Object.freeze({
      readPressed: () => undefined,
      readMultiplierLatch: () => undefined,
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
      readMultiplierLatch: () => undefined,
      uninstall: () => {},
    });
  }

  const onKeyDown = (event: unknown): void => {
    for (const key of observedKeys(event)) pressed.add(key);
    const mapped = mappedEventKey(event);
    if (mapped === undefined) return;
    foldMultiplierLatches((name, mapping) => {
      if (mapping === mapped) latched.set(name, true);
    });
  };
  const onKeyUp = (event: unknown): void => {
    for (const key of observedKeys(event)) pressed.delete(key);
    const mapped = mappedEventKey(event);
    if (mapped === undefined) return;
    foldMultiplierLatches((name, mapping) => {
      if (mapping === mapped) latched.set(name, false);
    });
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
    foldMultiplierLatches((name, mapping) => {
      for (const binding of GAME_KEY_STATE_MOUSE_MODIFIER_BINDINGS) {
        if (mapping !== binding.key && mapping !== binding.keyCode) continue;
        latched.set(name, readProperty(event, binding.eventProperty) === true);
        return;
      }
    });
  };
  const capturePhase = true;
  pageDocument.addEventListener("keydown", onKeyDown, capturePhase);
  pageDocument.addEventListener("keyup", onKeyUp, capturePhase);
  pageDocument.addEventListener("mousemove", onMouseMove, capturePhase);
  const stopWatchingRoot = (() => {
    const roots = options.roots;
    if (roots === undefined) return () => {};
    return roots.subscribeRootReplaced(() => {
      const next = roots.readRoot();
      // A re-wrap keeps the same root (Vue caches the proxy per raw target) and the game's own latch
      // with it; only an unrelated root starts over.
      if (next === capturedRoot) return;
      capturedRoot = next;
      latched.clear();
    });
  })();
  let uninstalled = false;
  return Object.freeze({
    readPressed(key: string | number): boolean {
      return pressed.has(key);
    },
    readMultiplierLatch(name: GameMultiplierLatchName): boolean | undefined {
      return latched.get(name);
    },
    uninstall(): void {
      if (uninstalled) return;
      uninstalled = true;
      pageDocument.removeEventListener!("keydown", onKeyDown, capturePhase);
      pageDocument.removeEventListener!("keyup", onKeyUp, capturePhase);
      pageDocument.removeEventListener!("mousemove", onMouseMove, capturePhase);
      stopWatchingRoot();
      pressed.clear();
      latched.clear();
    },
  });
}
