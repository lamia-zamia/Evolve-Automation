import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";
import { createHash } from "node:crypto";

class FixedDate {
  getMonth() {
    return 0;
  }
  getDate() {
    return 1;
  }
}
const { hooks } = await loadCharacterizationBundle({
  cloneInto: (value) => value,
  console,
  Date: FixedDate,
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

const compatibility = hooks.gameCompatibility;
assert.ok(compatibility, "game compatibility hook missing");
assert.deepEqual(Array.from(Object.keys(compatibility)), [
  "astrologySign",
  "arpaAdjustCosts",
  "govPrice",
  "galaxyOffers",
  "supplyValue",
  "monsters",
  "hellSupression",
  "taxCap",
  "mechCost",
  "terrainRating",
  "weaponPower",
  "timeFormat",
  "universeAffix",
  "genus_traits",
  "neg_roll_traits",
  "crateValue",
  "containerValue",
  "adjustCosts",
  "loc",
  "messageQueue",
  "shipCosts",
]);

assert.equal(compatibility.astrologySign(), "capricorn");
assert.deepEqual(
  { ...compatibility.mechCost("small", false, 0) },
  { s: 1, c: 75_000 },
);
assert.deepEqual(
  { ...compatibility.mechCost("small", true, 0) },
  { s: 20, c: 187_500 },
);
assert.equal(
  compatibility.terrainRating(
    { size: "small", equip: ["special"] },
    0.5,
    ["gravity"],
    0,
  ),
  0.55,
);
assert.equal(
  compatibility.weaponPower({ size: "titan", equip: ["special"] }, 0.5),
  0.625,
);
assert.equal(compatibility.timeFormat(3661), "1h 01m");
assert.equal(compatibility.universeAffix("magic"), "mg");
assert.equal(compatibility.galaxyOffers.length, 9);
assert.equal(compatibility.supplyValue.Scarletite.out, 250);
assert.equal(compatibility.monsters.fire_elm.weapon.flame, 0);
assert.equal(compatibility.genus_traits.fungi.spores, 1);
assert.equal(compatibility.neg_roll_traits.at(-1), "unorganized");

const dataHash = createHash("sha256")
  .update(
    JSON.stringify({
      supplyValue: compatibility.supplyValue,
      monsters: compatibility.monsters,
      genusTraits: compatibility.genus_traits,
      negativeTraits: compatibility.neg_roll_traits,
    }),
  )
  .digest("hex");
assert.equal(
  dataHash,
  "ebd5a94b1bf93a34401a4e274a1fe2fc90f5606609b9dba9dc3b07234e331fa0",
);
console.log("Game compatibility bundled characterization tests passed");
