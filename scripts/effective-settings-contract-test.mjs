/**
 * The effective-settings contract, pinned.
 *
 * The effective settings are a layered lookup view: own properties are the current pass's override
 * decisions, everything else resolves through the raw record behind them. That is deliberate — it
 * is what keeps an override pass from copying thousands of keys every tick — and it is easy to
 * misuse, so the misuse is asserted here as documentation rather than left to a comment.
 */

import assert from "node:assert/strict";

import {
  layerSettingsOver,
  materializeSettings,
} from "../src/domain/settings-layer.ts";
import { createOverrideSettings } from "../src/application/override-settings.ts";
import { createCapturedSettingsLifecycle } from "../src/application/captured-settings-lifecycle.ts";

const ALWAYS_TRUE = Object.freeze([
  Object.freeze({
    type1: "Boolean",
    arg1: true,
    cmp: "==",
    type2: "Boolean",
    arg2: true,
    ret: 2,
  }),
]);

/** An override source that resolves every condition against the raw record it is handed. */
function overrideRuntime(getRaw, getEffective) {
  return createOverrideSettings({
    getSafeMode: () => false,
    getSettings: getEffective,
    getSettingsRaw: getRaw,
    source: {
      sampleEvaluator: () => ({
        hasOperandType: (operandType) => operandType === "Boolean",
        readOperand: (_operandType, argument) => argument,
        hasComparator: (comparator) => comparator === "==",
        compare: (_comparator, left, right) => left === right,
        comparatorReturnsRightOperand: () => false,
      }),
      readForcedTasks: () => ({
        storageTaskActive: false,
        trashTaskActive: false,
        taxTaskActive: false,
      }),
    },
    reporter: { report: () => {} },
    display: { publish: () => {} },
  });
}

// --- 1. an ordinary setting is inherited, never an own property ---------------------------------

{
  const raw = { foo: 1, overrides: {} };
  const effective = {};
  layerSettingsOver(effective, raw);

  assert.equal(
    Object.hasOwn(effective, "foo"),
    false,
    "an unoverridden setting must not be an own property of the effective view",
  );
  assert.equal(
    effective.foo,
    1,
    "it must still resolve through the raw record",
  );
}

// --- 2. an override wins as an own property and leaves the raw record alone ----------------------

{
  const raw = { foo: 1, overrides: { foo: ALWAYS_TRUE } };
  const effective = {};
  const overrides = overrideRuntime(
    () => raw,
    () => effective,
  );

  overrides.updateOverrides();
  assert.equal(raw.foo, 1, "an override must never write the persisted record");
  assert.equal(effective.foo, 2);
  assert.equal(Object.hasOwn(effective, "foo"), true);

  // Removing the override and re-running the pass drops the decision, so the key resolves to the
  // stored value again without anyone having to restore it.
  raw.overrides = {};
  overrides.updateOverrides();
  assert.equal(effective.foo, 1);
  assert.equal(Object.hasOwn(effective, "foo"), false);
}

// --- 3. enumerating the layered view does NOT describe the effective record ----------------------

{
  const raw = {
    foo: 1,
    bar: "two",
    baz: false,
    overrides: { foo: ALWAYS_TRUE },
  };
  const effective = {};
  overrideRuntime(
    () => raw,
    () => effective,
  ).updateOverrides();

  // This is the misuse the contract exists to warn about, asserted so it stays visible: every one
  // of these sees the overrides alone.
  const enumerated = Object.keys(effective);
  assert.ok(enumerated.includes("foo"), "the override is an own property");
  for (const key of ["bar", "baz", "overrides"]) {
    assert.equal(
      enumerated.includes(key),
      false,
      `${key} is part of the effective record but not of its own keys`,
    );
  }
  assert.deepEqual(Object.keys({ ...effective }), enumerated);
  assert.deepEqual(Object.keys(Object.assign({}, effective)), enumerated);
  assert.deepEqual(
    Object.keys(JSON.parse(JSON.stringify(effective))),
    enumerated,
  );
  assert.equal(Object.hasOwn(effective, "bar"), false);
  assert.equal(
    effective.bar,
    "two",
    "the key a copy dropped is still readable on the layered view",
  );

  // Materializing is the supported way to get a complete record.
  const materialized = materializeSettings(effective);
  assert.equal(materialized.foo, 2, "the override must win in the snapshot");
  assert.equal(materialized.bar, "two");
  assert.equal(materialized.baz, false);
  for (const key of Object.keys(raw)) {
    assert.ok(
      Object.hasOwn(materialized, key),
      `${key} must be an own property of the materialized snapshot`,
    );
  }
  assert.equal(
    Object.getPrototypeOf(materialized),
    Object.prototype,
    "a materialized snapshot is a plain record, not another layer",
  );
  // Materializing copies; writing to the snapshot must not reach either layer.
  materialized.bar = "changed";
  assert.equal(raw.bar, "two");
  assert.equal(effective.bar, "two");
}

// --- 4. replacing the raw record re-bases the same effective object ------------------------------

{
  let raw = { foo: 1, overrides: {} };
  const effective = {};
  const overrides = overrideRuntime(
    () => raw,
    () => effective,
  );
  overrides.syncStoredSettings();
  assert.equal(effective.foo, 1);
  assert.equal(Object.getPrototypeOf(effective), raw);

  // What an import or a settings reset does: the store hands out a different object.
  const replaced = { foo: 9, overrides: {} };
  raw = replaced;
  overrides.syncStoredSettings();
  assert.equal(Object.getPrototypeOf(effective), replaced);
  assert.equal(
    effective.foo,
    9,
    "after a rebase the view must resolve from the new raw record",
  );
}

// --- 5. the lifecycle exposes raw, layered and materialized as three distinct answers ------------

{
  const stored = { foo: 1, overrides: { foo: ALWAYS_TRUE } };
  const store = {
    readRaw: () => stored,
    replaceRaw: () => {},
    persist: () => {},
  };
  const lifecycle = createCapturedSettingsLifecycle({
    settings: store,
    defaults: {
      startupReader: {},
      reader: {},
      effects: {},
      settingsSections: [],
      techIds: {},
      marketPriorityIds: [],
      resourceIds: [],
      projectIds: [],
      buildings: {},
      crafterOriginalIds: [],
      discoveredResetNames: [],
      readCatalogGeneration: () => "fixed",
      readMigrationCatalogs: () => ({}),
    },
  });
  const effective = lifecycle.readEffective();
  overrideRuntime(lifecycle.readRaw, () => effective).updateOverrides();

  assert.equal(lifecycle.readRaw().foo, 1, "readRaw is the persisted record");
  assert.equal(lifecycle.readEffective().foo, 2, "readEffective resolves it");
  assert.equal(
    Object.keys(lifecycle.readEffective()).includes("overrides"),
    false,
    "readEffective is a lookup view, not a complete record",
  );
  const materialized = lifecycle.materializeEffective();
  assert.equal(materialized.foo, 2);
  assert.ok(Object.hasOwn(materialized, "overrides"));
}

console.log("effective settings contract checks passed");
