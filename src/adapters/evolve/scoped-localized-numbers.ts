/** Numeric replacements made by one synchronous action effect's native localization calls. */
import { readProperty } from "../validation.ts";

type PageCall = (this: unknown, ...args: unknown[]) => unknown;
let localizedNumberProbeInFlight = false;

export function probeScopedLocalizedNumbers(
  pageWindow: unknown,
  read: () => void,
): readonly number[] | undefined {
  if (localizedNumberProbeInFlight) return undefined;
  const stringPrototype = readProperty(
    readProperty(pageWindow, "String"),
    "prototype",
  );
  const descriptor =
    stringPrototype === undefined
      ? undefined
      : Object.getOwnPropertyDescriptor(stringPrototype, "replace");
  if (
    descriptor?.configurable !== true ||
    !("value" in descriptor) ||
    typeof descriptor.value !== "function"
  )
    return undefined;
  const original = descriptor.value as PageCall;
  const numbers: number[] = [];
  const wrapper: PageCall = function observedLocalizedNumber(
    ...args: unknown[]
  ) {
    const output = Reflect.apply(original, this, args);
    let pattern: unknown;
    try {
      pattern = readProperty(args[0], "source");
    } catch {
      pattern = undefined;
    }
    if (
      typeof pattern === "string" &&
      /^%\d+\(\?!\\d\)/.test(pattern) &&
      typeof args[1] === "number"
    )
      numbers.push(args[1]);
    return output;
  };
  localizedNumberProbeInFlight = true;
  let invalid = false;
  try {
    Object.defineProperty(stringPrototype, "replace", {
      ...descriptor,
      value: wrapper,
    });
    read();
  } catch {
    invalid = true;
  }
  try {
    if (
      Object.getOwnPropertyDescriptor(stringPrototype, "replace")?.value ===
      wrapper
    )
      Object.defineProperty(stringPrototype, "replace", descriptor);
  } catch {
    invalid = true;
  }
  localizedNumberProbeInFlight = false;
  if (
    Object.getOwnPropertyDescriptor(stringPrototype, "replace")?.value !==
    original
  )
    invalid = true;
  return invalid ? undefined : Object.freeze(numbers);
}
