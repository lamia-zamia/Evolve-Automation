/**
 * The custom-race preset editor and the lab automation that submits a preset.
 *
 * TRANSITIONAL: the node, document, and lab surfaces below are the game's jQuery, DOM, and Vue 2
 * celestial-lab component today. They are declared as narrow structural types so replacing that
 * surface is a local change.
 */

import type {
  CustomRaceDraft,
  TraitDefinition,
} from "../game/custom-race-model.ts";
import type { EditableInput } from "./jquery.ts";

/** The raw element `each` hands its callback. This module only re-wraps it with `$`. */
type RaceElement = object;

/** The jQuery node surface this editor drives. */
interface RaceNode {
  addClass(className: string): RaceNode;
  append(content: string): RaceNode;
  appendTo(target: RaceNode): RaceNode;
  attr(name: string, value: string): RaceNode;
  before(content: RaceNode): RaceNode;
  closest(selector: string): RaceNode;
  each(callback: (this: RaceElement) => void): RaceNode;
  empty(): RaceNode;
  find(selector: string): RaceNode;
  html(content: string): RaceNode;
  readonly length: number;
  off(events: string): RaceNode;
  on(events: string, handler: (this: EditableInput) => void): RaceNode;
  prop(name: string): boolean;
  prop(name: string, value: boolean): RaceNode;
  removeClass(className: string): RaceNode;
  text(value: string): RaceNode;
  toggle(visible: boolean): RaceNode;
  toggleClass(className: string, state: boolean): RaceNode;
  val(): string;
  val(value: string): RaceNode;
}

type RaceJQuery = (target: string | RaceElement) => RaceNode;

/** The one element operation the lab automation performs. */
interface LabButton {
  click(): void;
}

interface RaceDocument {
  querySelector(selector: string): LabButton | null;
}

interface CustomRacePreset {
  name: string;
  json: string;
}

/**
 * The stored preset list and selection.
 *
 * Settings import can put any shape under `prestigeCustomRacePresets`, so this describes the
 * normalized list: `getCustomRacePreset` and the editor's entry both re-validate what they read.
 */
interface CustomRacePresetSettings {
  prestigeCustomRacePresets: CustomRacePreset[];
  prestigeCustomRacePreset: string;
}

/** The effective settings the lab automation reads. */
interface CustomRaceAutomationSettings extends CustomRacePresetSettings {
  masterScriptToggle: boolean;
  autoPrestige: boolean;
  prestigeType: string;
  prestigeCustomRaceMode: string;
}

interface CustomRaceUIState {
  /** The preset the last import attempt read, so one failure is reported once. */
  customRaceImportAttempt: string | null;
  goal: string;
}

/** The saved custom race the lab keeps. It stores its trait ids under `traits`. */
interface SavedCustomRace extends Partial<CustomRaceDraft> {
  traits?: string[];
}

interface CustomRaceUIGame {
  global: {
    stats: { achieve: Record<string, { l?: number } | undefined> };
    custom?: { race0?: SavedCustomRace };
  };
  traits: Record<string, TraitDefinition | undefined>;
  loc(id: string): string;
}

interface CustomRaceUIPoly {
  genus_traits: Record<string, Record<string, unknown> | undefined>;
}

/** The celestial lab's live design object: a draft whose rank map may not exist yet. */
type CelestialLabDesign = Omit<CustomRaceDraft, "ranks"> & {
  ranks?: Record<string, number>;
};

interface CelestialLabVue {
  g?: CelestialLabDesign;
  geneEdit(): void;
}

/** The identity fields a preset must carry, and the length the lab stores each one at. */
const requiredTextKeys = [
  "name",
  "desc",
  "entity",
  "home",
  "red",
  "hell",
  "gas",
  "gas_moon",
  "dwarf",
] as const;
type RequiredTextKey = (typeof requiredTextKeys)[number];

const requiredTextLimits: Record<RequiredTextKey, number> = {
  name: 20,
  desc: 255,
  entity: 40,
  home: 20,
  red: 20,
  hell: 20,
  gas: 20,
  gas_moon: 20,
  dwarf: 20,
};

