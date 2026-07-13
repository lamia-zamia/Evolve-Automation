type TraitValue = (
  trait: string,
  index: number,
  operation?: string | number,
) => number;

type RateGame = {
  global: {
    settings: { at: number };
    race: Record<string, unknown>;
    stats: { achieve: Record<string, { l: number } | undefined> };
    tech: Record<string, number | undefined>;
    city: {
      s_alter?: { regen: number };
      banquet: { strength: number };
      calendar: {
        weather: number;
        temp: number;
        wind: number;
        day: number;
        orbit: number;
        season: number;
      };
      biome: string;
      ptrait: string[];
    };
    genes: Record<string, number | undefined>;
  };
};

type RateBuildings = {
  EnceladusBase: { stateOnCount: number };
  BootCamp: { count: number };
  Hospital: { count: number };
  Banquet: { stateOnCount: number; count: number };
};

type GameRateDependencies = {
  getSettings: () => { tickRate: number };
  getGame: () => RateGame;
  getBuildings: () => RateBuildings;
  getState: () => { astroSign: string };
  getResources: () => { Population: { currentQuantity: number } };
  getJobs: () => { Meditator: { count: number } };
  getTraitVal: () => TraitValue;
  getGovernor: () => string;
  getHaveTech: () => (research: string, level?: number) => unknown;
  getDate: () => { getMonth: () => number; getDate: () => number };
};

