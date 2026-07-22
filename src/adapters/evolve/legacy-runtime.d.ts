import type { BrowserDiagnostics } from "../browser/diagnostics.ts";
import type { JQueryGlobal } from "../browser/jquery.ts";
import type { LegacyRuntimeEnvironment } from "../browser/legacy-runtime-environment.ts";

export type LegacyRuntimeSurface = Record<string, unknown>;

export declare function startLegacyRuntime(
  jquery: JQueryGlobal,
  diagnostics: BrowserDiagnostics,
  environment: LegacyRuntimeEnvironment,
  captureTestSurface?: boolean,
): LegacyRuntimeSurface;
