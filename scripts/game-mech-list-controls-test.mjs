import assert from "node:assert/strict";
import { createGameMechListControls } from "../src/adapters/browser/game-mech-list-controls.ts";

let views = {};
let elements = {};
let sandboxSortable;
let pageSortable;
let cloned = [];
const usedSortables = [];
const controls = createGameMechListControls({
  getVueById: (elementId) => views[elementId],
  getDocument: () => ({ getElementById: (elementId) => elements[elementId] }),
  getSortable: () => {
    usedSortables.push("sandbox");
    return sandboxSortable;
  },
  getPageSortable: () => {
    usedSortables.push("page");
    return pageSortable;
  },
  isSandboxBypass: () => false,
  cloneIntoPage: (value, options) => {
    cloned.push(["clone", options.cloneFunctions]);
    return value;
  },
});

function fakeSortable(events) {
  return {
    get: (element) => {
      events.push(["get", element]);
      return {
        options: {
          onEnd: (event) => events.push(["onEnd", event]),
        },
      };
    },
  };
}

// A panel the game has not rendered answers nothing and performs no calls.
assert.equal(controls.isRendered("mechList"), false);
assert.equal(controls.scrapMech({ elementId: "mechList", mechId: 3 }), false);
assert.equal(
  controls.dragMech({ elementId: "mechList", oldIndex: 1, newIndex: 2 }),
  false,
);
assert.deepEqual(cloned, []);

// A mounted component without the scrap method is just as unusable.
views["mechList"] = {};
assert.equal(controls.isRendered("mechList"), true);
assert.equal(controls.scrapMech({ elementId: "mechList", mechId: 3 }), false);
views["mechList"] = undefined;

// A scrap passes the mech id as the only argument, with the component as the
// receiver.
const scrapCalls = [];
const list = {
  scrap(...args) {
    scrapCalls.push({ args, receiver: this === list });
  },
};
views["mechList"] = list;
assert.equal(controls.scrapMech({ elementId: "mechList", mechId: 7 }), true);
assert.deepEqual(scrapCalls, [{ args: [7], receiver: true }]);
views["mechList"] = undefined;

// A drag is refused whenever any part of the chain is missing, without
// touching the event handler.
elements["mechList"] = {};
sandboxSortable = { get: () => ({ options: { onEnd() {} } }) };
assert.equal(
  controls.dragMech({ elementId: "mechList", oldIndex: 0, newIndex: 1 }),
  true,
);
elements["mechList"] = undefined;
assert.equal(
  controls.dragMech({ elementId: "mechList", oldIndex: 0, newIndex: 1 }),
  false,
);
elements["mechList"] = null;
assert.equal(
  controls.dragMech({ elementId: "mechList", oldIndex: 0, newIndex: 1 }),
  false,
);
elements["mechList"] = {};
sandboxSortable = { get: "not a function" };
assert.equal(
  controls.dragMech({ elementId: "mechList", oldIndex: 0, newIndex: 1 }),
  false,
);
sandboxSortable = { get: () => undefined };
assert.equal(
  controls.dragMech({ elementId: "mechList", oldIndex: 0, newIndex: 1 }),
  false,
);
sandboxSortable = { get: () => ({ options: { onEnd: "not a function" } }) };
assert.equal(
  controls.dragMech({ elementId: "mechList", oldIndex: 0, newIndex: 1 }),
  false,
);
elements["mechList"] = undefined;
sandboxSortable = undefined;

// A drag drives the script realm's Sortable with the list element when the
// sandbox needs no bypass, delivering the synthetic reorder event.
const events = [];
const element = { kind: "mech-list-element" };
sandboxSortable = fakeSortable(events);
usedSortables.length = 0;
elements["mechList"] = element;
assert.equal(
  controls.dragMech({ elementId: "mechList", oldIndex: 3, newIndex: 1 }),
  true,
);
assert.deepEqual(events[0], ["get", element]);
const delivered = events[1][1];
assert.equal(events[1][0], "onEnd");
assert.equal(delivered.oldDraggableIndex, 3);
assert.equal(delivered.newDraggableIndex, 1);
assert.deepEqual(delivered.from.querySelectorAll(), []);
assert.equal(delivered.from.insertBefore(), false);
assert.deepEqual(usedSortables, ["sandbox"]);

// The Firefox bypass drives the page Sortable and clones the event into the
// page, preserving the synthetic handler functions.
const bypassControls = createGameMechListControls({
  getVueById: (elementId) => views[elementId],
  getDocument: () => ({ getElementById: (elementId) => elements[elementId] }),
  getSortable: () => {
    throw new Error("must not reach the sandbox Sortable");
  },
  getPageSortable: () => pageSortable,
  isSandboxBypass: () => true,
  cloneIntoPage: (value, options) => {
    cloned.push(["clone", options.cloneFunctions, value]);
    return value;
  },
});
const bypassEvents = [];
pageSortable = fakeSortable(bypassEvents);
assert.equal(
  bypassControls.dragMech({ elementId: "mechList", oldIndex: 4, newIndex: 2 }),
  true,
);
assert.equal(cloned.length, 1);
assert.equal(cloned[0][0], "clone");
assert.equal(cloned[0][1], true);
const clonedEvent = cloned[0][2];
assert.equal(clonedEvent.oldDraggableIndex, 4);
assert.equal(clonedEvent.newDraggableIndex, 2);
assert.deepEqual(clonedEvent.from.querySelectorAll(), []);
assert.equal(clonedEvent.from.insertBefore(), false);
assert.deepEqual(bypassEvents[0], ["get", element]);

// A throwing event handler propagates rather than reporting a drag that did
// not happen.
sandboxSortable = {
  get: () => ({
    options: {
      onEnd() {
        throw new Error("reorder exploded");
      },
    },
  }),
};
elements["mechList"] = element;
assert.throws(
  () => controls.dragMech({ elementId: "mechList", oldIndex: 0, newIndex: 1 }),
  /reorder exploded/,
);
elements["mechList"] = undefined;

console.log("Game mech list controls adapter tests passed");
