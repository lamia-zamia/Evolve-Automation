type AutomationContainerDependencies = {
  getSettingsRaw: () => Record<string, any>;
  getJQuery: () => any;
  getSafeMode: () => boolean;
  getOverrideKeyLabel: () => string;
  getActions: () => Record<string, any>;
};

export function createAutomationContainer({
  getSettingsRaw,
  getJQuery,
  getSafeMode,
  getOverrideKeyLabel,
  getActions,
}: AutomationContainerDependencies) {
  function ensureAutomationContainer() {
    const settingsRaw = getSettingsRaw();
    const $ = getJQuery();
    const safeMode = getSafeMode();
    const overrideKeyLabel = getOverrideKeyLabel();
    const {
      createSettingToggle,
      updateSettingsFromState,
      buildScriptSettings,
      removeScriptSettings,
      createMechInfo,
      removeMechInfo,
      createCraftToggles,
      removeCraftToggles,
      createBuildingToggles,
      removeBuildingToggles,
      createArpaToggles,
      removeArpaToggles,
      createStorageToggles,
      removeStorageToggles,
      createMarketToggles,
      removeMarketToggles,
      createEjectToggles,
      removeEjectToggles,
      createSupplyToggles,
      removeSupplyToggles,
      updateDebugData,
      updateScriptData,
      finalizeScriptData,
      autoMarket,
    } = getActions();
    let created = false;
    const scriptNode = $("#autoScriptContainer");
    if (scriptNode.length === 0) {
      created = true;
      $("#resources").append(`
              <div id="autoScriptContainer" style="margin-top: 10px;">
                <h3 id="toggleSettingsCollapsed" class="script-collapsible text-center has-text-success">Automation</h3>
                <div id="scriptToggles">
                  <label>More script options available in Settings tab<br>${overrideKeyLabel}+click options to open <span class="inactive-row">advanced configuration</span></label><br>
                </div>
              </div>`);

      if (safeMode) {
        $("#resources").append(
          `<p>⚠️ Safe mode active, masterScriptToggle is disabled</p>`,
        );
      }

      let collapsibleNode = $("#toggleSettingsCollapsed");
      let togglesNode = $("#scriptToggles");

      collapsibleNode.toggleClass(
        "script-contentactive",
        !settingsRaw["toggleSettingsCollapsed"],
      );
      togglesNode.css(
        "display",
        settingsRaw["toggleSettingsCollapsed"] ? "none" : "block",
      );

      collapsibleNode.on("click", function () {
        settingsRaw["toggleSettingsCollapsed"] =
          !settingsRaw["toggleSettingsCollapsed"];
        collapsibleNode.toggleClass(
          "script-contentactive",
          !settingsRaw["toggleSettingsCollapsed"],
        );
        togglesNode.css(
          "display",
          settingsRaw["toggleSettingsCollapsed"] ? "none" : "block",
        );
        updateSettingsFromState();
      });

      createSettingToggle(
        togglesNode,
        "masterScriptToggle",
        "Stop taking any actions on behalf of the player.",
      );

      // Dirty performance patch. Settings have a lot of elements, and they stress JQuery selectors way too much. This toggle allow to remove them from DOM completely, when they aren't needed.
      // It doesn't have huge impact anymore, after all script and game changes, but still won't hurt to have an option to increase performance a tiny bit more
      createSettingToggle(
        togglesNode,
        "showSettings",
        "You can disable rendering of settings UI once you've done with configuring script, if you experiencing performance issues. It can help a little.",
        buildScriptSettings,
        removeScriptSettings,
      );

      createSettingToggle(
        togglesNode,
        "autoPrestige",
        "Allows script to finish current run after reaching configured goal. Prestige Type is recommended to be set even with manual resetting, as script uses that to make various decisions such as picking theology techs, or skipping buildings leading in wrong direction.",
      );
      createSettingToggle(
        togglesNode,
        "autoEvolution",
        "Runs through the evolution part of the game through to founding a settlement. In Auto Achievements mode will target races that you don't have extinction\\greatness achievements for yet.",
      );
      createSettingToggle(
        togglesNode,
        "autoFight",
        "Manage spies, and sends troops to battle whenever Soldiers are full and there are no wounded. Adds to your offensive battalion and switches attack type when offensive rating is greater than the rating cutoff for that attack type. Will not manage spies when Spy Operator governor task is active.",
      );
      createSettingToggle(
        togglesNode,
        "autoHell",
        "Sends soldiers to hell and sends them out on patrols. Adjusts maximum number of powered attractors based on threat.",
      );
      createSettingToggle(
        togglesNode,
        "autoMech",
        "Builds most effective large mechs for current spire floor. Least effective will be scrapped to make room for new ones. Will not build or scrap anything when Mech Constructor governor task is active.",
        createMechInfo,
        removeMechInfo,
      );
      createSettingToggle(
        togglesNode,
        "autoFleet",
        "Manages Andromeda fleet to supress piracy",
      );
      createSettingToggle(
        togglesNode,
        "autoTax",
        "Adjusts tax rates if your current morale is greater than your maximum allowed morale. Will always keep morale above 100%. Disabled when Tax-Morale Balance governor task is active.",
      );
      createSettingToggle(
        togglesNode,
        "autoGovernment",
        "Manage changes of government and governor when they becomes available. Governor will be selected once, and won't be reassigned, unless manually fired.",
      );
      createSettingToggle(
        togglesNode,
        "autoCraft",
        "Automatically produce craftable resources, thresholds when it happens depends on current demands and stocks.",
        createCraftToggles,
        removeCraftToggles,
      );
      createSettingToggle(
        togglesNode,
        "autoTrigger",
        "Purchase triggered buildings, projects, and researches once conditions met",
      );
      createSettingToggle(
        togglesNode,
        "autoBuild",
        "Construct buildings based on their weightings(user configured), and various rules(e.g. it won't build building which have no support to run)",
        createBuildingToggles,
        removeBuildingToggles,
      );
      createSettingToggle(
        togglesNode,
        "autoARPA",
        "Builds ARPA projects if user enables them to be built.",
        createArpaToggles,
        removeArpaToggles,
      );
      createSettingToggle(
        togglesNode,
        "autoPower",
        "Manages power based on a priority order of buildings. Also disables currently useless buildings to save up resources.",
      );
      createSettingToggle(
        togglesNode,
        "autoStorage",
        "Assigns crates and containers to resources needed for buildings enabled for Auto Build, queued buildings, researches, and enabled projects. Disabled when Crate/Container Manager governor task is active.",
        createStorageToggles,
        removeStorageToggles,
      );
      createSettingToggle(
        togglesNode,
        "autoMarket",
        "Allows for automatic buying and selling of resources once specific ratios are met. Also allows setting up trade routes until a minimum specified money per second is reached. The will trade in and out in an attempt to maximize your trade routes.",
        createMarketToggles,
        removeMarketToggles,
      );
      createSettingToggle(
        togglesNode,
        "autoGalaxyMarket",
        "Manages galaxy trade routes",
      );
      createSettingToggle(
        togglesNode,
        "autoResearch",
        "Performs research when minimum requirements are met.",
      );
      createSettingToggle(
        togglesNode,
        "autoJobs",
        "Assigns jobs in a priority order with multiple breakpoints. Starts with a few jobs each and works up from there. Will try to put a minimum number on lumber / stone then fill up capped jobs first.",
      );
      createSettingToggle(
        togglesNode,
        "autoCraftsmen",
        "Manage foundry workers, switching between resources at given ratio.",
      );
      createSettingToggle(
        togglesNode,
        "autoAlchemy",
        "Manages alchemic transmutations",
      );
      createSettingToggle(togglesNode, "autoPylon", "Manages pylon rituals");
      createSettingToggle(
        togglesNode,
        "autoQuarry",
        "Manages rock quarry stone to chrysotile ratio for smoldering races",
      );
      createSettingToggle(
        togglesNode,
        "autoMine",
        "Manages titan mine aluminium to adamantite ratio in true path",
      );
      createSettingToggle(
        togglesNode,
        "autoExtractor",
        "Manages extractor ship mining ratios in true path",
      );
      createSettingToggle(
        togglesNode,
        "autoSmelter",
        "Manages smelter fuel and production.",
      );
      createSettingToggle(
        togglesNode,
        "autoFactory",
        "Manages factory production.",
      );
      createSettingToggle(
        togglesNode,
        "autoMiningDroid",
        "Manages mining droid production.",
      );
      createSettingToggle(
        togglesNode,
        "autoGraphenePlant",
        "Manages graphene plant. Not user configurable - just uses least demanded resource for fuel.",
      );
      createSettingToggle(
        togglesNode,
        "autoGenetics",
        "Managed genetics settings, and automatically assembles genes more optimally than ingame sequencer",
      );
      createSettingToggle(
        togglesNode,
        "autoMinorTrait",
        "Purchase minor traits using genes according to their weighting settings. Also manages Mimic genus, Psychic powers, Ocular powers and wishes.",
      );
      createSettingToggle(
        togglesNode,
        "autoMutateTraits",
        "Mutate in or out major and genus traits. WARNING: This will spend Plasmids and Anti-Plasmids.",
      );
      createSettingToggle(
        togglesNode,
        "autoEject",
        "Eject excess resources to black hole. Normal resources ejected when they close to storage cap, craftables - when above requirements. Disabled when Mass Ejector Optimizer governor task is active.",
        createEjectToggles,
        removeEjectToggles,
      );
      createSettingToggle(
        togglesNode,
        "autoSupply",
        "Send excess resources to Spire. Normal resources sent when they close to storage cap, craftables - when above requirements. Takes priority over ejector.",
        createSupplyToggles,
        removeSupplyToggles,
      );
      createSettingToggle(
        togglesNode,
        "autoNanite",
        "Consume resources to produce Nanite. Normal resources sent when they close to storage cap, craftables - when above requirements. Takes priority over supplies and ejector.",
      );
      createSettingToggle(
        togglesNode,
        "autoReplicator",
        "Use excess power to replicate resources.",
      );

      togglesNode.append(
        '<a class="button is-dark is-small" id="bulk-sell"><span>Bulk Sell</span></a>',
      );
      $("#bulk-sell").on("mouseup", function () {
        updateDebugData();
        updateScriptData();
        finalizeScriptData();
        autoMarket(true, true);
      });
    }

    return { scriptNode, created };
  }

  return { ensureAutomationContainer };
}
