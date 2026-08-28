import assert from "node:assert/strict";
import { createGameUiSurface } from "../src/adapters/browser/game-ui-surface.ts";

const inputs = {};
const listeners = [];
let hidden = false;
const documentElement = { scrollTop: 0 };
const body = { scrollTop: 0 };
let labButton = null;
const documentStub = {
  get hidden() {
    return hidden;
  },
  getElementById: (id) => inputs[id],
  addEventListener: (type, handler, options) => {
    listeners.push({ type, handler, options });
  },
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

// The first scroll read is live: the document element, or the body when it is
// zero. It also subscribes, once, to the document's own scrolling.
documentElement.scrollTop = 200;
body.scrollTop = 10;
assert.equal(surface.readScrollTop(), 200);
assert.equal(listeners.length, 1);
assert.equal(listeners[0].type, "scroll");
assert.equal(listeners[0].options.passive, true);

// Later reads answer from the cache rather than forcing another layout flush,
// so a scroll the page never reported is not observed.
documentElement.scrollTop = 999;
assert.equal(surface.readScrollTop(), 200);
assert.equal(listeners.length, 1);

// The page reporting a scroll refreshes the cache, body fallback included.
listeners[0].handler();
assert.equal(surface.readScrollTop(), 999);
documentElement.scrollTop = 0;
listeners[0].handler();
assert.equal(surface.readScrollTop(), 10);

// Reset writes both element and body, and is itself a known scroll position.
surface.resetScrollTop(77);
assert.equal(documentElement.scrollTop, 77);
assert.equal(body.scrollTop, 77);
assert.equal(surface.readScrollTop(), 77);

// A document that cannot be subscribed to still answers, from the live read.
const bareDocument = {
  documentElement: { scrollTop: 42 },
  body: { scrollTop: 0 },
};
const bareSurface = createGameUiSurface({ getDocument: () => bareDocument });
assert.equal(bareSurface.readScrollTop(), 42);

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

// Counting the script's own nodes goes through the container's class lookup,
// not a descendant selector, and reports 0 rather than throwing when the
// container, the method, or a sane length is missing.
inputs["mTabCivil"] = {
  getElementsByClassName: (className) => ({
    length: className === "ea-building-toggle" ? 51 : 0,
  }),
};
assert.equal(surface.countByClassIn("mTabCivil", "ea-building-toggle"), 51);
assert.equal(surface.countByClassIn("mTabCivil", "ea-craft-toggle"), 0);
assert.equal(surface.countByClassIn("absent", "ea-building-toggle"), 0);
inputs["noMethod"] = {};
assert.equal(surface.countByClassIn("noMethod", "ea-building-toggle"), 0);
inputs["oddLength"] = { getElementsByClassName: () => ({ length: "51" }) };
assert.equal(surface.countByClassIn("oddLength", "ea-building-toggle"), 0);
assert.equal(bare.countByClassIn("mTabCivil", "ea-building-toggle"), 0);

console.log("Game UI surface tests passed");
