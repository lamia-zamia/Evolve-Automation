export function legacyPrestigeTrace(view) {
  const pillarLevel = view.game.speciesPillarLevel;
  const canPillar =
    !pillarLevel &&
    view.resources.harmony >= 1 &&
    view.game.universe !== "micro";
  const canUpgrade =
    pillarLevel &&
    pillarLevel < view.game.ascensionLevel &&
    view.game.universe !== "micro";
  const pillarFinished =
    !view.settings.requirePillar || (!canPillar && !canUpgrade);
  const geckNeeded =
    view.achievement.lamentisStandardFive &&
    view.buildings.gecks < view.settings.requiredGecks;
  const blackholeMass = view.game.blackholeMass + view.game.blackholeExotic;
  const resetTechUnlocked = view.game.fasting
    ? view.tech.finalIngredientUnlocked
    : view.tech.demonicInfusionUnlocked;
  const resetTechAffordable = view.game.fasting
    ? view.tech.finalIngredientAffordable
    : view.tech.demonicInfusionAffordable;
  const mechBlocks =
    view.settings.autoMech &&
    ((view.mech.active && view.settings.maximumMechPotential < 1) ||
      view.mech.potential > view.settings.maximumMechPotential);

  return {
    allowed:
      view.settings.autoPrestige &&
      !(view.settings.waitForArpa && view.game.activeArpaProjects > 0),
    matching:
      view.settings.autoPrestige &&
      !(view.settings.waitForArpa && view.game.activeArpaProjects > 0) &&
      view.settings.selectedType === "bioseed",
    other:
      view.settings.autoPrestige &&
      !(view.settings.waitForArpa && view.game.activeArpaProjects > 0) &&
      view.settings.selectedType === "mad",
    cataclysm: view.tech.cataclysmUnlocked,
    bioseed:
      !geckNeeded &&
      view.buildings.spaceDock >= 1 &&
      view.buildings.shipSegments >= 100 &&
      view.buildings.probes >= view.settings.requiredBioseedProbes,
    whitehole:
      blackholeMass >= view.settings.minimumBlackholeMass &&
      (view.tech.exoticInfusionUnlocked ||
        view.tech.infusionCheckUnlocked ||
        view.tech.infusionConfirmUnlocked),
    apocalypse: view.tech.protocol66Unlocked || view.tech.protocol66aUnlocked,
    ascension: view.buildings.siriusAscendUnlocked && pillarFinished,
    witchAscension:
      view.buildings.absorptionChambers >= 100 &&
      view.buildings.soulCapacitorEnergy >= 100_000_000 &&
      pillarFinished,
    witchDemonic:
      view.tech.forbiddenLevelFive &&
      (!view.game.fasting || view.tech.dishLevelTwo) &&
      view.buildings.absorptionChambers >= 100 &&
      view.buildings.soulCapacitorEnergy >= 100_000_000 &&
      pillarFinished,
    demonic:
      !mechBlocks &&
      view.buildings.spireFloor > view.settings.minimumSpireFloor &&
      resetTechUnlocked &&
      resetTechAffordable,
    pillarFinished,
    geckNeeded,
    blackholeMass,
  };
}
