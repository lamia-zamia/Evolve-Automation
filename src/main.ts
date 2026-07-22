import { createBrowserDiagnostics } from "./adapters/browser/diagnostics.ts";
import { startEvolveRuntime } from "./adapters/evolve/legacy-runtime.js";
import { readJQueryGlobal } from "./adapters/browser/jquery.ts";
import { createLegacyRuntimeEnvironment } from "./adapters/browser/legacy-runtime-environment.ts";

startEvolveRuntime(
  readJQueryGlobal(globalThis),
  createBrowserDiagnostics(globalThis),
  createLegacyRuntimeEnvironment(globalThis),
);
