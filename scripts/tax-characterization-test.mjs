import assert from "node:assert/strict";
import { loadCharacterizationBundle } from "./characterization-harness.mjs";

import {
  createFixtureBuilder,
  createTraceRecorder,
} from "./test-support/modernization-fixtures.mjs";

const { hooks } = await loadCharacterizationBundle({
  console,
  document: { getElementById: () => null },
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

assert.equal(typeof hooks.autoTax, "function", "tax test hook missing");
assert.equal(
  typeof hooks.setAutoTaxTestContext,
  "function",
  "tax context hook missing",
);

const buildCase = createFixtureBuilder({
  taxRate: 20,
  taxVisible: true,
  controlsAvailable: true,
  minimumTaxRate: 0,
  maximumTaxRate: 50,
  requestedTaxRate: -1,
  configuredMinimumTaxRate: 0,
  morale: 100,
  projectedMorale: 100,
  maximumMorale: 120,
  minimumMorale: 100,
  configuredMaximumMorale: 200,
  moraleAdjusted: false,
  moneyStorageRatio: 1,
  moneyDemanded: false,
  banana: false,
  authorityManage: true,
  authorityTarget: 0,
  authority: 100,
  maximumAuthority: 100,
  authorityUnlocked: true,
});

function executeCase(overrides) {
  const fixture = buildCase(overrides);
  const trace = createTraceRecorder();
  let taxRate = fixture.taxRate;
  let moraleAdjusted = fixture.moraleAdjusted;
  const taxes = { display: fixture.taxVisible };
  Object.defineProperty(taxes, "tax_rate", {
    get: () => taxRate,
    set: (value) => {
      taxRate = value;
    },
  });
  const morale = {
    currentQuantity: fixture.morale,
    rateOfChange: fixture.projectedMorale,
    maxQuantity: fixture.maximumMorale,
  };
  Object.defineProperty(morale, "incomeAdusted", {
    get: () => moraleAdjusted,
    set: (value) => {
      trace.stateChange("morale.income-adjusted", {
        before: moraleAdjusted,
        after: value,
      });
      moraleAdjusted = value;
    },
  });
  const resources = {
    Morale: morale,
    Money: {
      storageRatio: fixture.moneyStorageRatio,
      isDemanded: () => {
        trace.managerCall("money.is-demanded");
        return fixture.moneyDemanded;
      },
    },
    Authority: {
      currentQuantity: fixture.authority,
      maxQuantity: fixture.maximumAuthority,
      isUnlocked: () => {
        trace.managerCall("authority.is-unlocked");
        return fixture.authorityUnlocked;
      },
    },
  };
  const game = {
    global: {
      civic: { taxes },
      race: fixture.banana ? { banana: true } : {},
    },
  };
  const taxControls = fixture.controlsAvailable
    ? {
        add: () => {
          const before = taxRate;
          trace.command("tax.add", { before, after: before + 1 });
          taxRate += 1;
          trace.stateChange("tax.rate", { before, after: taxRate });
        },
        sub: () => {
          const before = taxRate;
          trace.command("tax.sub", { before, after: before - 1 });
          taxRate -= 1;
          trace.stateChange("tax.rate", { before, after: taxRate });
        },
      }
    : undefined;
  const win = {
    document: {
      getElementById: (id) =>
        id === "tax_rates" && taxControls ? { __vue__: taxControls } : null,
    },
  };
  const testContext = {
    game,
    resources,
    settings: {
      generalRequestedTaxRate: fixture.requestedTaxRate,
      generalMinimumTaxRate: fixture.configuredMinimumTaxRate,
      generalMinimumMorale: fixture.minimumMorale,
      generalMaximumMorale: fixture.configuredMaximumMorale,
      generalMinimumAuthority: fixture.authorityTarget,
      authorityManage: fixture.authorityManage,
    },
    poly: {
      taxCap: (minimum) => {
        trace.managerCall("tax.cap", { minimum });
        return minimum ? fixture.minimumTaxRate : fixture.maximumTaxRate;
      },
    },
    win,
    keySet: (...args) => trace.managerCall("keys.set", { args }),
  };
  hooks.setAutoTaxTestContext(testContext);
  hooks.autoTax();
  return trace.snapshot();
}

// Read-only probes are excluded from the characterized traces: they observe
// state without issuing commands, so their ordering is not a behavioral contract.
const readOnlyManagerCalls = new Set([
  "money.is-demanded",
  "authority.is-unlocked",
]);
function runCase(overrides) {
  return executeCase(overrides).filter(
    (event) =>
      !(
        event.category === "manager-call" &&
        readOnlyManagerCalls.has(event.name)
      ),
  );
}

const cases = {
  "already adjusted": runCase({ moraleAdjusted: true }),
  "missing controls": runCase({ controlsAvailable: false }),
  "hidden taxes": runCase({ taxVisible: false }),
  "forced increase": runCase({ taxRate: 10, requestedTaxRate: 13 }),
  "forced fractional decrease": runCase({
    taxRate: 15,
    requestedTaxRate: 13.5,
  }),
  "forced no-op still marks adjusted": runCase({
    taxRate: 13,
    requestedTaxRate: 13,
  }),
  "banana lowers taxes": runCase({ banana: true }),
  "demanded money raises taxes": runCase({
    morale: 101,
    projectedMorale: 101,
    moneyDemanded: true,
  }),
  "authority target caps morale": runCase({
    morale: 101,
    projectedMorale: 101,
    maximumMorale: 140,
    authority: 80,
    maximumAuthority: 120,
    authorityTarget: 100,
  }),
  "independent add and subtract": runCase({
    taxRate: 30,
    morale: 101,
    projectedMorale: 102,
    moneyStorageRatio: 0.5,
  }),
};

assert.deepEqual(cases["already adjusted"], []);
assert.deepEqual(cases["missing controls"], []);
assert.deepEqual(cases["hidden taxes"], []);
assert.deepEqual(cases["forced increase"], [
  {
    category: "manager-call",
    name: "tax.cap",
    details: { minimum: false },
  },
  {
    category: "manager-call",
    name: "tax.cap",
    details: { minimum: true },
  },
  {
    category: "manager-call",
    name: "keys.set",
    details: { args: [false, false, false] },
  },
  ...[10, 11, 12].flatMap((before) => [
    {
      category: "command",
      name: "tax.add",
      details: { before, after: before + 1 },
    },
    {
      category: "state-change",
      name: "tax.rate",
      details: { before, after: before + 1 },
    },
  ]),
  {
    category: "state-change",
    name: "morale.income-adjusted",
    details: { before: false, after: true },
  },
]);
assert.deepEqual(
  cases["forced fractional decrease"].filter(
    ({ category }) => category === "command",
  ),
  [
    {
      category: "command",
      name: "tax.sub",
      details: { before: 15, after: 14 },
    },
    {
      category: "command",
      name: "tax.sub",
      details: { before: 14, after: 13 },
    },
    {
      category: "command",
      name: "tax.add",
      details: { before: 13, after: 14 },
    },
  ],
);
assert.deepEqual(
  cases["forced no-op still marks adjusted"].map(({ name }) => name),
  ["tax.cap", "tax.cap", "keys.set", "morale.income-adjusted"],
);
assert.deepEqual(
  cases["banana lowers taxes"].map(({ name }) => name),
  [
    "tax.cap",
    "tax.cap",
    "keys.set",
    "tax.sub",
    "tax.rate",
    "morale.income-adjusted",
  ],
);
assert.deepEqual(
  cases["demanded money raises taxes"].map(({ name }) => name),
  [
    "tax.cap",
    "tax.cap",
    "keys.set",
    "tax.add",
    "tax.rate",
    "morale.income-adjusted",
  ],
);
assert.deepEqual(
  cases["authority target caps morale"].map(({ name }) => name),
  [
    "tax.cap",
    "tax.cap",
    "keys.set",
    "tax.add",
    "tax.rate",
    "morale.income-adjusted",
  ],
);
assert.deepEqual(
  cases["independent add and subtract"].map(({ name }) => name),
  [
    "tax.cap",
    "tax.cap",
    "keys.set",
    "tax.add",
    "tax.rate",
    "morale.income-adjusted",
    "keys.set",
    "tax.sub",
    "tax.rate",
    "morale.income-adjusted",
  ],
);

console.log("Tax automation bundled characterization tests passed");
