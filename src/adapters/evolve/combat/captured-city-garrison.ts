/** Native city-garrison mechanics exposed by both `buildGarrison()` bindings. */

import type { GameControlRegistry } from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { finite } from "../../validation.ts";

export const CAPTURED_CITY_GARRISON_CONTROLS = Object.freeze([
  "garrison",
  "c_garrison",
] as const);

/** `hell()` returns `civics.js:garrisonSize()`; `stationed()` can return presentation text. */
export function readCapturedCurrentCityGarrison(
  rootState: GameRootStateSource,
  controls: GameControlRegistry,
  expectedRoot: unknown,
): number | undefined {
  try {
    if (rootState.readRoot() !== expectedRoot) return undefined;
    for (const elementId of CAPTURED_CITY_GARRISON_CONTROLS) {
      const control = controls.resolve(elementId);
      if (control === undefined || !control.methods.includes("hell")) continue;
      let value: number | undefined;
      try {
        const result = controls.invoke(control, "hell", [undefined]);
        if (result.ok) value = finite(result.value);
      } catch {
        // The other binding may still provide the same native mechanics answer.
      }
      if (
        rootState.readRoot() !== expectedRoot ||
        controls.resolve(elementId)?.generation !== control.generation
      ) {
        return undefined;
      }
      if (value !== undefined) return value;
    }
  } catch {
    // A throwing native control or changed capture cannot authorize construction.
  }
  return undefined;
}
