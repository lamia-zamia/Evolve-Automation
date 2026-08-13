interface GeneratedPlanet {
  biome: string;
  traits: string[];
  orbit: number;
  geology: Record<string, number>;
  id?: string;
}

interface CustomPlanet {
  biome: string;
  traitlist: string[];
  orbit: number;
  geology: Record<string, number>;
}

interface PlanetGenerationGame {
  global: {
    race: { seed: number; probes: number; universe: string };
    stats: {
      portals: number;
      achieve: Record<string, { l: number } | undefined>;
    };
    custom: {
      planet: Record<string, Record<string, CustomPlanet | undefined>>;
    };
  };
}

interface PlanetGenerationDependencies {
  getGame: () => PlanetGenerationGame;
  getPoly: () => { universeAffix(universe: string): string };
  getIsAchievementUnlocked: () => (
    achievement: string,
    level: number,
  ) => boolean;
  universes: string[];
}

export function createPlanetGeneration({
  getGame,
  getPoly,
  getIsAchievementUnlocked,
  universes,
}: PlanetGenerationDependencies) {
  function generatePlanets() {
    const game = getGame();
    const poly = getPoly();
    const isAchievementUnlocked = getIsAchievementUnlocked();
    let seed = game.global.race.seed;
    const seededRandom = (min = 0, max = 1) => {
      seed = (seed * 9301 + 49297) % 233280;
      const rnd = seed / 233280;
      return min + rnd * (max - min);
    };

    const avail: string[] = [];
    if ((game.global.stats.achieve.lamentis?.l ?? 0) >= 4) {
      for (const universe of universes) {
        const affix = poly.universeAffix(universe);
        if (game.global.custom.planet[affix]?.s) {
          avail.push(`${affix}:s`);
        }
      }
    }

    const biomes = [
      "grassland",
      "oceanic",
      "forest",
      "desert",
      "volcanic",
      "tundra",
      game.global.race.universe === "evil" ? "eden" : "hellscape",
    ];
    const subbiomes: (string | string[])[] = [
      "savanna",
      "swamp",
      ["taiga", "swamp"],
      "ashland",
      "ashland",
      "taiga",
    ];
    const traits = [
      "toxic",
      "mellow",
      "rage",
      "stormy",
      "ozone",
      "magnetic",
      "trashed",
      "elliptical",
      "flare",
      "dense",
      "unstable",
      "permafrost",
      "retrograde",
      "kamikaze",
    ];
    const geologys = [
      "Copper",
      "Iron",
      "Aluminium",
      "Coal",
      "Oil",
      "Titanium",
      "Uranium",
    ];
    if (game.global.stats.achieve.whitehole) {
      geologys.push("Iridium");
    }

    const planets: GeneratedPlanet[] = [];
    let hell = false;
    const maxPlanets = Math.max(1, game.global.race.probes);
    for (let i = 0; i < maxPlanets; i++) {
      const planet: GeneratedPlanet = {
        biome: "grassland",
        traits: [],
        orbit: 365,
        geology: {},
      };

      if (avail.length > 0 && Math.floor(seededRandom(0, 10)) === 0) {
        const custom = avail[Math.floor(seededRandom(0, avail.length))];
        const selectedCustom = custom!;
        avail.splice(avail.indexOf(selectedCustom), 1);
        const target = selectedCustom.split(":");
        const customPlanet =
          game.global.custom.planet[target[0]!]![target[1]!]!;
        planet.biome = customPlanet.biome;
        planet.traits = customPlanet.traitlist;
        planet.orbit = customPlanet.orbit;
        planet.geology = customPlanet.geology;
      } else {
        const maxBound = !hell && game.global.stats.portals >= 1 ? 7 : 6;
        const subbiome = Math.floor(seededRandom(0, 3)) === 0;
        const biomeIndex = Math.floor(seededRandom(0, maxBound));

        if (
          subbiome &&
          isAchievementUnlocked(`biome_${biomes[biomeIndex]}`, 1) &&
          biomeIndex < subbiomes.length
        ) {
          const sub = subbiomes[biomeIndex]!;
          planet.biome =
            sub instanceof Array
              ? sub[Math.floor(seededRandom(0, sub.length))]!
              : sub;
        } else {
          planet.biome = biomes[biomeIndex]!;
        }

        for (let traitIndex = 0; traitIndex < 2; traitIndex++) {
          const index = Math.floor(seededRandom(0, 18 + 9 * traitIndex));
          const trait = traits[index];
          if (
            trait === "permafrost" &&
            ["volcanic", "ashland", "hellscape"].includes(planet.biome)
          ) {
            continue;
          }
          if (trait && !planet.traits.includes(trait)) {
            planet.traits.push(trait);
          }
        }
        planet.traits.sort();
        if (planet.traits.length === 0) {
          planet.traits.push("none");
        }

        let max = Math.floor(seededRandom(0, 3));
        let top = planet.biome === "eden" ? 35 : 30;
        if (game.global.stats.achieve.whitehole) {
          max += game.global.stats.achieve.whitehole.l;
          top += game.global.stats.achieve.whitehole.l * 5;
        }
        for (let geologyIndex = 0; geologyIndex < max; geologyIndex++) {
          const index = Math.floor(seededRandom(0, 10));
          if (geologys[index]) {
            planet.geology[geologys[index]] =
              (Math.floor(seededRandom(0, top)) - 10) / 100;
          }
        }

        if (planet.biome === "hellscape") {
          planet.orbit = 666;
          hell = true;
        } else if (planet.biome === "eden") {
          planet.orbit = 777;
          hell = true;
        } else {
          let maxOrbit = 600;
          if (planet.traits.includes("elliptical")) maxOrbit += 200;
          if (planet.traits.includes("kamikaze")) maxOrbit += 100;
          planet.orbit = Math.floor(seededRandom(200, maxOrbit));
        }
      }

      const id = planet.biome + Math.floor(seededRandom(0, 10000));
      planet.id = id.charAt(0).toUpperCase() + id.slice(1);
      planets.push(planet);
    }
    return planets;
  }

  return { generatePlanets };
}
