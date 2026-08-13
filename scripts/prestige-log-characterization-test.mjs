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

assert.equal(typeof hooks.setPrestigeLogTestContext, "function");
assert.equal(typeof hooks.prestigeLog?.formatLogString, "function");
assert.equal(typeof hooks.prestigeLog?.logPrestige, "function");

assert.equal(
  hooks.prestigeLog.formatLogString("{species} reset {missing} {eval:1 + 2}", {
    species: "Human",
  }),
  "Human reset {missing} 3",
);
assert.equal(
  hooks.prestigeLog.formatLogString("invalid {eval:not defined}", {}),
  "invalid {eval:not defined}",
);

const infoCalls = [];
const actions = [];
const stateLog = {
  species: "human",
  reset: 4,
  samples: [{ day: 100 }],
};
hooks.setPrestigeLogTestContext({
  settings: {
    prestigeType: "mad",
    log_prestige_format: "{species}: {resetType} on day {timeStamp}",
    stateLogEnabled: true,
    stateLogAutoDownload: true,
  },
  game: {
    global: { stats: { days: 123 }, race: { species: "human" } },
  },
  state: { stateLog },
  GameLog: {
    logInfo: (...args) => infoCalls.push(args),
  },
  actions: {
    saveStateLog: () => actions.push(["save"]),
    triggerFileDownload: (...args) => actions.push(["download", ...args]),
  },
});
hooks.prestigeLog.logPrestige();
assert.deepEqual(JSON.parse(JSON.stringify(infoCalls)), [
  [
    "prestige",
    "Human: Mutual Assured Destruction on day 123",
    ["achievements"],
  ],
]);
assert.deepEqual(actions, [
  ["save"],
  ["download", JSON.stringify(stateLog), "evolve-statelog-human-r4-d123.json"],
]);

hooks.setPrestigeLogTestContext({
  settings: {
    prestigeType: "mad",
    log_prestige_format: "{species}",
    stateLogEnabled: false,
    stateLogAutoDownload: true,
  },
  game: { global: { stats: { days: 1 }, race: { species: "balorg" } } },
  state: { stateLog },
  GameLog: { logInfo: (...args) => infoCalls.push(args) },
  actions: {
    saveStateLog: () => actions.push(["unexpected-save"]),
    triggerFileDownload: () => actions.push(["unexpected-download"]),
  },
});
hooks.prestigeLog.logPrestige();
assert.deepEqual(JSON.parse(JSON.stringify(infoCalls.at(-1))), [
  "prestige",
  "Balorg",
  ["achievements"],
]);
assert.equal(actions.length, 2);

console.log("Prestige log bundled characterization tests passed");
