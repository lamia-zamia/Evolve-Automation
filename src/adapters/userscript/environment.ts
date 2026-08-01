import { isRecord } from "../validation.ts";

declare const unsafeWindow: unknown;
declare const cloneInto: unknown;
declare const exportFunction: unknown;
declare const GM_info: unknown;
declare const GM: unknown;

type BridgeFunction = (this: unknown, ...args: unknown[]) => unknown;

export interface UserscriptGlobals {
  readonly unsafeWindow: unknown | undefined;
  readonly cloneInto: unknown | undefined;
  readonly exportFunction: unknown | undefined;
  readonly gmInfo: unknown | undefined;
  readonly gm: unknown | undefined;
}

export interface UserscriptCapabilities {
  readonly hasPageWindow: boolean;
  readonly canCloneIntoPage: boolean;
  readonly canExportToPage: boolean;
  readonly needsSandboxBridge: boolean;
}

export interface UserscriptEnvironment {
  readonly pageWindow: unknown;
  readonly capabilities: UserscriptCapabilities;
  cloneIntoPage<T>(value: T, options?: Readonly<Record<string, unknown>>): T;
  exportToPage<T>(value: T): T;
  getScriptVersion(): string | undefined;
}

function readSafely<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

export function readAmbientUserscriptGlobals(): UserscriptGlobals {
  return Object.freeze({
    unsafeWindow: readSafely(() =>
      typeof unsafeWindow === "undefined" ? undefined : unsafeWindow,
    ),
    cloneInto: readSafely(() =>
      typeof cloneInto === "undefined" ? undefined : cloneInto,
    ),
    exportFunction: readSafely(() =>
      typeof exportFunction === "undefined" ? undefined : exportFunction,
    ),
    gmInfo: readSafely(() =>
      typeof GM_info === "undefined" ? undefined : GM_info,
    ),
    gm: readSafely(() => (typeof GM === "undefined" ? undefined : GM)),
  });
}

function asBridge(value: unknown): BridgeFunction | undefined {
  // This cast is confined to the adapter edge after runtime validation and never escapes.
  return typeof value === "function" ? (value as BridgeFunction) : undefined;
}

function readVersion(info: unknown): string | undefined {
  if (!isRecord(info)) return undefined;
  const script = info["script"];
  if (!isRecord(script)) return undefined;
  const version = script["version"];
  return typeof version === "string" && version.length > 0
    ? version
    : undefined;
}

export function createUserscriptEnvironment(
  browserWindow: unknown,
  globals: UserscriptGlobals = readAmbientUserscriptGlobals(),
): UserscriptEnvironment {
  const candidatePageWindow = readSafely(() => globals.unsafeWindow);
  const pageWindow = isRecord(candidatePageWindow)
    ? candidatePageWindow
    : browserWindow;
  const cloneBridge = asBridge(readSafely(() => globals.cloneInto));
  const exportBridge = asBridge(readSafely(() => globals.exportFunction));
  const needsSandboxBridge =
    pageWindow !== browserWindow &&
    cloneBridge !== undefined &&
    exportBridge !== undefined;
  const capabilities: UserscriptCapabilities = Object.freeze({
    hasPageWindow: pageWindow !== browserWindow,
    canCloneIntoPage: cloneBridge !== undefined,
    canExportToPage: exportBridge !== undefined,
    needsSandboxBridge,
  });

  function cloneIntoPage<T>(
    value: T,
    options?: Readonly<Record<string, unknown>>,
  ): T {
    if (!needsSandboxBridge || cloneBridge === undefined) return value;
    const cloned = Reflect.apply(cloneBridge, undefined, [
      value,
      pageWindow,
      options,
    ]);
    // Userscript managers do not provide a runtime schema for cloned values. Keep the assertion
    // inside this adapter so untyped bridge output cannot spread through the application.
    return cloned as T;
  }

  function exportToPage<T>(value: T): T {
    if (!needsSandboxBridge || exportBridge === undefined) return value;
    const exported = Reflect.apply(exportBridge, undefined, [
      value,
      pageWindow,
    ]);
    return exported as T;
  }

  function getScriptVersion(): string | undefined {
    return readSafely(() => {
      const directInfo = globals.gmInfo;
      if (directInfo !== undefined) return readVersion(directInfo);
      const gm = globals.gm;
      return isRecord(gm) ? readVersion(gm["info"]) : undefined;
    });
  }

  return Object.freeze({
    pageWindow,
    capabilities,
    cloneIntoPage,
    exportToPage,
    getScriptVersion,
  });
}
