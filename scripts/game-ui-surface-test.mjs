import assert from "node:assert/strict";
import { createGameUiSurface } from "../src/adapters/browser/game-ui-surface.ts";

const inputs = {};
let hidden = false;
const documentElement = { scrollTop: 0 };
const body = { scrollTop: 0 };
let labButton = null;
const documentStub = {
  get hidden() {
    return hidden;
  },
  getElementById: (id) => inputs[id],
  querySelector: (selector) =>
    selector === "#celestialLab .create button" ? labButton : null,
  documentElement,
  body,
};

const surface = createGameUiSurface({ getDocument: () => documentStub });

// Visibility reports the document's hidden flag.
hidden = false;
assert.equal(surface.isPageVisible(), true);
hidden = true;
assert.equal(surface.isPageVisible(), false);

// A document without a hidden property is treated as visible.
hidden = undefined;
assert.equal(surface.isPageVisible(), true);

// Scroll reads the document element, or the body when it is zero.
documentElement.scrollTop = 200;
body.scrollTop = 10;
assert.equal(surface.readScrollTop(), 200);
documentElement.scrollTop = 0;
assert.equal(surface.readScrollTop(), 10);
documentElement.scrollTop = 20;
assert.equal(surface.readScrollTop(), 20);

// Reset writes both element and body.
surface.resetScrollTop(77);
assert.equal(documentElement.scrollTop, 77);
assert.equal(body.scrollTop, 77);

// The mech-stats selection reads the five ids; absent inputs read as unchanged.
inputs.script_mechStatsSpecial = { checked: true };
inputs.script_mechStatsGravity = { checked: false, value: "" };
inputs.script_mechStatsEfficient = { checked: true, value: "" };
inputs.script_mechStatsScouts = { checked: false, value: "14" };
inputs.script_mechStatsCompact = { checked: false, value: "" };
assert.deepEqual(surface.readMechStatsInputs(), {
  special: true,
  gravity: false,
  efficient: true,
  compact: false,
  scouts: "14",
});

// Absent inputs read as false / empty string, never throw.
for (const key of Object.keys(inputs)) delete inputs[key];
assert.deepEqual(surface.readMechStatsInputs(), {
  special: false,
  gravity: false,
  efficient: false,
  compact: false,
  scouts: "",
});

// The lab create button's presence gate and its click when the module decides.
let clicked = 0;
labButton = { click: () => clicked++ };
assert.equal(surface.isLabCreateAvailable(), true);
surface.clickLabCreate();
assert.equal(clicked, 1);
labButton = null;
assert.equal(surface.isLabCreateAvailable(), false);
surface.clickLabCreate();
assert.equal(clicked, 1);

// A document without querySelector or the button reports false, never throws.
const bare = createGameUiSurface({ getDocument: () => ({}) });
assert.equal(bare.isLabCreateAvailable(), false);
bare.clickLabCreate();

console.log("Game UI surface tests passed");
