import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const readyCallbacks = [];
const document = {
  readyState: "loading",
  addEventListener(type, callback) {
    readyCallbacks.push([type, callback]);
  },
};

const sandbox = {
  console,
  localStorage: { getItem: () => null },
  document,
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

if (
  readyCallbacks.some(
    ([type, callback]) =>
      type !== "DOMContentLoaded" || typeof callback !== "function",
  )
) {
  throw new Error("Userscript registered a legacy ready callback");
}

console.log("Userscript legacy-bootstrap smoke test passed");
