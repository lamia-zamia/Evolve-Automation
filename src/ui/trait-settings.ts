type Loose = any;

interface TraitSettingsDependencies {
  getSettingsRaw: () => Loose;
  getState: () => Loose;
  getGame: () => Loose;
  getRaces: () => Loose;
  getResources: () => Loose;
  getPoly: () => Loose;
  getMinorTraitManager: () => Loose;
  getMutableTraitManager: () => Loose;
  getOcularPowerData: () => Loose;
  getWishData: () => Loose;
  getMutationCostMultipliers: () => Loose;
  getDocument: () => Loose;
  getJQuery: () => Loose;
  getSorterHelper: () => Loose;
  resetMinorTraitSettings: (reset: boolean) => void;
  resetMutableTraitSettings: (reset: boolean) => void;
  updateSettingsFromState: () => void;
  resetCheckbox: (...settingNames: string[]) => void;
  buildSettingsSection: Loose;
  addStandardHeading: Loose;
  addSettingsSelect: Loose;
  addSettingsNumber: Loose;
  addSettingsToggle: Loose;
  addTableToggle: Loose;
  addTableInput: Loose;
  buildTableLabel: Loose;
}

export function createTraitSettings({
  getSettingsRaw,
  getState,
  getGame,
  getRaces,
  getResources,
  getPoly,
  getMinorTraitManager,
  getMutableTraitManager,
  getOcularPowerData,
  getWishData,
  getMutationCostMultipliers,
  getDocument,
  getJQuery,
  getSorterHelper,
  resetMinorTraitSettings,
  resetMutableTraitSettings,
  updateSettingsFromState,
  resetCheckbox,
  buildSettingsSection,
  addStandardHeading,
  addSettingsSelect,
  addSettingsNumber,
  addSettingsToggle,
  addTableToggle,
  addTableInput,
  buildTableLabel,
}: TraitSettingsDependencies) {
  function buildTraitSettings() {
    let sectionId = "trait";
    let sectionName = "Traits";

    let resetFunction = function () {
      resetMinorTraitSettings(true);
      resetMutableTraitSettings(true);
      updateSettingsFromState();
      updateTraitSettingsContent();

      resetCheckbox("autoMinorTrait", "autoMutateTraits", "autoGenetics");
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateTraitSettingsContent,
    );
  }

  function updateImitateWarning() {
    const settingsRaw = getSettingsRaw();
    const races = getRaces();
    const game = getGame();
    const $ = getJQuery();
    let race = races[settingsRaw.imitateRace];

    if (race) {
      const raceAvaialableForImitate = race && game.global.stats.synth[race.id];
      if (raceAvaialableForImitate) {
        $("#script_imitate_warning").html(
          `<span class="has-text-success">You have completed an AI Apocalypse with this race and can imitate it.</span>`,
        );
      } else {
        $("#script_imitate_warning").html(
          `<span class="has-text-danger">Warning! You have NOT completed an AI Apocalypse with this race, and cannot imitate it.</span>`,
        );
      }
    } else {
      $("#script_imitate_warning").empty();
    }
  }

  function updateTraitSettingsContent() {
    const document = getDocument();
    const $ = getJQuery();
    const game = getGame();
    const races = getRaces();
    const resources = getResources();
    const poly = getPoly();
    const ocularPowerData = getOcularPowerData();
    const wishData = getWishData();
    const mutationCostMultipliers = getMutationCostMultipliers();
    const MinorTraitManager = getMinorTraitManager();
    const MutableTraitManager = getMutableTraitManager();
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_traitContent");

    currentNode.empty().off("*");

    addStandardHeading(currentNode, "Major Traits");
    let genusOptions = [
      { val: "ignore", label: "Ignore", hint: "Do not shift genus" },
      { val: "none", label: game.loc(`genelab_genus_none`) },
      ...Object.values(game.races as Record<string, Loose>)
        .map((r) => r.type)
        .filter(
          (g, i, a) =>
            g && g !== "organism" && g !== "synthetic" && a.indexOf(g) === i,
        )
        .map((g) => ({ val: g, label: game.loc(`genelab_genus_${g}`) })),
    ];
    addSettingsSelect(
      currentNode,
      "shifterGenus",
      "Mimic genus",
      "Mimic selected genus, if avaialble. If you want to add some conditional overrides to this setting, keep in mind changing genus redraws game page, frequent changes can drastically harm game performance.",
      genusOptions,
    );

    const imitateOptions = [
      {
        val: "ignore",
        label: "Ignore",
        hint: "Do not imitate race. IMPORTANT: script will stall at evolution if none selected",
      },
      ...Object.values(races as Record<string, Loose>).map((race) => {
        const label = game.global.stats.synth[race.id]
          ? race.name
          : `--${race.name}--`;

        return {
          val: race.id,
          label,
          hint: race.desc,
        };
      }),
    ];

    addSettingsSelect(
      currentNode,
      "imitateRace",
      "Imitate race",
      "Imitate selected race, if available.",
      imitateOptions,
    ).on("change", "select", function () {
      getState().evolutionTarget = null;
      updateImitateWarning();
    });

    currentNode.append(`<div><span id="script_imitate_warning"></span></div>`);
    updateImitateWarning();

    let shrineOptions = [
      {
        val: "any",
        label: "Any",
        hint: "Build any Shrines, whenever have resources for it",
      },
      { val: "equally", label: "Equally", hint: "Build all Shrines equally" },
      { val: "morale", label: "Morale", hint: "Build only Morale Shrines" },
      { val: "metal", label: "Metal", hint: "Build only Metal Shrines" },
      { val: "know", label: "Knowledge", hint: "Build only Knowledge Shrines" },
      { val: "tax", label: "Tax", hint: "Build only Tax Shrines" },
      {
        val: "rotating",
        label: "Rotating",
        hint: "Build Shrines during quarter/full phases for rotating effect shrines",
      },
    ];
    addSettingsSelect(
      currentNode,
      "buildingShrineType",
      "Magnificent shrine",
      "Auto Build shrines only at moons of chosen shrine",
      shrineOptions,
    );
    addSettingsNumber(
      currentNode,
      "slaveIncome",
      "Minimum income to buy slave",
      "Script will use Slave Market only when money is capped, or have income above given number",
    );

    let psychicOptions = [
      {
        val: "none",
        label: "Ignore",
        hint: "Psychic Powers ignored by script",
      },
      {
        val: "auto",
        label: "Script Managed",
        hint: "Performs one of available actions in this order: Capture, Mind Break, Boost Profits, Boost Resource, Boost Attack Power.",
      },
      ...["boost", "murder", "assault", "profit", "stun", "mind_break"].map(
        (p) => ({
          val: p,
          label: game.loc(`psychic_${p}_title`),
          hint: game.loc(`psychic_${p}_desc`),
        }),
      ),
    ];
    addSettingsSelect(
      currentNode,
      "psychicPower",
      "Psychic Powers",
      "Activates selected power with full energy. 10 murders required to research advanced powers will be performed automatically, if needed.",
      psychicOptions,
    );

    let psychicBoost = [
      {
        val: "auto",
        label: "Script Managed",
        hint: "Resource selected by looking for highest income among ones having enough free storage room.",
      },
      ...Object.values(resources as Record<string, Loose>)
        .filter((r) => r.atomicMass > 0)
        .map((r) => ({ val: r.id, label: r.title })),
    ];
    addSettingsSelect(
      currentNode,
      "psychicBoostRes",
      "Boosted Resource",
      "Resource for Boost Resource Production psychic power.",
      psychicBoost,
    );

    let wishMinor = [
      { val: "none", label: "None", hint: "Disable using minor wishes." },
      ...wishData.minor.map((w) => ({
        val: w.id,
        label: poly.loc("wish_for", [poly.loc(w.loc)]),
      })),
    ];
    addSettingsSelect(
      currentNode,
      "wishMinor",
      "Minor Wish",
      "Uses this minor wish when available.",
      wishMinor,
    );
    let wishMajor = [
      { val: "none", label: "None", hint: "Disable using major wishes." },
      ...wishData.major.map((w) => ({
        val: w.id,
        label: poly.loc("wish_for", [poly.loc(w.loc)]),
      })),
    ];
    addSettingsSelect(
      currentNode,
      "wishMajor",
      "Major Wish",
      "Uses this major wish when available.",
      wishMajor,
    );

    addSettingsToggle(
      currentNode,
      "jobScalePop",
      "High Pop job scale",
      "Auto Job will automatically scaly breakpoints to match population increase",
    );

    addStandardHeading(currentNode, "Ocular Powers");
    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:50%">Name</th>
              <th class="has-text-warning" style="width:25%">Enabled</th>
              <th class="has-text-warning" style="width:25%">Priority</th>
            </tr>
            <tbody id="script_ocularPowersTableBody"></tbody>
          </table>
        `);
    const ocularTableBodyNode = $("#script_ocularPowersTableBody");
    ocularPowerData.forEach((p) => {
      let tr = $(`<tr><td></td><td></td><td></td></tr>`);
      tr.appendTo(ocularTableBodyNode);

      let ocularPowerElement = tr.find("td").first();
      ocularPowerElement.append(
        buildTableLabel(
          game.loc(`ocular_${p.id}`),
          game.loc(`ocular_${p.id}_desc`, p.locParam),
        ),
      );

      ocularPowerElement = ocularPowerElement.next();
      addTableToggle(ocularPowerElement, `ocularPower_${p.id}`);

      ocularPowerElement = ocularPowerElement.next();
      addTableInput(ocularPowerElement, `ocularPower_p_${p.id}`);
    });

    // Minor Traits
    addStandardHeading(currentNode, "Minor Traits");

    let sequenceOptions = [
      {
        val: "none",
        label: "Ignore",
        hint: "Ignored by script, managed by game and player",
      },
      { val: "enabled", label: "Enable", hint: "Sequencer enabled" },
      { val: "disabled", label: "Disable", hint: "Sequencer disabled" },
      {
        val: "decode",
        label: "Decode",
        hint: "Decode genome only, with no further mutations",
      },
    ];
    addSettingsSelect(
      currentNode,
      "geneticsSequence",
      "Sequencer",
      "Manages genome decoding, and mutations",
      sequenceOptions,
    );

    let boostOptions = [
      {
        val: "none",
        label: "Ignore",
        hint: "Ignored by script, managed by game and player",
      },
      { val: "enabled", label: "Enable", hint: "Booster enabled" },
      { val: "disabled", label: "Disable", hint: "Booster disabled" },
    ];
    addSettingsSelect(
      currentNode,
      "geneticsBoost",
      "Sequence Booster",
      "Manages sequencer booster",
      boostOptions,
    );

    let assembleOptions = [
      {
        val: "none",
        label: "Ignore",
        hint: "Ignored by script, managed by game and player",
      },
      { val: "enabled", label: "Enable", hint: "Auto Sequencer enable" },
      { val: "disabled", label: "Disable", hint: "Auto Sequencer disable" },
      {
        val: "auto",
        label: "Script Managed",
        hint: "Gene assembling managed by script, allowing to dump excess knowledge at faster rate, matching income",
      },
    ];
    addSettingsSelect(
      currentNode,
      "geneticsAssemble",
      "Auto Sequence",
      "Manages genome decoding, and mutations",
      assembleOptions,
    );

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:20%">Minor Trait</th>
              <th class="has-text-warning" style="width:20%">Enabled</th>
              <th class="has-text-warning" style="width:20%">Weighting</th>
              <th class="has-text-warning" style="width:40%"></th>
            </tr>
            <tbody id="script_minorTraitTableBody"></tbody>
          </table>`);

    let tableBodyNode = $("#script_minorTraitTableBody");
    let newTableBodyText = "";

    for (let i = 0; i < MinorTraitManager.priorityList.length; i++) {
      const trait = MinorTraitManager.priorityList[i];
      newTableBodyText += `<tr value="${trait.traitName}" class="script-draggable"><td id="script_minorTrait_${trait.traitName}" style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:40%"><span class="script-lastcolumn"></span></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other minorTraits settings rows
    for (let i = 0; i < MinorTraitManager.priorityList.length; i++) {
      const trait = MinorTraitManager.priorityList[i];
      let minorTraitElement = $("#script_minorTrait_" + trait.traitName);

      minorTraitElement.append(
        buildTableLabel(
          game.loc("trait_" + trait.traitName + "_name"),
          game.loc("trait_" + trait.traitName),
        ),
      );

      minorTraitElement = minorTraitElement.next();
      addTableToggle(minorTraitElement, "mTrait_" + trait.traitName);

      minorTraitElement = minorTraitElement.next();
      addTableInput(minorTraitElement, "mTrait_w_" + trait.traitName);
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: getSorterHelper(),
      update: function () {
        let minorTraitNames = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        const settingsRaw = getSettingsRaw();
        for (let i = 0; i < minorTraitNames.length; i++) {
          settingsRaw["mTrait_p_" + minorTraitNames[i]] = i;
        }

        getMinorTraitManager().sortByPriority();
        updateSettingsFromState();
      },
    });

    // Trait Mutations

    addStandardHeading(currentNode, "Trait Mutation");
    addSettingsToggle(
      currentNode,
      "doNotGoBelowPlasmidSoftcap",
      "Do not go below Plasmid softcap",
      "Script will not mutate if the number of remaining plasmids or anti plamids would be lower than the softcap (250 + Phage)",
    );
    addSettingsNumber(
      currentNode,
      "minimumPlasmidsToPreserve",
      "Minimum Plasmids / Anti-Plasmids to preserve",
      "Script will not mutate if the number of remaining plasmids or anti plamids would be lower than this value",
    );

    currentNode.append(`
        <table style="width:100%">
        <tr>
            <th class="has-text-warning" style="width:30%">Species / Genus</th>
            <th class="has-text-warning" style="width:25%">Trait</th>
            <th class="has-text-warning" style="width:10%">Cost</th>
            <th class="has-text-warning" style="width:10%">Add</th>
            <th class="has-text-warning" style="width:10%">Remove</th>
            <th class="has-text-warning" style="width:10%">Reset</th>
            <th class="has-text-warning" style="width:5%"></th>
        </tr>
        <tbody id="script_mutateTraitTableBody"></tbody>
        </table>`);

    let mutateTraitTableBodyNode = $("#script_mutateTraitTableBody");
    newTableBodyText = "";

    for (let i = 0; i < MutableTraitManager.priorityList.length; i++) {
      const trait = MutableTraitManager.priorityList[i];
      newTableBodyText += `<tr value="${trait.traitName}" class="script-draggable"><td id="script_mutableTrait_${trait.traitName}" style="width:30%"></td><td style="width:25%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:10%"></td><td style="width:5%"><span class="script-lastcolumn"></span></td></tr>`;
    }
    mutateTraitTableBodyNode.append($(newTableBodyText));

    // Build all other mutableTraits settings rows
    for (let i = 0; i < MutableTraitManager.priorityList.length; i++) {
      const trait = MutableTraitManager.priorityList[i];
      let mutableTraitElement = $("#script_mutableTrait_" + trait.traitName);

      mutableTraitElement.append(
        buildTableLabel(
          trait.source === ""
            ? "-"
            : game.loc(
                (trait.type === "major" ? "race_" : "genelab_genus_") +
                  trait.source,
              ),
          trait.type === "major" ? "Major" : "Genus",
          trait.type === "genus" ? "has-text-special" : "has-text",
        ),
      );

      mutableTraitElement = mutableTraitElement.next();
      mutableTraitElement.append(
        buildTableLabel(
          trait.name,
          game.loc("trait_" + trait.traitName),
          trait.isPositive ? "has-text-success" : "has-text-danger",
        ),
      );

      mutableTraitElement = mutableTraitElement.next();
      mutableTraitElement.append(
        buildTableLabel(
          `${trait.baseCost * 5}`,
          `${
            trait.baseCost * 5 * mutationCostMultipliers["custom"]["gain"]
          } for Custom${trait.traitName !== "ooze" ? " and Sludge" : ""}`,
        ),
      );

      mutableTraitElement = mutableTraitElement.next();
      if (trait.isGainable()) {
        // TODO check if beast_of_burden can be gained by other races during winter event.
        addTableToggle(
          mutableTraitElement,
          "mutableTrait_gain_" + trait.traitName,
        );
      }

      mutableTraitElement = mutableTraitElement.next();
      addTableToggle(
        mutableTraitElement,
        "mutableTrait_purge_" + trait.traitName,
      );

      if (trait.isGainable()) {
        makeToggleSwitchesMutuallyExclusive(
          $(".script_mutableTrait_gain_" + trait.traitName),
          "mutableTrait_gain_" + trait.traitName,
          $(".script_mutableTrait_purge_" + trait.traitName),
          "mutableTrait_purge_" + trait.traitName,
        );
      }

      mutableTraitElement = mutableTraitElement.next();
      if (poly.neg_roll_traits.includes(trait.traitName)) {
        addTableToggle(
          mutableTraitElement,
          "mutableTrait_reset_" + trait.traitName,
        );
      }
    }

    mutateTraitTableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: getSorterHelper(),
      update: function () {
        let mutableTraitNames = mutateTraitTableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        const settingsRaw = getSettingsRaw();
        for (let i = 0; i < mutableTraitNames.length; i++) {
          settingsRaw["mutableTrait_p_" + mutableTraitNames[i]] = i;
        }

        getMutableTraitManager().sortByPriority();
        updateSettingsFromState();
      },
    });

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function makeToggleSwitchesMutuallyExclusive(
    switch1,
    settingsKey1,
    switch2,
    settingsKey2,
  ) {
    switch1.on("change", function () {
      if (switch1.prop("checked") && switch2.prop("checked")) {
        switch2.prop("checked", false);
        getSettingsRaw()[settingsKey2] = false;
        updateSettingsFromState();
      }
    });
    switch2.on("change", function () {
      if (switch1.prop("checked") && switch2.prop("checked")) {
        switch1.prop("checked", false);
        getSettingsRaw()[settingsKey1] = false;
        updateSettingsFromState();
      }
    });
  }

  return {
    buildTraitSettings,
    updateImitateWarning,
    updateTraitSettingsContent,
    makeToggleSwitchesMutuallyExclusive,
  };
}
