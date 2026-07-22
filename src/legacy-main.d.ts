import type { BrowserDiagnostics } from "./adapters/browser/diagnostics.ts";
import type { JQueryGlobal } from "./adapters/browser/jquery.ts";
import type { LegacyRuntimeEnvironment } from "./adapters/browser/legacy-runtime-environment.ts";
import type { TestHooks } from "./adapters/userscript/test-hooks.ts";

export declare function startLegacyRuntime(
  jquery: JQueryGlobal,
  diagnostics: BrowserDiagnostics,
  environment: LegacyRuntimeEnvironment,
  testHooks?: TestHooks,
): void;
