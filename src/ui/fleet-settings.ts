import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface FleetSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createFleetSettings({
  getDependency,
  getOverride,
}: FleetSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const FleetManagerOuter = liveObject(() =>
    getDependency("FleetManagerOuter"),
  );
  const addSettingsHeader1 = liveFunction(() =>
    getDependency("addSettingsHeader1"),
  );
  const addSettingsNumber = liveFunction(() =>
    getDependency("addSettingsNumber"),
  );
  const addSettingsSelect = liveFunction(() =>
    getDependency("addSettingsSelect"),
  );
  const addSettingsToggle = liveFunction(() =>
    getDependency("addSettingsToggle"),
  );
  const addStandardHeading = liveFunction(() =>
    getDependency("addStandardHeading"),
  );
  const addTableInput = liveFunction(() => getDependency("addTableInput"));
  const buildSettingsSection2 = liveFunction(() =>
    getDependency("buildSettingsSection2"),
  );
  const buildTableLabel = liveFunction(() => getDependency("buildTableLabel"));
  const document = liveObject(() => getDependency("document"));
  const galaxyRegions = liveObject(() => getDependency("galaxyRegions"));
  const game = liveObject(() => getDependency("game"));
  const openOverrideModal = liveFunction(() =>
    getDependency("openOverrideModal"),
  );
  const resetCheckbox = liveFunction(() => getDependency("resetCheckbox"));
  const resetFleetSettings = liveFunction(() =>
    getDependency("resetFleetSettings"),
  );
  const settings = liveObject(() => getDependency("settings"));
  const settingsRaw = liveObject(() => getDependency("settingsRaw"));
  const sorterHelper = liveFunction(() => getDependency("sorterHelper"));
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildFleetSettingsImpl(parentNode, secondaryPrefix) {
    let sectionId = "fleet";
    let sectionName = "Fleet";

    let resetFunction = function () {
      resetFleetSettings(true);
      updateSettingsFromState();
      updateFleetSettingsContent(secondaryPrefix);

      resetCheckbox("autoFleet");
    };

    buildSettingsSection2(
      parentNode,
      secondaryPrefix,
      sectionId,
      sectionName,
      resetFunction,
      updateFleetSettingsContent,
    );
  }

  function updateFleetSettingsContentImpl(secondaryPrefix) {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $(`#script_${secondaryPrefix}fleetContent`);
    currentNode.empty().off("*");

    updateFleetAndromeda(currentNode, secondaryPrefix);
    updateFleetOuter(currentNode, secondaryPrefix);

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function updateFleetOuterImpl(currentNode, secondaryPrefix) {
    addStandardHeading(currentNode, "Outer Solar");

    let shipOptions = [
      { val: "none", label: "None", hint: "Ship building disabled" },
      {
        val: "user",
        label: "Current design",
        hint: "Build whatever currently set in Ship Yard",
      },
      {
        val: "manual",
        label: "Manual mode",
        hint: "Assists accumulating resources needed for current blueprint, without building or deploying anything. It also might need tweaking prioritization settings to work.",
      },
      {
        val: "custom",
        label: "Presets",
        hint: "Build ships with components configured below. All components need to be unlocked, and resulting design should have enough power",
      },
    ];
    addSettingsSelect(
      currentNode,
      "fleetOuterShips",
      "Ships to build",
      "Once avalable and affordable script will build ship of selected design, and send it to region with most piracy * weighting",
      shipOptions,
    );
    addSettingsNumber(
      currentNode,
      "fleetOuterCrew",
      "Minimum idle soldiers",
      "Only build ships when amount of idle soldiers above give number",
    );
    addSettingsToggle(
      currentNode,
      "fleetExploreTau",
      "Explore Tau Ceti",
      "Send explorer to Tau Ceti",
    );

    addSettingsHeader1(currentNode, "Fighter");
    for (let [type, parts] of Object.entries(
      FleetManagerOuter.ShipConfig,
    ) as Array<[string, Loose[]]>) {
      let partOptions = parts.map((id) => ({
        val: id,
        label: game.loc(`outer_shipyard_${type}_${id}`),
      }));
      addSettingsSelect(
        currentNode,
        `fleet_outer_${type}`,
        game.loc(`outer_shipyard_${type}`),
        "Preset ship component",
        partOptions,
      );
    }
    addSettingsHeader1(currentNode, "Scout");
    for (let [type, parts] of Object.entries(
      FleetManagerOuter.ShipConfig,
    ) as Array<[string, Loose[]]>) {
      let partOptions = parts.map((id) => ({
        val: id,
        label: game.loc(`outer_shipyard_${type}_${id}`),
      }));
      addSettingsSelect(
        currentNode,
        `fleet_scout_${type}`,
        game.loc(`outer_shipyard_${type}`),
        "Preset ship component",
        partOptions,
      );
    }

    currentNode.append(`
          <table style="width:100%; text-align: left">
            <tr>
              <th class="has-text-warning" style="width:35%">Region</th>
              <th class="has-text-warning" style="width:20%" title="Weighting determines order of ships dispatching, regions with higher weighting will be get ships sooner">Weighting</th>
              <th class="has-text-warning" style="width:20%" title="Desired protection from syndicate, trying to reach 100%(1.0) defense with full uptime might be wasteful due to excesses and fluctuations">Defend</th>
              <th class="has-text-warning" style="width:20%" title="Amounts of scouts to dispatch">Scouts</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_${secondaryPrefix}fleetOuterTable"></tbody>
          </table>`);

    let tableBodyNode = $(`#script_${secondaryPrefix}fleetOuterTable`);
    let newTableBodyText = "";

    for (let reg of FleetManagerOuter.Regions) {
      newTableBodyText += `<tr><td id="script_${secondaryPrefix}fleet_${reg}" style="width:35%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:20%"></td><td style="width:5%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build all other productions settings rows
    for (let reg of FleetManagerOuter.Regions) {
      let fleetElement = $(`#script_${secondaryPrefix}fleet_${reg}`);

      let nameRef = game.actions.space[reg].info.name;
      let gameName = typeof nameRef === "function" ? nameRef() : nameRef;
      let label = reg
        .split("_")
        .slice(1)
        .map((n) => n.charAt(0).toUpperCase() + n.slice(1))
        .join(" ");
      if (label !== gameName) {
        label += ` (${gameName})`;
      }

      fleetElement.append(buildTableLabel(label));

      fleetElement = fleetElement.next();
      addTableInput(fleetElement, "fleet_outer_pr_" + reg);

      fleetElement = fleetElement.next();
      addTableInput(fleetElement, "fleet_outer_def_" + reg);

      fleetElement = fleetElement.next();
      addTableInput(fleetElement, "fleet_outer_sc_" + reg);
    }
  }

  function updateFleetAndromedaImpl(currentNode, secondaryPrefix) {
    addStandardHeading(currentNode, "Andromeda");
    addSettingsToggle(
      currentNode,
      "fleetMaxCover",
      "Maximize protection of prioritized systems",
      "Adjusts ships distribution to fully supress piracy in prioritized regions. Some potential defense will be wasted, as it will use big ships to cover small holes, when it doesn't have anything fitting better. This option is not required: all your dreadnoughts still will be used even without this option.",
    );
    addSettingsToggle(
      currentNode,
      "fleetCrewReclaim",
      "Reclaim crews of surplus ships",
      "Power down combat ships which are not needed to fully supress piracy, releasing their crews back to the workforce. Ships are powered back up when coverage requires them. Inactive while fleet is being accumulated for an assault mission. Surplus ships won't be parked at Gorddon for the Symposium bonus while this is enabled.",
    );
    addSettingsNumber(
      currentNode,
      "fleetEmbassyKnowledge",
      "Minimum knowledge for Embassy",
      "Building Embassy increases maximum piracy up to 100, script won't Auto Build it until this knowledge cap is reached.",
    );
    addSettingsNumber(
      currentNode,
      "fleetAlienGiftKnowledge",
      "Minimum knowledge for Alien Gift",
      "Researching Alien Gift increases maximum piracy up to 250, script won't Auto Research it until this knowledge cap is reached.",
    );
    addSettingsNumber(
      currentNode,
      "fleetAlien2Knowledge",
      "Minimum knowledge for Alien 2 Assault",
      "Assaulting Alien 2 increases maximum piracy up to 500, script won't do it until this knowledge cap is reached. Regardless of set value it won't ever try to assault until you have big enough fleet to do it without loses.",
    );

    let alien2AssaultOptions = [
      {
        val: "none",
        label: "No Losses",
        hint: "Min fleet strength 650. No losses.",
      },
      {
        val: "suicide",
        label: "Suicide Mission",
        hint: "Attack as soon as we hit 400 fleet rating. There will be losses.",
      },
    ];
    addSettingsSelect(
      currentNode,
      "fleetAlien2Loses",
      "Alien 2 Mission",
      "Assault Alien 2 when chosen outcome is achievable. You should really keep the default, unless you're speed running and want to take it out ASAP with losses.",
      alien2AssaultOptions,
    );

    let assaultOptions = [
      {
        val: "ignore",
        label: "Manual assault",
        hint: "Won't ever launch assault mission on Chthonian",
      },
      {
        val: "high",
        label: "High casualties",
        hint: "Unlock Chthonian using mixed fleet, high casualties (1250+ total fleet power, 500 will be lost)",
      },
      {
        val: "avg",
        label: "Average casualties",
        hint: "Unlock Chthonian using mixed fleet, average casualties (2500+ total fleet power, 160 will be lost)",
      },
      {
        val: "low",
        label: "Low casualties",
        hint: "Unlock Chthonian using mixed fleet, low casualties (4500+ total fleet power, 80 will be lost)",
      },
      {
        val: "frigate",
        label: "Frigate",
        hint: "Unlock Chthonian loosing Frigate ship(s) (4500+ total fleet power, suboptimal for banana\\instinct runs)",
      },
      {
        val: "dread",
        label: "Dreadnought",
        hint: "Unlock Chthonian with Dreadnought suicide mission",
      },
    ];
    addSettingsSelect(
      currentNode,
      "fleetChthonianLoses",
      "Chthonian Mission",
      "Assault Chthonian when chosen outcome is achievable. Mixed fleet formed to clear mission with minimum possible wasted ships, e.g. for low causlities it can sacriface 8 scouts, or 2 corvettes and 2 scouts, or frigate, and such. Whatever will be first available. It also takes in account perks and challenges, adjusting fleet accordingly.",
      assaultOptions,
    );

    currentNode.append(`
          <table style="width:100%; text-align: left">
            <tr>
              <th class="has-text-warning" style="width:95%">Region</th>
              <th style="width:5%"></th>
            </tr>
            <tbody id="script_${secondaryPrefix}fleetTableBody"></tbody>
          </table>`);

    let tableBodyNode = $(`#script_${secondaryPrefix}fleetTableBody`);

    let priorityRegions = galaxyRegions
      .slice()
      .sort(
        (a, b) => settingsRaw["fleet_pr_" + a] - settingsRaw["fleet_pr_" + b],
      );
    for (let i = 0; i < priorityRegions.length; i++) {
      const settingName = `fleet_pr_${priorityRegions[i]}`;

      const rowNode = $(`
              <tr value="${priorityRegions[i]}" class="script-draggable script_bg_${settingName}">
                <td id="script_${secondaryPrefix}fleet_${priorityRegions[i]}" style="width:95%"></td>
                <td style="width:5%">
                  <span class="script-lastcolumn"></span>
                </td>
              </tr>`);

      rowNode
        .toggleClass(
          "inactive-row",
          Boolean(settingsRaw.overrides[settingName]),
        )
        .on(
          "click",
          {
            label: `Andromeda region priority (${settingName})`,
            name: settingName,
            type: "number",
          },
          openOverrideModal,
        );

      tableBodyNode.append(rowNode);
    }

    // Build all other productions settings rows
    for (let i = 0; i < galaxyRegions.length; i++) {
      let fleetElement = $(
        `#script_${secondaryPrefix}fleet_${galaxyRegions[i]}`,
      );
      let nameRef =
        galaxyRegions[i] === "gxy_alien1"
          ? "Alien 1 System"
          : galaxyRegions[i] === "gxy_alien2"
            ? "Alien 2 System"
            : game.actions.galaxy[galaxyRegions[i]].info.name;

      fleetElement.append(
        buildTableLabel(typeof nameRef === "function" ? nameRef() : nameRef),
      );
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: sorterHelper,
      update: function () {
        let regionIds = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        for (let i = 0; i < regionIds.length; i++) {
          settingsRaw["fleet_pr_" + regionIds[i]] = i;
        }

        updateSettingsFromState();
        if (settings.showSettings && secondaryPrefix) {
          updateFleetSettingsContent("");
        }
      },
    });
  }

  function buildFleetSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildFleetSettings") ?? buildFleetSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateFleetSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateFleetSettingsContent") ??
      updateFleetSettingsContentImpl;
    return implementation.apply(this, args);
  }

  function updateFleetOuter(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateFleetOuter") ?? updateFleetOuterImpl;
    return implementation.apply(this, args);
  }

  function updateFleetAndromeda(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateFleetAndromeda") ?? updateFleetAndromedaImpl;
    return implementation.apply(this, args);
  }

  return {
    buildFleetSettings,
    updateFleetSettingsContent,
    updateFleetOuter,
    updateFleetAndromeda,
  };
}
