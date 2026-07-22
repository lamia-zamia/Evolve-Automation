import type { BrowserDiagnostics } from "./adapters/browser/diagnostics.ts";
import type { JQueryGlobal } from "./adapters/browser/jquery.ts";
import type { TestHooks } from "./adapters/userscript/test-hooks.ts";

export declare function startLegacyRuntime(
  jquery: JQueryGlobal,
  testHooks: TestHooks | undefined,
  diagnostics: BrowserDiagnostics,
): void;
