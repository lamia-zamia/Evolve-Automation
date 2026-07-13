import assert from "node:assert/strict";

import { createPrestigeLog } from "../src/observability/prestige-log.ts";

let settings = {
  prestigeType: "mad",
  log_prestige_format: "{species} {resetType} {timeStamp}",
  stateLogEnabled: true,
  stateLogAutoDownload: true,
};
let game = {
  global: { stats: { days: 10 }, race: { species: "human" } },
};
let state = {
  stateLog: { species: "human", reset: 1, samples: [{}] },
};
let info = [];
let actions = [];
const prestigeLog = createPrestigeLog({
  getSettings: () => settings,
  getGame: () => game,
  getState: () => state,
  getPrestigeTypes: () => [{ val: "mad", label: "MAD" }],
  getGameLog: () => ({ logInfo: (...args) => info.push(args) }),
  getFastEval: () => (expression) => Function(`return ${expression}`)(),
  getSaveStateLog: () => () => actions.push("save"),
  getTriggerFileDownload: () => (contents, filename) =>
    actions.push([contents, filename]),
});

assert.equal(prestigeLog.formatLogString("{eval:2 * 3}", {}), "6");
prestigeLog.logPrestige();
assert.deepEqual(info, [["prestige", "Human MAD 10", ["achievements"]]]);
assert.equal(actions[0], "save");
assert.equal(actions[1][1], "evolve-statelog-human-r1-d10.json");

settings = {
  ...settings,
  log_prestige_format: "{species}",
  stateLogEnabled: false,
};
game = { global: { stats: { days: 20 }, race: { species: "balorg" } } };
state = { stateLog: { species: "balorg", reset: 2, samples: [{}] } };
info = [];
actions = [];
prestigeLog.logPrestige();
assert.deepEqual(info, [["prestige", "Balorg", ["achievements"]]]);
assert.deepEqual(actions, []);

console.log("Prestige log module tests passed");
