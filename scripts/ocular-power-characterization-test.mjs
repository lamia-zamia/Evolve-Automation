import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile("evolve_automation.user.js", "utf8");
const hooks = {};
const jquery = () => ({ ready() {} });
const config = { d: true, p: false, w: false, t: false, f: false, c: false };
const clicks = [];
const ids = {
  d: "disintegration",
  p: "petrification",
  w: "wound",
  t: "telekinesis",
  f: "fear",
  c: "charm",
};
const elements = {
  ocularPower: { __vue__: config },
};
for (const [key, id] of Object.entries(ids)) {
  elements[`ocular${id}`] = {
    querySelector: () => ({
      click() {
        clicks.push(key);
        config[key] = !config[key];
        if (key === "c" && config.c) config.d = false;
      },
    }),
  };
}
const document = { getElementById: (id) => elements[id] ?? null };
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
  document,
  $: jquery,
};
sandbox.window = sandbox;
sandbox.window.location = "https://pmotschmann.github.io/Evolve/";

vm.runInNewContext(source, sandbox, {
  filename: "evolve_automation.user.js",
  timeout: 10_000,
});

assert.equal(typeof hooks.autoOcularPowers, "function");
hooks.setAutomationTestContext({
  game: {
    global: {
      race: { ocular_power: true, ocularPowerConfig: config },
      settings: { at: false },
    },
    traits: { ocular_power: { vars: () => [1, 100] } },
  },
  win: { document },
});
for (const id of Object.values(ids)) {
  hooks.automationSettings[`ocularPower_${id}`] = id === "charm";
  hooks.automationSettings[`ocularPower_p_${id}`] = id === "charm" ? 10 : 1;
}

hooks.autoOcularPowers();
assert.deepEqual(clicks, ["c"]);
assert.deepEqual(config, {
  d: false,
  p: false,
  w: false,
  t: false,
  f: false,
  c: true,
});

console.log("Ocular-power bundled characterization tests passed");
