import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const readyCallbacks = [];
const jquery = () => ({
  ready(callback) {
    readyCallbacks.push(callback);
  },
});

const sandbox = {
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: jquery,
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

if (readyCallbacks.length !== 1 || typeof readyCallbacks[0] !== "function") {
  throw new Error("Userscript did not register exactly one ready callback");
}

console.log("Userscript initialization smoke test passed");
