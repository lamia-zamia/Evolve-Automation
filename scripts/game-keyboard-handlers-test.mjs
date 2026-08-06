import assert from "node:assert/strict";
import { createGameKeyboardHandlers } from "../src/adapters/browser/game-keyboard-handlers.ts";

let events;
let win;
let needBypass = false;
const cloned = [];
const dispatched = [];
const played = [];
const cloneIntoPage = (value) => {
  cloned.push(value);
  return value;
};
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
  getWin: () => win,
  getDocument: () => documentStub,
  getKeyboardEvent: () => KeyboardEventStub,
  getNeedSandboxBypass: () => needBypass,
  cloneIntoPage,
});

// A page with no registered bindings falls back to synthetic keyboard events.
win = { document: documentStub, $: { _data: () => ({ events: {} }) } };
const direct = handlers.readGameKeyboardHandlers();
assert.equal(direct.moveAll, null);
direct.keyDown({ key: "Shift" });
direct.keyUp({ key: "Shift" });
assert.equal(dispatched.length, 2);
assert.equal(dispatched[0].type, "keydown");
assert.equal(dispatched[0].key, "Shift");
assert.equal(dispatched[1].type, "keyup");
assert.equal(dispatched[1].key, "Shift");
assert.deepEqual(cloned, []);

// The same fallback applies when the window carries no jQuery at all.
win = {};
const bare = handlers.readGameKeyboardHandlers();
bare.keyDown({ key: "Alt" });
assert.equal(dispatched.at(-1).type, "keydown");
assert.equal(dispatched.at(-1).key, "Alt");
assert.equal(handlers.hasKeydownBinding(), false);

// The page-shell query reports whether the page's jQuery carries the binding.
events = { keydown: [{ handler: () => {} }] };
win = { $: { _data: () => ({ events }) } };
assert.equal(handlers.hasKeydownBinding(), true);
events.keydown = [];
assert.equal(handlers.hasKeydownBinding(), false);

// A page with both key bindings but no combined binding replays each key.
events = {
  keydown: [{ handler: (event) => played.push(["down", event.key]) }],
  keyup: [{ handler: (event) => played.push(["up", event.key]) }],
};
win = { $: { _data: () => ({ events }) } };
needBypass = false;
const separate = handlers.readGameKeyboardHandlers();
assert.equal(separate.moveAll, null);
separate.keyDown({ key: "Control" });
separate.keyUp({ key: "Control" });
assert.deepEqual(played, [
  ["down", "Control"],
  ["up", "Control"],
]);

// A mounted combined binding replays the modifier chord.
events.mousemove = [
  { handler: (event) => played.push(["chord", event.metaKey]) },
];
const chord = handlers.readGameKeyboardHandlers();
assert.equal(typeof chord.moveAll, "function");
chord.moveAll({ metaKey: true });
assert.deepEqual(played.at(-1), ["chord", true]);

// The sandbox bypass clones each synthetic event into the page first.
needBypass = true;
const bypassed = handlers.readGameKeyboardHandlers();
bypassed.keyDown({ key: "Shift" });
bypassed.moveAll({ shiftKey: true });
assert.equal(cloned.length, 2);
assert.equal(cloned[0].key, "Shift");
assert.deepEqual(cloned[1], { shiftKey: true });

// A key binding the game never registered replays as null, never through the
// synthetic fallback, once the page did register a combined binding.
events = {
  keydown: [{ handler: (event) => played.push(["down", event.key]) }],
  mousemove: [{ handler: (event) => played.push(["moved", event]) }],
};
needBypass = false;
const partial = handlers.readGameKeyboardHandlers();
assert.equal(typeof partial.keyDown, "function");
assert.equal(partial.keyUp, null);
assert.equal(typeof partial.moveAll, "function");

console.log("Game keyboard handlers tests passed");
