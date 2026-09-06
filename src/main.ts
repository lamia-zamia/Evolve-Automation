import { createBrowserDiagnostics } from "./adapters/browser/diagnostics.ts";
import { startEvolveRuntime } from "./adapters/evolve/evolve-runtime.js";
import { createBrowserDomQuery } from "./adapters/browser/dom.ts";
import { createLegacyRuntimeEnvironment } from "./adapters/browser/legacy-runtime-environment.ts";
import { whenDocumentReady } from "./adapters/browser/document-ready.ts";
import { installPageCapture } from "./adapters/evolve/page-capture.ts";
import { createUserscriptEnvironment } from "./adapters/userscript/environment.ts";

// Must happen at document-start, before the page's Vue script and the game module run.
installPageCapture(createUserscriptEnvironment(globalThis).pageWindow);

whenDocumentReady(globalThis, () => {
  startEvolveRuntime(
    createBrowserDomQuery(globalThis),
    createBrowserDiagnostics(globalThis),
    createLegacyRuntimeEnvironment(globalThis),
  );
});
