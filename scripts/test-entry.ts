import { createBrowserDiagnostics } from "../src/adapters/browser/diagnostics.ts";
import { readJQueryGlobal } from "../src/adapters/browser/jquery.ts";
import { createLegacyRuntimeEnvironment } from "../src/adapters/browser/legacy-runtime-environment.ts";
import { readTestHooks } from "../src/adapters/userscript/test-hooks.ts";
import { startRuntime } from "../src/bootstrap/runtime.js";

const runtimeTestSurface = startRuntime(
  readJQueryGlobal(globalThis),
  createBrowserDiagnostics(globalThis),
  createLegacyRuntimeEnvironment(globalThis),
);
const testHooks = readTestHooks(globalThis);
if (testHooks) Object.assign(testHooks, runtimeTestSurface);
