import { createBrowserDiagnostics } from "./adapters/browser/diagnostics.ts";
import { readJQueryGlobal } from "./adapters/browser/jquery.ts";
import { createLegacyRuntimeEnvironment } from "./adapters/browser/legacy-runtime-environment.ts";
import { startRuntime } from "./bootstrap/runtime.ts";

startRuntime(
  readJQueryGlobal(globalThis),
  createBrowserDiagnostics(globalThis),
  createLegacyRuntimeEnvironment(globalThis),
);
