import assert from "node:assert/strict";

import { createGameKeyStateCapture } from "../../../src/adapters/browser/game-key-state.ts";

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
assert.equal(unavailable.readMultiplierLatch("x10"), undefined);
assert.doesNotThrow(() => unavailable.uninstall());

// The multiplier latch is a fold over the same stream, answering what pinned `vars.js:keyMultiplier`
// will read rather than what is physically down. Without a settings authority it answers nothing.
{
  const authorityless = createGameKeyStateCapture(() => documentStub);
  documentStub.dispatch("keydown", { key: "x", keyCode: 88 });
  assert.equal(authorityless.readMultiplierLatch("x10"), undefined);
  authorityless.uninstall();
}

// A latch is unknown until an event has been compared against a real mapping, then follows the three
// pinned `main.js` rules over the mapping as configured at that moment.
{
  let settings = { keyMap: { x10: "x", x25: 17, x100: 88 } };
  let root = { settings };
  const rootListeners = new Set();
  const latch = createGameKeyStateCapture(() => documentStub, {
    roots: {
      readRoot: () => root,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: (listener) => {
        rootListeners.add(listener);
        return () => rootListeners.delete(listener);
      },
    },
    readMultiplierMapping: (name) => {
      const configured = root.settings.keyMap[name];
      return typeof configured === "string" || typeof configured === "number"
        ? configured
        : undefined;
    },
  });
  const send = (type, properties) => documentStub.dispatch(type, properties);
  const noModifiers = {
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
  };

  assert.equal(
    latch.readMultiplierLatch("x10"),
    undefined,
    "no answer before an event",
  );
  send("mousemove", noModifiers);
  for (const name of ["x10", "x25", "x100"])
    assert.equal(
      latch.readMultiplierLatch(name),
      false,
      `${name} starts clear`,
    );

  // A named keydown never matches a numeric mapping: `e.key || e.keyCode` is one value.
  send("keydown", { key: "x", keyCode: 88 });
  assert.equal(latch.readMultiplierLatch("x10"), true);
  assert.equal(latch.readMultiplierLatch("x100"), false);
  send("keyup", { key: "x", keyCode: 88 });
  assert.equal(latch.readMultiplierLatch("x10"), false);

  // Modifiers are set and cleared by mousemove alone, under their numeric alias as well.
  send("mousemove", { ...noModifiers, ctrlKey: true });
  assert.equal(latch.readMultiplierLatch("x25"), true);
  send("mousemove", noModifiers);
  assert.equal(latch.readMultiplierLatch("x25"), false);
  send("keydown", { key: "", keyCode: 88 });
  assert.equal(latch.readMultiplierLatch("x100"), true);
  send("keyup", { key: "", keyCode: 88 });
  assert.equal(latch.readMultiplierLatch("x100"), false);

  // A mapping changed while its key is down keeps the latch set, exactly as upstream does: its keyup
  // compares against the mapping current at that moment and matches nothing.
  send("keydown", { key: "x", keyCode: 88 });
  settings = { ...settings, keyMap: { ...settings.keyMap, x10: "z" } };
  root = { settings };
  send("keyup", { key: "x", keyCode: 88 });
  assert.equal(latch.readPressed("x"), false, "the key really is up");
  assert.equal(latch.readMultiplierLatch("x10"), true, "the latch is not");
  send("keydown", { key: "z", keyCode: 90 });
  send("keyup", { key: "z", keyCode: 90 });
  assert.equal(latch.readMultiplierLatch("x10"), false);

  // A different captured root is not the root the fold was derived from; the same object re-wrapped is.
  root = { settings: { keyMap: { x10: "y", x25: 17, x100: 88 } } };
  for (const listener of rootListeners) listener();
  for (const name of ["x10", "x25", "x100"])
    assert.equal(
      latch.readMultiplierLatch(name),
      undefined,
      `${name} unknown again`,
    );
  send("keydown", { key: "y", keyCode: 89 });
  assert.equal(latch.readMultiplierLatch("x10"), true);
  const rewrapped = root;
  for (const listener of rootListeners) listener();
  assert.equal(
    latch.readMultiplierLatch("x10"),
    true,
    "re-wrapping the same root keeps the latch",
  );
  root = { ...rewrapped };
  for (const listener of rootListeners) listener();
  assert.equal(
    latch.readMultiplierLatch("x10"),
    undefined,
    "a different object is a different root",
  );
  latch.uninstall();
  assert.equal(latch.readMultiplierLatch("x10"), undefined);
}

console.log("game-key-state ok");
