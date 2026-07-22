type RaceProfileGame = {
  global: {
    race: {
      species: string;
      [key: string]: unknown;
    };
    civic: { govern?: { type: string } };
  };
};

type TraitValue = (
  trait: string,
  index: number,
  operation?: string | number,
) => number;

type RaceProfileDependencies = {
  getGame: () => RaceProfileGame;
  getTraitVal: () => TraitValue;
};

export function createRaceProfile({
  getGame,
  getTraitVal,
}: RaceProfileDependencies) {
  function isHungryRace() {
    const race = getGame().global.race;
    return (
      (race["carnivore"] && !race["herbivore"] && !race["artifical"]) ||
      race["ravenous"]
    );
  }

  function isDemonRace() {
    const race = getGame().global.race;
    return race["soul_eater"] && race["evil"] && race.species !== "wendigo";
  }

  function isLumberRace() {
    const race = getGame().global.race;
    return !race["kindling_kindred"] && !race["smoldering"];
  }

  function getOccCosts() {
    // Evolve leaves civic.govern absent on a fresh game until government data
    // is initialized; the legacy non-federation branch is the safe default.
    const governmentType = getGame().global.civic.govern?.type;
    return (
      getTraitVal()("high_pop", 0, 1) *
      (governmentType === "federation" ? 15 : 20)
    );
  }

  return { isHungryRace, isDemonRace, isLumberRace, getOccCosts };
}
