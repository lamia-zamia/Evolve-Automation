import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const { hooks } = await loadCharacterizationBundle({
  console,
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => ({ ready() {} }),
});

assert.equal(typeof hooks.setRuntimeQueryTestContext, "function");
const queries = hooks.runtimeQueries;
for (const name of ["getGovernor", "haveTask", "haveTech", "isEarlyGame"]) {
  assert.equal(typeof queries?.[name], "function", `${name} hook missing`);
}

function use(race = {}, tech = {}) {
  hooks.setRuntimeQueryTestContext({
    game: { global: { race, tech } },
  });
}

use(
  {
    governor: {
      g: { bg: "sports" },
      tasks: { first: "spy", second: "tax" },
    },
  },
  { mad: 1, high_tech: 6, metallurgy: 0 },
);
assert.deepEqual(
  {
    governor: queries.getGovernor(),
    spyTask: queries.haveTask("spy"),
    missingTask: queries.haveTask("merc"),
    mad: queries.haveTech("mad"),
    mad2: queries.haveTech("mad", 2),
    zeroTech: queries.haveTech("metallurgy"),
    missingTech: queries.haveTech("unknown"),
    early: queries.isEarlyGame(),
  },
  {
    governor: "sports",
    spyTask: true,
    missingTask: false,
    mad: true,
    mad2: false,
    zeroTech: 0,
    missingTech: undefined,
    early: false,
  },
);

use({}, {});
assert.equal(queries.getGovernor(), "none");
assert.equal(queries.haveTask("spy"), false);
assert.equal(queries.isEarlyGame(), true);

for (const challenge of [
  "cataclysm",
  "orbit_decayed",
  "lone_survivor",
  "warlord",
]) {
  use({ [challenge]: true }, {});
  assert.equal(queries.isEarlyGame(), false, challenge);
}

for (const challenge of ["truepath", "sludge", "ultra_sludge"]) {
  use({ [challenge]: true }, { high_tech: 6 });
  assert.equal(queries.isEarlyGame(), true, `${challenge} before high tech`);
  use({ [challenge]: true }, { high_tech: 7 });
  assert.equal(queries.isEarlyGame(), false, `${challenge} after high tech`);
}

console.log("Runtime query bundled characterization tests passed");
