import { createBrowserDiagnostics } from "../src/adapters/browser/diagnostics.ts";
import { startEvolveRuntimeForTests } from "../src/adapters/evolve/evolve-runtime-test.js";
import {
  createBrowserDomQuery,
  type DomQuery,
} from "../src/adapters/browser/dom.ts";
import { createLegacyRuntimeEnvironment } from "../src/adapters/browser/legacy-runtime-environment.ts";
import { readTestHooks } from "../src/adapters/userscript/test-hooks.ts";

/**
 * The DOM helper the characterization run drives the script with.
 *
 * A characterization test observes what the script asks the page for, so it installs its own
 * recording `$` on the sandbox and asserts against that. This entry point is bundled only for those
 * tests — production's `src/main.ts` always builds the real helper — so honouring a sandbox `$` here
 * keeps that seam out of the shipped script. `scripts/dom-test.mjs` covers the real
 * helper on its own.
 */
function readDomQuery(): DomQuery {
  const injected = (globalThis as Record<string, unknown>)["$"];
  return typeof injected === "function"
    ? (injected as DomQuery)
    : createBrowserDomQuery(globalThis);
}

const characterizationSurface = startEvolveRuntimeForTests(
  readDomQuery(),
  createBrowserDiagnostics(globalThis),
  createLegacyRuntimeEnvironment(globalThis),
);
const testHooks = readTestHooks(globalThis);
if (testHooks) Object.assign(testHooks, characterizationSurface);
