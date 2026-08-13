import type { BrowserDiagnostics } from "../browser/diagnostics.ts";
import type { JQueryGlobal } from "../browser/jquery.ts";
import type { LegacyRuntimeEnvironment } from "../browser/legacy-runtime-environment.ts";

export type EvolveCharacterizationSurface = Record<string, unknown>;

export declare function startEvolveRuntimeForTests(
  jquery: JQueryGlobal,
  diagnostics: BrowserDiagnostics,
  environment: LegacyRuntimeEnvironment,
): EvolveCharacterizationSurface;
