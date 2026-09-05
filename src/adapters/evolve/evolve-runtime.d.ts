import type { BrowserDiagnostics } from "../browser/diagnostics.ts";
import type { DomQuery } from "../browser/dom.ts";
import type { LegacyRuntimeEnvironment } from "../browser/legacy-runtime-environment.ts";

/**
 * Evolve production compatibility boundary. The current Vue 2 integration is
 * intentionally dynamic at this external adapter edge; typed domain and
 * application contracts do not escape into the game surface.
 */
export declare function startEvolveRuntime(
  dom: DomQuery,
  diagnostics: BrowserDiagnostics,
  environment: LegacyRuntimeEnvironment,
): void;
