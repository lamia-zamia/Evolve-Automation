import assert from "node:assert/strict";
import { createSettingsStore } from "../../../src/adapters/browser/settings-store.ts";
import {
  createPage,
  createStorage,
} from "../../support/fixtures/settings-panel-fixture.mjs";

// --- import/export buttons: the player's way to configure every ported feature ------------------

{
  const {
    panel,
    root,
    saveText,
    settings,
    storage,
    downloads,
    effectiveSettings,
  } = createPage(JSON.stringify({ autoBuild: true }));
  panel.ensurePanel();
  const buttons = root.querySelectorAll("#script_importExportButtons");
  assert.equal(buttons.length, 1, "the script's buttons should be drawn once");
  // Anchored under the block holding the game's own save field, not under the Google Drive block
  // 1.5.0 appended after it.
  const siblings = buttons[0].parentElement.children;
  const precedingBlock = siblings[siblings.indexOf(buttons[0]) - 1];
  assert.equal(precedingBlock.querySelectorAll("#importExport").length, 1);
  panel.ensurePanel();
  assert.equal(root.querySelectorAll("#script_importExportButtons").length, 1);

  // Export writes the live record into the game's field and copies it.
  root.querySelectorAll("#script_settingsExport")[0].dispatch("click");
  assert.deepEqual(JSON.parse(saveText.value), settings.readRaw());

  // Import replaces the record, persists it, and clears the field.
  saveText.value = JSON.stringify({
    autoBuild: false,
    autoResearch: true,
    prestigeWhiteholeEjectEnabled: true,
  });
  root.querySelectorAll("#script_settingsImport")[0].dispatch("click");
  assert.equal(saveText.value, "");
  assert.equal(settings.readRaw()["autoBuild"], false);
  assert.equal(settings.readRaw()["autoResearch"], true);
  assert.equal(settings.readRaw()["autoEject"], true);
  assert.equal(settings.readRaw()["prestigeWhiteholeEjectEnabled"], undefined);
  assert.equal(effectiveSettings.autoBuild, false);
  assert.equal(settings.readRaw()["autoJobs"], false);
  assert.equal(settings.readRaw()["tickRate"], 4);
  assert.equal(JSON.parse(storage.writes())["autoResearch"], true);
  // The panel drawn from the replaced record is gone, and the next tick rebuilds it.
  assert.equal(root.querySelectorAll("#script_settings").length, 0);
  assert.equal(root.querySelectorAll("#autoScriptContainer").length, 0);
  panel.ensurePanel();
  assert.equal(root.querySelectorAll("#script_settings").length, 1);
  assert.equal(root.querySelectorAll("#autoScriptContainer").length, 1);

  // The file button hands the page a pretty-printed copy.
  root.querySelectorAll("#script_settingsFile")[0].dispatch("click");
  assert.equal(downloads.length, 1);
  assert.equal(JSON.parse(downloads[0])["autoResearch"], true);
  assert.ok(
    downloads[0].split("\n").length > 1,
    "the file copy is pretty printed",
  );
}

// --- a blob that is not settings is refused, and one carrying code asks first ---------------------

{
  const { panel, root, saveText, settings, logged } = createPage(
    JSON.stringify({ autoBuild: true }),
  );
  panel.ensurePanel();
  const importButton = root.querySelectorAll("#script_settingsImport")[0];

  for (const [text, reason] of [
    ["{", /not valid JSON/],
    ["[1,2]", /not a settings object/],
  ]) {
    saveText.value = text;
    importButton.dispatch("click");
    assert.equal(settings.readRaw()["autoBuild"], true, text);
    assert.match(logged.at(-1), reason);
    assert.equal(saveText.value, text, "a refused blob stays in the field");
  }
  saveText.value = "{}";
  importButton.dispatch("click");
  assert.equal(settings.readRaw()["autoBuild"], false);
  assert.equal(saveText.value, "");
}

{
  // An imported custom expression is code the evaluator will run, so it is shown and confirmed.
  const withEval = JSON.stringify({
    autoBuild: false,
    triggers: [{ requirementType: "Eval", requirementId: "fetch('/x')" }],
    log_prestige_format: "{eval:document.cookie}",
    overrides: {
      autoResearch: [{ type1: "Eval", arg1: "alert(1)", type2: "Number" }],
    },
  });

  const refused = createPage(JSON.stringify({ autoBuild: true }), {
    confirmAnswer: false,
  });
  refused.panel.ensurePanel();
  refused.saveText.value = withEval;
  refused.root.querySelectorAll("#script_settingsImport")[0].dispatch("click");
  assert.equal(refused.settings.readRaw()["autoBuild"], true);
  const warning = refused.confirmed.at(-1);
  for (const source of ["alert(1)", "fetch('/x')"]) {
    assert.ok(warning.includes(source), `${source} should be shown`);
  }
  assert.equal(warning.includes("{eval:document.cookie}"), false);

  const accepted = createPage(JSON.stringify({ autoBuild: true }));
  accepted.panel.ensurePanel();
  accepted.saveText.value = withEval;
  accepted.root.querySelectorAll("#script_settingsImport")[0].dispatch("click");
  assert.equal(accepted.settings.readRaw()["autoBuild"], false);
}

// --- the store itself -----------------------------------------------------------------------------

{
  const corrupt = createStorage("not json");
  const logged = [];
  const store = createSettingsStore({
    storage: corrupt,
    logError: (message) => logged.push(message),
  });
  assert.deepEqual(store.readRaw(), {});
  assert.equal(logged.length, 1);
  assert.match(logged[0], /could not be parsed/);

  // An array is a valid JSON document and an invalid settings blob.
  const arrayStore = createSettingsStore({ storage: createStorage("[1,2]") });
  assert.deepEqual(arrayStore.readRaw(), {});

  // The record is the same object across reads, so a UI write is visible to the runtime at once.
  const live = createSettingsStore({ storage: createStorage('{"a":1}') });
  assert.equal(live.readRaw(), live.readRaw());
  live.readRaw()["b"] = 2;
  assert.equal(live.readRaw()["b"], 2);

  // Absent storage is survivable rather than fatal: nothing to read, nothing to write.
  const none = createSettingsStore({ storage: undefined });
  assert.deepEqual(none.readRaw(), {});
  none.persist();
}

console.log("captured-settings-panel-import-export passed");
