interface Dependencies {
  readonly getMechManager: () => any;
  readonly getGame: () => any;
  readonly getSettings: () => any;
  readonly getResources: () => any;
  readonly getBuildings: () => any;
  readonly getHaveTech: () => any;
  readonly getHaveTask: () => any;
  readonly average: (values: number[]) => number;
  readonly GameLog: any;
  readonly getJQuery: () => any;
}
export function createAutoMech({
  getMechManager,
  getGame,
  getSettings,
  getResources,
  getBuildings,
  getHaveTech,
  getHaveTask,
  average,
  GameLog,
  getJQuery,
}: Dependencies) {
  return function autoMech() {
    const MechManager = getMechManager();
    const game = getGame();
    const settings = getSettings();
    const resources = getResources();
    const buildings = getBuildings();
    const haveTech = getHaveTech();
    const haveTask = getHaveTask();
    const $ = getJQuery();
    let m = MechManager;
    if (
      game.global.race["warlord"] ||
      !m.initLab() ||
      $(`#mechList .mechRow[draggable=true]`).length > 0
    ) {
      return;
    }
    let mechBay = game.global.portal.mechbay;
    let prolongActive = m.isActive;
    m.isActive = false;
    let savingSupply =
      m.saveSupply &&
      settings.mechBaysFirst &&
      buildings.SpirePurifier.stateOffCount === 0;
    m.saveSupply = false;

    // Rearrange mechs for best efficiency if some of the bays are disabled
    if (m.inactiveMechs.length > 0) {
      // Each drag redraw mechs list, do it just once per tick to reduce stress
      if (m.activeMechs.length > 0) {
        m.activeMechs.sort((a, b) => a.efficiency - b.efficiency);
        m.inactiveMechs.sort((a, b) => b.efficiency - a.efficiency);
        if (m.activeMechs[0].efficiency < m.inactiveMechs[0].efficiency) {
          if (m.activeMechs.length > m.inactiveMechs.length) {
            m.dragMech(m.activeMechs[0].id, mechBay.mechs.length - 1);
          } else {
            m.dragMech(m.inactiveMechs[0].id, 0);
          }
        }
      }
      return; // Can't do much while having disabled mechs, without scrapping them all. And that's really bad idea. Just wait until bays will be enabled back.
    }

    if (haveTask("mech")) {
      return; // Do nothing except dragging if governor enabled
    }

    let newMech: any = {};
    let newSize, forceBuild;
    if (settings.mechBuild === "random") {
      [newSize, forceBuild] = m.getPreferredSize();
      newMech = m.getRandomMech(newSize);
    } else if (settings.mechBuild === "user") {
      newMech = { ...mechBay.blueprint, ...m.getMechStats(mechBay.blueprint) };
    } else {
      // mechBuild === "none"
      return; // Mech build disabled, stop here
    }
    let [newGems, newSupply, newSpace] = m.getMechCost(newMech);

    if (
      !settings.mechFillBay &&
      resources.Supply.spareMaxQuantity < newSupply
    ) {
      return; // Not enough supply capacity, and smaller mechs are disabled, can't do anything
    }

    let baySpace = mechBay.max - mechBay.bay;
    let lastFloor =
      settings.autoPrestige &&
      settings.prestigeType === "demonic" &&
      buildings.SpireTower.count >= settings.prestigeDemonicFloor &&
      haveTech("waygate", 3);
    if (lastFloor) {
      savingSupply = false;
    }

    // Save up supply for next floor
    if (settings.mechSaveSupplyRatio > 0 && !lastFloor && !forceBuild) {
      let missingSupplies =
        resources.Supply.maxQuantity * settings.mechSaveSupplyRatio -
        resources.Supply.currentQuantity;
      if (baySpace < newSpace) {
        missingSupplies -= m.getMechRefund({ size: "titan" })[1];
      }
      let timeToFullSupplies = missingSupplies / resources.Supply.rateOfChange;
      if (m.getTimeToClear() <= timeToFullSupplies) {
        return; // Floor will be cleared before capping supplies, save them
      }
    }

    let canExpandBay =
      settings.autoBuild &&
      settings.mechBaysFirst &&
      buildings.SpireMechBay.isAutoBuildable() &&
      (buildings.SpireMechBay.isAffordable(true) ||
        (buildings.SpirePurifier.isAutoBuildable() &&
          buildings.SpirePurifier.isAffordable(true) &&
          buildings.SpirePurifier.stateOffCount === 0));
    let mechScrap = settings.mechScrap;
    if (
      canExpandBay &&
      resources.Supply.currentQuantity < resources.Supply.maxQuantity &&
      !prolongActive &&
      resources.Supply.rateOfChange >= settings.mechMinSupply
    ) {
      // We can build purifier or bay once we'll have enough resources, do not rebuild old mechs
      // Unless floor just changed, and scrap income fall to low, so we need to rebuild them to fix it
      mechScrap = "none";
    } else if (settings.mechScrap === "mixed") {
      if (buildings.SpireWaygate.stateOnCount === 1) {
        // No mass scrapping during Demon Lord fight, all mechs equially good here - stay with full bay
        mechScrap = "single";
      } else {
        let mechToBuild = Math.floor(baySpace / newSpace);
        // If we're going to save up supplies we need to reserve time for it
        let supplyCost =
          mechToBuild * newSupply +
          resources.Supply.maxQuantity * settings.mechSaveSupplyRatio;
        let timeToFullBay = Math.max(
          (supplyCost - resources.Supply.currentQuantity) /
            resources.Supply.rateOfChange,
          (mechToBuild * newGems - resources.Soul_Gem.currentQuantity) /
            resources.Soul_Gem.rateOfChange,
        );
        // timeToClear changes drastically with new mechs, let's try to normalize it, scaling it with available power
        let estimatedTotalPower = m.mechsPower + mechToBuild * newMech.power;
        let estimatedTimeToClear =
          m.getTimeToClear() * (m.mechsPower / estimatedTotalPower);
        mechScrap =
          timeToFullBay > estimatedTimeToClear && !lastFloor ? "single" : "all";
      }
    }

    // Check if we need to scrap anything
    if (
      newSupply < resources.Supply.spareMaxQuantity &&
      ((mechScrap === "single" && baySpace < newSpace) ||
        (mechScrap === "all" &&
          (baySpace < newSpace ||
            resources.Supply.spareQuantity < newSupply ||
            resources.Soul_Gem.spareQuantity < newGems)))
    ) {
      let spaceGained = 0;
      let supplyGained = 0;
      let gemsGained = 0;
      let powerLost = 0;

      // Get list of inefficient mech
      let scrapEfficiency =
        (settings.mechFillBay ? baySpace === 0 : baySpace < newSpace) &&
        resources.Supply.storageRatio > 0.9 &&
        !savingSupply
          ? 0
          : lastFloor
            ? Math.min(settings.mechScrapEfficiency, 1)
            : settings.mechScrapEfficiency;

      let badMechList = m.activeMechs
        .filter((mech) => {
          if (
            (mech.infernal && mech.size !== "collector") ||
            mech.power >= m.bestMech[mech.size].power
          ) {
            return false;
          }
          if (forceBuild) {
            // Get everything that isn't infernal or 100% optimal for force rebuild
            return true;
          }
          let [gemRefund, supplyRefund] = m.getMechRefund(mech);
          // Collector and scout does not refund gems. Let's pretend they're returning half of gem during filtering
          let costRatio = Math.min(
            (gemRefund || 0.5) / newGems,
            supplyRefund / newSupply,
          );
          let powerRatio = mech.power / newMech.power;
          return costRatio / powerRatio > scrapEfficiency;
        })
        .sort((a, b) => a.efficiency - b.efficiency);

      let extraScouts = settings.mechScoutsRebuild
        ? Number.MAX_SAFE_INTEGER
        : mechBay.scouts - (mechBay.max * settings.mechScouts) / 2;

      // Remove worst mechs untill we have enough room for new mech
      let trashMechs = [];
      for (
        let i = 0;
        i < badMechList.length &&
        (baySpace + spaceGained < newSpace ||
          (mechScrap === "all" &&
            (resources.Supply.spareQuantity + supplyGained < newSupply ||
              resources.Soul_Gem.spareQuantity + gemsGained < newGems)));
        i++
      ) {
        if (badMechList[i].size === "small") {
          if (extraScouts < 1) {
            continue;
          } else {
            extraScouts--;
          }
        }
        spaceGained += m.getMechSpace(badMechList[i]);
        supplyGained += m.getMechRefund(badMechList[i])[1];
        gemsGained += m.getMechRefund(badMechList[i])[0];
        powerLost += badMechList[i].power;
        trashMechs.push(badMechList[i]);
      }

      // Now go scrapping, if possible and benefical
      if (
        trashMechs.length > 0 &&
        (forceBuild || powerLost / spaceGained < newMech.efficiency) &&
        baySpace + spaceGained >= newSpace &&
        resources.Supply.spareQuantity + supplyGained >= newSupply &&
        resources.Soul_Gem.spareQuantity + gemsGained >= newGems
      ) {
        trashMechs.sort((a, b) => b.id - a.id); // Goes from bottom to top of the list, so it won't shift IDs
        if (trashMechs.length > 1) {
          let rating = average(
            trashMechs.map((mech) => mech.power / m.bestMech[mech.size].power),
          );
          GameLog.logSuccess(
            "mech_scrap",
            `${trashMechs.length} mechs (~${Math.round(
              rating * 100,
            )}%) has been scrapped.`,
            ["hell"],
          );
        } else {
          GameLog.logSuccess(
            "mech_scrap",
            `${m.mechDesc(trashMechs[0])} mech has been scrapped.`,
            ["hell"],
          );
        }
        trashMechs.forEach((mech) => m.scrapMech(mech));
        resources.Supply.currentQuantity = Math.min(
          resources.Supply.currentQuantity + supplyGained,
          resources.Supply.maxQuantity,
        );
        resources.Soul_Gem.currentQuantity += gemsGained;
        baySpace += spaceGained;
      } else if (baySpace + spaceGained >= newSpace) {
        return; // We have scrapable mechs, but don't want to scrap them right now. Waiting for more supplies for instant replace.
      }
    }

    // Try to squeeze smaller mech, if we can't fit preferred one
    if (
      settings.mechFillBay &&
      !savingSupply &&
      ((!canExpandBay && baySpace < newSpace) ||
        resources.Supply.maxQuantity < newSupply)
    ) {
      for (let i = m.Size.indexOf(newMech.size) - 1; i >= 0; i--) {
        [newGems, newSupply, newSpace] = m.getMechCost({ size: m.Size[i] });
        if (newSpace <= baySpace && newSupply <= resources.Supply.maxQuantity) {
          newMech = m.getRandomMech(m.Size[i]);
          break;
        }
      }
    }

    // We have everything to get new mech
    if (
      resources.Soul_Gem.spareQuantity >= newGems &&
      resources.Supply.spareQuantity >= newSupply &&
      baySpace >= newSpace
    ) {
      m.buildMech(newMech);
      resources.Supply.currentQuantity -= newSupply;
      resources.Soul_Gem.currentQuantity -= newGems;
      m.isActive = prolongActive;
      return;
    }
  };
}
