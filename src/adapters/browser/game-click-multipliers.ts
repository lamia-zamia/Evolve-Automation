// TRANSITIONAL: the modifier keys live on the script's own legacy KeyManager,
// which pushes synthetic keyboard events at the Vue 2 page and answers `click()`
// with a generator that holds a different modifier combination per step. This
// adapter is the one place that reaches into that untyped object; replace it
// when the Vue 3 update lets a panel take a count directly.

import type { GameClickMultipliersPort } from "../../ports/game-click-multipliers.ts";
import { requireFunction, requireRecord } from "../validation.ts";

export interface GameClickMultipliersDependencies {
  /** The legacy KeyManager, read per call because the runtime can replace it. */
  readonly getKeyManager: () => unknown;
}

export function createGameClickMultipliers({
  getKeyManager,
}: GameClickMultipliersDependencies): GameClickMultipliersPort {
  function callKeyManager(name: string, args: unknown[]): unknown {
    const keyManager = requireRecord(getKeyManager(), "KeyManager");
    const method = requireFunction(keyManager[name], `KeyManager.${name}`);
    return Reflect.apply(method, keyManager, args);
  }

  return Object.freeze({
    *steps(count: number): Iterable<unknown> {
      // Generator, so nothing is pressed until the caller starts iterating.
      const sequence = requireRecord(
        callKeyManager("click", [count]),
        "KeyManager.click() result",
      );
      const iterate = requireFunction(
        sequence[Symbol.iterator],
        "KeyManager.click() result[Symbol.iterator]",
      );
      const iterator = requireRecord(
        Reflect.apply(iterate, sequence, []),
        "KeyManager.click() iterator",
      );
      const next = requireFunction(
        iterator["next"],
        "KeyManager.click() iterator.next",
      );
      while (true) {
        const result = requireRecord(
          Reflect.apply(next, iterator, []),
          "KeyManager.click() iterator result",
        );
        if (result["done"]) {
          return;
        }
        yield result["value"];
      }
    },

    clear(): void {
      callKeyManager("set", [false, false, false]);
    },
  });
}
