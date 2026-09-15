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

createGameMessageLog(document)("Built city-basic_housing (6)");
assert.equal(entries.length, 1);
assert.equal(entries[0].className, "has-text-success");
assert.equal(entries[0].textContent, "Built city-basic_housing (6)");

createGameMessageLog({})("ignored");
assert.equal(entries.length, 1);
