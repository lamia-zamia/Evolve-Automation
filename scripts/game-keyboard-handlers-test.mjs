import assert from "node:assert/strict";
import { createGameKeyboardHandlers } from "../src/adapters/browser/game-keyboard-handlers.ts";

const dispatched = [];
class KeyboardEventStub {
  constructor(type, init) {
    this.type = type;
    Object.assign(this, init);
  }
}
const documentStub = {
  dispatchEvent: (event) => dispatched.push(event),
};

const handlers = createGameKeyboardHandlers({
  getDocument: () => documentStub,
  getKeyboardEvent: () => KeyboardEventStub,
});

// The game keeps its listeners natively at 1.5.0, so a real event on the document is the only way
// to reach them and there is no combined modifier binding left to replay.
const keyboard = handlers.readGameKeyboardHandlers();
assert.equal(keyboard.moveAll, null);
keyboard.keyDown({ key: "Shift" });
keyboard.keyUp({ key: "Shift" });
assert.equal(dispatched.length, 2);
assert.equal(dispatched[0].type, "keydown");
assert.equal(dispatched[0].key, "Shift");
assert.equal(dispatched[1].type, "keyup");
assert.equal(dispatched[1].key, "Shift");

// The bindings are resolved per call rather than cached, so a document swapped in later is the one
// that receives the events.
const laterDispatched = [];
const swapped = createGameKeyboardHandlers({
  getDocument: () => ({
    dispatchEvent: (event) => laterDispatched.push(event),
  }),
  getKeyboardEvent: () => KeyboardEventStub,
});
swapped.readGameKeyboardHandlers().keyDown({ key: "Alt" });
assert.equal(laterDispatched.length, 1);
assert.equal(laterDispatched[0].key, "Alt");

// A page that exposes no dispatcher, and one with no KeyboardEvent, stay quiet rather than throw.
{
  const quiet = createGameKeyboardHandlers({
    getDocument: () => ({}),
    getKeyboardEvent: () => KeyboardEventStub,
  });
  assert.doesNotThrow(() =>
    quiet.readGameKeyboardHandlers().keyDown({ key: "Control" }),
  );
  const unconstructable = createGameKeyboardHandlers({
    getDocument: () => documentStub,
    getKeyboardEvent: () => undefined,
  });
  assert.doesNotThrow(() =>
    unconstructable.readGameKeyboardHandlers().keyUp({ key: "Control" }),
  );
  assert.equal(dispatched.length, 2);
}

console.log("Game keyboard handlers tests passed");
