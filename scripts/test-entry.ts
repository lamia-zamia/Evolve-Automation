import { createBrowserDiagnostics } from "../src/adapters/browser/diagnostics.ts";
import { startEvolveRuntimeForTests } from "../src/adapters/evolve/evolve-runtime-test.js";
import { readJQueryGlobal } from "../src/adapters/browser/jquery.ts";
import { createLegacyRuntimeEnvironment } from "../src/adapters/browser/legacy-runtime-environment.ts";
import { readTestHooks } from "../src/adapters/userscript/test-hooks.ts";

const characterizationSurface = startEvolveRuntimeForTests(
  readJQueryGlobal(globalThis),
  createBrowserDiagnostics(globalThis),
  createLegacyRuntimeEnvironment(globalThis),
);
const testHooks = readTestHooks(globalThis);
if (testHooks) Object.assign(testHooks, characterizationSurface);
