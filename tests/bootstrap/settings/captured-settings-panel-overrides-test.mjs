import assert from "node:assert/strict";

import { createPage } from "../../support/fixtures/settings-panel-fixture.mjs";

// --- the captured settings UI opens and edits the persisted override definition ---------------

{
  const page = createPage(JSON.stringify({ autoBuild: false }));
  page.panel.ensurePanel();
  const target = page.root.querySelectorAll(".script_autoBuild")[0];
  target.parentElement.dispatch("click", target, { ctrlKey: true });
  assert.equal(
    page.root.querySelectorAll("#script_autoBuildModal").length,
    1,
    "Ctrl-clicking a captured setting opens the real override editor",
  );
  assert.deepEqual(page.diagnostics, []);

  const add = page.root
    .querySelectorAll("#script_autoBuild_d")[0]
    .querySelectorAll("a")[0];
  add.dispatch("click");
  assert.equal(page.settings.readRaw().autoBuild, false);
  assert.equal(page.settings.readRaw().overrides.autoBuild.length, 1);

  const row = page.root.querySelectorAll("#script_autoBuild_o0")[0];
  const conditionInputs = row.querySelectorAll("input");
  conditionInputs[0].checked = false;
  conditionInputs[0].dispatch("change");
  const resultInput = conditionInputs.at(-1);
  resultInput.checked = true;
  resultInput.dispatch("change");
  assert.equal(page.settings.readRaw().autoBuild, false);
  assert.equal(page.effectiveSettings.autoBuild, true);

  // Editing the base setting while the override matches changes raw state only.
  target.checked = true;
  target.dispatch("change");
  assert.equal(page.settings.readRaw().autoBuild, true);
  assert.equal(page.effectiveSettings.autoBuild, true);

  // The condition stops matching, so the effective value falls back to the new raw value.
  conditionInputs[1].checked = true;
  conditionInputs[1].dispatch("change");
  assert.equal(page.effectiveSettings.autoBuild, true);

  // Editing the override itself still leaves the base value alone.
  conditionInputs[1].checked = false;
  conditionInputs[1].dispatch("change");
  const editedResult = row.querySelectorAll("input").at(-1);
  editedResult.checked = false;
  editedResult.dispatch("change");
  assert.equal(page.settings.readRaw().autoBuild, true);
  assert.equal(page.settings.readRaw().overrides.autoBuild[0].ret, false);
  assert.equal(page.effectiveSettings.autoBuild, false);

  const savedWithOverride = page.storage.writes();
  const reloaded = createPage(savedWithOverride);
  reloaded.panel.ensurePanel();
  assert.equal(reloaded.settings.readRaw().autoBuild, true);
  assert.equal(reloaded.settings.readRaw().overrides.autoBuild.length, 1);
  assert.equal(reloaded.effectiveSettings.autoBuild, false);

  // Deleting the authored definition restores the raw value and persists the deletion.
  const remove = page.root
    .querySelectorAll("#script_autoBuild_o0")[0]
    .querySelectorAll("a")[0];
  remove.dispatch("click");
  assert.equal(page.settings.readRaw().overrides.autoBuild, undefined);
  assert.equal(page.settings.readRaw().autoBuild, true);
  assert.equal(page.effectiveSettings.autoBuild, true);
  assert.equal(
    JSON.parse(page.storage.writes()).overrides.autoBuild,
    undefined,
  );
}

// --- real settings editor composition ----------------------------------------------------------

// The production modal routes duplicate and drag reorder through the same application editor.
{
  const page = createPage(JSON.stringify({ autoBuild: false }));
  const sortableInstances = new WeakMap();
  let latestSortable;
  page.pageWindow.Sortable = {
    create(container, options) {
      const instance = { options, destroy() {} };
      sortableInstances.set(container, instance);
      latestSortable = instance;
    },
    get(container) {
      return sortableInstances.get(container) ?? null;
    },
  };
  page.panel.ensurePanel();
  const target = page.root.querySelectorAll(".script_autoBuild")[0];
  target.parentElement.dispatch("click", target, { ctrlKey: true });
  page.root
    .querySelectorAll("#script_autoBuild_d")[0]
    .querySelectorAll("a")[0]
    .dispatch("click");

  let duplicate = page.root.querySelectorAll("#script_autoBuild_o0")[0];
  duplicate.querySelectorAll("a")[1].dispatch("click");
  assert.equal(page.settings.readRaw().overrides.autoBuild.length, 2);
  const secondResult = page.root
    .querySelectorAll("#script_autoBuild_o1")[0]
    .querySelectorAll("input")
    .at(-1);
  secondResult.checked = true;
  secondResult.dispatch("change");

  const table = page.root.querySelectorAll("#script_autoBuildModalTable")[0];
  const first = page.root.querySelectorAll("#script_autoBuild_o0")[0];
  const second = page.root.querySelectorAll("#script_autoBuild_o1")[0];
  for (const row of table.children) {
    row.matches = (selector) =>
      selector === "tr:not(.unsortable)" &&
      !row.classList.contains("unsortable");
  }
  table.insertBefore(second, first);
  latestSortable.options.onUpdate();
  assert.deepEqual(
    page.settings.readRaw().overrides.autoBuild.map(({ ret }) => ret),
    [true, false],
  );
  assert.deepEqual(
    JSON.parse(page.storage.writes()).overrides.autoBuild.map(({ ret }) => ret),
    [true, false],
    "duplicate and reorder edits persist through the application service",
  );

  const reorderedFirst = page.root.querySelectorAll("#script_autoBuild_o0")[0];
  reorderedFirst.querySelectorAll("a")[0].dispatch("click");
  assert.deepEqual(
    page.settings.readRaw().overrides.autoBuild.map(({ ret }) => ret),
    [false],
  );
}

// The real Research panel's autocomplete selects, adds, and removes a technology id.
{
  const page = createPage(
    JSON.stringify({ researchIgnore: ["retired-tech"] }),
    { allSections: true },
  );
  page.gameRoot.tech["physics"] = {};
  page.panel.ensurePanel();
  const search = page.root.querySelectorAll(
    ".script_bg_researchIgnore input",
  )[0];
  assert.ok(
    search,
    "the captured Research panel renders its object-list input",
  );
  search.dispatch("focus");
  search.value = "tech-physics";
  search.dispatch("input");
  const suggestion = page.root.querySelectorAll("ul li")[0];
  assert.ok(
    suggestion,
    "the production autocomplete offers captured technology ids",
  );
  suggestion.dispatch("mousedown");
  const buttons = page.root.querySelectorAll(
    ".script_bg_researchIgnore button",
  );
  buttons[1].dispatch("click");
  assert.deepEqual(page.settings.readRaw().researchIgnore, [
    "retired-tech",
    "tech-physics",
  ]);
  assert.deepEqual(JSON.parse(page.storage.writes()).researchIgnore, [
    "retired-tech",
    "tech-physics",
  ]);
  buttons[0].dispatch("click");
  assert.deepEqual(page.settings.readRaw().researchIgnore, ["retired-tech"]);
  assert.deepEqual(JSON.parse(page.storage.writes()).researchIgnore, [
    "retired-tech",
  ]);
  assert.equal(
    page.root.querySelectorAll(".script_researchIgnore")[0].value,
    "retired-tech",
    "stale stored ids remain visible and removable items do not erase them",
  );
}

console.log("captured-settings-panel-overrides passed");
