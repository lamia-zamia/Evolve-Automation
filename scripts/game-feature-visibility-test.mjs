import assert from "node:assert/strict";
import { createGameFeatureVisibility } from "../src/adapters/browser/game-feature-visibility.ts";

let elements = {};
const queried = [];
const visibility = createGameFeatureVisibility({
  getDocument: () => ({
    querySelector: (selector) => {
      queried.push(selector);
      return elements[selector] ?? null;
    },
  }),
});

// An absent element is not visible, so no caller has to guard the read.
elements = {};
assert.equal(visibility.isVisible("#govType"), false);
assert.deepEqual(queried, ["#govType"]);

// The selector reaches the document verbatim.
queried.length = 0;
elements["#gov0 div span:nth-child(3)"] = { style: { display: "block" } };
assert.equal(visibility.isVisible("#gov0 div span:nth-child(3)"), true);
assert.deepEqual(queried, ["#gov0 div span:nth-child(3)"]);

// `v-show` hides a feature with an inline display style.
elements["#govType"] = { style: { display: "none" } };
assert.equal(visibility.isVisible("#govType"), false);
elements["#govType"] = { style: { display: "block" } };
assert.equal(visibility.isVisible("#govType"), true);
elements["#govType"] = { style: { display: "" } };
assert.equal(visibility.isVisible("#govType"), true);

// The evolution actions hide themselves with a class instead.
elements["#evolution-bilateral_symmetry"] = {
  classList: { contains: (token) => token === "is-hidden" },
};
assert.equal(visibility.isVisible("#evolution-bilateral_symmetry"), false);
elements["#evolution-bilateral_symmetry"] = {
  classList: { contains: () => false },
};
assert.equal(visibility.isVisible("#evolution-bilateral_symmetry"), true);

// Either mechanism alone hides the element, and both together still hide it.
elements["#both"] = {
  style: { display: "none" },
  classList: { contains: () => true },
};
assert.equal(visibility.isVisible("#both"), false);
elements["#both"] = {
  style: { display: "block" },
  classList: { contains: () => true },
};
assert.equal(visibility.isVisible("#both"), false);
elements["#both"] = {
  style: { display: "none" },
  classList: { contains: () => false },
};
assert.equal(visibility.isVisible("#both"), false);
elements["#both"] = {
  style: { display: "block" },
  classList: { contains: () => false },
};
assert.equal(visibility.isVisible("#both"), true);

// Another class on the element is not the hiding one.
elements["#classy"] = {
  classList: { contains: (token) => token === "has-text-caution" },
};
assert.equal(visibility.isVisible("#classy"), true);

// A control the game renders without either mechanism — the market's buy and
// sell orders — is visible whenever it exists at all.
elements["#market-Iron .order"] = {};
assert.equal(visibility.isVisible("#market-Iron .order"), true);
assert.equal(visibility.isVisible("#market-Copper .order"), false);

// A `querySelector` that answers `undefined` rather than `null` is still absent.
assert.equal(
  createGameFeatureVisibility({
    getDocument: () => ({ querySelector: () => undefined }),
  }).isVisible("#govType"),
  false,
);

// The document is read per call, so a page that mounts the feature later sees it.
const lateElements = {};
const lateVisibility = createGameFeatureVisibility({
  getDocument: () => ({
    querySelector: (selector) => lateElements[selector] ?? null,
  }),
});
assert.equal(lateVisibility.isVisible("#govType"), false);
lateElements["#govType"] = { style: { display: "block" } };
assert.equal(lateVisibility.isVisible("#govType"), true);

console.log("Game feature visibility adapter tests passed");
