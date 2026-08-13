import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const trace = [];
let registration;
function makeNode() {
  let proxy;
  proxy = new Proxy(function () {}, {
    apply: () => proxy,
    get(_target, property) {
      if (property === "length") return 0;
      return () => proxy;
    },
  });
  return proxy;
}
function jquery() {
  return makeNode();
}
jquery.isEmptyObject = () => true;
const document = {
  documentElement: { scrollTop: 19 },
  body: { scrollTop: 4 },
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
};
const { hooks } = await loadCharacterizationBundle({
  console,
  confirm: () => true,
  document,
  localStorage: { getItem: () => null, setItem() {} },
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  navigator: { platform: "Win32" },
  setTimeout,
  clearTimeout,
  structuredClone,
  $: jquery,
});

hooks.setWarSettingsTestContext({
  game: { loc: (key) => key },
  SpyManager: { Types: { Annex: { id: "annex" } } },
  actions: {
    buildSettingsSection2(...args) {
      registration = args;
      trace.push(`section:${args[1]}:${args[2]}:${args[3]}`);
    },
    addSettingsHeader1(_node, label) {
      trace.push(`header:${label}`);
    },
    addSettingsNumber(_node, key) {
      trace.push(`number:${key}`);
    },
    addSettingsSelect(_node, key) {
      trace.push(`select:${key}`);
    },
    addSettingsToggle(_node, key) {
      trace.push(`toggle:${key}`);
    },
  },
  resetWarSettings: (value) => trace.push(`reset:${value}`),
  updateSettingsFromState: () => trace.push("persist"),
  resetCheckbox: (key) => trace.push(`checkbox:${key}`),
});
const panel = hooks.warSettings;
panel.updateWarSettingsContent("p-");
assert.equal(trace[0], "header:Foreign Powers");
assert.ok(trace.includes("toggle:foreignPacifist"));
assert.ok(trace.includes("select:foreignProtect"));
assert.equal(document.documentElement.scrollTop, 19);
trace.length = 0;
panel.buildWarSettings(makeNode(), "p-");
registration[4]();
assert.deepEqual(trace, [
  "section:p-:war:Foreign Affairs",
  "reset:true",
  "persist",
  "header:Foreign Powers",
  "toggle:foreignPacifist",
  "toggle:foreignUnification",
  "toggle:foreignOccupyLast",
  "toggle:foreignForceSabotage",
  "toggle:foreignTrainSpy",
  "number:foreignSpyMax",
  "number:foreignPowerRequired",
  "select:foreignPolicyInferior",
  "select:foreignPolicySuperior",
  "select:foreignPolicyRival",
  "header:Campaigns",
  "number:foreignAttackLivingSoldiersPercent",
  "number:foreignAttackHealthySoldiersPercent",
  "number:foreignHireMercMoneyStoragePercent",
  "number:foreignHireMercCostLowerThanIncome",
  "number:foreignHireMercDeadSoldiers",
  "number:foreignMinAdvantage",
  "number:foreignMaxAdvantage",
  "number:foreignMaxSiegeBattalion",
  "select:foreignProtect",
  "checkbox:autoFight",
]);
console.log("War settings bundled characterization tests passed");
