import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface EvolutionSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createEvolutionSettings({
  getDependency,
  getOverride,
}: EvolutionSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const addSettingsSelect = liveFunction(() =>
    getDependency("addSettingsSelect"),
  );
  const addSettingsToggle = liveFunction(() =>
    getDependency("addSettingsToggle"),
  );
  const addStandardHeading = liveFunction(() =>
    getDependency("addStandardHeading"),
  );
  const buildSettingsSection = liveFunction(() =>
    getDependency("buildSettingsSection"),
  );
  const challenges = liveObject(() => getDependency("challenges"));
  const document = liveObject(() => getDependency("document"));
  const evolutionSettingsToStore = liveObject(() =>
    getDependency("evolutionSettingsToStore"),
  );
  const game = liveObject(() => getDependency("game"));
  const getStarLevel = liveFunction(() => getDependency("getStarLevel"));
  const prestigeOptions = liveObject(() => getDependency("prestigeOptions"));
  const prestigeTypes = liveObject(() => getDependency("prestigeTypes"));
  const races = liveObject(() => getDependency("races"));
  const resetCheckbox = liveFunction(() => getDependency("resetCheckbox"));
  const resetEvolutionSettings = liveFunction(() =>
    getDependency("resetEvolutionSettings"),
  );
  const settings = liveObject(() => getDependency("settings"));
  const settingsRaw = liveObject(() => getDependency("settingsRaw"));
  const sorterHelper = liveFunction(() => getDependency("sorterHelper"));
  const state = liveObject(() => getDependency("state"));
  const universes = liveObject(() => getDependency("universes"));
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildEvolutionSettingsImpl() {
    let sectionId = "evolution";
    let sectionName = "Evolution";

    let resetFunction = function () {
      resetEvolutionSettings(true);
      updateSettingsFromState();
      updateEvolutionSettingsContent();

      resetCheckbox("autoEvolution");
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateEvolutionSettingsContent,
    );
  }

  function updateRaceWarningImpl() {
    let race = races[settingsRaw.userEvolutionTarget];
    if (race && race.getCondition() !== "") {
      let suited = race.getHabitability();
      if (suited === 1) {
        $("#script_race_warning").html(
          `<span class="has-text-success">This race have special requirements: ${race.getCondition()} This condition is met.</span>`,
        );
      } else if (suited === 0) {
        $("#script_race_warning").html(
          `<span class="has-text-danger">Warning! This race have special requirements: ${race.getCondition()} This condition is not met.</span>`,
        );
      } else {
        $("#script_race_warning").html(
          `<span class="has-text-warning">Warning! This race have special requirements: ${race.getCondition()} This condition is bypassed. Race will have ${
            100 - suited * 100
          }% penalty.</span>`,
        );
      }
    } else {
      $("#script_race_warning").empty();
    }
  }

  function updateEvolutionSettingsContentImpl() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_evolutionContent");
    currentNode.empty().off("*");

    // Target universe
    let universeOptions = [
      { val: "none", label: "None", hint: "Wait for user selection" },
      ...universes.map((id) => ({
        val: id,
        label: game.loc(`universe_${id}`),
        hint: game.loc(`universe_${id}_desc`),
      })),
    ];
    addSettingsSelect(
      currentNode,
      "userUniverseTargetName",
      "Target Universe",
      "Chosen universe will be automatically selected after appropriate reset",
      universeOptions,
    );

    // Target planet
    let planetOptions = [
      { val: "none", label: "None", hint: "Wait for user selection" },
      {
        val: "habitable",
        label: "Most habitable",
        hint: "Picks most habitable planet, based on biome and trait",
      },
      {
        val: "achieve",
        label: "Most achievements",
        hint: "Picks planet with most unearned achievements. Takes in account extinction achievements for planet exclusive races, and greatness achievements for planet biome, trait, and exclusive genus.",
      },
      {
        val: "weighting",
        label: "Highest weighting",
        hint: "Picks planet with highest weighting. Should be configured in Planet Weighting Settings section.",
      },
    ];
    addSettingsSelect(
      currentNode,
      "userPlanetTargetName",
      "Target Planet",
      "Chosen planet will be automatically selected after appropriate reset. Warning! Script ignores changes made by G.E.C.K., you need to select planet manually after using it.",
      planetOptions,
    );

    // Target evolution
    let raceOptions = [
      {
        val: "auto",
        label: "Auto Achievements",
        hint: "Picks race giving most achievements upon completing run. Tracks all achievements limited to specific races and resets. Races unique to current planet biome are prioritized, when available.",
      },
      ...(Object.values(races) as Loose[]).map((race) => ({
        val: race.id,
        label: race.name,
        hint: race.desc,
      })),
    ];
    addSettingsSelect(
      currentNode,
      "userEvolutionTarget",
      "Target Race",
      "Chosen race will be automatically selected during next evolution",
      raceOptions,
    ).on("change", "select", function () {
      state.evolutionTarget = null;
      updateRaceWarning();
    });

    let genusOptions = [
      ...(Object.values(game.races) as Loose[])
        .map((r) => r.type)
        .filter((g, i, a) => g && g !== "organism" && a.indexOf(g) === i)
        .map((g) => ({ val: g, label: game.loc(`genelab_genus_${g}`) })),
    ];
    addSettingsSelect(
      currentNode,
      "userEvolutionGenus",
      "Preferred genus",
      "Chosen genus will be picked if target race have such option. Works only with challenge races, and hybrids. If chosen genus is not allowed, then first valid option will be picked instead.",
      genusOptions,
    );

    currentNode.append(`<div><span id="script_race_warning"></span></div>`);
    updateRaceWarning();

    addSettingsToggle(
      currentNode,
      "evolutionAutoUnbound",
      "Allow unbound races",
      "Allow Auto Achievement to pick biome restricted races on unsuited biomes, after getting unbound.",
    );
    addSettingsToggle(
      currentNode,
      "evolutionBackup",
      "Soft Reset",
      "Perform soft resets until you'll get chosen race. Has no effect after getting mass extinction perk.",
    );

    // Challenges
    for (let i = 0; i < challenges.length; i++) {
      let set = challenges[i];
      addSettingsToggle(
        currentNode,
        `challenge_${set[0].id}`,
        set.map((c) => game.loc(`evo_challenge_${c.id}`)).join(" | "),
        set.map((c) => game.loc(`evo_challenge_${c.id}_effect`)).join("&#xA;"),
      );
    }

    addStandardHeading(currentNode, "Evolution Queue");
    addSettingsToggle(
      currentNode,
      "evolutionQueueEnabled",
      "Queue Enabled",
      "When enabled script with evolve with queued settings, from top to bottom. During that script settings will be overriden with settings stored in queue. Queued target will be removed from list after evolution.",
    );
    addSettingsToggle(
      currentNode,
      "evolutionQueueRepeat",
      "Repeat Queue",
      "When enabled applied evolution targets will be moved to the end of queue, instead of being removed",
    );

    currentNode.append(`
          <div style="margin-top: 5px; display: inline-block; width: 90%; text-align: left;">
            <label for="script_evolution_prestige">Prestige for new evolutions:</label>
            <select id="script_evolution_prestige" style="height: 18px; width: 150px; float: right;">
              <option value = "auto" title = "Inherited from current Prestige Settings">Current Prestige</option>
              ${prestigeOptions}
            </select>
          </div>
          <div style="margin-top: 10px;">
            <button id="script_evlution_add" class="button">Add New Evolution</button>
          </div>`);

    $("#script_evlution_add").on("click", addEvolutionSetting);
    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:25%">Race</th>
              <th class="has-text-warning" style="width:70%" title="Settings applied before evolution. Changed settings not limited to initial template, you can manually add any script options to JSON.">Settings</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_evolutionQueueTable"></tbody>
          </table>`);

    let tableBodyNode = $("#script_evolutionQueueTable");
    for (let i = 0; i < settingsRaw.evolutionQueue.length; i++) {
      tableBodyNode.append(buildEvolutionQueueItem(i));
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: sorterHelper,
      update: function () {
        let newOrder = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        settingsRaw.evolutionQueue = newOrder.map(
          (i) => settingsRaw.evolutionQueue[i],
        );

        updateSettingsFromState();
        updateEvolutionSettingsContent();
      },
    });

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildEvolutionQueueItemImpl(id) {
    let queuedEvolution = settingsRaw.evolutionQueue[id];
    for (let settingName of evolutionSettingsToStore) {
      queuedEvolution[settingName] =
        queuedEvolution[settingName] ?? settings[settingName];
    }

    let raceName = "";
    let raceClass = "";
    let prestigeName = "";
    let prestigeClass = "";

    let race = races[queuedEvolution.userEvolutionTarget];
    let isValdi = queuedEvolution.challenge_junker || race === races.junker;
    let isSludge = queuedEvolution.challenge_sludge || race === races.sludge;
    let isUltraSludge =
      queuedEvolution.challenge_ultra_sludge || race === races.ultra_sludge;
    let isHellspawn =
      queuedEvolution.challenge_warlord || race === races.hellspawn;

    const getRaceColor = (race) => {
      let suited = race.getHabitability();
      if (suited === 1) {
        return "has-text-info";
      } else if (suited === 0) {
        return "has-text-danger";
      } else {
        return "has-text-warning";
      }
    };

    let uniqPicked = isValdi + isSludge + isUltraSludge + isHellspawn;
    if (uniqPicked > 1) {
      raceName = "Valdi, Sludge and Hellspawn can not be combined!";
      raceClass = "has-text-danger";
    } else if (uniqPicked === 1) {
      let name = isValdi
        ? races.junker.name
        : isSludge
          ? races.sludge.name
          : isUltraSludge
            ? races.ultra_sludge.name
            : isHellspawn
              ? races.hellspawn.name
              : "???";
      if (
        race &&
        race !== races.junker &&
        race !== races.sludge &&
        race !== races.ultra_sludge
      ) {
        raceName = name + ", " + game.loc(`genelab_genus_${race.genus}`);
        raceClass = getRaceColor(race);
      } else {
        raceName =
          name +
          ", " +
          game.loc(`genelab_genus_${queuedEvolution.userEvolutionGenus}`);
        raceClass = getRaceColor(
          (Object.values(races) as Loose[]).find(
            (r) => r.genus === queuedEvolution.userEvolutionGenus,
          ),
        );
      }
    } else if (queuedEvolution.userEvolutionTarget === "auto") {
      raceName = "Auto Achievements";
      raceClass = "has-text-advanced";
    } else if (race) {
      raceName = race.name;
      raceClass = getRaceColor(race);
      if (race.genus == "hybrid") {
        if (
          game.races[race.id].hybrid.includes(
            queuedEvolution.userEvolutionGenus,
          )
        ) {
          raceName +=
            ", " +
            game.loc(`genelab_genus_${queuedEvolution.userEvolutionGenus}`);
        } else {
          raceName +=
            ", " + game.loc(`genelab_genus_${game.races[race.id].hybrid[0]}`);
        }
      }
    } else {
      raceName = "Unrecognized race!";
      raceClass = "has-text-danger";
    }

    let star = $(
      `#settings a.dropdown-item:contains("${game.loc(
        game.global.settings.icon,
      )}") svg`,
    ).clone();
    star.removeClass();
    star.addClass("star" + getStarLevel(queuedEvolution));

    if (queuedEvolution.prestigeType !== "none") {
      let prestige = prestigeTypes.find(
        (prest) => prest.val === queuedEvolution.prestigeType,
      );
      if (prestige) {
        prestigeName = `(${prestige.short_label ?? prestige.label})`;
        prestigeClass = "has-text-info";
      } else {
        prestigeName = "Unrecognized prestige!";
        prestigeClass = "has-text-danger";
      }
    }

    let queueNode = $(`
          <tr id="script_evolution_${id}" value="${id}" class="script-draggable">
            <td style="width:25%"><span class="${raceClass}">${raceName}</span> <span class="${prestigeClass}">${prestigeName}</span> ${
              star.prop("outerHTML") ?? getStarLevel(queuedEvolution) - 1 + "*"
            }</td>
            <td style="width:70%"><textarea class="textarea">${JSON.stringify(
              queuedEvolution,
              null,
              4,
            )}</textarea></td>
            <td style="width:5%"><a class="button is-dark is-small" style="width: 26px; height: 26px"><span>X</span></a></td>
          </tr>`);

    // Delete button
    queueNode.find(".button").on("click", function () {
      settingsRaw.evolutionQueue.splice(id, 1);
      updateSettingsFromState();
      updateEvolutionSettingsContent();
    });

    // Settings textarea
    queueNode.find(".textarea").on("change", function (this: Loose) {
      try {
        let queuedEvolution = JSON.parse(this.value);
        settingsRaw.evolutionQueue[id] = queuedEvolution;
        updateSettingsFromState();
        updateEvolutionSettingsContent();
      } catch (error) {
        queueNode
          .find("td:eq(0)")
          .html(`<span class="has-text-danger">${error}</span>`);
      }
    });

    return queueNode;
  }

  function addEvolutionSettingImpl() {
    let queuedEvolution: Loose = {};
    for (let settingName of evolutionSettingsToStore) {
      let settingValue = settingsRaw[settingName];
      queuedEvolution[settingName] = settingValue;
    }

    let overridePrestige = $("#script_evolution_prestige").first().val();
    if (overridePrestige && overridePrestige !== "auto") {
      queuedEvolution.prestigeType = overridePrestige;
    }

    let queueLength = settingsRaw.evolutionQueue.push(queuedEvolution);
    updateSettingsFromState();

    let tableBodyNode = $("#script_evolutionQueueTable");
    tableBodyNode.append(buildEvolutionQueueItem(queueLength - 1));
  }

  function buildEvolutionSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildEvolutionSettings") ?? buildEvolutionSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateRaceWarning(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateRaceWarning") ?? updateRaceWarningImpl;
    return implementation.apply(this, args);
  }

  function updateEvolutionSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateEvolutionSettingsContent") ??
      updateEvolutionSettingsContentImpl;
    return implementation.apply(this, args);
  }

  function buildEvolutionQueueItem(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildEvolutionQueueItem") ?? buildEvolutionQueueItemImpl;
    return implementation.apply(this, args);
  }

  function addEvolutionSetting(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("addEvolutionSetting") ?? addEvolutionSettingImpl;
    return implementation.apply(this, args);
  }

  return {
    buildEvolutionSettings,
    updateRaceWarning,
    updateEvolutionSettingsContent,
    buildEvolutionQueueItem,
    addEvolutionSetting,
  };
}
