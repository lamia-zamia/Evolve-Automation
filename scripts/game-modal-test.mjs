import assert from "node:assert/strict";
import { createGameModal } from "../src/adapters/browser/game-modal.ts";

let elements = {};
let selectors = {};
const trace = [];
const observers = [];

const documentStub = {
  getElementById: (id) => elements[id] ?? null,
  querySelector: (selector) => selectors[selector] ?? null,
};

class ObserverStub {
  constructor(callback) {
    this.callback = callback;
    observers.push(this);
  }
  observe(target, options) {
    this.target = target;
    this.options = options;
  }
}

const gameModal = createGameModal({
  getDocument: () => documentStub,
  getMutationObserver: () => ObserverStub,
});

function reset() {
  elements = {};
  selectors = {};
  trace.length = 0;
  observers.length = 0;
}

function openFactory(title = "Factory") {
  selectors["#trigger"] = { click: () => trace.push("open-click") };
  selectors[".modal .modal-close"] = { click: () => trace.push("close-click") };
  gameModal.open({
    triggerSelector: "#trigger",
    title,
    action: () => trace.push("action"),
  });
  const element = { style: { display: "" } };
  gameModal.captureScriptModal(element);
  return element;
}

// isOpen answers for the game's window, this script's own window, and a pending
// script-opened one.
reset();
assert.equal(gameModal.isOpen(), false);
elements.modalBox = {};
assert.equal(gameModal.isOpen(), true);
delete elements.modalBox;
elements.scriptModal = { style: { display: "none" } };
assert.equal(gameModal.isOpen(), false);
elements.scriptModal = { style: { display: "block" } };
assert.equal(gameModal.isOpen(), true);
delete elements.scriptModal;
assert.equal(gameModal.isOpen(), false);

// canOpen requires a present, enabled control.
reset();
assert.equal(gameModal.canOpen("#trigger"), false);
selectors["#trigger"] = { getAttribute: () => "disabled" };
assert.equal(gameModal.canOpen("#trigger"), false);
selectors["#trigger"] = { getAttribute: () => null };
assert.equal(gameModal.canOpen("#trigger"), true);

// A full cycle: click, stay pending until the title identifies the window, run
// the action once, close, and forget the request.
reset();
const element = openFactory();
assert.deepEqual(trace, ["open-click"]);
assert.equal(element.style.display, "none");
assert.equal(gameModal.isAwaitingScriptModal(), true);
assert.equal(gameModal.isOpen(), true);
assert.deepEqual(observers.at(-1).options, { childList: true, subtree: true });

observers.at(-1).callback();
assert.deepEqual(trace, ["open-click"]);
assert.equal(gameModal.isAwaitingScriptModal(), true);

elements.modalBoxTitle = { textContent: "Factory - 26.4K/279.9K" };
observers.at(-1).callback();
assert.deepEqual(trace, ["open-click", "action", "close-click"]);
assert.equal(gameModal.isAwaitingScriptModal(), false);
assert.equal(gameModal.isOpen(), false);

// A second mutation after the request was served must not run the action again,
// and it restores whatever modal is on screen.
selectors[".modal"] = { style: { display: "none" } };
observers.at(-1).callback();
assert.deepEqual(trace, ["open-click", "action", "close-click"]);
assert.equal(selectors[".modal"].style.display, "");

// A modal that titles itself something else is the player's: it is shown again
// and the request is dropped rather than kept waiting.
reset();
openFactory("Expected");
elements.modalBoxTitle = { textContent: "Different" };
selectors[".modal"] = { style: { display: "none" } };
observers.at(-1).callback();
assert.deepEqual(trace, ["open-click"]);
assert.equal(selectors[".modal"].style.display, "");
assert.equal(gameModal.isAwaitingScriptModal(), false);

// A title with no separator identifies the window by its whole text.
reset();
openFactory("Smelter");
elements.modalBoxTitle = { textContent: "Smelter" };
observers.at(-1).callback();
assert.deepEqual(trace, ["open-click", "action", "close-click"]);

// A missing title node and a node with no text are both "not rendered yet".
reset();
openFactory();
elements.modalBoxTitle = { textContent: null };
observers.at(-1).callback();
assert.equal(gameModal.isAwaitingScriptModal(), true);
elements.modalBoxTitle = { textContent: "Factory" };
observers.at(-1).callback();
assert.deepEqual(trace, ["open-click", "action", "close-click"]);

// If the title mutation wins the race with the close control, keep the request
// pending and retry the close on a later mutation. The action must not run twice.
reset();
selectors["#trigger"] = { click: () => trace.push("open-click") };
gameModal.open({
  triggerSelector: "#trigger",
  title: "Factory",
  action: () => trace.push("action"),
});
gameModal.captureScriptModal({ style: { display: "" } });
elements.modalBoxTitle = { textContent: "Factory" };
observers.at(-1).callback();
assert.deepEqual(trace, ["open-click", "action"]);
assert.equal(gameModal.isAwaitingScriptModal(), true);

selectors[".modal .modal-close"] = { click: () => trace.push("close-click") };
observers.at(-1).callback();
assert.deepEqual(trace, ["open-click", "action", "close-click"]);
assert.equal(gameModal.isAwaitingScriptModal(), false);

// open does nothing while a modal is already open, and does not throw when the
// trigger control is absent.
reset();
elements.modalBox = {};
selectors["#trigger"] = { click: () => trace.push("open-click") };
gameModal.open({
  triggerSelector: "#trigger",
  title: "Blocked",
  action: () => trace.push("action"),
});
assert.deepEqual(trace, []);
assert.equal(gameModal.isAwaitingScriptModal(), false);

reset();
gameModal.open({
  triggerSelector: "#absent",
  title: "Absent",
  action: () => trace.push("action"),
});
assert.deepEqual(trace, []);
assert.equal(gameModal.isAwaitingScriptModal(), false);

console.log("Game modal adapter tests passed");
