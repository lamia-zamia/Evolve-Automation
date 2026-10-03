import { readProperty } from "../validation.ts";

type ScopedKeysCall = (this: unknown, ...args: unknown[]) => unknown;

// Guards the shared page property across adapter instances, only during synchronous probes.
const scopedKeysOwners = new WeakSet<object>();

/** Observe arguments only; the original call, receiver, arguments and answer pass through intact. */
export function observeScopedObjectKeys(
  pageWindow: unknown,
  inspect: (argument: unknown) => void,
  draw: () => void,
): boolean {
  const owner = readProperty(pageWindow, "Object");
  if (
    (typeof owner !== "function" && typeof owner !== "object") ||
    owner === null
  )
    return false;
  if (scopedKeysOwners.has(owner)) return false;
  scopedKeysOwners.add(owner);
  let original: PropertyDescriptor | undefined;
  let keysWrapper: ScopedKeysCall | undefined;
  let keysScopeSucceeded = true;
  try {
    original = Object.getOwnPropertyDescriptor(owner, "keys");
    if (original?.configurable !== true || typeof original.value !== "function")
      return false;
    const originalKeys = original.value as ScopedKeysCall;
    keysWrapper = function observedSpaceKeys(
      this: unknown,
      ...args: unknown[]
    ) {
      const answer = Reflect.apply(originalKeys, this, args);
      inspect(args[0]);
      return answer;
    };
    Object.defineProperty(owner, "keys", { ...original, value: keysWrapper });
    draw();
  } catch {
    keysScopeSucceeded = false;
  } finally {
    try {
      if (
        keysWrapper !== undefined &&
        Object.getOwnPropertyDescriptor(owner, "keys")?.value === keysWrapper
      )
        Object.defineProperty(owner, "keys", original!);
      const restored = Object.getOwnPropertyDescriptor(owner, "keys");
      if (
        original === undefined ||
        restored?.value !== original.value ||
        restored?.writable !== original.writable ||
        restored?.enumerable !== original.enumerable ||
        restored?.configurable !== original.configurable ||
        restored?.get !== original.get ||
        restored?.set !== original.set
      )
        keysScopeSucceeded = false;
    } catch {
      keysScopeSucceeded = false;
    } finally {
      scopedKeysOwners.delete(owner);
    }
  }
  return keysScopeSucceeded;
}
