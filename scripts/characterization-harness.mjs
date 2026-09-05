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
 * The document the script builds its own `$` on. `readyState` is deliberately `"loading"`: the
 * script defers `mainAutoEvolveScript` until the page is ready, and a characterization test drives
 * the hooks it wants directly rather than letting the whole script start.
 */
function defaultDocument() {
  return {
    readyState: "loading",
    addEventListener() {},
    removeEventListener() {},
    createElement: () => ({ innerHTML: "", content: { childNodes: [] } }),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
    querySelector: () => null,
    querySelectorAll: () => [],
    documentElement: { scrollTop: 0 },
    body: { scrollTop: 0 },
  };
}

function fillDocument(documentStub) {
  for (const [name, value] of Object.entries(defaultDocument())) {
    if (!(name in documentStub)) documentStub[name] = value;
  }
  return documentStub;
}

/**
 * Load the generated userscript with the minimum browser surface shared by
 * characterization tests. Feature tests extend this with their own DOM
 * behavior instead of duplicating the bundle boundary.
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
    ...overrides,
    // A test that brings its own document still gets the members the bundle needs to boot. The
    // caller's object is filled in place: tests flip fields on it after loading the bundle, so a
    // merged copy would silently stop reflecting those.
    document: fillDocument(overrides.document ?? {}),
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
