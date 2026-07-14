import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface HellSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createHellSettings({
  getDependency,
  getOverride,
}: HellSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const addSettingsHeader1 = liveFunction(() =>
    getDependency("addSettingsHeader1"),
  );
  const addSettingsNumber = liveFunction(() =>
    getDependency("addSettingsNumber"),
  );
  const addSettingsToggle = liveFunction(() =>
    getDependency("addSettingsToggle"),
  );
  const buildSettingsSection2 = liveFunction(() =>
    getDependency("buildSettingsSection2"),
  );
  const document = liveObject(() => getDependency("document"));
  const resetCheckbox = liveFunction(() => getDependency("resetCheckbox"));
  const resetHellSettings = liveFunction(() =>
    getDependency("resetHellSettings"),
  );
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildHellSettingsImpl(parentNode, secondaryPrefix) {
    let sectionId = "hell";
    let sectionName = "Hell";

    let resetFunction = function () {
      resetHellSettings(true);
      updateSettingsFromState();
      updateHellSettingsContent(secondaryPrefix);

      resetCheckbox("autoHell");
    };

    buildSettingsSection2(
      parentNode,
      secondaryPrefix,
      sectionId,
      sectionName,
      resetFunction,
      updateHellSettingsContent,
    );
  }

  function updateHellSettingsContentImpl(secondaryPrefix) {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $(`#script_${secondaryPrefix}hellContent`);
    currentNode.empty().off("*");

    addSettingsHeader1(currentNode, "Entering Hell");
    addSettingsNumber(
      currentNode,
      "hellHomeGarrison",
      "Soldiers to stay out of hell",
      "Home garrison maximum",
    );
    addSettingsNumber(
      currentNode,
      "hellMinSoldiers",
      "Minimum soldiers to be available for hell (pull out if below)",
      "Don't enter hell if not enough soldiers, or get out if already in",
    );
    addSettingsNumber(
      currentNode,
      "hellMinSoldiersPercent",
      "Alive soldier percentage for entering hell",
      "Don't enter hell if too many soldiers are dead, but don't get out",
    );

    addSettingsHeader1(currentNode, "Hell Garrison");
    addSettingsToggle(
      currentNode,
      "hellAssaultReserve",
      "Always reserve hell troops to Secure the Pit",
      "With this option enabled hell soldiers will be put to fortress once Secure the Pit is unlocked, to fulfil its costs. It makes saving resources and setting triggers for it easier, at cost of less efficient use of manpower.",
    );
    addSettingsNumber(
      currentNode,
      "hellTargetFortressDamage",
      "Target wall damage per siege (overestimates threat)",
      "Actual damage will usually be lower due to patrols and drones",
    );
    addSettingsNumber(
      currentNode,
      "hellLowWallsMulti",
      "Garrison bolster factor for damaged walls",
      "Multiplies target defense rating by this when close to 0 wall integrity, half as much increase at half integrity",
    );

    addSettingsHeader1(currentNode, "Patrol Size");
    addSettingsToggle(
      currentNode,
      "hellHandlePatrolSize",
      "Automatically adjust patrol size",
      "Sets patrol attack rating based on current threat, lowers it depending on buildings, increases it to the minimum rating, and finally increases it based on dead soldiers. Handling patrol count has to be turned on.",
    );
    addSettingsNumber(
      currentNode,
      "hellPatrolMinRating",
      "Minimum patrol attack rating",
      "Will never go below this",
    );
    addSettingsNumber(
      currentNode,
      "hellPatrolThreatPercent",
      "Percent of current threat as base patrol rating",
      "Demon encounters have a rating of 2 to 10 percent of current threat",
    );
    addSettingsNumber(
      currentNode,
      "hellPatrolDroneMod",
      "&emsp;Lower Rating for each active Predator Drone by",
      "Predators reduce threat before patrols fight",
    );
    addSettingsNumber(
      currentNode,
      "hellPatrolDroidMod",
      "&emsp;Lower Rating for each active War Droid by",
      "War Droids boost patrol attack rating by 1 or 2 soldiers depending on tech",
    );
    addSettingsNumber(
      currentNode,
      "hellPatrolBootcampMod",
      "&emsp;Lower Rating for each Bootcamp by",
      "Bootcamps help regenerate soldiers faster",
    );
    addSettingsNumber(
      currentNode,
      "hellBolsterPatrolRating",
      "Increase patrol rating by up to this when soldiers die",
      "Larger patrols are less effective, but also have fewer deaths",
    );
    addSettingsNumber(
      currentNode,
      "hellBolsterPatrolPercentTop",
      "&emsp;Start increasing patrol rating at this home garrison fill percent",
      "This is the higher number",
    );
    addSettingsNumber(
      currentNode,
      "hellBolsterPatrolPercentBottom",
      "&emsp;Full patrol rating increase below this home garrison fill percent",
      "This is the lower number",
    );

    // Attractors
    addSettingsHeader1(currentNode, "Attractors");
    addSettingsNumber(
      currentNode,
      "hellAttractorBottomThreat",
      "&emsp;All Attractors on below this threat",
      "Turn more and more attractors off when getting nearer to the top threat. Auto Power needs to be on for this to work.",
    );
    addSettingsNumber(
      currentNode,
      "hellAttractorTopThreat",
      "&emsp;All Attractors off above this threat",
      "Turn more and more attractors off when getting nearer to the top threat. Auto Power needs to be on for this to work.",
    );

    // Warlord
    addSettingsHeader1(currentNode, "Warlord Specific Settings");
    addSettingsToggle(
      currentNode,
      "warlordHandleFortress",
      "Automatically attack enemy fortresses during Warlord",
      "Attacks an enemy fortress when minions are above the specified threshold",
    );
    addSettingsNumber(
      currentNode,
      "warlordMinimumMinions",
      "&emsp;Minimum minions required to attack an enemy fortress",
      "Will not attack if there are fewer than this many minions",
    );

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildHellSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildHellSettings") ?? buildHellSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateHellSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateHellSettingsContent") ?? updateHellSettingsContentImpl;
    return implementation.apply(this, args);
  }

  return { buildHellSettings, updateHellSettingsContent };
}
