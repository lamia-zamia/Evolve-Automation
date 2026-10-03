/** Native city-garrison mechanics exposed by both `buildGarrison()` bindings. */

import type {
  GameControlHandle,
  GameControlRegistry,
} from "../../../ports/game-control-registry.ts";
import type { GameRootStateSource } from "../../../ports/game-root-state.ts";
import { finite } from "../../validation.ts";

export const CAPTURED_CITY_GARRISON_CONTROLS = Object.freeze([
  "garrison",
  "c_garrison",
] as const);

export interface CapturedCityGarrisonSnapshot {
  readonly current: number;
  readonly maximum: number;
  readonly control: GameControlHandle;
}

function cityGarrisonHandleIsCurrent(
  rootState: GameRootStateSource,
  controls: GameControlRegistry,
  expectedRoot: unknown,
  control: GameControlHandle,
): boolean {
  return (
    rootState.readRoot() === expectedRoot &&
    controls.resolve(control.elementId)?.generation === control.generation
  );
}

function invokeCityGarrisonNumber(
  controls: GameControlRegistry,
  control: GameControlHandle,
  method: "hell" | "s_max",
): number | undefined {
  const result = controls.invoke(control, method, [undefined]);
  return result.ok ? finite(result.value) : undefined;
}

/** Both native answers must come from one binding and one unchanged root/generation. */
export function readCapturedCityGarrisonSnapshot(
  rootState: GameRootStateSource,
  controls: GameControlRegistry,
  expectedRoot: unknown,
): CapturedCityGarrisonSnapshot | undefined {
  try {
    if (rootState.readRoot() !== expectedRoot) return undefined;
    for (const elementId of CAPTURED_CITY_GARRISON_CONTROLS) {
      const control = controls.resolve(elementId);
      if (
        control === undefined ||
        !control.methods.includes("hell") ||
        !control.methods.includes("s_max")
      ) {
        continue;
      }
      const current = invokeCityGarrisonNumber(controls, control, "hell");
      if (
        !cityGarrisonHandleIsCurrent(rootState, controls, expectedRoot, control)
      ) {
        return undefined;
      }
      if (current === undefined) return undefined;
      const maximum = invokeCityGarrisonNumber(controls, control, "s_max");
      if (
        !cityGarrisonHandleIsCurrent(rootState, controls, expectedRoot, control)
      ) {
        return undefined;
      }
      if (maximum === undefined) return undefined;
      return Object.freeze({ current, maximum, control });
    }
  } catch {
    // A throwing native method or changing capture cannot authorize a snapshot.
  }
  return undefined;
}

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
        value = invokeCityGarrisonNumber(controls, control, "hell");
      } catch {
        // The other binding may still provide the same native mechanics answer.
      }
      if (
        !cityGarrisonHandleIsCurrent(rootState, controls, expectedRoot, control)
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

/** Invert DeadSpace `buildGarrison().rating(n, false)` on one unchanged binding. */
export function capturedCitySoldiersForRating(options: {
  readonly rootState: GameRootStateSource;
  readonly controls: GameControlRegistry;
  readonly control: GameControlHandle;
  readonly expectedRoot: unknown;
  readonly targetRating: number;
  readonly capacity: number;
}): number | undefined {
  const { rootState, controls, control, expectedRoot, targetRating, capacity } =
    options;
  if (
    !Number.isFinite(targetRating) ||
    !Number.isSafeInteger(capacity) ||
    capacity < 0
  )
    return undefined;
  const current = () =>
    cityGarrisonHandleIsCurrent(rootState, controls, expectedRoot, control);
  try {
    if (!control.methods.includes("rating") || !current()) return undefined;
    if (targetRating <= 0) return 0;
    if (capacity === 0) return 1;
    const rating = (soldiers: number): number | undefined => {
      if (!current()) return undefined;
      const answer = controls.invoke(control, "rating", [soldiers, false]);
      if (!current() || !answer.ok) return undefined;
      return finite(answer.value);
    };
    const upperRating = rating(capacity);
    if (upperRating === undefined) return undefined;
    if (upperRating < targetRating) return capacity + 1;
    let low = 1;
    let high = capacity;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const answer = rating(middle);
      if (answer === undefined) return undefined;
      if (answer >= targetRating) high = middle;
      else low = middle + 1;
    }
    return current() ? low : undefined;
  } catch {
    return undefined;
  }
}
