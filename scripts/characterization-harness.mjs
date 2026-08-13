import { readFile } from "node:fs/promises";
import vm from "node:vm";

const bundlePath = "evolve_automation.user.js";

function defaultMutationObserver() {
  return class {
    observe() {}
    disconnect() {}
  };
}

/**
 * Load the generated userscript with the minimum browser surface shared by
 * characterization tests. Feature tests extend this with their own DOM and
 * jQuery behavior instead of duplicating the bundle boundary.
 */
export async function loadCharacterizationBundle(
  overrides = {},
  { useContext = false } = {},
) {
  const hooks = {};
  const sandbox = {
    __EA_TEST_HOOKS__: hooks,
    console,
    localStorage: { getItem: () => null },
    MutationObserver: defaultMutationObserver(),
    navigator: { platform: "Win32" },
    setTimeout,
    clearTimeout,
    structuredClone,
    $: () => ({ ready() {} }),
    ...overrides,
  };
  sandbox.window = sandbox;
  sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

  const source = await readFile(bundlePath, "utf8");
  const context = useContext ? vm.createContext(sandbox) : undefined;
  const runOptions = {
    filename: bundlePath,
    timeout: 10_000,
  };
  if (context) {
    vm.runInContext(source, context, runOptions);
  } else {
    vm.runInNewContext(source, sandbox, runOptions);
  }

  return { context, hooks, sandbox };
}
