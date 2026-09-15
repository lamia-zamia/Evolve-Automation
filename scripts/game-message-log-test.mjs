import assert from "node:assert/strict";
import { createGameMessageLog } from "../src/adapters/browser/game-message-log.ts";

const entries = [];
const log = {
  prepend(entry) {
    entries.unshift(entry);
  },
};
const document = {
  getElementById(id) {
    return id === "msgQueueLog" ? log : null;
  },
  createElement(tag) {
    assert.equal(tag, "p");
    return {};
  },
};

createGameMessageLog(document)({
  message: "Built Basic Housing (6)",
  color: "success",
  tags: ["queue", "building_queue"],
});
assert.equal(entries.length, 1);
assert.equal(entries[0].className, "has-text-success");
assert.equal(entries[0].textContent, "Built Basic Housing (6)");

createGameMessageLog({})({
  message: "ignored",
  color: "success",
  tags: [],
});
assert.equal(entries.length, 1);

const retained = { all: [], queue: [], building_queue: [], view: "all" };
const filteredLog = {
  prepend(entry) {
    this.children.unshift(entry);
  },
  children: [],
};
const filteredDocument = {
  getElementById(id) {
    return id === "msgQueueLog" ? filteredLog : null;
  },
  createElement() {
    return {};
  },
};
const controls = {
  resolve(elementId) {
    return elementId === "msgQueue"
      ? {
          elementId,
          generation: 1,
          methods: ["swapFilter"],
          data: {
            m: retained,
            s: {
              all: { max: 2 },
              queue: { max: 2 },
              building_queue: { max: 1 },
            },
          },
        }
      : undefined;
  },
  invoke() {
    return { ok: true, value: undefined };
  },
  capturedElementIds() {
    return ["msgQueue"];
  },
};

createGameMessageLog(
  filteredDocument,
  controls,
)({
  message: "Built Basic Housing (7)",
  color: "success",
  tags: ["queue", "building_queue"],
});
assert.deepEqual(retained.all, [
  { msg: "Built Basic Housing (7)", color: "success" },
]);
assert.deepEqual(retained.queue, [
  { msg: "Built Basic Housing (7)", color: "success" },
]);
assert.deepEqual(retained.building_queue, [
  { msg: "Built Basic Housing (7)", color: "success" },
]);