export function createGameRates({
  getSettings,
  getGame,
  getBuildings,
  getState,
  getResources,
  getJobs,
  getTraitVal,
  getGovernor,
  getHaveTech,
  getDate,
}: GameRateDependencies) {
  // Script hooked to fastTick fired 4 times per second
  function ticksPerSecond() {
    return 4 / getSettings().tickRate / (getGame().global.settings.at ? 2 : 1);
  }

  // main.js -> Soldier Healing
  function getHealingRate() {
    const game = getGame();
    const buildings = getBuildings();
    const race = game.global.race;
    const traitVal = getTraitVal();
    let healingCount =
      race["orbit_decayed"] && race["truepath"]
        ? buildings.EnceladusBase.stateOnCount
        : race["artifical"]
          ? buildings.BootCamp.count
          : buildings.Hospital.count;
    if (race["rejuvenated"] && game.global.stats.achieve["lamentis"]) {
      healingCount += Math.min(game.global.stats.achieve.lamentis!.l, 5);
    }
    healingCount *= getState().astroSign === "cancer" ? 1.05 : 1;
    healingCount *= game.global.tech["medic"] || 1;
    healingCount += (race["fibroblast"] as number) * 2 || 0;
    if ((game.global.city.s_alter?.regen ?? 0) > 0) {
      if (healingCount >= 20) {
        healingCount *= traitVal("cannibalize", 0, "+");
      } else {
        healingCount += Math.floor(traitVal("cannibalize", 0) / 5);
      }
    }
    healingCount *= traitVal("high_pop", 2, 1);
    if (getGovernor() === "sports") {
      healingCount *= 1.5;
    }
    if (buildings.Banquet.stateOnCount > 0 && buildings.Banquet.count >= 2) {
      healingCount *= 1 + game.global.city.banquet.strength ** 0.65 / 100;
    }
    //TODO: troll fathom
    const maxBound = 20 * traitVal("slow_regen", 0, "+");
    healingCount = Math.round(healingCount);

    // Guaranteed healing
    let healed =
      traitVal("regenerative", 0, 1) + Math.floor(healingCount / maxBound);

    // Probability to heal extra soldier
    const leftover = healingCount % maxBound;
    if (leftover > 0) {
      const chances = leftover * maxBound;
      let success = 0;
      for (let i = 0; i < leftover; i++) {
        for (let j = 0; j < maxBound; j++) {
          success += Number(i > j);
        }
      }
      healed += success / chances;
    }

    return healed;
  }

  // main.js -> food_consume_mod
  function getFoodConsume() {
    const game = getGame();
    const traitVal = getTraitVal();
    let foodConsume = 1;
    foodConsume *= traitVal("gluttony", 0, "+");
    foodConsume *= traitVal("high_metabolism", 0, "+");
    foodConsume *= traitVal("sticky", 0, "-");
    // TODO: pinguicula fathom
    if (game.global.race["photosynth"]) {
      switch (game.global.city.calendar.weather) {
        case 0:
          foodConsume *=
            game.global.city.calendar.temp === 0
              ? 1
              : traitVal("photosynth", 2, "-");
          break;
        case 1:
          foodConsume *= traitVal("photosynth", 1, "-");
          break;
        case 2:
          foodConsume *= traitVal("photosynth", 0, "-");
          break;
      }
    }
    foodConsume *= traitVal("ravenous", 0, "+");
    // Prematurely increase amount of meditators if hibernation bonus is about to end
    const hibernationEnds =
      game.global.city.calendar.day + Math.ceil(getSettings().tickRate / 4) >=
      game.global.city.calendar.orbit;
    foodConsume *=
      game.global.city.calendar.season === 3 && !hibernationEnds
        ? traitVal("hibernator", 0, "-")
        : 1;
    foodConsume /= traitVal("high_pop", 0, 1);
    return foodConsume;
  }

  // main.js -> Citizen Growth
  function getGrowthRate() {
    const game = getGame();
    const race = game.global.race;
    if (
      race["artifical"] ||
      (race["spongy"] && game.global.city.calendar.weather === 0) ||
      (race["parasite"] &&
        game.global.city.calendar.wind === 0 &&
        !race["cataclysm"])
    ) {
      return 0;
    }
    const traitVal = getTraitVal();
    const haveTech = getHaveTech();
    const date = getDate();
    let lifeBirth = game.global.tech["reproduction"] ?? 0;
    if (
      haveTech("reproduction") &&
      date.getMonth() === 1 &&
      date.getDate() === 14
    ) {
      lifeBirth += 5;
    }
    lifeBirth *= traitVal("fast_growth", 0, 1);
    lifeBirth += traitVal("fast_growth", 1, 0);
    if (race["spores"] && game.global.city.calendar.wind === 1) {
      if (race["parasite"]) {
        lifeBirth += traitVal("spores", 2);
      } else {
        lifeBirth += traitVal("spores", 0);
        lifeBirth *= traitVal("spores", 1);
      }
    }
    lifeBirth +=
      getBuildings().Hospital.count * (haveTech("reproduction", 2) ? 1 : 0);
    lifeBirth += game.global.genes["birth"] ?? 0;
    lifeBirth += (race["promiscuous"] as number | undefined) ?? 0;
    lifeBirth += race["fasting"]
      ? getJobs().Meditator.count * traitVal("high_pop", 1, "=") * 0.15
      : 0;
    const buildings = getBuildings();
    lifeBirth *=
      buildings.Banquet.stateOnCount > 0 && buildings.Banquet.count >= 1
        ? 1 + game.global.city.banquet.strength ** 0.75 / 100
        : 1;
    lifeBirth *= getState().astroSign === "libra" ? 1.25 : 1;
    lifeBirth *= traitVal("high_pop", 2, 1);
    lifeBirth *= game.global.city.biome === "taiga" ? 1.5 : 1;
    let base =
      getResources().Population.currentQuantity *
      (game.global.city.ptrait.includes("toxic") ? 1.25 : 1);
    if (race["parasite"] && race["cataclysm"]) {
      lifeBirth = Math.round(lifeBirth / 5);
      base *= 3;
    }
    return lifeBirth / ((base * 1.810792884997279) / 2);
  }

  function getResourcesPerClick() {
    return (
      getTraitVal()("strong", 0, 1) *
      (getGame().global.genes["enhance"] ? 2 : 1)
    );
  }

  return {
    ticksPerSecond,
    getHealingRate,
    getFoodConsume,
    getGrowthRate,
    getResourcesPerClick,
  };
}
