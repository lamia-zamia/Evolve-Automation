type AnyRecord = Record<string, any>;

interface CustomRacePreset {
  name: string;
  json: string;
}

interface CustomRaceSettings extends AnyRecord {
  prestigeCustomRacePresets: CustomRacePreset[];
  prestigeCustomRacePreset: string;
}

interface CustomRaceDraft extends AnyRecord {
  traitlist: string[];
  ranks: Record<string, number>;
  genus: string;
}

interface CustomRaceUIDependencies {
  getJQuery: () => any;
  getDocument: () => any;
  getSettingsRaw: () => CustomRaceSettings;
  getSettings: () => CustomRaceSettings;
  getState: () => AnyRecord;
  getGame: () => AnyRecord;
  getPoly: () => AnyRecord;
  getCustomRaceDraftFromPreset: (preset: CustomRacePreset) => CustomRaceDraft;
  getCustomRaceEditorTraits: (
    draft: CustomRaceDraft,
  ) => Array<[string, AnyRecord]>;
  getCustomRaceRankOptions: (trait: string) => number[];
  getCustomRaceTraitEffect: (trait: string, rank: number) => string;
  getCustomRaceGeneBalance: (draft: CustomRaceDraft) => number;
  getUpdateSettingsFromState: () => () => void;
  getUpdateOverrides: () => () => void;
  getVueById: (id: string) => AnyRecord | undefined;
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
    let source = raw ? settingsRaw : settings;
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
    $(".script_prestigeCustomRacePreset").each(function (this: any) {
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

  function buildCustomRacePresetEditor(modal: any) {
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
    let preset = settingsRaw.prestigeCustomRacePresets[presetIndex];
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
    const addTextField = (key: any, label: any, max: any) => {
      let row = $('<label style="display:flex; gap:8px;"></label>').appendTo(
        form,
      );
      $("<span></span>").text(label).appendTo(row);
      let input = $(
        `<input class="input" type="text" maxlength="${max}" style="flex:1;" />`,
      )
        .val(draft[key])
        .appendTo(row);
      input.on("change", function (this: any) {
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
      .on("change", function (this: any) {
        draft.desc = this.value.trim();
        saveDraft();
      })
      .appendTo(descRow);
    let outerNames = $(
      '<details style="margin-top:6px;"><summary class="has-text-caution">Outer-system names</summary><div class="fields" style="display:grid; grid-template-columns:1fr 1fr; gap:6px 14px;"></div></details>',
    ).appendTo(identity);
    let outerForm = outerNames.find("div");
    const addOuterField = (key: any, label: any) => {
      let row = $('<label style="display:flex; gap:8px;"></label>').appendTo(
        outerForm,
      );
      $("<span></span>").text(label).appendTo(row);
      $('<input class="input" type="text" maxlength="20" style="flex:1;" />')
        .val(draft[key])
        .on("change", function (this: any) {
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
    genusSelect.val(draft.genus).on("change", function (this: any) {
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
    let activeTrait: any = null;
    const showTraitEffect = (id: any) => {
      activeTrait = id;
      let trait = game.traits[id];
      let rank = draft.ranks[id] ?? 1;
      effectPanel.empty();
      $("<strong class='has-text-warning'></strong>")
        .text(`${trait.name} · r${rank}`)
        .appendTo(effectPanel);
      $("<div class='desc'></div>")
        .html(typeof trait.desc === "function" ? trait.desc() : trait.desc)
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
    let traitRows = [];
    let lastCategory: Record<string, any> = {
      positive: null,
      negative: null,
    };
    for (let [id, trait] of customRaceEditorTraits(draft)) {
      let side = trait.val >= 0 ? "positive" : "negative";
      let targetArea = trait.val >= 0 ? positiveArea : negativeArea;
      if (lastCategory[side] !== trait.taxonomy) {
        lastCategory[side] = trait.taxonomy;
        $("<h5 class='has-text-caution'></h5>")
          .text(game.loc(`genelab_traits_${trait.taxonomy}`) ?? trait.taxonomy)
          .appendTo(targetArea);
      }
      let row = $(
        `<div class="script-custom-trait field t${id}" style="display:flex; align-items:center; gap:5px; padding:2px 0;"></div>`,
      ).appendTo(targetArea);
      row.attr(
        "data-search",
        `${trait.name} ${id} ${trait.taxonomy}`.toLowerCase(),
      );
      row.on("mouseenter click", () => showTraitEffect(id));
      let checkbox = $('<input type="checkbox" />')
        .prop("checked", draft.traitlist.includes(id))
        .appendTo(row);
      $(
        `<span class="${trait.val >= 0 ? "has-text-success" : "has-text-danger"}" style="flex:1;"></span>`,
      )
        .text(`${trait.name} [${trait.val >= 0 ? "+" : ""}${trait.val}]`)
        .attr(
          "title",
          typeof trait.desc === "function" ? trait.desc() : trait.desc,
        )
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
      checkbox.on("change", function (this: any) {
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
        let index = ranks.indexOf(currentRank);
        if (index > 0) draft.ranks[id] = ranks[index - 1];
        updateRank();
        saveDraft();
        updateSummary();
      });
      rankUp.on("click", function () {
        if (!checkbox.prop("checked")) return;
        let index = ranks.indexOf(currentRank);
        if (index < ranks.length - 1) draft.ranks[id] = ranks[index + 1];
        updateRank();
        saveDraft();
        updateSummary();
      });
      updateRank();
      traitRows.push(row);
    }
    filter.on("input", function (this: any) {
      let query = this.value.trim().toLowerCase();
      traitRows.forEach((row) =>
        row.toggle(!query || row.attr("data-search").includes(query)),
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
      fanaticSelect.val(draft.fanaticism || "");
    }
    fanaticSelect.on("change", function (this: any) {
      draft.fanaticism = this.value || false;
      saveDraft();
    });
    presetSelect.on("change", function (this: any) {
      settingsRaw.prestigeCustomRacePreset = this.value;
      updateSettingsFromState();
      refreshCustomRacePresetSelectors();
      buildCustomRacePresetEditor(modal);
    });
    presetName.on("change", function (this: any) {
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
        (key, value) => (value === undefined ? undefined : value),
        2,
      );
      buildCustomRacePresetEditor(modal);
    });
    loadRaw.on("click", function () {
      try {
        let parsed = JSON.parse(rawJson.val());
        if (!parsed || typeof parsed !== "object")
          throw new Error("not an object");
        preset.json = JSON.stringify(parsed, null, 2);
        rawStatus.removeClass("has-text-danger").text("");
        updateSettingsFromState();
        buildCustomRacePresetEditor(modal);
      } catch (error: any) {
        rawStatus
          .addClass("has-text-danger")
          .text(`Invalid JSON: ${error.message}`);
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

    let template;
    try {
      template = JSON.parse(preset.json);
    } catch (error: any) {
      showCustomRaceImportStatus(
        `Automatic custom-race import of “${preset.name}” paused: invalid JSON (${error.message}).`,
        true,
      );
      return false;
    }

    let lab = getVueById("celestialLab");
    let traits = template.traitlist ?? template.traits;
    if (
      !lab?.g ||
      !Array.isArray(traits) ||
      typeof template.genus !== "string"
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

    let requiredText = [
      "name",
      "desc",
      "entity",
      "home",
      "red",
      "hell",
      "gas",
      "gas_moon",
      "dwarf",
    ];
    let missingText = requiredText.filter(
      (key) => typeof template[key] !== "string" || template[key].length === 0,
    );
    if (missingText.length > 0) {
      showCustomRaceImportStatus(
        `Automatic custom-race import paused: missing ${missingText.join(", ")}.`,
        true,
      );
      return false;
    }

    if (
      !game.global.stats.achieve[`genus_${template.genus}`]?.l &&
      template.genus !== lab.g.genus
    ) {
      showCustomRaceImportStatus(
        `Automatic custom-race import paused: ${template.genus} genus is not unlocked.`,
        true,
      );
      return false;
    }

    let unavailableTraits = traits.filter(
      (trait) =>
        typeof trait !== "string" ||
        !/^[a-z0-9_]+$/.test(trait) ||
        document.querySelector(`#celestialLab .t${trait}`) === null,
    );
    if (unavailableTraits.length > 0) {
      showCustomRaceImportStatus(
        `Automatic custom-race import paused: unavailable traits ${unavailableTraits.join(", ")}.`,
        true,
      );
      return false;
    }

    let ranks = template.ranks ?? {};
    if (
      typeof ranks !== "object" ||
      Array.isArray(ranks) ||
      Object.entries(ranks).some(
        ([trait, rank]) =>
          !traits.includes(trait) ||
          typeof rank !== "number" ||
          !Number.isFinite(rank) ||
          rank <= 0 ||
          !customRaceRankOptions(trait).includes(rank),
      )
    ) {
      showCustomRaceImportStatus(
        "Automatic custom-race import paused: ranks must contain positive numeric values for selected traits only.",
        true,
      );
      return false;
    }

    let fanaticism = template.fanaticism || false;
    if (fanaticism && !traits.includes(fanaticism)) {
      showCustomRaceImportStatus(
        `Automatic custom-race import paused: Fanaticism trait ${fanaticism} is not selected.`,
        true,
      );
      return false;
    }

    let textLimits: Record<string, number> = {
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
    requiredText.forEach(
      (key) => (lab.g[key] = template[key].substring(0, textLimits[key])),
    );
    ["titan", "enceladus", "triton", "eris"].forEach((key) => {
      if (typeof template[key] === "string" && template[key].length > 0) {
        lab.g[key] = template[key];
      }
    });
    lab.g.genus = template.genus;
    lab.g.traitlist = traits.slice();
    lab.g.fanaticism = fanaticism;
    lab.g.ranks ??= {};
    Object.keys(lab.g.ranks).forEach((trait) => delete lab.g.ranks[trait]);
    Object.assign(lab.g.ranks, ranks);
    lab.geneEdit();

    if (lab.g.genes < 0) {
      showCustomRaceImportStatus(
        `Automatic custom-race import paused: template exceeds the live gene budget by ${Math.abs(lab.g.genes)}. Edit the lab or paste a cheaper export.`,
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