/** The outer-system names, which a preset may omit. */
const outerTextKeys = ["titan", "enceladus", "triton", "eris"] as const;
type OuterTextKey = (typeof outerTextKeys)[number];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function traitDescription(trait: TraitDefinition) {
  return typeof trait.desc === "function" ? trait.desc() : (trait.desc ?? "");
}

interface CustomRaceUIDependencies {
  getJQuery: () => RaceJQuery;
  getDocument: () => RaceDocument;
  getSettingsRaw: () => CustomRacePresetSettings;
  getSettings: () => CustomRaceAutomationSettings;
  getState: () => CustomRaceUIState;
  getGame: () => CustomRaceUIGame;
  getPoly: () => CustomRaceUIPoly;
  getCustomRaceDraftFromPreset: (preset: CustomRacePreset) => CustomRaceDraft;
  getCustomRaceEditorTraits: (
    draft: CustomRaceDraft,
  ) => Array<[string, TraitDefinition]>;
  getCustomRaceRankOptions: (trait: string) => number[];
  getCustomRaceTraitEffect: (trait: string, rank: number) => string;
  getCustomRaceGeneBalance: (draft: CustomRaceDraft) => number;
  getUpdateSettingsFromState: () => () => void;
  getUpdateOverrides: () => () => void;
  getVueById: (id: string) => CelestialLabVue | undefined;
  getAlert: () => (message: string) => void;
}

