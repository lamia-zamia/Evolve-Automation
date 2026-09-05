import assert from "node:assert/strict";
import { createGamePageShell } from "../src/adapters/browser/game-page-shell.ts";

const trace = [];
const observers = [];
const elements = {};
let injected = [];
const documentStub = {
  body: { appendChild: (node) => injected.push(node) },
  createElement: () => {
    const script = {};
    return script;
  },
  getElementById: (id) => elements[id] ?? null,
  querySelector: (selector) => (selector === "body" ? documentStub.body : null),
};
class Observer {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target, options) {
    observers.push({ callback: this.callback, target, options });
  }
}
const tooltip = () => trace.push(["tooltip"]);
const filterLog = () => trace.push(["filter"]);
const modal = {
  awaiting: false,
  captured: [],
  isAwaitingScriptModal() {
    return this.awaiting;
  },
  captureScriptModal(element) {
    this.captured.push(element);
  },
};
let jquery = {};
let documentValue = documentStub;
let observerValue = Observer;
let nodeValue = { ELEMENT_NODE: 1 };

const shell = createGamePageShell({
  getDocument: () => documentValue,
  getMutationObserver: () => observerValue,
  getNode: () => nodeValue,
  getTooltipObserver: () => tooltip,
  getLogFilter: () => filterLog,
  getModal: () => modal,
  getJQuery: () => jquery,
});

// Mounting the three long-lived observers looks them up by their ids and selector.
elements.main = {};
elements.msgQueueLog = {};
shell.mountObservers();
assert.equal(observers.map(({ target }) => target).filter(Boolean).length, 3);
const bodyObserver = observers.find(
  ({ target }) => target === documentStub.body,
);
assert.ok(bodyObserver);
assert.deepEqual(bodyObserver.options, { childList: true, subtree: true });
assert.deepEqual(
  observers.map(({ callback }) => callback),
  [tooltip, bodyObserver.callback, filterLog],
);

// A script-opened modal element is handed to the modal port, not observed.
const scriptModal = {
  nodeType: 1,
  classList: { contains: () => true },
  style: {},
};
modal.awaiting = true;
bodyObserver.callback([{ addedNodes: [scriptModal] }]);
assert.deepEqual(modal.captured, [scriptModal]);
assert.equal(observers.length, 3);

// A player-opened modal gets its own tooltip observer instead.
modal.awaiting = false;
const userModal = {
  nodeType: 1,
  classList: { contains: () => true },
  style: {},
};
bodyObserver.callback([{ addedNodes: [userModal] }]);
assert.equal(observers.at(-1).target, userModal);
assert.equal(observers.at(-1).callback, tooltip);

// Real MutationRecords carry a NodeList in addedNodes, which is not an Array.
// The observer must still hand such modals to the capture port.
const nodeList = (nodes) => ({ forEach: (visit) => nodes.forEach(visit) });
modal.captured = [];
modal.awaiting = true;
bodyObserver.callback([{ addedNodes: nodeList([scriptModal]) }]);
assert.deepEqual(modal.captured, [scriptModal]);
assert.equal(observers.length, 4);
modal.awaiting = false;

// Non-element additions and non-modal elements are ignored.
bodyObserver.callback([{ addedNodes: [documentStub.body] }]);
bodyObserver.callback([{ addedNodes: [] }]);
assert.equal(observers.at(-1).target, userModal);

// Readiness tracks the queueColumn element's presence.
delete elements.queueColumn;
assert.equal(shell.isPageReady(), false);
elements.queueColumn = {};
assert.equal(shell.isPageReady(), true);

console.log("Game page shell tests passed");
