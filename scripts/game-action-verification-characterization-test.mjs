import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const logs = [];
const hooks = {};
const sandbox = {
  __EA_TEST_HOOKS__: hooks,
  console: {
    ...console,
    log(...args) {
      logs.push(args);
    },
  },
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

assert.equal(typeof hooks.setGameActionVerificationTestContext, "function");
const verification = hooks.gameActionVerification;
for (const name of [
  "verifyGameActions",
  "verifyGameActionsExist",
  "verifyGameActionExists",
]) {
  assert.equal(typeof verification?.[name], "function", `${name} hook missing`);
}

const missingCity = { id: "gameMissing" };
const missingSpace = { id: "spaceMissing" };
const game = {
  actions: {
    city: {
      known: { id: "known" },
      info: { id: "info" },
      gift: { id: "gift" },
      missing: missingCity,
    },
    space: {
      orbit: {
        station: { id: "station" },
        replicator: { id: "replicator" },
        absent: missingSpace,
      },
    },
    interstellar: {},
    portal: {},
    galaxy: {},
    tauceti: {},
    eden: {},
  },
};
const buildings = {
  Known: { id: "known" },
  Station: { id: "station" },
};
hooks.setGameActionVerificationTestContext({ game, buildings });
logs.length = 0;
verification.verifyGameActions();
assert.equal(logs.length, 4);
assert.equal(
  logs[0][0],
  "Game action key not found in script: missing (gameMissing)",
);
assert.equal(logs[1][0], missingCity);
assert.equal(
  logs[2][0],
  "Game action key not found in script: absent (spaceMissing)",
);
assert.equal(logs[3][0], missingSpace);

logs.length = 0;
verification.verifyGameActionExists(
  Object.keys(buildings),
  buildings,
  "bonfire",
  { bonfire: { id: "seasonal" } },
);
assert.deepEqual(logs, []);

console.log("Game action verification bundled characterization tests passed");
