import { createBrowserDiagnostics } from "../src/adapters/browser/diagnostics.ts";
import { readJQueryGlobal } from "../src/adapters/browser/jquery.ts";
import { createLegacyRuntimeEnvironment } from "../src/adapters/browser/legacy-runtime-environment.ts";
import { readTestHooks } from "../src/adapters/userscript/test-hooks.ts";
import { startLegacyRuntime } from "../src/legacy-main.js";

startLegacyRuntime(
  readJQueryGlobal(globalThis),
  createBrowserDiagnostics(globalThis),
  createLegacyRuntimeEnvironment(globalThis),
  readTestHooks(globalThis),
);
