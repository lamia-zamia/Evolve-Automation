import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
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
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.setRaceProfileTestContext, "function");
const profile = hooks.raceProfile;
for (const name of [
  "isHungryRace",
  "isDemonRace",
  "isLumberRace",
  "getOccCosts",
]) {
  assert.equal(typeof profile?.[name], "function", `${name} hook missing`);
}

function use(race, government = "democracy", highPop = 1.2) {
  hooks.setRaceProfileTestContext({
    game: {
      global: {
        race,
        civic: { govern: { type: government } },
      },
    },
    traitVal: (trait, index, fallback) => {
      assert.equal(trait, "high_pop");
      assert.equal(index, 0);
      assert.equal(fallback, 1);
      return highPop;
    },
  });
}

use({ carnivore: true, species: "human" });
assert.deepEqual(
  {
    hungry: profile.isHungryRace(),
    demon: profile.isDemonRace(),
    lumber: profile.isLumberRace(),
    occ: profile.getOccCosts(),
  },
  { hungry: true, demon: undefined, lumber: true, occ: 24 },
);

use({ carnivore: true, herbivore: true, species: "human" });
assert.equal(profile.isHungryRace(), undefined);
use({ ravenous: true, artifical: true, species: "human" });
assert.equal(profile.isHungryRace(), true);

use({ soul_eater: true, evil: true, species: "balorg" });
assert.equal(profile.isDemonRace(), true);
use({ soul_eater: true, evil: true, species: "wendigo" });
assert.equal(profile.isDemonRace(), false);

use({ kindling_kindred: true, species: "human" });
assert.equal(profile.isLumberRace(), false);
use({ smoldering: true, species: "human" });
assert.equal(profile.isLumberRace(), false);

use({ species: "human" }, "federation", 1.5);
assert.equal(profile.getOccCosts(), 22.5);

console.log("Race profile bundled characterization tests passed");
