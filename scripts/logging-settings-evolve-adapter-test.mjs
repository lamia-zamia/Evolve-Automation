import assert from "node:assert/strict";

import { createLoggingSettingsEvolveAdapter } from "../src/adapters/evolve/logging-settings.ts";

const game = { global: { settings: { locale: "en-US" } } };
const gameLog = {
  Types: { special: "Specials", research: "Research" },
};
const settingsRaw = { logFilter: "special" };

const adapter = createLoggingSettingsEvolveAdapter({
  getGame: () => game,
  getGameLog: () => gameLog,
  getSettingsRaw: () => settingsRaw,
});
const readModel = adapter.readLoggingSettingsReadModel();

assert.equal(readModel.sectionId, "logging");
assert.equal(readModel.locale, "en-US");
assert.equal(readModel.logFilter, "special");
assert.deepEqual(
  readModel.controls
    .filter((control) => control.kind === "toggle")
    .map((control) => control.settingName),
  ["logEnabled", "log_special", "log_research", "hellTurnOffLogMessages"],
);
assert.ok(Object.isFrozen(readModel));
assert.ok(Object.isFrozen(readModel.controls));

assert.throws(
  () =>
    createLoggingSettingsEvolveAdapter({
      getGame: () => ({}),
      getGameLog: () => gameLog,
      getSettingsRaw: () => settingsRaw,
    }).readLoggingSettingsReadModel(),
  /game\.global must be an object/,
);
assert.throws(
  () =>
    createLoggingSettingsEvolveAdapter({
      getGame: () => game,
      getGameLog: () => ({ Types: { special: 1 } }),
      getSettingsRaw: () => settingsRaw,
    }).readLoggingSettingsReadModel(),
  /GameLog\.Types\.special must be a string/,
);
assert.throws(
  () =>
    createLoggingSettingsEvolveAdapter({
      getGame: () => ({ global: { settings: { locale: 42 } } }),
      getGameLog: () => gameLog,
      getSettingsRaw: () => settingsRaw,
    }).readLoggingSettingsReadModel(),
  /game\.global\.settings\.locale must be a string/,
);
assert.throws(
  () =>
    createLoggingSettingsEvolveAdapter({
      getGame: () => game,
      getGameLog: () => gameLog,
      getSettingsRaw: () => ({}),
    }).readLoggingSettingsReadModel(),
  /settingsRaw\.logFilter must be a string/,
);

console.log("Logging settings Evolve adapter contract tests passed");
