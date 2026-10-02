/**
 * One synchronous observation of the page's own `Number.prototype.toFixed`.
 *
 * Two features need to see what the game rounded rather than re-derive what it rounded *from*: the
 * fuel-adjustment factor, which has no other reachable expression, and the Truepath `syndicate()`
 * result, whose remaining-defense ratio exists only as the four-digit string that `p` is
 * subtracted from. Both run a game closure and watch the rounding it performs, because the values
 * the closure consumed are module-private and unreachable.
 *
 * The wrapper is deliberately transparent. It records the receiver as a number, the requested
 * digit count and the string the game itself produced, then returns that string untouched, so the
 * game cannot tell it was observed. Restoration is by the complete saved property descriptor, and
 * only while this wrapper still owns the property — a page that replaced `toFixed` underneath the
 * probe keeps its own replacement instead of being overwritten with a stale one.
 *
 * One probe at a time. Two interleaved observations would be indistinguishable from one closure
 * rounding something else, so a probe that arrives while another is installed is refused rather
 * than merged.
 */

/** One call the observed code made. `receiver` is the value before rounding. */
export interface ScopedToFixedObservation {
  readonly receiver: number;
  readonly digits: number;
  readonly text: string;
}

import { readProperty } from "../validation.ts";

type PageCall = (this: unknown, ...args: unknown[]) => unknown;

/**
 * Module-level because it guards the page prototype itself rather than any one adapter's state:
 * two captures installed on the same page must not patch the same property at once. Held only for
 * the synchronous extent of one probe.
 */
let scopedToFixedProbeInFlight = false;

/**
 * Runs `read` with the page's own `toFixed` observed, then restores the prototype.
 *
 * `read` receives the live observation list, so it can slice the observations per invocation of its
 * own closure when it makes more than one. Returns `undefined` when the page has no ordinary
 * configurable `toFixed` to observe, when the body threw, or when the original descriptor could not
 * be put back — never a partial observation set, because a caller cannot tell a truncated list
 * from a complete one.
 */
export function probeScopedNumberToFixed(
  pageWindow: unknown,
  read: (observations: readonly ScopedToFixedObservation[]) => void,
): readonly ScopedToFixedObservation[] | undefined {
  if (scopedToFixedProbeInFlight) return undefined;
  const numberConstructor = readProperty(pageWindow, "Number");
  const numberPrototype = readProperty(numberConstructor, "prototype");
  const objectConstructor = readProperty(pageWindow, "Object");
  const defineProperty = readProperty(objectConstructor, "defineProperty");
  if (
    typeof defineProperty !== "function" ||
    typeof numberPrototype !== "object" ||
    numberPrototype === null
  ) {
    return undefined;
  }
  const original = Object.getOwnPropertyDescriptor(numberPrototype, "toFixed");
  if (
    original === undefined ||
    original.configurable !== true ||
    !("value" in original) ||
    typeof original.value !== "function"
  ) {
    // An accessor or a frozen prototype cannot be observed and restored as the same property, so
    // there is no probe here to run.
    return undefined;
  }
  const nativeToFixed = original.value as PageCall;
  const observations: ScopedToFixedObservation[] = [];
  const wrapper: PageCall = function observedNumberToFixed(
    this: unknown,
    ...args: unknown[]
  ): unknown {
    const digits = args[0];
    const text = Reflect.apply(nativeToFixed, this, args);
    if (typeof text === "string" && typeof digits === "number") {
      let receiver: number;
      try {
        receiver = Number(this);
      } catch {
        receiver = Number.NaN;
      }
      observations.push(Object.freeze({ receiver, digits, text }));
    }
    return text;
  };
  scopedToFixedProbeInFlight = true;
  let unusable = false;
  try {
    Reflect.apply(defineProperty as PageCall, objectConstructor, [
      numberPrototype,
      "toFixed",
      { ...original, value: wrapper },
    ]);
    read(observations);
  } catch {
    unusable = true;
  }
  // Outside the protected block above rather than in a `finally`, so the way back cannot swallow a
  // result. And only while this wrapper is still the property's value: a page that reassigned
  // `toFixed` while the body ran keeps what it installed.
  if (
    Object.getOwnPropertyDescriptor(numberPrototype, "toFixed")?.value ===
    wrapper
  ) {
    try {
      Reflect.apply(defineProperty as PageCall, objectConstructor, [
        numberPrototype,
        "toFixed",
        original,
      ]);
    } catch {
      unusable = true;
    }
  }
  scopedToFixedProbeInFlight = false;
  const current = Object.getOwnPropertyDescriptor(numberPrototype, "toFixed");
  if (
    current?.configurable !== original.configurable ||
    current.enumerable !== original.enumerable ||
    current.writable !== original.writable ||
    current.value !== original.value ||
    current.get !== original.get ||
    current.set !== original.set
  ) {
    // A prototype this module cannot leave exactly as it found it has been observed by something
    // else, so nothing it saw can be attributed to the call this probe made.
    unusable = true;
  }
  return unusable ? undefined : Object.freeze(observations);
}
