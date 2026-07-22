import {
  startLegacyRuntime,
  type LegacyRuntimeSurface,
} from "../adapters/evolve/legacy-runtime.js";
import type { BrowserDiagnostics } from "../adapters/browser/diagnostics.ts";
import type { JQueryGlobal } from "../adapters/browser/jquery.ts";
import type { LegacyRuntimeEnvironment } from "../adapters/browser/legacy-runtime-environment.ts";

/**
 * Starts the userscript through the typed composition boundary.
 *
 * TRANSITIONAL: `adapters/evolve/legacy-runtime.js` still owns the untyped compatibility
 * composition. Each remaining legacy factory must migrate behind a typed
 * application or adapter contract before that module can be deleted.
 */
export function startRuntime(
  jquery: JQueryGlobal,
  diagnostics: BrowserDiagnostics,
  environment: LegacyRuntimeEnvironment,
): void {
  startLegacyRuntime(jquery, diagnostics, environment, false);
}

/**
 * Starts the legacy runtime for bundled characterization only.
 *
 * This entry point is intentionally separate from production startup so the
 * mutable characterization surface cannot be exposed by the userscript root.
 */
export function startRuntimeForTests(
  jquery: JQueryGlobal,
  diagnostics: BrowserDiagnostics,
  environment: LegacyRuntimeEnvironment,
): LegacyRuntimeSurface {
  return startLegacyRuntime(jquery, diagnostics, environment, true);
}
