import { createBrowserDiagnostics } from "./adapters/browser/diagnostics.ts";
import { startEvolveRuntime } from "./adapters/evolve/evolve-runtime.js";
import { createBrowserDomQuery } from "./adapters/browser/dom.ts";
import { createLegacyRuntimeEnvironment } from "./adapters/browser/legacy-runtime-environment.ts";

startEvolveRuntime(
  createBrowserDomQuery(globalThis),
  createBrowserDiagnostics(globalThis),
  createLegacyRuntimeEnvironment(globalThis),
);
