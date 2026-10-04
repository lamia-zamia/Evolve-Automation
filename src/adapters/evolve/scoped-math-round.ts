/** A synchronous observation of the page realm's Math.round. */
import { readProperty } from "../validation.ts";

export interface ScopedMathRoundObservation {
  readonly input: number;
  readonly result: number;
}

let mathRoundProbeInFlight = false;

export function probeScopedMathRound(
  pageWindow: unknown,
  read: (observations: readonly ScopedMathRoundObservation[]) => void,
): readonly ScopedMathRoundObservation[] | undefined {
  if (mathRoundProbeInFlight) return undefined;
  const pageMath = readProperty(pageWindow, "Math");
  if (typeof pageMath !== "object" || pageMath === null) return undefined;
  let original: PropertyDescriptor | undefined;
  try {
    original = Object.getOwnPropertyDescriptor(pageMath, "round");
  } catch {
    return undefined;
  }
  if (
    original === undefined ||
    !original.configurable ||
    !("value" in original) ||
    typeof original.value !== "function"
  )
    return undefined;
  const nativeRound = original.value as (...args: unknown[]) => unknown;
  const observations: ScopedMathRoundObservation[] = [];
  let malformed = false;
  const wrapper = function observedPageMathRound(...args: unknown[]): unknown {
    const result = Reflect.apply(nativeRound, pageMath, args);
    if (
      typeof args[0] === "number" &&
      Number.isFinite(args[0]) &&
      typeof result === "number" &&
      Number.isFinite(result)
    ) {
      observations.push(Object.freeze({ input: args[0], result }));
    } else {
      malformed = true;
    }
    return result;
  };
  mathRoundProbeInFlight = true;
  let invalid = false;
  try {
    Object.defineProperty(pageMath, "round", { ...original, value: wrapper });
    read(observations);
  } catch {
    invalid = true;
  } finally {
    try {
      if (Object.getOwnPropertyDescriptor(pageMath, "round")?.value !== wrapper)
        invalid = true;
      Object.defineProperty(pageMath, "round", original);
      const current = Object.getOwnPropertyDescriptor(pageMath, "round");
      if (
        current?.value !== original.value ||
        current?.configurable !== original.configurable ||
        current?.enumerable !== original.enumerable ||
        current?.writable !== original.writable
      )
        invalid = true;
    } catch {
      invalid = true;
    }
    mathRoundProbeInFlight = false;
  }
  return invalid || malformed ? undefined : Object.freeze(observations);
}