export function createCustomRaceUI({
  getJQuery,
  getDocument,
  getSettingsRaw,
  getSettings,
  getState,
  getGame,
  getPoly,
  getCustomRaceDraftFromPreset,
  getCustomRaceEditorTraits,
  getCustomRaceRankOptions,
  getCustomRaceTraitEffect,
  getCustomRaceGeneBalance,
  getUpdateSettingsFromState,
  getUpdateOverrides,
  getVueById,
  getAlert,
}: CustomRaceUIDependencies) {
  function showCustomRaceImportStatus(message: string, danger = false) {
    const $ = getJQuery();
    let status = $("#scriptCustomRaceImportStatus");
    if (status.length === 0) {
      status = $('<p id="scriptCustomRaceImportStatus"></p>');
      $("#celestialLab .create").before(status);
    }
    status
      .toggleClass("has-text-danger", danger)
      .toggleClass("has-text-warning", !danger)
      .text(message);
  }

  function getCustomRacePreset(raw = false) {
    const settingsRaw = getSettingsRaw();
    const settings = getSettings();
    let source: CustomRacePresetSettings = raw ? settingsRaw : settings;
    let presets = source.prestigeCustomRacePresets;
    if (!Array.isArray(presets) || presets.length === 0) {
      return { name: "General", json: "" };
    }
    let index = Number.parseInt(source.prestigeCustomRacePreset, 10);
    if (!Number.isInteger(index) || index < 0 || index >= presets.length) {
      index = 0;
    }
    let preset = presets[index];
    return {
      name:
        typeof preset?.name === "string" && preset.name.trim()
          ? preset.name.trim()
          : `Preset ${index + 1}`,
      json: typeof preset?.json === "string" ? preset.json.trim() : "",
    };
  }

  function refreshCustomRacePresetSelectors() {
    const $ = getJQuery();
    const settingsRaw = getSettingsRaw();
    $(".script_prestigeCustomRacePreset").each(function () {
      let select = $(this).empty();
      (settingsRaw.prestigeCustomRacePresets ?? []).forEach((preset, index) =>
        $("<option></option>")
          .val(String(index))
          .text(preset.name || `Preset ${index + 1}`)
          .appendTo(select),
      );
      select.val(settingsRaw.prestigeCustomRacePreset);
    });
  }

  function buildCustomRacePresetEditor(modal: RaceNode) {
    const $ = getJQuery();
    const settingsRaw = getSettingsRaw();
    const state = getState();
    const game = getGame();
    const poly = getPoly();
    const customRaceDraftFromPreset = getCustomRaceDraftFromPreset;
    const customRaceEditorTraits = getCustomRaceEditorTraits;
    const customRaceRankOptions = getCustomRaceRankOptions;
    const customRaceTraitEffect = getCustomRaceTraitEffect;
    const customRaceGeneBalance = getCustomRaceGeneBalance;
    const updateSettingsFromState = getUpdateSettingsFromState();
    const alert = getAlert();
    modal.empty().off("*").addClass("celestialLab");
    modal.closest(".script-modal-content").addClass("custom-race-modal");
    modal.append(`
      <style>
        .script-modal-content.custom-race-modal { width: min(96vw, 1400px); margin-top: 2vh; margin-bottom: 2vh; }
        .script-modal-content.custom-race-modal .script-modal-body { max-height: calc(96vh - 70px); overflow-y: auto; }
        #scriptModalBody.celestialLab { font-size: .92rem; }
        #scriptModalBody.celestialLab .button,
        #scriptModalBody.celestialLab input.input,
        #scriptModalBody.celestialLab select { height: 2em; min-height: 2em; font-size: .92rem; padding-top: 0; padding-bottom: 0; }
        #scriptModalBody.celestialLab .fields { margin-bottom: .35rem; }
        #scriptModalBody.celestialLab .trait_selection .field { margin-bottom: .1rem; }
        #scriptModalBody.celestialLab .script-custom-trait .rc { min-width: 4.8rem; text-align: center; }
        #scriptModalBody.celestialLab .script-custom-effect,
        #scriptModalBody.celestialLab .script-custom-traits { scrollbar-color: #777 transparent; scrollbar-width: auto; }
        #scriptModalBody.celestialLab .script-custom-effect::-webkit-scrollbar,
        #scriptModalBody.celestialLab .script-custom-traits::-webkit-scrollbar { width: 10px; }
        #scriptModalBody.celestialLab .script-custom-effect::-webkit-scrollbar-thumb,
        #scriptModalBody.celestialLab .script-custom-traits::-webkit-scrollbar-thumb { background: #777; border-radius: 5px; }
      </style>`);
    if (
      !Array.isArray(settingsRaw.prestigeCustomRacePresets) ||
      settingsRaw.prestigeCustomRacePresets.length === 0
    ) {
      settingsRaw.prestigeCustomRacePresets = [{ name: "General", json: "" }];
      settingsRaw.prestigeCustomRacePreset = "0";
    }
    let presetIndex = Number.parseInt(settingsRaw.prestigeCustomRacePreset, 10);
    if (
      !Number.isInteger(presetIndex) ||
      presetIndex < 0 ||
      presetIndex >= settingsRaw.prestigeCustomRacePresets.length
    ) {
      presetIndex = 0;
      settingsRaw.prestigeCustomRacePreset = "0";
    }
    const storedPreset = settingsRaw.prestigeCustomRacePresets[presetIndex];
    // The index was clamped into a list that was just guaranteed non-empty, so the replacement only
    // guards a stored list that changed underneath the clamp.
    const preset: CustomRacePreset = storedPreset ?? {
      name: "General",
      json: "",
    };
    if (storedPreset === undefined) {
      settingsRaw.prestigeCustomRacePresets = [preset];
      settingsRaw.prestigeCustomRacePreset = "0";
      presetIndex = 0;
    }
    let draft = customRaceDraftFromPreset(preset);

    modal.append(
      '<div><h3 class="has-text-danger">Custom Race Presets</h3> - <span class="has-text-warning">Automation Custom Lab</span></div>',
    );
    let controls = $(
      '<div class="fields" style="margin-bottom:10px;"></div>',
    ).appendTo(modal);
    let presetSelect = $(
      '<select class="select" style="width:220px;"></select>',
    ).appendTo(controls);
    settingsRaw.prestigeCustomRacePresets.forEach((item, index) => {
      $("<option></option>")
        .val(String(index))
        .text(item.name || `Preset ${index + 1}`)
        .appendTo(presetSelect);
    });
    presetSelect.val(String(presetIndex));
    let presetName = $(
      '<input class="input" type="text" maxlength="60" style="width:180px;" />',
    )
      .val(preset.name || `Preset ${presetIndex + 1}`)
      .appendTo(controls);
    let addButton = $(
      '<button class="button" type="button">Add</button>',
    ).appendTo(controls);
    let cloneButton = $(
      '<button class="button" type="button">Clone</button>',
    ).appendTo(controls);
    let deleteButton = $(
      '<button class="button" type="button">Delete</button>',
    ).appendTo(controls);
    let captureButton = $(
      '<button class="button" type="button">Capture saved custom</button>',
    ).appendTo(controls);

    let summary = $(
      '<div class="has-text-warning" style="margin:8px 0; font-weight:bold;"></div>',
    ).appendTo(modal);
    let identity = $(
      '<details style="margin:4px 0;"><summary class="has-text-caution">Race names and description</summary></details>',
    ).appendTo(modal);
    let form = $(
      '<div class="fields" style="display:grid; grid-template-columns:1fr 1fr; gap:6px 14px;"></div>',
    ).appendTo(identity);
    const addTextField = (key: RequiredTextKey, label: string, max: number) => {
      let row = $('<label style="display:flex; gap:8px;"></label>').appendTo(
        form,
      );
      $("<span></span>").text(label).appendTo(row);
      let input = $(
        `<input class="input" type="text" maxlength="${max}" style="flex:1;" />`,
      )
        .val(draft[key])
        .appendTo(row);
      input.on("change", function () {
        draft[key] = this.value.trim();
        saveDraft();
      });
    };
    addTextField("name", "Name", 20);
    addTextField("entity", "Entity", 40);
    addTextField("home", "Homeworld", 20);
    addTextField("red", "Red planet", 20);
    addTextField("hell", "Hell", 20);
    addTextField("gas", "Gas giant", 20);
    addTextField("gas_moon", "Gas moon", 20);
    addTextField("dwarf", "Dwarf planet", 20);

    let descRow = $(
      '<label style="display:block; margin-top:6px;"></label>',
    ).appendTo(identity);
    $("<span>Description</span>").appendTo(descRow);
    $(
      '<textarea class="textarea" maxlength="255" style="width:100%; min-height:55px;"></textarea>',
    )
      .val(draft.desc)
      .on("change", function () {
        draft.desc = this.value.trim();
        saveDraft();
      })
      .appendTo(descRow);
    let outerNames = $(
      '<details style="margin-top:6px;"><summary class="has-text-caution">Outer-system names</summary><div class="fields" style="display:grid; grid-template-columns:1fr 1fr; gap:6px 14px;"></div></details>',
    ).appendTo(identity);
    let outerForm = outerNames.find("div");
    const addOuterField = (key: OuterTextKey, label: string) => {
      let row = $('<label style="display:flex; gap:8px;"></label>').appendTo(
        outerForm,
      );
      $("<span></span>").text(label).appendTo(row);
      $('<input class="input" type="text" maxlength="20" style="flex:1;" />')
        .val(draft[key])
        .on("change", function () {
          draft[key] = this.value.trim();
          saveDraft();
        })
        .appendTo(row);
    };
    addOuterField("titan", "Titan");
    addOuterField("enceladus", "Enceladus");
    addOuterField("triton", "Triton");
    addOuterField("eris", "Eris");

    let raceControls = $(
      '<div class="genus_selection" style="display:flex; gap:18px; margin:8px 0;"></div>',
    ).appendTo(modal);
    let genusLabel = $(
      '<label class="genus"><span class="has-text-caution header">Genus </span></label>',
    ).appendTo(raceControls);
    let genusSelect = $("<select></select>").appendTo(genusLabel);
    Object.keys(poly.genus_traits)
      .filter(
        (genus) =>
          genus !== "hybrid" &&
          (genus === draft.genus ||
            game.global.stats.achieve[`genus_${genus}`]?.l),
      )
      .forEach((genus) =>
        $("<option></option>")
          .val(genus)
          .text(game.loc(`genelab_genus_${genus}`))
          .appendTo(genusSelect),
      );
    genusSelect.val(draft.genus).on("change", function () {
      draft.genus = this.value;
      saveDraft();
      updateSummary();
    });
    let fanaticLabel = $(
      '<label class="fanatic"><span class="has-text-caution header">Fanaticism </span></label>',
    ).appendTo(raceControls);
    let fanaticSelect = $("<select></select>").appendTo(fanaticLabel);
    let genusInfo = $(
      '<div class="has-text-info" style="margin-bottom:6px;"></div>',
    ).appendTo(modal);
    let effectPanel = $(
      '<div class="script-custom-effect" style="height:112px; overflow-y:scroll; overflow-x:hidden; overflow-wrap:anywhere; white-space:normal; scrollbar-gutter:stable; overscroll-behavior:contain; pointer-events:auto; position:relative; z-index:2; padding:5px 9px; margin-bottom:5px; border-top:1px solid #777; border-bottom:1px solid #777; text-align:left;"></div>',
    ).appendTo(modal);
    let activeTrait: string | null = null;
    const showTraitEffect = (id: string) => {
      activeTrait = id;
      let trait = game.traits[id];
      // Every caller passes an id the editor listed from `game.traits`.
      if (!trait) return;
      let rank = draft.ranks[id] ?? 1;
      effectPanel.empty();
      $("<strong class='has-text-warning'></strong>")
        .text(`${trait.name} · r${rank}`)
        .appendTo(effectPanel);
      $("<div class='desc'></div>")
        .html(traitDescription(trait))
        .appendTo(effectPanel);
      $(
        `<div class="effect ${
          trait.val >= 0 ? "has-text-success" : "has-text-danger"
        }"></div>`,
      )
        .html(customRaceTraitEffect(id, rank))
        .appendTo(effectPanel);
    };
    effectPanel.text("Hover or select a trait to see its current-rank effect.");

    let filter = $(
      '<input class="input" type="search" placeholder="Filter traits..." style="width:100%; margin:4px 0 8px;" />',
    ).appendTo(identity);
    let traitsArea = $(
      '<div class="script-custom-traits" style="display:grid; grid-template-columns:1fr 1fr; gap:16px; max-height:52vh; overflow-y:scroll; overflow-x:hidden; scrollbar-gutter:stable;"></div>',
    ).appendTo(modal);
    let positiveArea = $(
      '<div class="cool trait_selection"><h4 class="has-text-success">Positive traits</h4></div>',
    ).appendTo(traitsArea);
    let negativeArea = $(
      '<div class="lame trait_selection"><h4 class="has-text-danger">Negative traits</h4></div>',
    ).appendTo(traitsArea);
    let traitRows: Array<{ node: RaceNode; search: string }> = [];
    let lastCategory = new Map<"positive" | "negative", string | undefined>();
    for (let [id, trait] of customRaceEditorTraits(draft)) {
      const side = trait.val >= 0 ? "positive" : "negative";
      let targetArea = trait.val >= 0 ? positiveArea : negativeArea;
      if (
        !lastCategory.has(side) ||
        lastCategory.get(side) !== trait.taxonomy
      ) {
        lastCategory.set(side, trait.taxonomy);
        $("<h5 class='has-text-caution'></h5>")
          .text(game.loc(`genelab_traits_${trait.taxonomy}`))
          .appendTo(targetArea);
      }
      let row = $(
        `<div class="script-custom-trait field t${id}" style="display:flex; align-items:center; gap:5px; padding:2px 0;"></div>`,
      ).appendTo(targetArea);
      let search = `${trait.name} ${id} ${trait.taxonomy}`.toLowerCase();
      row.attr("data-search", search);
      row.on("mouseenter click", () => showTraitEffect(id));
      let checkbox = $('<input type="checkbox" />')
        .prop("checked", draft.traitlist.includes(id))
        .appendTo(row);
      $(
        `<span class="${trait.val >= 0 ? "has-text-success" : "has-text-danger"}" style="flex:1;"></span>`,
      )
        .text(`${trait.name} [${trait.val >= 0 ? "+" : ""}${trait.val}]`)
        .attr("title", traitDescription(trait))
        .appendTo(row);
      let ranks = customRaceRankOptions(id);
      let currentRank = draft.ranks[id] ?? 1;
      if (!ranks.includes(currentRank)) ranks.push(currentRank);
      ranks.sort((a, b) => a - b);
      let rankWrap = $(
        '<span class="rc" style="white-space:nowrap;"></span>',
      ).appendTo(row);
      let rankDown = $(
        '<span class="sub has-text-danger" role="button">−</span>',
      ).appendTo(rankWrap);
      let rankValue = $(
        '<span class="has-text-warning" style="padding:0 4px;"></span>',
      ).appendTo(rankWrap);
      let rankUp = $(
        '<span class="add has-text-success" role="button">+</span>',
      ).appendTo(rankWrap);
      const updateRank = () => {
        currentRank = draft.ranks[id] ?? 1;
        rankValue.text(`r${currentRank}`);
        rankWrap.toggleClass("inactive-row", !checkbox.prop("checked"));
        if (activeTrait === id) showTraitEffect(id);
      };
      checkbox.on("change", function () {
        if (this.checked) {
          if (!draft.traitlist.includes(id)) draft.traitlist.push(id);
          draft.ranks[id] = currentRank;
        } else {
          draft.traitlist = draft.traitlist.filter((traitId) => traitId !== id);
          delete draft.ranks[id];
          if (draft.fanaticism === id) draft.fanaticism = false;
        }
        updateRank();
        saveDraft();
        updateSummary();
      });
      rankDown.on("click", function () {
        if (!checkbox.prop("checked")) return;
        const lower = ranks[ranks.indexOf(currentRank) - 1];
        if (lower !== undefined) draft.ranks[id] = lower;
        updateRank();
        saveDraft();
        updateSummary();
      });
      rankUp.on("click", function () {
        if (!checkbox.prop("checked")) return;
        const higher = ranks[ranks.indexOf(currentRank) + 1];
        if (higher !== undefined) draft.ranks[id] = higher;
        updateRank();
        saveDraft();
        updateSummary();
      });
      updateRank();
      traitRows.push({ node: row, search });
    }
    filter.on("input", function () {
      let query = this.value.trim().toLowerCase();
      traitRows.forEach((row) =>
        row.node.toggle(!query || row.search.includes(query)),
      );
    });

    let advanced = $(
      '<details style="margin-top:10px;"><summary>Advanced JSON import/export</summary></details>',
    ).appendTo(modal);
    let rawJson = $(
      '<textarea class="textarea" style="width:100%; min-height:160px;"></textarea>',
    ).appendTo(advanced);
    let loadRaw = $(
      '<button class="button" type="button">Load JSON into editor</button>',
    ).appendTo(advanced);
    let rawStatus = $('<span style="margin-left:8px;"></span>').appendTo(
      advanced,
    );

    function saveDraft() {
      draft.genes = 0;
      preset.json = JSON.stringify(draft, null, 2);
      rawJson.val(preset.json);
      state.customRaceImportAttempt = null;
      updateSettingsFromState();
    }
    function updateSummary() {
      let balance = customRaceGeneBalance(draft);
      summary
        .toggleClass("has-text-success", balance >= 0)
        .toggleClass("has-text-danger", balance < 0)
        .text(
          `Genes remaining: ${balance} · ${draft.traitlist.length} selected traits · live lab validation still applies`,
        );
      let builtIns = Object.keys(poly.genus_traits[draft.genus] ?? {})
        .filter((id) => !(draft.genus === "fungi" && id === "spores"))
        .map((id) => game.traits[id]?.name ?? id);
      genusInfo.text(`Genus traits: ${builtIns.join(", ") || "none"}`);
      fanaticSelect.empty();
      $("<option></option>")
        .val("")
        .text("Automatic / none")
        .appendTo(fanaticSelect);
      draft.traitlist.forEach((id) =>
        $("<option></option>")
          .val(id)
          .text(game.traits[id]?.name ?? id)
          .appendTo(fanaticSelect),
      );
      fanaticSelect.val(
        typeof draft.fanaticism === "string" ? draft.fanaticism : "",
      );
    }
    fanaticSelect.on("change", function () {
      draft.fanaticism = this.value || false;
      saveDraft();
    });
    presetSelect.on("change", function () {
      settingsRaw.prestigeCustomRacePreset = this.value;
      updateSettingsFromState();
      refreshCustomRacePresetSelectors();
      buildCustomRacePresetEditor(modal);
    });
    presetName.on("change", function () {
      preset.name = this.value.trim() || `Preset ${presetIndex + 1}`;
      updateSettingsFromState();
      presetSelect.find(`option[value="${presetIndex}"]`).text(preset.name);
      refreshCustomRacePresetSelectors();
    });
    addButton.on("click", function () {
      settingsRaw.prestigeCustomRacePresets.push({
        name: `Preset ${settingsRaw.prestigeCustomRacePresets.length + 1}`,
        json: "",
      });
      settingsRaw.prestigeCustomRacePreset = String(
        settingsRaw.prestigeCustomRacePresets.length - 1,
      );
      updateSettingsFromState();
      refreshCustomRacePresetSelectors();
      buildCustomRacePresetEditor(modal);
    });
    cloneButton.on("click", function () {
      let clone = {
        name: `${preset.name || `Preset ${presetIndex + 1}`} copy`,
        json: preset.json,
      };
      settingsRaw.prestigeCustomRacePresets.push(clone);
      settingsRaw.prestigeCustomRacePreset = String(
        settingsRaw.prestigeCustomRacePresets.length - 1,
      );
      updateSettingsFromState();
      refreshCustomRacePresetSelectors();
      buildCustomRacePresetEditor(modal);
    });
    deleteButton.on("click", function () {
      if (settingsRaw.prestigeCustomRacePresets.length > 1) {
        settingsRaw.prestigeCustomRacePresets.splice(presetIndex, 1);
      } else {
        settingsRaw.prestigeCustomRacePresets[0] = {
          name: "General",
          json: "",
        };
      }
      settingsRaw.prestigeCustomRacePreset = "0";
      updateSettingsFromState();
      refreshCustomRacePresetSelectors();
      buildCustomRacePresetEditor(modal);
    });
    captureButton.on("click", function () {
      let savedRace = game.global.custom?.race0;
      if (!savedRace) {
        alert("There is no saved custom race to capture yet.");
        return;
      }
      preset.json = JSON.stringify(
        {
          ...savedRace,
          genes: 0,
          traitlist: (savedRace.traits ?? []).slice(),
          traits: undefined,
        },
        null,
        2,
      );
      buildCustomRacePresetEditor(modal);
    });
    loadRaw.on("click", function () {
      try {
        let parsed: unknown = JSON.parse(rawJson.val());
        if (!parsed || typeof parsed !== "object")
          throw new Error("not an object");
        preset.json = JSON.stringify(parsed, null, 2);
        rawStatus.removeClass("has-text-danger").text("");
        updateSettingsFromState();
        buildCustomRacePresetEditor(modal);
      } catch (error) {
        rawStatus
          .addClass("has-text-danger")
          .text(`Invalid JSON: ${messageOf(error)}`);
      }
    });
    saveDraft();
    updateSummary();
  }

  function importCustomRaceIntoLab() {
    const settings = getSettings();
    const state = getState();
    const game = getGame();
    const document = getDocument();
    const customRaceRankOptions = getCustomRaceRankOptions;
    let preset = getCustomRacePreset();
    let attemptKey = `${settings.prestigeCustomRacePreset}:${preset.json}`;
    if (state.customRaceImportAttempt === attemptKey) {
      return false;
    }
    state.customRaceImportAttempt = attemptKey;

    let parsed: unknown;
    try {
      parsed = JSON.parse(preset.json);
    } catch (error) {
      showCustomRaceImportStatus(
        `Automatic custom-race import of “${preset.name}” paused: invalid JSON (${messageOf(error)}).`,
        true,
      );
      return false;
    }

    const lab = getVueById("celestialLab");
    const design = lab?.g;
    const template = isPlainRecord(parsed) ? parsed : {};
    const templateText = (key: string) => {
      const value = template[key];
      return typeof value === "string" ? value : "";
    };
    const genus = template.genus;
    const traits = template.traitlist ?? template.traits;
    if (
      !lab ||
      !design ||
      !Array.isArray(traits) ||
      typeof genus !== "string"
    ) {
      showCustomRaceImportStatus(
        "Automatic custom-race import paused: expected a game custom-race export with genus and traitlist.",
        true,
      );
      return false;
    }
    if (new Set(traits).size !== traits.length) {
      showCustomRaceImportStatus(
        "Automatic custom-race import paused: traitlist contains duplicates.",
        true,
      );
      return false;
    }

    const missingText = requiredTextKeys.filter(
      (key) => templateText(key).length === 0,
    );
    if (missingText.length > 0) {
      showCustomRaceImportStatus(
        `Automatic custom-race import paused: missing ${missingText.join(", ")}.`,
        true,
      );
      return false;
    }

    if (
      !game.global.stats.achieve[`genus_${genus}`]?.l &&
      genus !== design.genus
    ) {
      showCustomRaceImportStatus(
        `Automatic custom-race import paused: ${genus} genus is not unlocked.`,
        true,
      );
      return false;
    }

    const traitIds: string[] = [];
    const unavailableTraits: unknown[] = [];
    for (const trait of traits) {
      if (
        typeof trait === "string" &&
        /^[a-z0-9_]+$/.test(trait) &&
        document.querySelector(`#celestialLab .t${trait}`) !== null
      ) {
        traitIds.push(trait);
      } else {
        unavailableTraits.push(trait);
      }
    }
    if (unavailableTraits.length > 0) {
      showCustomRaceImportStatus(
        `Automatic custom-race import paused: unavailable traits ${unavailableTraits.join(", ")}.`,
        true,
      );
      return false;
    }

    const storedRanks = template.ranks ?? {};
    const ranks: Record<string, number> = {};
    if (!isPlainRecord(storedRanks)) {
      showCustomRaceImportStatus(
        "Automatic custom-race import paused: ranks must contain positive numeric values for selected traits only.",
        true,
      );
      return false;
    }
    for (const [trait, rank] of Object.entries(storedRanks)) {
      if (
        !traitIds.includes(trait) ||
        typeof rank !== "number" ||
        !Number.isFinite(rank) ||
        rank <= 0 ||
        !customRaceRankOptions(trait).includes(rank)
      ) {
        showCustomRaceImportStatus(
          "Automatic custom-race import paused: ranks must contain positive numeric values for selected traits only.",
          true,
        );
        return false;
      }
      ranks[trait] = rank;
    }

    const fanaticism: unknown = template.fanaticism || false;
    if (
      fanaticism &&
      !(typeof fanaticism === "string" && traitIds.includes(fanaticism))
    ) {
      showCustomRaceImportStatus(
        `Automatic custom-race import paused: Fanaticism trait ${String(fanaticism)} is not selected.`,
        true,
      );
      return false;
    }

    requiredTextKeys.forEach((key) => {
      design[key] = templateText(key).substring(0, requiredTextLimits[key]);
    });
    outerTextKeys.forEach((key) => {
      const value = templateText(key);
      if (value.length > 0) design[key] = value;
    });
    design.genus = genus;
    design.traitlist = traitIds;
    design.fanaticism = fanaticism;
    // The lab's own rank map is kept and refilled, not replaced, so the component keeps the
    // object it made reactive.
    const labRanks = (design.ranks ??= {});
    Object.keys(labRanks).forEach((trait) => delete labRanks[trait]);
    Object.assign(labRanks, ranks);
    lab.geneEdit();

    if (design.genes < 0) {
      showCustomRaceImportStatus(
        `Automatic custom-race import paused: template exceeds the live gene budget by ${Math.abs(design.genes)}. Edit the lab or paste a cheaper export.`,
        true,
      );
      return false;
    }
    return true;
  }

  function automateLab() {
    const document = getDocument();
    const settings = getSettings();
    const state = getState();
    const game = getGame();
    const updateOverrides = getUpdateOverrides();
    let createCustom = document.querySelector("#celestialLab .create button");
    if (createCustom) {
      updateOverrides(); // Game doesn't tick in lab. Update settings here.
      if (
        settings.masterScriptToggle &&
        settings.autoPrestige &&
        ["ascension", "terraform", "apotheosis"].includes(settings.prestigeType)
      ) {
        let customMode = ["reuse", "pause", "import"].includes(
          settings.prestigeCustomRaceMode,
        )
          ? settings.prestigeCustomRaceMode
          : "reuse";
        if (customMode !== "import") {
          state.customRaceImportAttempt = null;
        }
        if (customMode === "pause") {
          showCustomRaceImportStatus(
            "Auto Prestige paused by Custom race handling: Pause in lab.",
          );
          return;
        }
        if (customMode === "import" && !importCustomRaceIntoLab()) {
          return;
        }
        // The first lab opens with the game's empty/default Zombie design. Never submit that
        // implicitly in reuse mode; wait for a saved race or an explicit import instead.
        if (customMode === "reuse" && !game.global.custom?.race0) {
          showCustomRaceImportStatus(
            "Auto Prestige paused: no saved custom race. Design one here or select Import selected preset in Prestige settings.",
          );
          return;
        }
        state.goal = "GameOverMan";
        createCustom.click();
        return;
      }
    }
  }
  return {
    showCustomRaceImportStatus,
    getCustomRacePreset,
    refreshCustomRacePresetSelectors,
    buildCustomRacePresetEditor,
    importCustomRaceIntoLab,
    automateLab,
  };
}
