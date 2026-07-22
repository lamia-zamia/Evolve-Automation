import { createBrowserDiagnostics } from "./adapters/browser/diagnostics.ts";
import { readJQueryGlobal } from "./adapters/browser/jquery.ts";
import { startLegacyRuntime } from "./legacy-main.js";

startLegacyRuntime(
  readJQueryGlobal(globalThis),
  createBrowserDiagnostics(globalThis),
);
