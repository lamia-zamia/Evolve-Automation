import assert from "node:assert/strict";

import { createMechStats } from "../src/ui/mech-stats.ts";

const inputs = {
  script_mechStatsSpecial: { checked: false, value: "" },
  script_mechStatsGravity: { checked: false, value: "" },
  script_mechStatsEfficient: { checked: true, value: "" },
  script_mechStatsScouts: { checked: false, value: "0" },
  script_mechStatsCompact: { checked: false, value: "" },
};
let label = "First";
let output = "";
const stats = createMechStats({
  getDocument: () => ({ getElementById: (id) => inputs[id] }),
  getJQuery: () => () => ({ html: (content) => (output = content) }),
  getMechManager: () => ({
    SmallChassisMod: {},
    LargeChassisMod: {},
    Size: ["small", "collector"],
    SizeWeapons: { small: 1 },
    StatusMod: { gravity: () => 1 },
    getSizeMod: () => 1,
    getMechCost: () => [1, 100_000, 1],
    getMechRefund: () => [0, 0],
  }),
  getPoly: () => ({
    monsters: {},
    terrainRating: () => 1,
    weaponPower: () => 1,
  }),
  getGame: () => ({ loc: () => label }),
  average: (values) =>
    values.reduce((sum, value) => sum + value, 0) / values.length,
});

stats.calculateMechStats();
assert.match(output, /First/);
assert.match(output, /100\.0000/);
label = "Replacement";
stats.calculateMechStats();
assert.match(output, /Replacement/);

console.log("Mech stats module tests passed");
