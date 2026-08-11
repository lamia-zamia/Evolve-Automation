/**
 * One evolution step, as the script's own action entity. This module only
 * collects them into per-genus trees, so their identity is all it needs.
 */
type EvolutionAction = object;

type RaceEntity = {
  genus: string;
  evolutionTree: Record<string, EvolutionAction[]>;
};

type GameSurface = {
  actions: { evolution: Record<string, unknown> };
  // Only hybrid races carry `hybrid`, and only the hybrid branch reads it.
  races: Record<string, { type: string; hybrid?: string[] }>;
};

type RaceInitializationDependencies = {
  getGame: () => GameSurface;
  getEvolutions: () => Record<string, EvolutionAction>;
  getRaces: () => Record<string, RaceEntity>;
  getImitations: () => Record<string, EvolutionAction>;
  getEvolutionAction: () => new (id: string) => EvolutionAction;
  getRace: () => new (id: string) => RaceEntity;
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

    let genusEvolution: Record<string, EvolutionAction[]> = {
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
        for (let genus of currentGame.races[id].hybrid ?? []) {
          currentRaces[id].evolutionTree[genus] = [
            e.bunker,
            e[id],
            ...(genusEvolution[genus] ?? []),
          ];
        }
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
