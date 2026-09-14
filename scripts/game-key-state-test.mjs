import assert from "node:assert/strict";

import { createGameKeyStateCapture } from "../src/adapters/browser/game-key-state.ts";

const listeners = new Map();
const documentStub = {
  addEventListener(type, listener, options) {
    listeners.set(type, { listener, options });
  },
  removeEventListener(type, listener, options) {
    const current = listeners.get(type);
    assert.equal(current?.listener, listener);
    assert.equal(current?.options, options);
    listeners.delete(type);
  },
  dispatch(type, event) {
    listeners.get(type)?.listener(event);
  },
};

const capture = createGameKeyStateCapture(() => documentStub);
assert.equal(capture.readPressed("q"), false);
assert.equal(capture.readPressed(81), false);
documentStub.dispatch("keydown", { key: "q", keyCode: 81 });
assert.equal(capture.readPressed("q"), true);
assert.equal(capture.readPressed(81), true);
documentStub.dispatch("keyup", { key: "q", keyCode: 81 });
assert.equal(capture.readPressed("q"), false);
assert.equal(capture.readPressed(81), false);

documentStub.dispatch("keydown", { key: "a", keyCode: 65 });
documentStub.dispatch("mousemove", {
  shiftKey: true,
  ctrlKey: true,
  altKey: true,
  metaKey: true,
});
for (const key of ["Shift", 16, "Control", 17, "Alt", 18, "Meta", 91]) {
  assert.equal(
    capture.readPressed(key),
    true,
    `modifier should be pressed: ${key}`,
  );
}
assert.equal(capture.readPressed("a"), true);
documentStub.dispatch("mousemove", {
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
});
for (const key of ["Shift", 16, "Control", 17, "Alt", 18, "Meta", 91]) {
  assert.equal(
    capture.readPressed(key),
    false,
    `modifier should be released: ${key}`,
  );
}
assert.equal(capture.readPressed("a"), true);

capture.uninstall();
assert.equal(listeners.size, 0);
documentStub.dispatch("keydown", { key: "q", keyCode: 81 });
assert.equal(capture.readPressed("q"), false);
capture.uninstall();

const unavailable = createGameKeyStateCapture(() => ({}));
assert.equal(unavailable.readPressed("q"), undefined);
assert.doesNotThrow(() => unavailable.uninstall());

console.log("game-key-state ok");
