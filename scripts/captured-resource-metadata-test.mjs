// The one resource-label reader the captured settings catalogs share.

import assert from "node:assert/strict";
import {
  readCapturedResource,
  readCapturedResourceLabel,
} from "../src/adapters/evolve/captured-resource-metadata.ts";

const root = {
  resource: {
    Iron: { title: "Iron Ore", name: "Iron" },
    Coal: { name: "Coal" },
    Oil: {},
    Blank: { title: "", name: "" },
  },
};

// title -> title; title absent -> name; both absent -> the raw id; resource absent -> the raw id.
assert.equal(readCapturedResourceLabel(root, "Iron"), "Iron Ore");
assert.equal(readCapturedResourceLabel(root, "Coal"), "Coal");
assert.equal(readCapturedResourceLabel(root, "Oil"), "Oil");
assert.equal(readCapturedResourceLabel(root, "Missing"), "Missing");

// A blank title is the game's uninitialized state, not a label.
assert.equal(readCapturedResourceLabel(root, "Blank"), "Blank");

// A root with no resource map at all, and a non-record resource entry, are absent cases.
assert.equal(readCapturedResourceLabel({}, "Iron"), "Iron");
assert.equal(readCapturedResourceLabel(undefined, "Iron"), "Iron");
assert.equal(
  readCapturedResourceLabel({ resource: { Iron: 7 } }, "Iron"),
  "Iron",
);

// The record reader hands back the resource itself for the section-specific questions.
assert.equal(readCapturedResource(root, "Iron").title, "Iron Ore");
assert.equal(readCapturedResource(root, "Missing"), undefined);
assert.equal(
  readCapturedResource({ resource: { Iron: 7 } }, "Iron"),
  undefined,
);
