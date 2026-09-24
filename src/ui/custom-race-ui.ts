/**
 * Settings editor for named Custom Race preset exports. The live race editor remains the game's
 * native Ascension Lab, where DeadSpace owns trait descriptions, ranks and gene scoring.
 */

import {
  normalizeCustomRacePresetList,
  type CustomRacePreset,
} from "../domain/progression/prestige/custom-race.ts";
import type {
  CustomRaceSavedSlot,
  GameCustomRaceLabPort,
} from "../ports/game-custom-race-lab.ts";
import type { EditableInput } from "./jquery.ts";

interface PresetEditorNode {
  append(content: string | PresetEditorNode): PresetEditorNode;
  appendTo(target: PresetEditorNode): PresetEditorNode;
  empty(): PresetEditorNode;
  find(selector: string): PresetEditorNode;
  off(events: string): PresetEditorNode;
  on(events: string, handler: (this: EditableInput) => void): PresetEditorNode;
  text(value: string): PresetEditorNode;
  val(): string;
  val(value: string): PresetEditorNode;
}

type PresetEditorJQuery = (selector: string) => PresetEditorNode;

export interface CustomRacePresetEditorDependencies {
  readonly getJQuery: () => PresetEditorJQuery;
  readonly getSettingsRaw: () => unknown;
  readonly persist: () => void;
  readonly customRaceLab: GameCustomRaceLabPort;
  readonly onSettingsChanged?: () => void;
}

export interface CustomRacePresetEditor {
  buildCustomRacePresetEditor(modal: PresetEditorNode): void;
}

export function createCustomRacePresetEditor({
  getJQuery,
  getSettingsRaw,
  persist,
  customRaceLab,
  onSettingsChanged = () => {},
}: CustomRacePresetEditorDependencies): CustomRacePresetEditor {
  function settingsRecord(): Record<string, unknown> {
    const settings = getSettingsRaw();
    if (
      typeof settings !== "object" ||
      settings === null ||
      Array.isArray(settings)
    ) {
      return {};
    }
    return settings as Record<string, unknown>;
  }

  function storePresets(
    presets: readonly CustomRacePreset[],
    selected: number,
  ): void {
    const settings = settingsRecord();
    settings["prestigeCustomRacePresets"] = presets.map((preset) => ({
      name: preset.name,
      json: preset.json,
    }));
    settings["prestigeCustomRacePreset"] = String(selected);
    persist();
    onSettingsChanged();
  }

  function buildCustomRacePresetEditor(modal: PresetEditorNode): void {
    const $ = getJQuery();
    const settings = settingsRecord();
    const presets = normalizeCustomRacePresetList(settings).map((preset) => ({
      name: preset.name,
      json: preset.json,
    }));
    const requestedIndex = Number.parseInt(
      String(settings["prestigeCustomRacePreset"] ?? "0"),
      10,
    );
    const selected =
      Number.isInteger(requestedIndex) &&
      requestedIndex >= 0 &&
      requestedIndex < presets.length
        ? requestedIndex
        : 0;
    const preset = presets[selected]!;

    modal.empty().off("*").append(`
      <h3>Custom Race Presets</h3>
      <p>Edit named game exports here. Use the game's Export control in the Ascension Lab to create a preset; the game owns the race editor and its gene calculation.</p>
      <div class="fields script-custom-race-presets">
        <select class="script-custom-race-preset-list"></select>
        <input class="script-custom-race-preset-name" type="text" maxlength="60" aria-label="Preset name">
        <button class="button script-custom-race-preset-add" type="button">Add</button>
        <button class="button script-custom-race-preset-clone" type="button">Clone</button>
        <button class="button script-custom-race-preset-delete" type="button">Delete</button>
        <button class="button script-custom-race-capture-race0" type="button">Capture saved custom</button>
        <button class="button script-custom-race-capture-race1" type="button">Capture saved hybrid</button>
      </div>
      <textarea class="textarea script-custom-race-preset-json" rows="24" spellcheck="false" aria-label="Game custom race JSON"></textarea>
      <p class="script-custom-race-preset-status" role="status"></p>
    `);

    const select = modal.find(".script-custom-race-preset-list").empty();
    presets.forEach((item, index) => {
      $("<option></option>")
        .val(String(index))
        .text(item.name || `Preset ${index + 1}`)
        .appendTo(select);
    });
    select.val(String(selected));
    const nameInput = modal
      .find(".script-custom-race-preset-name")
      .val(preset.name);
    const jsonInput = modal
      .find(".script-custom-race-preset-json")
      .val(preset.json);
    const status = modal.find(".script-custom-race-preset-status");

    const saveCurrent = (): void => {
      preset.name =
        nameInput.val().trim().slice(0, 60) || `Preset ${selected + 1}`;
      preset.json = jsonInput.val();
      storePresets(presets, selected);
    };
    nameInput.on("change", function () {
      preset.name = this.value.trim().slice(0, 60) || `Preset ${selected + 1}`;
      storePresets(presets, selected);
      buildCustomRacePresetEditor(modal);
    });
    jsonInput.on("change", function () {
      preset.json = this.value;
      storePresets(presets, selected);
      status.text("Preset saved.");
    });
    select.on("change", function () {
      saveCurrent();
      settingsRecord()["prestigeCustomRacePreset"] = this.value;
      persist();
      onSettingsChanged();
      buildCustomRacePresetEditor(modal);
    });
    modal.find(".script-custom-race-preset-add").on("click", function () {
      presets.push({ name: `Preset ${presets.length + 1}`, json: "" });
      storePresets(presets, presets.length - 1);
      buildCustomRacePresetEditor(modal);
    });
    modal.find(".script-custom-race-preset-clone").on("click", function () {
      saveCurrent();
      presets.push({ name: `${preset.name} copy`, json: preset.json });
      storePresets(presets, presets.length - 1);
      buildCustomRacePresetEditor(modal);
    });
    modal.find(".script-custom-race-preset-delete").on("click", function () {
      if (presets.length > 1) presets.splice(selected, 1);
      else presets[0] = { name: "General", json: "" };
      storePresets(presets, 0);
      buildCustomRacePresetEditor(modal);
    });
    const captureSaved = (slot: CustomRaceSavedSlot): void => {
      const json = customRaceLab.readSavedRaceJson(slot);
      if (json === undefined) {
        status.text(
          slot === "race0"
            ? "There is no saved custom race to capture."
            : "There is no saved hybrid race to capture.",
        );
        return;
      }
      preset.json = json;
      jsonInput.val(json);
      storePresets(presets, selected);
      status.text("Saved race copied into this preset.");
    };
    modal.find(".script-custom-race-capture-race0").on("click", function () {
      captureSaved("race0");
    });
    modal.find(".script-custom-race-capture-race1").on("click", function () {
      captureSaved("race1");
    });
  }

  return Object.freeze({ buildCustomRacePresetEditor });
}
