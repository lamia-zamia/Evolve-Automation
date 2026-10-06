/** Numeric replacements in one native localization template's synchronous chain. */
import { readProperty } from "../validation.ts";

type PageCall = (this: unknown, ...args: unknown[]) => unknown;
let localizedNumberProbeInFlight = false;

export function probeScopedLocalizedNumbers(
  pageWindow: unknown,
  template: string,
  read: () => void,
): readonly number[] | undefined {
  if (localizedNumberProbeInFlight || !template.includes("%")) return undefined;
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
  let chain: string | undefined;
  let starts = 0;
  let ambiguous = false;
  const wrapper: PageCall = function observedLocalizedNumber(
    ...args: unknown[]
  ) {
    const input = String(this);
    const output = Reflect.apply(original, this, args);
    let pattern: unknown;
    try {
      pattern = readProperty(args[0], "source");
    } catch {
      pattern = undefined;
    }
    if (typeof pattern !== "string" || !/^%(\d+)\(\?!\\d\)/u.test(pattern))
      return output;
    const index = Number(/^%(\d+)/u.exec(pattern)?.[1]);
    if (input === template) {
      starts++;
      if (starts > 1) ambiguous = true;
      chain = template;
    }
    if (chain !== undefined && input === chain && !ambiguous) {
      if (
        typeof output !== "string" ||
        !Number.isSafeInteger(index) ||
        (numbers[index] !== undefined && numbers[index] !== args[1])
      )
        ambiguous = true;
      else {
        if (typeof args[1] === "number") numbers[index] = args[1];
        chain = output;
      }
    }
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
  return invalid || ambiguous || starts !== 1
    ? undefined
    : Object.freeze(numbers);
}
