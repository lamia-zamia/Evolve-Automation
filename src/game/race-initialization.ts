type LooseObject = Record<PropertyKey, any>;
type LooseConstructor = new (...args: any[]) => any;

type RaceInitializationDependencies = {
  getGame: () => LooseObject;
  getEvolutions: () => LooseObject;
  getRaces: () => LooseObject;
  getImitations: () => LooseObject;
  getEvolutionAction: () => LooseConstructor;
  getRace: () => LooseConstructor;
};

export function createRaceInitialization({
  getGame,
  getEvolutions,
  getRaces,
  getImitations,
  getEvolutionAction,
  getRace,
}: RaceInitializationDependencies) {
  function initialiseRaces() {
    const currentGame = getGame();
    const currentEvolutions = getEvolutions();
    const currentRaces = getRaces();
    const currentImitations = getImitations();
    const CurrentEvolutionAction = getEvolutionAction();
    const CurrentRace = getRace();

    for (let id in currentGame.actions.evolution) {
      currentEvolutions[id] = new CurrentEvolutionAction(id);
    }
    let e = currentEvolutions;

    let bilateralSymmetry = [
      e.bilateral_symmetry,
      e.multicellular,
      e.phagocytosis,
      e.sexual_reproduction,
    ];
    let mammals = [e.mammals, ...bilateralSymmetry];

    let genusEvolution: LooseObject = {
      eldritch: [e.sentience, e.eldritch, ...bilateralSymmetry],
      aquatic: [e.sentience, e.aquatic, ...bilateralSymmetry],
      insectoid: [e.sentience, e.athropods, ...bilateralSymmetry],
      humanoid: [e.sentience, e.humanoid, ...mammals],
      giant: [e.sentience, e.gigantism, ...mammals],
      small: [e.sentience, e.dwarfism, ...mammals],
      carnivore: [e.sentience, e.carnivore, e.animalism, ...mammals],
      herbivore: [e.sentience, e.herbivore, e.animalism, ...mammals],
      //omnivore: [e.sentience, e.omnivore, e.animalism, ...mammals],
      demonic: [e.sentience, e.demonic, ...mammals],
      angelic: [e.sentience, e.celestial, ...mammals],
      fey: [e.sentience, e.fey, ...mammals],
      heat: [e.sentience, e.heat, ...mammals],
      polar: [e.sentience, e.polar, ...mammals],
      sand: [e.sentience, e.sand, ...mammals],
      avian: [e.sentience, e.endothermic, e.eggshell, ...bilateralSymmetry],
      reptilian: [e.sentience, e.ectothermic, e.eggshell, ...bilateralSymmetry],
      plant: [
        e.sentience,
        e.bryophyte,
        e.poikilohydric,
        e.multicellular,
        e.chloroplasts,
        e.sexual_reproduction,
      ],
      fungi: [
        e.sentience,
        e.bryophyte,
        e.spores,
        e.multicellular,
        e.chitin,
        e.sexual_reproduction,
      ],
      synthetic: [e.sentience, e.exterminate, e.sexual_reproduction],
    };

    for (let id in currentGame.races) {
      // We don't care about protoplasm
      if (id === "protoplasm") {
        continue;
      }

      currentRaces[id] = new CurrentRace(id);
      let evolutionPath;
      if (id === "hellspawn") {
        currentRaces[id].evolutionTree[currentRaces[id].genus] = [
          e.bunker,
          e.warlord,
          ...(genusEvolution[currentRaces[id].genus] ?? []),
        ];
      } else if (id === "junker" || id === "sludge" || id === "ultra_sludge") {
        for (let genus of Object.keys(genusEvolution)) {
          currentRaces[id].evolutionTree[genus] = [
            e.bunker,
            e[id],
            ...(genusEvolution[genus] ?? []),
          ];
        }
      } else if (currentGame.races[id].type === "hybrid") {
        let hybridGenus = currentGame.races[id].hybrid;
        currentRaces[id].evolutionTree[hybridGenus[0]] = [
          e.bunker,
          e[id],
          ...(genusEvolution[hybridGenus[0]] ?? []),
        ];
        currentRaces[id].evolutionTree[hybridGenus[1]] = [
          e.bunker,
          e[id],
          ...(genusEvolution[hybridGenus[1]] ?? []),
        ];
      } else {
        currentRaces[id].evolutionTree[currentRaces[id].genus] = [
          e.bunker,
          e[id],
          ...(genusEvolution[currentRaces[id].genus] ?? []),
        ];
      }

      // add imitate races
      currentImitations[id] = new CurrentEvolutionAction(`s-${id}`);
    }
  }

  return { initialiseRaces };
}
