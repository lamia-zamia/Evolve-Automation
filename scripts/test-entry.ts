import { createBrowserDiagnostics } from "../src/adapters/browser/diagnostics.ts";
import { startLegacyRuntime } from "../src/adapters/evolve/legacy-runtime.js";
import { readJQueryGlobal } from "../src/adapters/browser/jquery.ts";
import { createLegacyRuntimeEnvironment } from "../src/adapters/browser/legacy-runtime-environment.ts";
import { readTestHooks } from "../src/adapters/userscript/test-hooks.ts";

const runtimeTestSurface = startLegacyRuntime(
  readJQueryGlobal(globalThis),
  createBrowserDiagnostics(globalThis),
  createLegacyRuntimeEnvironment(globalThis),
  true,
);
const testHooks = readTestHooks(globalThis);
if (testHooks) Object.assign(testHooks, runtimeTestSurface);
