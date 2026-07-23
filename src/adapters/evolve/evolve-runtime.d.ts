import type { BrowserDiagnostics } from "../browser/diagnostics.ts";
import type { JQueryGlobal } from "../browser/jquery.ts";
import type { LegacyRuntimeEnvironment } from "../browser/legacy-runtime-environment.ts";

export type EvolveCharacterizationSurface = Record<string, unknown>;

/**
 * Evolve compatibility composition boundary. The current Vue 2 integration is
 * intentionally dynamic at this external adapter edge; typed domain and
 * application contracts do not escape into the game surface. Production and
 * characterization entry points are deliberately separate so test-only
 * mutable surfaces cannot enter the userscript root.
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
): EvolveCharacterizationSurface;
