import type { BrowserDiagnostics } from "../browser/diagnostics.ts";
import type { DomQuery } from "../browser/dom.ts";
import type { LegacyRuntimeEnvironment } from "../browser/legacy-runtime-environment.ts";

export type EvolveCharacterizationSurface = Record<string, unknown>;

export declare function startEvolveRuntimeForTests(
  dom: DomQuery,
  diagnostics: BrowserDiagnostics,
  environment: LegacyRuntimeEnvironment,
): EvolveCharacterizationSurface;
