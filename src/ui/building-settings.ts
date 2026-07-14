import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface BuildingSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createBuildingSettings({
  getDependency,
  getOverride,
}: BuildingSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const BuildingManager = liveObject(() => getDependency("BuildingManager"));
  const addSettingsNumber = liveFunction(() =>
    getDependency("addSettingsNumber"),
  );
  const addSettingsSelect = liveFunction(() =>
    getDependency("addSettingsSelect"),
  );
  const addSettingsToggle = liveFunction(() =>
    getDependency("addSettingsToggle"),
  );
  const addTableInput = liveFunction(() => getDependency("addTableInput"));
  const addTableToggle = liveFunction(() => getDependency("addTableToggle"));
  const addToggleCallbacks = liveFunction(() =>
    getDependency("addToggleCallbacks"),
  );
  const buildSettingsSection = liveFunction(() =>
    getDependency("buildSettingsSection"),
  );
  const buildTableLabel = liveFunction(() => getDependency("buildTableLabel"));
  const buildingIds = liveObject(() => getDependency("buildingIds"));
  const checkCompare = liveObject(() => getDependency("checkCompare"));
  const confirm = liveFunction(() => getDependency("confirm"));
  const document = liveObject(() => getDependency("document"));
  const getRealNumber = liveFunction(() => getDependency("getRealNumber"));
  const initBuildingState = liveFunction(() =>
    getDependency("initBuildingState"),
  );
  const linkedBuildings = liveObject(() => getDependency("linkedBuildings"));
  const overrideKey = liveObject(() => getDependency("overrideKey"));
  const removeBuildingToggles = liveFunction(() =>
    getDependency("removeBuildingToggles"),
  );
  const resetBuildingSettings = liveFunction(() =>
    getDependency("resetBuildingSettings"),
  );
  const resetCheckbox = liveFunction(() => getDependency("resetCheckbox"));
  const resources = liveObject(() => getDependency("resources"));
  const settingsRaw = liveObject(() => getDependency("settingsRaw"));
  const sorterHelper = liveFunction(() => getDependency("sorterHelper"));
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildBuildingSettingsImpl() {
    let sectionId = "building";
    let sectionName = "Building";

    let resetFunction = function () {
      resetBuildingSettings(true);
      updateSettingsFromState();
      updateBuildingSettingsContent();

      resetCheckbox("autoBuild", "autoPower");
      removeBuildingToggles();
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateBuildingSettingsContent,
    );
  }

  function updateBuildingSettingsContentImpl() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_buildingContent");
    currentNode.empty().off("*");

    addSettingsToggle(
      currentNode,
      "buildingsIgnoreZeroRate",
      "Do not wait for resources without income",
      "Weighting checks will ignore resources without positive income(craftables, inactive factory goods, etc), buildings with such resources will not delay other buildings.",
    );
    addSettingsToggle(
      currentNode,
      "buildingsLimitPowered",
      "Limit amount of powered buildings",
      "With this option enabled Max Build will prevent powering extra building. Can be useful to disable buildings with overrided settings.",
    );
    addSettingsToggle(
      currentNode,
      "buildingsTransportGem",
      "Build cheapest Supplies transport",
      "By default script chooses between Lake Transport and Lake Bireme Warship comparing their 'Supplies Per Support', with this option enabled it will compare 'Supplies Per Soulgems' instead.",
    );
    addSettingsToggle(
      currentNode,
      "buildingsBestFreighter",
      "Build most efficient freighters",
      "With this option enabled script will compare 'Money Storage per Crew' of Freighter and Super Freighter, and only build the best one. Without this option no restrictions will be applied. Works only when both ships are buildable.",
    );
    addSettingsToggle(
      currentNode,
      "buildingsUseMultiClick",
      "Bulk build multi-segmented buildings",
      "With this option enabled, the script will build as many segments as are affordable at once, instead of one per tick.",
    );
    addSettingsNumber(
      currentNode,
      "buildingTowerSuppression",
      "Minimum suppression for Towers",
      "East Tower and West Tower won't be built until minimum suppression is reached",
    );

    const consumptionOptions = [
      {
        val: "onePerTick",
        label: "Default",
        hint: "Script will stop building buildings for one tick after buying building with support/upkeep. (Example: 1 Living Quarters stops processing of all buildings until next script tick.)",
      },
      {
        val: "perResource",
        label: "Non-conflicting only",
        hint: "During a tick, the script will only buy at most one building using a given support/upkeep type, but non-conflicting ones are allowed. Should be safe in most cases. (Example: 1 Living Quarters stops building the other buildings using Red Planet support for that tick, but it can still build on other planets.)",
      },
      {
        val: "unlimited",
        label: "Unlimited",
        hint: "Do not pay attention to support/upkeep requirements. This will cause bugs and undesirable behavior as it can easily exceed the maximum support. But, at extremely high prestige levels, this may be required. (Example: Can buy 1 Living Quarters + 1 Mine + 1 Fabrication + 1 Biodome in a single tick even if there is only 2 support left.)",
      },
    ];
    addSettingsSelect(
      currentNode,
      "buildingConsumptionCheck",
      "Behavior when building support/upkeep-using building",
      "By default, the script only buys one building with support or upkeep requirement per tick, to allow automatic weightings to work optimally.",
      consumptionOptions,
    );

    currentNode.append(`
          <div><input id="script_buildingSearch" class="script-searchsettings" type="text" placeholder="Search for buildings..."></div>
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:35%">Building</th>
              <th class="has-text-warning" style="width:15%" title="Enables auto building. Triggers ignores this option, allowing to build disabled things.">Auto Build</th>
              <th class="has-text-warning" style="width:15%" title="Maximum amount of buildings to build. Triggers ignores this option, allowing to build above limit. Can be also used to limit amount of enabled buildings, with respective option above.">Max Build</th>
              <th class="has-text-warning" style="width:15%" title="Script will try to spend 2x amount of resources on building having 2x weighting, and such.">Weighting</th>
              <th class="has-text-warning" style="width:20%" title="First toggle enables basic automation based on priority, power, support, and consumption. Second enables logic made specially for particlular building, their effects are different, but generally it tries to behave smarter than just staying enabled all the time.">Auto Power</th>
            </tr>
            <tbody id="script_buildingTableBody"></tbody>
          </table>`);

    let tableBodyNode = $("#script_buildingTableBody");

    $("#script_buildingSearch").on("keyup", filterBuildingSettingsTable); // Add building filter

    // Add in a first row for switching "All"
    let newTableBodyText =
      '<tr value="All" class="unsortable"><td id="script_bldallToggle" style="width:35%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:20%"><span id="script_resetBuildingsPriority" class="script-refresh"></span></td></tr>';

    for (let i = 0; i < BuildingManager.priorityList.length; i++) {
      let building = BuildingManager.priorityList[i];
      newTableBodyText += `<tr value="${building._vueBinding}" class="script-draggable"><td id="script_${building._vueBinding}" style="width:35%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:15%"></td><td style="width:20%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    // Build special "All Buildings" top row
    let buildingElement = $("#script_bldallToggle");
    buildingElement.append(
      '<span class="has-text-warning" style="margin-left: 20px;">All Buildings</span>',
    );

    // enabled column
    buildingElement = buildingElement.next();
    buildingElement.append(buildAllBuildingEnabledSettingsToggle());

    // state column
    buildingElement = buildingElement.next().next().next();
    buildingElement.append(buildAllBuildingStateSettingsToggle());

    $("#script_resetBuildingsPriority").on("click", function () {
      if (confirm("Are you sure you wish to reset buildings priority?")) {
        initBuildingState();
        for (let i = 0; i < BuildingManager.priorityList.length; i++) {
          let id = BuildingManager.priorityList[i]._vueBinding;
          settingsRaw["bld_p_" + id] = i;
        }
        updateSettingsFromState();
        updateBuildingSettingsContent();
      }
    });

    // Build all other buildings settings rows
    for (let i = 0; i < BuildingManager.priorityList.length; i++) {
      let building = BuildingManager.priorityList[i];
      let buildingElement = $("#script_" + building._vueBinding);

      let color =
        building._tab === "space" || building._tab === "starDock"
          ? "has-text-danger"
          : building._tab === "galaxy" || building._tab === "eden"
            ? "has-text-advanced"
            : building._tab === "interstellar"
              ? "has-text-special"
              : building._tab === "portal" || building._tab === "tauceti"
                ? "has-text-warning"
                : "has-text-info";

      buildingElement.append(buildTableLabel(building.name, "", color));

      buildingElement = buildingElement.next();
      addTableToggle(buildingElement, "bat" + building._vueBinding);

      buildingElement = buildingElement.next();
      addTableInput(buildingElement, "bld_m_" + building._vueBinding);

      buildingElement = buildingElement.next();
      addTableInput(buildingElement, "bld_w_" + building._vueBinding);

      buildingElement = buildingElement.next();
      buildBuildingStateSettingsToggle(buildingElement, building);
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: sorterHelper,
      update: function () {
        let buildingElements = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        for (let i = 0; i < buildingElements.length; i++) {
          settingsRaw["bld_p_" + buildingElements[i]] = i;
        }

        BuildingManager.sortByPriority();
        updateSettingsFromState();
      },
    });

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function filterBuildingSettingsTableImpl() {
    // Declare variables
    let filter = document
      .getElementById("script_buildingSearch")
      .value.toUpperCase();
    let trs = document
      .getElementById("script_buildingTableBody")
      .getElementsByTagName("tr");

    let filterChecker = null;
    let reg = filter.match(/^(.+)(<=|>=|===|==|<|>|!==|!=)(.+)$/);
    if (reg?.length === 4) {
      let buildingValue = null;
      switch (reg[1].trim()) {
        case "BUILD":
        case "AUTOBUILD":
          buildingValue = (b) => b.autoBuildEnabled;
          break;
        case "POWER":
        case "AUTOPOWER":
          buildingValue = (b) => b.autoStateEnabled;
          break;
        case "WEIGHT":
        case "WEIGHTING":
          buildingValue = (b) => b._weighting;
          break;
        case "MAX":
        case "MAXBUILD":
          buildingValue = (b) => b._autoMax;
          break;
        case "POWERED":
          buildingValue = (b) => b.powered;
          break;
        case "KNOW":
        case "KNOWLEDGE":
          buildingValue = (b) => b.is.knowledge;
          break;
        default: // Cost check, get resource quantity by part of name
          buildingValue = (b) =>
            Object.entries(b.cost).find(
              ([res, qnt]) =>
                resources[res].title.toUpperCase().indexOf(reg[1].trim()) > -1,
            )?.[1] ?? 0;
      }
      let testValue = null;
      switch (reg[3].trim()) {
        case "ON":
        case "TRUE":
          testValue = true;
          break;
        case "OFF":
        case "FALSE":
          testValue = false;
          break;
        default:
          testValue = getRealNumber(reg[3].trim());
          break;
      }
      filterChecker = (building) =>
        checkCompare[reg[2]](buildingValue(building), testValue);
    }

    // Loop through all table rows, and hide those who don't match the search query
    for (let i = 0; i < trs.length; i++) {
      let td = trs[i].getElementsByTagName("td")[0];
      if (td) {
        if (filterChecker) {
          let building = buildingIds[td.id.match(/^script_(.*)$/)[1]];
          if (building && filterChecker(building)) {
            trs[i].style.display = "";
          } else {
            trs[i].style.display = "none";
          }
        } else if (td.textContent.toUpperCase().indexOf(filter) > -1) {
          trs[i].style.display = "";
        } else {
          trs[i].style.display = "none";
        }
      }
    }
  }

  function buildAllBuildingEnabledSettingsToggleImpl() {
    return $(`
          <label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;">
            <input class="script_buildingEnabledAll" type="checkbox"${
              settingsRaw.buildingEnabledAll ? " checked" : ""
            }>
            <span class="check" style="height:5px; max-width:15px"></span>
            <span style="margin-left: 20px;"></span>
          </label>`)
      .on("change", "input", function (this: Loose) {
        settingsRaw.buildingEnabledAll = this.checked;
        for (let i = 0; i < BuildingManager.priorityList.length; i++) {
          let id = BuildingManager.priorityList[i]._vueBinding;
          settingsRaw["bat" + id] = this.checked;
        }
        $('[class^="script_bat"]').prop("checked", this.checked);

        updateSettingsFromState();
      })
      .on("click", function (event) {
        if (event[overrideKey]) {
          event.preventDefault();
        }
        if (
          event.target.nodeName === "INPUT" &&
          !confirm(
            "Are you sure you wish to change the Auto Build state of ALL buildings?",
          )
        ) {
          event.preventDefault();
        }
      });
  }

  function buildBuildingStateSettingsToggleImpl(node, building) {
    let stateKey = "bld_s_" + building._vueBinding;
    let smartKey = "bld_s2_" + building._vueBinding;

    if (building.isSwitchable()) {
      addToggleCallbacks(
        $(`
              <label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;">
                <input class="script_${stateKey}" type="checkbox"${
                  settingsRaw[stateKey] ? " checked" : ""
                }>
                <span class="check" style="height:5px; max-width:15px"></span>
                <span style="margin-left: 20px;"></span>
              </label>`),
        stateKey,
      ).appendTo(node);
      node.addClass("script_bg_" + stateKey);
    }

    if (building.is.smart) {
      let smartNode = $(`
              <label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 35px;">
                <input class="script_${smartKey}" type="checkbox"${
                  settingsRaw[smartKey] ? " checked" : ""
                }>
                <span class="check" style="height:5px; max-width:15px"></span>
                <span style="margin-left: 20px;"></span>
              </label>`);

      let set = linkedBuildings.find((set) => set.includes(building));
      if (set) {
        smartNode.on("change", "input", function (this: Loose) {
          set.forEach((building) => {
            let linkedId = "bld_s2_" + building._vueBinding;
            settingsRaw[linkedId] = this.checked;
            $(".script_" + linkedId).prop("checked", this.checked);
          });
          updateSettingsFromState();
        });
      } else {
        addToggleCallbacks(smartNode, smartKey);
      }
      node.append(smartNode);
      node.addClass("script_bg_" + smartKey);
    }

    node.append(`<span class="script-lastcolumn"></span>`);
    node.toggleClass(
      "inactive-row",
      Boolean(
        settingsRaw.overrides[stateKey] || settingsRaw.overrides[smartKey],
      ),
    );
  }

  function buildAllBuildingStateSettingsToggleImpl() {
    return $(`
          <label tabindex="0" class="switch" style="position:absolute; margin-top: 8px; margin-left: 10px;">
            <input class="script_buildingStateAll" type="checkbox"${
              settingsRaw.buildingStateAll ? " checked" : ""
            }>
            <span class="check" style="height:5px; max-width:15px"></span>
            <span style="margin-left: 20px;"></span>
          </label>`)
      .on("change", "input", function (this: Loose, e) {
        settingsRaw.buildingStateAll = this.checked;
        for (let i = 0; i < BuildingManager.priorityList.length; i++) {
          let id = BuildingManager.priorityList[i]._vueBinding;
          settingsRaw["bld_s_" + id] = this.checked;
        }
        $('[class^="script_bld_s_"]').prop("checked", this.checked);

        updateSettingsFromState();
      })
      .on("click", function (event) {
        if (event[overrideKey]) {
          event.preventDefault();
        }
        if (
          event.target.nodeName === "INPUT" &&
          !confirm(
            "Are you sure you wish to change the Auto Power state of ALL buildings?",
          )
        ) {
          event.preventDefault();
        }
      });
  }

  function buildBuildingSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildBuildingSettings") ?? buildBuildingSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateBuildingSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateBuildingSettingsContent") ??
      updateBuildingSettingsContentImpl;
    return implementation.apply(this, args);
  }

  function filterBuildingSettingsTable(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("filterBuildingSettingsTable") ??
      filterBuildingSettingsTableImpl;
    return implementation.apply(this, args);
  }

  function buildAllBuildingEnabledSettingsToggle(
    this: Loose,
    ...args: Loose[]
  ) {
    const implementation =
      getOverride("buildAllBuildingEnabledSettingsToggle") ??
      buildAllBuildingEnabledSettingsToggleImpl;
    return implementation.apply(this, args);
  }

  function buildBuildingStateSettingsToggle(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildBuildingStateSettingsToggle") ??
      buildBuildingStateSettingsToggleImpl;
    return implementation.apply(this, args);
  }

  function buildAllBuildingStateSettingsToggle(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildAllBuildingStateSettingsToggle") ??
      buildAllBuildingStateSettingsToggleImpl;
    return implementation.apply(this, args);
  }

  return {
    buildBuildingSettings,
    updateBuildingSettingsContent,
    filterBuildingSettingsTable,
    buildAllBuildingEnabledSettingsToggle,
    buildBuildingStateSettingsToggle,
    buildAllBuildingStateSettingsToggle,
  };
}
