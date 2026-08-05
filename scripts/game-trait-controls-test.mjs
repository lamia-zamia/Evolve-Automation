import assert from "node:assert/strict";
import { createGameTraitControls } from "../src/adapters/browser/game-trait-controls.ts";

let view;
const lookups = [];
const controls = createGameTraitControls({
  getVueById: (id) => {
    lookups.push(id);
    return view;
  },
});

function recordingView(calls) {
  return {
    gene(...args) {
      calls.push(["gene", args, this === view]);
    },
    gain(...args) {
      calls.push(["gain", args, this === view]);
    },
    purge(...args) {
      calls.push(["purge", args, this === view]);
    },
  };
}

// Each command reaches the trait panel's matching method, called on the view
// itself rather than as a free function.
{
  const calls = [];
  view = recordingView(calls);
  lookups.length = 0;
  assert.equal(controls.buyMinorTrait("smart"), true);
  assert.equal(controls.gainTrait("strong"), true);
  assert.equal(controls.purgeTrait("strong"), true);
  assert.deepEqual(calls, [
    ["gene", ["smart"], true],
    ["gain", ["strong"], true],
    ["purge", ["strong"], true],
  ]);
  // The panel is looked up per command, so a remounted one is picked up.
  assert.deepEqual(lookups, [
    "geneticBreakdown",
    "geneticBreakdown",
    "geneticBreakdown",
  ]);
}

// A run that has not unlocked the panel reports every command as not offered
// instead of throwing, so the caller keeps its own model untouched.
for (const missing of [undefined, null]) {
  view = missing;
  assert.equal(controls.buyMinorTrait("smart"), false);
  assert.equal(controls.gainTrait("strong"), false);
  assert.equal(controls.purgeTrait("strong"), false);
}

// A mounted panel that is missing one command answers only that one as not
// offered.
{
  const calls = [];
  view = { gene: (name) => calls.push(name) };
  assert.equal(controls.buyMinorTrait("smart"), true);
  assert.equal(controls.gainTrait("strong"), false);
  assert.equal(controls.purgeTrait("strong"), false);
  assert.deepEqual(calls, ["smart"]);
}

console.log("Game trait controls adapter tests passed");
