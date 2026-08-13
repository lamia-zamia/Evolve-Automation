import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const htmlCalls = [];
const inputs = {
  script_mechStatsSpecial: { checked: true },
  script_mechStatsGravity: { checked: true },
  script_mechStatsEfficient: { checked: true },
  script_mechStatsScouts: { value: "3" },
  script_mechStatsCompact: { checked: true },
};
const { hooks } = await loadCharacterizationBundle({
  console,
  document: { getElementById: (id) => inputs[id] },
  localStorage: { getItem: () => null },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: () => ({
    ready() {},
    html: (content) => htmlCalls.push(content),
  }),
});

assert.equal(typeof hooks.calculateMechStats, "function");
assert.equal(typeof hooks.setMechStatsTestContext, "function");
const calls = [];
hooks.setMechStatsTestContext({
  game: { loc: (id) => (id === "portal_mech_size_small" ? "Small" : id) },
  poly: {
    monsters: {},
    terrainRating: (mech, factor, statuses, scouts) => {
      calls.push(["terrain", mech.size, factor, Array.from(statuses), scouts]);
      return 5;
    },
    weaponPower: (mech, factor) => {
      calls.push(["weapon", mech.size, factor]);
      return 6;
    },
  },
  MechManager: {
    SmallChassisMod: {},
    LargeChassisMod: {},
    Size: ["small", "collector"],
    SizeWeapons: { small: 4 },
    StatusMod: { gravity: (mech) => (mech.size === "small" ? 3 : 0) },
    getSizeMod: (mech, prepared) => {
      calls.push(["size", mech.size, prepared]);
      return 2;
    },
    getMechCost: (mech, prepared) => {
      calls.push(["cost", mech.size, prepared]);
      return [5, 100_000, 10];
    },
    getMechRefund: (mech, prepared) => {
      calls.push(["refund", mech.size, prepared]);
      return [1, 20_000];
    },
  },
});

hooks.calculateMechStats();
assert.deepEqual(calls, [
  ["size", "small", false],
  ["terrain", "small", 1, ["gravity"], 3],
  ["weapon", "small", 1],
  ["cost", "small", 2],
  ["refund", "small", 2],
]);
const cellInfo = '<td><span class="has-text-info">';
const cellWarn = '<td><span class="has-text-warning">';
const cellAdv = '<td><span class="has-text-advanced">';
const cellEnd = "</span></td>";
const rows = [
  ["", "Small"],
  ["Damage Per Size", "7200.0000"],
  ["Damage Per Supply (New)", "72000.0000"],
  ["Damage Per Gems (New)", "14400.0000"],
  ["Damage Per Supply (Rebuild)", "90000.0000"],
  ["Damage Per Gems (Rebuild)", "18000.0000"],
];
const expected = rows
  .map(
    (line, index) =>
      "<tr>" +
      (index === 0 ? cellWarn : cellAdv) +
      line.join("&nbsp;" + cellEnd + (index === 0 ? cellAdv : cellInfo)) +
      cellEnd +
      "</tr>",
  )
  .join("");
assert.deepEqual(htmlCalls, [expected]);

console.log("Mech stats bundled characterization tests passed");
