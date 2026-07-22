import { readJQueryGlobal } from "./adapters/browser/jquery.ts";
import { readTestHooks } from "./adapters/userscript/test-hooks.ts";
import { startLegacyRuntime } from "./legacy-main.js";

startLegacyRuntime(readJQueryGlobal(globalThis), readTestHooks(globalThis));
