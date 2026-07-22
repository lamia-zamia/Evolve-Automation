import type { BrowserDiagnostics } from "./adapters/browser/diagnostics.ts";
import type { JQueryGlobal } from "./adapters/browser/jquery.ts";
import type { LegacyRuntimeEnvironment } from "./adapters/browser/legacy-runtime-environment.ts";

export type LegacyRuntimeSurface = Record<string, unknown>;

export declare function startLegacyRuntime(
  jquery: JQueryGlobal,
  diagnostics: BrowserDiagnostics,
  environment: LegacyRuntimeEnvironment,
): LegacyRuntimeSurface;
