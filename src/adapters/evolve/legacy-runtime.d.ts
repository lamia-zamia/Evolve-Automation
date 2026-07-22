import type { BrowserDiagnostics } from "../browser/diagnostics.ts";
import type { JQueryGlobal } from "../browser/jquery.ts";
import type { LegacyRuntimeEnvironment } from "../browser/legacy-runtime-environment.ts";

export type LegacyRuntimeSurface = Record<string, unknown>;

/**
 * TRANSITIONAL: The current Evolve/Vue 2 composition is kept behind this
 * adapter until its remaining legacy wiring is replaced by typed application
 * composition. Production and characterization entry points are deliberately
 * separate so test-only mutable surfaces cannot enter the userscript root.
 */
export declare function startEvolveRuntime(
  jquery: JQueryGlobal,
  diagnostics: BrowserDiagnostics,
  environment: LegacyRuntimeEnvironment,
): void;

export declare function startEvolveRuntimeForTests(
  jquery: JQueryGlobal,
  diagnostics: BrowserDiagnostics,
  environment: LegacyRuntimeEnvironment,
): LegacyRuntimeSurface;
