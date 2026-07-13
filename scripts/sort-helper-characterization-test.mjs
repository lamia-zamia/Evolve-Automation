import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const cssCalls = [];
class TestElement {
  constructor(childNodes = []) {
    this.childNodes = childNodes;
  }
}
const makeClone = (source) => {
  const original = source instanceof TestElement ? source : source[0];
  const cloneNode = new TestElement(
    original.childNodes.map(() => ({ style: {} })),
  );
  return {
    0: cloneNode,
    css: (...args) => cssCalls.push(args),
  };
};
const jquery = (value) => ({
  ready() {},
  clone: () => makeClone(value),
});
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console,
  HTMLElement: TestElement,
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

assert.equal(typeof hooks.sorterHelper, "function");
const sourceNode = new TestElement([
  { offsetWidth: 12, offsetHeight: 34 },
  { offsetWidth: 0, offsetHeight: 20 },
  { offsetWidth: 9, offsetHeight: 8 },
]);
const clone = hooks.sorterHelper({}, sourceNode);
assert.deepEqual(cssCalls, [["position", "absolute"]]);
assert.deepEqual(clone.childNodes[0].style, {
  width: "12px",
  height: "34px",
});
assert.deepEqual(clone.childNodes[1].style, {});
assert.deepEqual(clone.childNodes[2].style, {
  width: "9px",
  height: "8px",
});

cssCalls.length = 0;
const wrappedClone = hooks.sorterHelper({}, { 0: sourceNode });
assert.deepEqual(cssCalls, [["position", "absolute"]]);
assert.equal(wrappedClone.childNodes[0].style.width, "12px");

console.log("Sort helper bundled characterization tests passed");
