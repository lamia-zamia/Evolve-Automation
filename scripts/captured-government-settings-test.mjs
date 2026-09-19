import assert from "node:assert/strict";

import {
  readCapturedGovernmentOptions,
  readCapturedGovernorOptions,
} from "../src/adapters/evolve/civic/captured-government-settings-catalog.ts";
import { createCapturedGovernmentSettingsAdapter } from "../src/adapters/evolve/civic/captured-government-settings.ts";

// The eleven governments drawGovModal offers, in its order; anarchy is never offered.
assert.deepEqual(
  readCapturedGovernmentOptions().map((option) => option.val),
  [
    "autocracy",
    "democracy",
    "oligarchy",
    "theocracy",
    "republic",
    "socialist",
    "corpocracy",
    "technocracy",
    "federation",
    "magocracy",
    "dictator",
  ],
);
assert.deepEqual(
  readCapturedGovernorOptions().map((option) => option.val),
  [
    "soldier",
    "criminal",
    "entrepreneur",
    "educator",
    "spiritual",
    "bluecollar",
    "noble",
    "media",
    "sports",
    "bureaucrat",
  ],
);
for (const option of [
  ...readCapturedGovernmentOptions(),
  ...readCapturedGovernorOptions(),
]) {
  assert.equal(option.label, option.val);
  assert.equal(option.hint, "");
}
assert.ok(Object.isFrozen(readCapturedGovernmentOptions()));

const raw = {
  autoGovernment: true,
  govInterim: "autocracy",
  govGovernor: "soldier",
};
const adapter = createCapturedGovernmentSettingsAdapter({
  getSettingsRaw: () => raw,
});
const model = adapter.readGovernmentSettingsReadModel();
assert.equal(model.sectionId, "government");
assert.equal(model.sectionName, "Government");
assert.equal(model.controls.length, 8);
const numbers = model.controls.filter((control) => control.kind === "number");
assert.deepEqual(
  numbers.map((control) => control.settingName),
  [
    "generalRequestedTaxRate",
    "generalMinimumTaxRate",
    "generalMinimumMorale",
    "generalMaximumMorale",
  ],
);
const selects = model.controls.filter((control) => control.kind === "select");
assert.deepEqual(
  selects.map((control) => control.settingName),
  ["govInterim", "govFinal", "govSpace", "govGovernor"],
);
for (const control of selects.slice(0, 3)) {
  assert.equal(control.options[0].val, "none");
  assert.equal(control.options.length, 12);
}
assert.deepEqual(
  selects[3].options.map((option) => option.val),
  [
    "none",
    "soldier",
    "criminal",
    "entrepreneur",
    "educator",
    "spiritual",
    "bluecollar",
    "noble",
    "media",
    "sports",
    "bureaucrat",
  ],
);

adapter.resetToDefaults();
assert.deepEqual(raw, {
  autoGovernment: false,
  autoTax: false,
  generalRequestedTaxRate: -1,
  generalMinimumTaxRate: 20,
  generalMinimumMorale: 105,
  generalMaximumMorale: 500,
  govInterim: "democracy",
  govFinal: "technocracy",
  govSpace: "corpocracy",
  govGovernor: "none",
});

// A missing record is a no-op rather than a crash.
const missing = createCapturedGovernmentSettingsAdapter({
  getSettingsRaw: () => undefined,
});
missing.resetToDefaults();

console.log("captured government settings ok");
