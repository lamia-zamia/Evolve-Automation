import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface PrestigeSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createPrestigeSettings({
  getDependency,
  getOverride,
}: PrestigeSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
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
  const buildCustomRacePresetEditor = liveFunction(() =>
    getDependency("buildCustomRacePresetEditor"),
  );
  const buildSettingsSection2 = liveFunction(() =>
    getDependency("buildSettingsSection2"),
  );
  const buildings = liveObject(() => getDependency("buildings"));
  const confirm = liveFunction(() => getDependency("confirm"));
  const document = liveObject(() => getDependency("document"));
  const game = liveObject(() => getDependency("game"));
  const haveTech = liveFunction(() => getDependency("haveTech"));
  const isApocalypsePrestigeAvailable = liveFunction(() =>
    getDependency("isApocalypsePrestigeAvailable"),
  );
  const isAscensionPrestigeAvailable = liveFunction(() =>
    getDependency("isAscensionPrestigeAvailable"),
  );
  const isBioseederPrestigeAvailable = liveFunction(() =>
    getDependency("isBioseederPrestigeAvailable"),
  );
  const isCataclysmPrestigeAvailable = liveFunction(() =>
    getDependency("isCataclysmPrestigeAvailable"),
  );
  const isDemonicPrestigeAvailable = liveFunction(() =>
    getDependency("isDemonicPrestigeAvailable"),
  );
  const isPrestigeAllowed = liveFunction(() =>
    getDependency("isPrestigeAllowed"),
  );
  const isWhiteholePrestigeAvailable = liveFunction(() =>
    getDependency("isWhiteholePrestigeAvailable"),
  );
  const isWitchAscensionPrestigeAvailable = liveFunction(() =>
    getDependency("isWitchAscensionPrestigeAvailable"),
  );
  const openOptionsModal = liveFunction(() =>
    getDependency("openOptionsModal"),
  );
  const openOverrideModal = liveFunction(() =>
    getDependency("openOverrideModal"),
  );
  const prestigeOptions = liveObject(() => getDependency("prestigeOptions"));
  const resetPrestigeSettings = liveFunction(() =>
    getDependency("resetPrestigeSettings"),
  );
  const settingsRaw = liveObject(() => getDependency("settingsRaw"));
  const state = liveObject(() => getDependency("state"));
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildPrestigeSettingsImpl(parentNode, secondaryPrefix) {
    let sectionId = "prestige";
    let sectionName = "Prestige";

    let resetFunction = function () {
      resetPrestigeSettings(true);
      updateSettingsFromState();
      updatePrestigeSettingsContent(secondaryPrefix);
    };

    buildSettingsSection2(
      parentNode,
      secondaryPrefix,
      sectionId,
      sectionName,
      resetFunction,
      updatePrestigeSettingsContent,
    );
  }

  function updatePrestigeSettingsContentImpl(secondaryPrefix) {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $(`#script_${secondaryPrefix}prestigeContent`);
    currentNode.empty().off("*");

    currentNode.append(`
          <div class="script_bg_prestigeType" style="display: inline-block; width: 90%; text-align: left; margin-bottom: 10px;">
            <label>
              <span>Prestige Type</span>
              <select class="script_prestigeType" style="height: 18px; width: 150px; float: right;">
                ${prestigeOptions}
              </select>
            </label>
          </div>`);

    currentNode
      .find(".script_prestigeType")
      .val(settingsRaw.prestigeType)
      .on("change", function (this: Loose) {
        // Special processing for prestige options. If they are ready to prestige then warn the user about enabling them.
        if (isPrestigeAllowed()) {
          let confirmationText = "";
          if (this.value === "mad" && haveTech("mad")) {
            confirmationText = "MAD has already been researched.";
          } else if (
            this.value === "bioseed" &&
            isBioseederPrestigeAvailable()
          ) {
            confirmationText =
              "Required probes are built, and bioseeder ship is ready to launch.";
          } else if (
            this.value === "cataclysm" &&
            isCataclysmPrestigeAvailable()
          ) {
            confirmationText =
              "Dial It To 11 is unlocked. You may prestige immediately.";
          } else if (
            this.value === "whitehole" &&
            isWhiteholePrestigeAvailable()
          ) {
            confirmationText =
              "Required mass is reached, and exotic infusion is unlocked.";
          } else if (
            this.value === "apocalypse" &&
            isApocalypsePrestigeAvailable()
          ) {
            confirmationText = "Protocol 66 is unlocked.";
          } else if (
            this.value === "ascension" &&
            (game.global.race["witch_hunter"]
              ? isWitchAscensionPrestigeAvailable()
              : isAscensionPrestigeAvailable())
          ) {
            confirmationText = game.global.race["witch_hunter"]
              ? "Absorption Chamber is built and ready."
              : "Ascension machine is built and powered.";
          } else if (
            this.value === "demonic" &&
            (game.global.race["witch_hunter"]
              ? isWitchAscensionPrestigeAvailable(true)
              : isDemonicPrestigeAvailable())
          ) {
            confirmationText = game.global.race["witch_hunter"]
              ? "Absorption Chamber is built and ready."
              : "Required floor is reached, and demon lord is already dead.";
          } else if (
            this.value === "terraform" &&
            buildings.RedTerraform.isUnlocked()
          ) {
            confirmationText = "Terraformer is built and powered.";
          } else if (
            this.value === "matrix" &&
            buildings.TauStarBluePill.isUnlocked()
          ) {
            confirmationText = "Matrix is built and powered.";
          } else if (
            this.value === "retire" &&
            buildings.TauGas2MatrioshkaBrain.count >= 1000 &&
            buildings.TauGas2IgniteGasGiant.isUnlocked() &&
            buildings.TauGas2IgniteGasGiant.isAffordable()
          ) {
            confirmationText = "Ignition Device is built and ready.";
          } else if (
            this.value === "eden" &&
            buildings.TauStarEden.isUnlocked() &&
            buildings.TauStarEden.isAffordable()
          ) {
            confirmationText = "Garden Of Eden is ready to build.";
          } else if (
            this.value === "apotheosis" &&
            buildings.PalaceApotheosis.isUnlocked()
          ) {
            confirmationText = "Apotheosis is ready to build.";
          }
          if (confirmationText !== "") {
            confirmationText +=
              " You may prestige immediately. Are you sure you want to toggle this prestige?";
            if (!confirm(confirmationText)) {
              this.value = "none";
            }
          }
        }
        settingsRaw.prestigeType = this.value;
        $(".script_prestigeType").val(settingsRaw.prestigeType);

        state.goal = "Standard";
        updateSettingsFromState();
      });
    currentNode
      .find(".script_bg_prestigeType")
      .toggleClass("inactive-row", Boolean(settingsRaw.overrides.prestigeType))
      .on(
        "click",
        {
          label: "Prestige Type (prestigeType)",
          name: "prestigeType",
          type: "select",
          options: prestigeOptions,
        },
        openOverrideModal,
      );

    addSettingsToggle(
      currentNode,
      "prestigeWaitAT",
      "Disable prestiging under Accelerated Time",
      "Delay reset until all accelerated time will be used, to avoid wasting it",
    );
    addSettingsToggle(
      currentNode,
      "prestigeMADIgnoreArpa",
      "Ignore early game A.R.P.A.",
      "Disables building any A.R.P.A. projects until MAD is researched, or rival have appeared",
    );
    addSettingsToggle(
      currentNode,
      "prestigeBioseedConstruct",
      "Ignore useless buildings",
      "Space Dock, Bioseeder Ship and Probes will be constructed only when Bioseed prestige enabled. World Collider won't be constructed during Bioseed. Jump Ship won't be constructed during Whitehole. Stellar Engine won't be constucted during Vacuum Collapse. Mana Syphon won't be constructed during Witch Hunter's Ascension and Demonic Infusion.",
    );

    addSettingsHeader1(currentNode, "Mutual Assured Destruction");
    addSettingsToggle(
      currentNode,
      "prestigeMADWait",
      "Wait for maximum population",
      "Wait for maximum population and soldiers to maximize plasmids gain",
    );
    addSettingsNumber(
      currentNode,
      "prestigeMADPopulation",
      "Required population",
      "Required number of workers and soldiers before performing MAD reset",
    );

    addSettingsHeader1(currentNode, "Bioseed");
    addSettingsNumber(
      currentNode,
      "prestigeBioseedProbes",
      "Required probes",
      "Required number of probes before launching bioseeder ship",
    );
    addSettingsNumber(
      currentNode,
      "prestigeGECK",
      "Required G.E.C.K",
      "Required number of G.E.C.K. for Bioseed. Unlike any other buildings G.E.C.K. won't ever be constructed during inappropriate runs, or above this number. To prevent losing plasmids. It can, however, be built with triggers - you should not build G.E.C.K with triggers, unless you absolutely sure you know what you're doing.",
    );

    addSettingsHeader1(currentNode, "Whitehole");
    addSettingsToggle(
      currentNode,
      "prestigeWhiteholeSaveGems",
      "Save up Soul Gems for reset",
      "Save up enough Soul Gems for reset, only excess gems will be used. This option does not affect triggers.",
    );
    addSettingsNumber(
      currentNode,
      "prestigeWhiteholeMinMass",
      "Minimum solar mass for reset",
      "Required minimum solar mass of blackhole before prestiging. Script do not stabilize on blackhole run, this number will need to be reached naturally",
    );

    addSettingsHeader1(currentNode, "Ascension");
    addSettingsToggle(
      currentNode,
      "prestigeAscensionPillar",
      "Wait for Pillar",
      "Wait for Pillar before ascending, unless it was done earlier",
    );
    addSettingsSelect(
      currentNode,
      "prestigeCustomRaceMode",
      "Custom race handling",
      "Controls every custom-race lab reached after Ascension, Terraform, or Apotheosis. Pause lets you edit challenge-specific races even when one is already saved. Import replaces the live design with the selected preset and continues only when the game accepts it.",
      [
        {
          val: "reuse",
          label: "Reuse saved",
          hint: "Automatically reuse the saved custom; pause if none exists.",
        },
        {
          val: "pause",
          label: "Pause in lab",
          hint: "Always stop in the lab so the custom can be edited or imported manually.",
        },
        {
          val: "import",
          label: "Import selected preset",
          hint: "Apply the selected structured preset and continue automatically.",
        },
      ],
    );
    let presetOptions = (settingsRaw.prestigeCustomRacePresets ?? []).map(
      (preset, index) => ({
        val: String(index),
        label: preset.name || `Preset ${index + 1}`,
        hint: "Custom race preset used by Import selected preset.",
      }),
    );
    addSettingsSelect(
      currentNode,
      "prestigeCustomRacePreset",
      "Selected custom preset",
      "Preset used when Custom race handling is Import selected preset. The selection can also be changed by Evolution Queue.",
      presetOptions,
    );
    $(
      '<button class="button" type="button" style="margin:6px 0;">Edit custom race presets…</button>',
    )
      .on("click", function () {
        openOptionsModal("Custom Race Presets", buildCustomRacePresetEditor);
      })
      .appendTo(currentNode);

    addSettingsHeader1(currentNode, "Demonic Infusion");
    addSettingsNumber(
      currentNode,
      "prestigeDemonicFloor",
      "Minimum spire floor for reset",
      "Perform reset after climbing up to this spire floor",
    );
    addSettingsNumber(
      currentNode,
      "prestigeDemonicPotential",
      "Maximum mech potential for reset",
      "Perform reset only if current mech team potential below given amount. Full bay of best mechs will have `1` potential. This allows to postpone reset if your team is still good after reaching target floor, and can quickly clear another floor",
    );
    addSettingsToggle(
      currentNode,
      "prestigeDemonicBomb",
      "Use Dark Energy Bomb",
      "Kill Demon Lord with Dark Energy Bomb",
    );

    addSettingsHeader1(currentNode, "Matrix");
    let cureStrat = [
      { val: "none", label: "None", hint: "Do not select strategy" },
      {
        val: "strat1",
        label: game.loc(`tech_vax_strat1`),
        hint: game.loc(`tech_vax_strat1_effect`),
      },
      {
        val: "strat2",
        label: game.loc(`tech_vax_strat2`),
        hint: game.loc(`tech_vax_strat2_effect`),
      },
      {
        val: "strat3",
        label: game.loc(`tech_vax_strat3`),
        hint: game.loc(`tech_vax_strat3_effect`),
      },
      {
        val: "strat4",
        label: game.loc(`tech_vax_strat4`),
        hint: game.loc(`tech_vax_strat4_effect`),
      },
    ];
    addSettingsSelect(
      currentNode,
      "prestigeVaxStrat",
      "Vaccination Strategy",
      "Alter script behaviour to speed up queued items, prioritizing missing resources.",
      cureStrat,
    );

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildPrestigeSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildPrestigeSettings") ?? buildPrestigeSettingsImpl;
    return implementation.apply(this, args);
  }

  function updatePrestigeSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updatePrestigeSettingsContent") ??
      updatePrestigeSettingsContentImpl;
    return implementation.apply(this, args);
  }

  return { buildPrestigeSettings, updatePrestigeSettingsContent };
}
