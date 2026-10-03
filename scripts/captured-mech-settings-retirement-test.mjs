import assert from "node:assert/strict";

import { computeMechDefaults } from "../src/domain/settings-defaults.ts";
import { createCapturedMechSettingsReadModel } from "../src/domain/combat/mech-settings.ts";

const defaults = computeMechDefaults().def;
assert.equal(Object.hasOwn(defaults, "mechSpecial"), false);
assert.equal(Object.hasOwn(defaults, "mechInfernalCollector"), false);
assert.equal(defaults.mechWaygatePotential, 0.4);

const controls = createCapturedMechSettingsReadModel().controls;
const names = controls.flatMap((control) =>
  control.kind === "header" ? [] : [control.settingName],
);
assert.equal(names.includes("mechSpecial"), false);
assert.equal(names.includes("mechInfernalCollector"), false);
assert.equal(names.includes("mechWaygatePotential"), true);
