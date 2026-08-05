import assert from "node:assert/strict";
import { createGameCustomRaceLab } from "../src/adapters/browser/game-custom-race-lab.ts";

let views = {};
let elements = {};
const trace = [];
const lab = createGameCustomRaceLab({
  getVueById: (elementId) => views[elementId],
  getDocument: () => ({
    querySelector: (selector) => elements[selector] ?? null,
  }),
});

const design = {
  name: "old",
  genus: "humanoid",
  traitlist: ["stale"],
  ranks: { stale: 3 },
  genes: 0,
};

// A closed lab holds no design, so there is nothing to read or write.
assert.equal(lab.currentGenus(), null);
assert.equal(
  lab.applyDesign({
    text: {},
    genus: "avian",
    traits: [],
    ranks: {},
    fanaticism: false,
  }),
  null,
);

// A mounted lab that has not built a design yet counts as closed too.
views["celestialLab"] = {
  geneEdit() {
    trace.push(this === views["celestialLab"]);
    this.g.genes = 5;
  },
};
assert.equal(lab.currentGenus(), null);

views["celestialLab"].g = design;
assert.equal(lab.currentGenus(), "humanoid");

// A trait is offered only when the panel rendered its button, and an id the
// lab's class names cannot express is never looked up.
elements["#celestialLab .tsmart"] = {};
assert.equal(lab.offersTrait("smart"), true);
assert.equal(lab.offersTrait("dumb"), false);
assert.equal(lab.offersTrait("smart, #celestialLab .tdumb"), false);

// The written design replaces the old one, and the lab recosts it.
const ranks = design.ranks;
assert.equal(
  lab.applyDesign({
    text: { name: "new", desc: "described" },
    genus: "avian",
    traits: ["smart"],
    ranks: { smart: 2 },
    fanaticism: "smart",
  }),
  5,
);
assert.deepEqual(trace, [true]);
assert.equal(design.name, "new");
assert.equal(design.desc, "described");
assert.equal(design.genus, "avian");
assert.deepEqual(design.traitlist, ["smart"]);
assert.equal(design.fanaticism, "smart");
// The lab keeps the rank object it made reactive; the write refills it in place.
assert.equal(design.ranks, ranks);
assert.deepEqual(ranks, { smart: 2 });

// A design the lab never gave a rank map gets one.
delete design.ranks;
assert.equal(
  lab.applyDesign({
    text: {},
    genus: "avian",
    traits: ["smart"],
    ranks: { smart: 1 },
    fanaticism: false,
  }),
  5,
);
assert.deepEqual(design.ranks, { smart: 1 });

console.log("Game custom race lab tests passed");
