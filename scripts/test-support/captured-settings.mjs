/**
 * Shared plumbing for the captured settings tests.
 *
 * Only the generic pieces live here — a fake storage, a fake control registry, a minimal game
 * root, and the lifecycle wiring every settings test needs before it can assert anything. Each
 * test keeps its own domain state and assertions explicit; nothing here decides what is correct.
 */

import { createSettingsStore } from "../../src/adapters/browser/settings-store.ts";
import { createCapturedSettingsDefaults } from "../../src/adapters/evolve/captured-settings-defaults.ts";
import { createCapturedSettingsLifecycle } from "../../src/application/captured-settings-lifecycle.ts";

/** A `localStorage`-shaped object over one in-memory slot, with a `read()` for assertions. */
export function createFakeStorage(initial = null) {
  let value = initial;
  return {
    getItem(key) {
      return key === "settings" ? value : null;
    },
    setItem(key, next) {
      if (key === "settings") value = next;
    },
    read() {
      return value;
    },
  };
}

/**
 * A `GameControlRegistry` over an explicit id -> handle map. Tests that care which handles exist
 * build the map; nothing here decides what a handle looks like.
 */
export function createCapturedControls(controlsById) {
  const byId =
    controlsById instanceof Map ? controlsById : new Map(controlsById ?? []);
  return {
    resolve: (id) => byId.get(id),
    invoke: () => ({ ok: false, reason: "unknown-method" }),
    capturedElementIds: () => [...byId.keys()],
  };
}

/** A `GameRootStateSource` over a root the test owns, with reactivity and replacement inert. */
export function createCapturedRootState(readRoot) {
  return {
    readRoot,
    isReactivitySuppressed: () => false,
    subscribeRootReplaced: () => () => {},
  };
}

/** A `GameControlRegistry` that resolves exactly the ids it was given. */
export function createControlRegistry(ids = []) {
  return {
    capturedElementIds: () => ids,
    resolve: (id) =>
      ids.includes(id)
        ? {
            elementId: id,
            generation: 1,
            methods: ["add", "sub", "setDefault"],
          }
        : undefined,
  };
}

function job(name, extra = {}) {
  return {
    job: name,
    assigned: 0,
    workers: 0,
    max: -1,
    display: true,
    ...extra,
  };
}

/** The smallest game root the settings defaults can be computed against. */
export function createSettingsRoot(overrides = {}) {
  return {
    race: { universe: "standard", governor: { tasks: {} } },
    civic: {
      d_job: "unemployed",
      unemployed: job("unemployed", { workers: 10 }),
      farmer: job("farmer"),
      teamster: job("teamster"),
    },
    resource: {},
    tech: {},
    ...overrides,
  };
}

export const DEFAULT_CONTROL_IDS = Object.freeze([
  "civ-unemployed",
  "civ-farmer",
  "civ-teamster",
]);

/** Store + defaults + lifecycle over one fake storage slot, as production composes them. */
export function createSettingsFixture({
  rawText = null,
  controlIds = DEFAULT_CONTROL_IDS,
  gameRoot = createSettingsRoot(),
  saved = createFakeStorage(rawText),
  settings = createSettingsStore({ storage: saved }),
} = {}) {
  const lifecycle = createCapturedSettingsLifecycle({
    settings,
    defaults: createCapturedSettingsDefaults({
      rootState: { readRoot: () => gameRoot },
      controls: createControlRegistry(controlIds),
    }),
  });
  return { saved, settings, lifecycle, gameRoot };
}

/** One valid, always-true override definition — the shape the editor and the store accept. */
export const ALWAYS_TRUE_OVERRIDE = Object.freeze([
  Object.freeze({
    type1: "Boolean",
    arg1: true,
    type2: "Boolean",
    arg2: true,
    cmp: "==",
    ret: true,
  }),
]);

/** Seeds `overrides` with a bare (always-true) definition per key, as the editor stores them. */
export function seedOverrides(settings, keys) {
  const overrides = settings.readRaw().overrides;
  for (const key of keys) {
    overrides[key] = [
      {
        type1: "Boolean",
        arg1: true,
        type2: "Boolean",
        arg2: true,
        cmp: "==",
        ret: true,
      },
    ];
  }
  return overrides;
}

/**
 * A lifecycle over a plain settings object, for adapter tests that already hold one. Section
 * reset is the lifecycle's job, so a test that asserts what a reset writes drives it from here
 * rather than from the adapter under test.
 */
export function createRecordSettingsLifecycle({ raw, rootState, controls }) {
  return createCapturedSettingsLifecycle({
    settings: {
      readRaw: () => raw,
      persist: () => {},
      replaceRaw: () => {},
    },
    defaults: createCapturedSettingsDefaults({ rootState, controls }),
  });
}
