import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

const trace = [];
let registration;
function makeNode() {
  let proxy;
  proxy = new Proxy(function () {}, {
    apply: () => proxy,
    get: () => () => proxy,
  });
  return proxy;
}
function jquery() {
  return makeNode();
}
jquery.isEmptyObject = () => true;
const document = {
  documentElement: { scrollTop: 16 },
  body: { scrollTop: 2 },
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

hooks.setHellSettingsTestContext({
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
    addSettingsToggle(_node, key) {
      trace.push(`toggle:${key}`);
    },
  },
  resetHellSettings: (value) => trace.push(`reset:${value}`),
  updateSettingsFromState: () => trace.push("persist"),
  resetCheckbox: (key) => trace.push(`checkbox:${key}`),
});
const panel = hooks.hellSettings;
panel.updateHellSettingsContent("p-");
assert.equal(trace[0], "header:Entering Hell");
assert.ok(trace.includes("toggle:hellAssaultReserve"));
assert.equal(document.documentElement.scrollTop, 16);
trace.length = 0;
panel.buildHellSettings(makeNode(), "p-");
registration[4]();
assert.deepEqual(trace, [
  "section:p-:hell:Hell",
  "reset:true",
  "persist",
  "header:Entering Hell",
  "number:hellHomeGarrison",
  "number:hellMinSoldiers",
  "number:hellMinSoldiersPercent",
  "header:Hell Garrison",
  "toggle:hellAssaultReserve",
  "number:hellTargetFortressDamage",
  "number:hellLowWallsMulti",
  "header:Patrol Size",
  "toggle:hellHandlePatrolSize",
  "number:hellPatrolMinRating",
  "number:hellPatrolThreatPercent",
  "number:hellPatrolDroneMod",
  "number:hellPatrolDroidMod",
  "number:hellPatrolBootcampMod",
  "number:hellBolsterPatrolRating",
  "number:hellBolsterPatrolPercentTop",
  "number:hellBolsterPatrolPercentBottom",
  "header:Attractors",
  "number:hellAttractorBottomThreat",
  "number:hellAttractorTopThreat",
  "header:Warlord Specific Settings",
  "toggle:warlordHandleFortress",
  "number:warlordMinimumMinions",
  "checkbox:autoHell",
]);
console.log("Hell settings bundled characterization tests passed");
