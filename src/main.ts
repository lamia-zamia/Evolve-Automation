import { readJQueryGlobal } from "./adapters/browser/jquery.ts";
import { startLegacyRuntime } from "./legacy-main.js";

startLegacyRuntime(readJQueryGlobal(globalThis));
