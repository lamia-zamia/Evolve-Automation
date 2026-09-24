import { readProperty } from "../validation.ts";

type CapturedBrowserFunction = (...args: unknown[]) => unknown;

export interface CapturedRuntimeBrowserEnvironment {
  readonly document: unknown;
  readonly keyboardEvent: unknown;
  readonly mouseEvent: unknown;
  readonly storage: unknown;
  readonly log: CapturedBrowserFunction;
  readonly logError: CapturedBrowserFunction;
}

function bindCapturedBrowserFunction(
  owner: unknown,
  key: PropertyKey,
  fallback: CapturedBrowserFunction,
): CapturedBrowserFunction {
  const candidate = readProperty(owner, key);
  return typeof candidate === "function"
    ? (...args) => Reflect.apply(candidate, owner, args)
    : fallback;
}

const noCapturedBrowserLog: CapturedBrowserFunction = () => undefined;

export function createCapturedRuntimeBrowserEnvironment(
  globalObject: unknown,
): CapturedRuntimeBrowserEnvironment {
  const consoleObject = readProperty(globalObject, "console");

  return Object.freeze({
    document: readProperty(globalObject, "document"),
    keyboardEvent: readProperty(globalObject, "KeyboardEvent"),
    mouseEvent: readProperty(globalObject, "MouseEvent"),
    storage: readProperty(globalObject, "localStorage"),
    log: bindCapturedBrowserFunction(
      consoleObject,
      "log",
      noCapturedBrowserLog,
    ),
    logError: bindCapturedBrowserFunction(
      consoleObject,
      "error",
      noCapturedBrowserLog,
    ),
  });
}
