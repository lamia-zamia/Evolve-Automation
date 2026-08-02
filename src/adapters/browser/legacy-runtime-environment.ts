import { readProperty } from "../validation.ts";

type RuntimeFunction = (...args: unknown[]) => unknown;

export interface RuntimeUrlApi {
  readonly createObjectURL: (blob: unknown) => string;
  readonly revokeObjectURL: (url: string) => void;
}

export type RuntimeBlobConstructor = new (parts: string[]) => unknown;

export interface LegacyRuntimeEnvironment {
  readonly document: unknown;
  readonly window: unknown;
  readonly storage: unknown;
  readonly createDate: () => Date;
  readonly urlApi: RuntimeUrlApi;
  readonly BlobConstructor: RuntimeBlobConstructor;
  readonly schedule: RuntimeFunction;
  readonly repeat: RuntimeFunction;
  readonly MutationObserver: unknown;
  readonly ResizeObserver: unknown;
  readonly HTMLElement: unknown;
  readonly KeyboardEvent: unknown;
  readonly Node: unknown;
  readonly Sortable: unknown;
  readonly alert: RuntimeFunction;
  readonly confirm: RuntimeFunction;
  readonly log: RuntimeFunction;
  readonly error: RuntimeFunction;
}

function bindFunction(
  owner: unknown,
  key: PropertyKey,
  fallback: RuntimeFunction,
): RuntimeFunction {
  const candidate = readProperty(owner, key);
  return typeof candidate === "function"
    ? (...args) => Reflect.apply(candidate, owner, args)
    : fallback;
}

const noOperation: RuntimeFunction = () => undefined;
const confirmByDefault: RuntimeFunction = () => true;
const unavailableUrlApi: RuntimeUrlApi = Object.freeze({
  createObjectURL: () => {
    throw new Error("URL.createObjectURL is unavailable");
  },
  revokeObjectURL: () => undefined,
});
class UnavailableBlob {
  constructor(_parts: string[]) {
    throw new Error("Blob is unavailable");
  }
}

function readUrlApi(globalObject: unknown): RuntimeUrlApi {
  const candidate = readProperty(globalObject, "URL");
  const createObjectURL = readProperty(candidate, "createObjectURL");
  const revokeObjectURL = readProperty(candidate, "revokeObjectURL");
  if (
    typeof createObjectURL !== "function" ||
    typeof revokeObjectURL !== "function"
  ) {
    return unavailableUrlApi;
  }
  return Object.freeze({
    createObjectURL: (blob: unknown) =>
      Reflect.apply(createObjectURL, candidate, [blob]) as string,
    revokeObjectURL: (url: string) => {
      Reflect.apply(revokeObjectURL, candidate, [url]);
    },
  });
}

function readBlobConstructor(globalObject: unknown): RuntimeBlobConstructor {
  const candidate = readProperty(globalObject, "Blob");
  return typeof candidate === "function"
    ? (candidate as RuntimeBlobConstructor)
    : UnavailableBlob;
}

export function createLegacyRuntimeEnvironment(
  globalObject: unknown,
): LegacyRuntimeEnvironment {
  const window = readProperty(globalObject, "window") ?? globalObject;
  const document = readProperty(globalObject, "document");
  const consoleObject = readProperty(globalObject, "console");

  return Object.freeze({
    document,
    window,
    storage: readProperty(globalObject, "localStorage"),
    createDate: () => new Date(),
    urlApi: readUrlApi(globalObject),
    BlobConstructor: readBlobConstructor(globalObject),
    schedule: bindFunction(globalObject, "setTimeout", noOperation),
    repeat: bindFunction(globalObject, "setInterval", noOperation),
    MutationObserver: readProperty(globalObject, "MutationObserver"),
    ResizeObserver: readProperty(globalObject, "ResizeObserver"),
    HTMLElement: readProperty(globalObject, "HTMLElement"),
    KeyboardEvent: readProperty(globalObject, "KeyboardEvent"),
    Node: readProperty(globalObject, "Node"),
    Sortable: readProperty(globalObject, "Sortable"),
    alert: bindFunction(globalObject, "alert", noOperation),
    confirm: bindFunction(globalObject, "confirm", confirmByDefault),
    log: bindFunction(consoleObject, "log", noOperation),
    error: bindFunction(consoleObject, "error", noOperation),
  });
}
