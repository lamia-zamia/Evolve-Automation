import assert from "node:assert/strict";

import { createSortHelper } from "../src/ui/sort-helper.ts";

const source = {
  isElement: true,
  childNodes: [{ offsetWidth: 5, offsetHeight: 6, style: {} }],
};
const css = [];
const helper = createSortHelper({
  getJQuery: () => (input) => {
    const node = input.isElement ? input : input[0];
    return {
      0: node,
      clone: () => ({
        0: { childNodes: node.childNodes.map(() => ({ style: {} })) },
        css: (...args) => css.push(args),
      }),
      css() {},
    };
  },
  isHTMLElement: (value) => value.isElement === true,
});

const direct = helper.sorterHelper({}, source);
assert.deepEqual(direct.childNodes[0].style, {
  width: "5px",
  height: "6px",
});
source.childNodes[0].offsetWidth = 9;
const wrapped = helper.sorterHelper({}, { 0: source });
assert.equal(wrapped.childNodes[0].style.width, "9px");
assert.deepEqual(css, [
  ["position", "absolute"],
  ["position", "absolute"],
]);

console.log("Sort helper module tests passed");
