import { createBrowserDiagnostics } from "./adapters/browser/diagnostics.ts";
import { createLegacyRuntimeEnvironment } from "./adapters/browser/legacy-runtime-environment.ts";
import { whenDocumentReady } from "./adapters/browser/document-ready.ts";
import { installPageCapture } from "./adapters/evolve/page-capture.ts";
import { createUserscriptEnvironment } from "./adapters/userscript/environment.ts";
import { startCapturedRuntime } from "./bootstrap/captured-runtime-control.ts";

// Must happen at document-start, before the page's Vue script and the game module run.
const settingsHostWindow = createUserscriptEnvironment(globalThis).pageWindow;
const pageCapture = installPageCapture(settingsHostWindow);

whenDocumentReady(globalThis, () => {
  const environment = createLegacyRuntimeEnvironment(globalThis);
  startCapturedRuntime({
    pageCapture,
    settingsHostWindow,
    document: environment.document,
    keyboardEvent: environment.KeyboardEvent,
    mouseEvent: environment.MouseEvent,
    storage: environment.storage,
    diagnostics: createBrowserDiagnostics(globalThis),
    log: environment.log,
    logError: environment.error,
  });
});
