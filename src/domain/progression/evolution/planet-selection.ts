/**
 * Pure equivalent of the legacy `autoPlanetSelection` decision. The adapter
 * samples the generated planet list, achievement lookups, and weighting
 * settings; the planner scores and orders the candidates and picks the DOM
 * element id of the planet to click.
 */

export interface PlanetSelectionGate {
  readonly universe: string | null;
  readonly seeded: boolean;
  readonly chose: boolean;
  readonly targetName: string | null;
}

export function shouldSelectPlanet(
  gate: Readonly<PlanetSelectionGate>,
): boolean {
  if (gate.universe === "bigbang") {
    return false;
  }
  if (!gate.seeded || gate.chose) {
    return false;
  }
  if (gate.targetName === "none") {
    return false;
  }
  return true;
}

export interface PlanetCandidate {
  readonly id: string;
  readonly biome: string;
  readonly traits: readonly string[];
  readonly orbit: number;
  readonly geology: Readonly<Record<string, number>>;
}

/**
 * Achievement ids the legacy loop queried while counting how many achievements
 * each planet could still earn. Returned deduplicated; sampling is read-only so
 * query order is not observable.
 */
export function planetSelectionAchievementIds(
  planets: readonly PlanetCandidate[],
  raceGenusById: Readonly<Record<string, string | null>>,
  biomeGenus: Readonly<Record<string, string>>,
): readonly string[] {
  const ids = new Set<string>();
  for (const planet of planets) {
    ids.add(`biome_${planet.biome}`);
    for (const trait of planet.traits) {
      if (trait !== "none") {
        ids.add(`atmo_${trait}`);
      }
    }
    const genus = biomeGenus[planet.biome];
    if (genus) {
      for (const raceId of Object.keys(raceGenusById)) {
        if (raceGenusById[raceId] === genus) {
          ids.add(`extinct_${raceId}`);
        }
      }
      ids.add(`genus_${genus}`);
    }
    // Legacy checked the unlock before the biome, so this was queried for
    // every planet regardless of biome.
    ids.add("madagascar_tree");
  }
  return Object.freeze([...ids]);
}

export interface PlanetSelectionInput {
  readonly planets: readonly PlanetCandidate[];
  readonly targetName: string | null;
  readonly gods: string | null;
  readonly raceGenusById: Readonly<Record<string, string | null>>;
  readonly biomeGenus: Readonly<Record<string, string>>;
  readonly achievementUnlocked: Readonly<Record<string, boolean>>;
  /** null when the achievement entry is absent; NaN when present without a level. */
  readonly minersDreamLevel: number | null;
  readonly lamentisLevel: number | null;
  readonly biomeWeights: Readonly<Record<string, number | undefined>>;
  readonly traitWeights: Readonly<Record<string, number | undefined>>;
  readonly achievementWeight: number | undefined;
  readonly orbitWeight: number | undefined;
  readonly geologyWeights: Readonly<Record<string, number | undefined>>;
  /** Biomes ordered from most to least habitable. */
  readonly biomeOrder: readonly string[];
  /** Traits ordered from most to least habitable. */
  readonly planetTraitOrder: readonly string[];
}

export interface PlanetSelectionDecision {
  readonly elementId: string;
}

interface ScoredPlanet {
  readonly planet: PlanetCandidate;
  readonly achieve: number;
  readonly weighting: number;
}

export function planPlanetSelection(
  input: Readonly<PlanetSelectionInput>,
): PlanetSelectionDecision {
  if (input.planets.length === 0) {
    throw new TypeError("planet selection requires at least one candidate");
  }
  const unlocked = (id: string) => input.achievementUnlocked[id] === true;
  // Absent weighting settings poison the sum to NaN, exactly like the legacy
  // `weighting += settings[...]` with an undefined key.
  const weightOf = (value: number | undefined) => value ?? NaN;

  const scored: ScoredPlanet[] = input.planets.map((planet) => {
    let achieve = 0;
    if (!unlocked(`biome_${planet.biome}`)) {
      achieve++;
    }
    for (const trait of planet.traits) {
      if (trait !== "none" && !unlocked(`atmo_${trait}`)) {
        achieve++;
      }
    }
    const genus = input.biomeGenus[planet.biome];
    if (genus) {
      for (const raceId of Object.keys(input.raceGenusById)) {
        if (
          input.raceGenusById[raceId] === genus &&
          !unlocked(`extinct_${raceId}`)
        ) {
          achieve++;
        }
      }
      if (!unlocked(`genus_${genus}`)) {
        achieve++;
      }
    }
    if (
      !unlocked("madagascar_tree") &&
      planet.biome === "oceanic" &&
      input.gods !== "sharkin"
    ) {
      achieve++;
    }

    let weighting = 0;
    weighting += weightOf(input.biomeWeights[planet.biome]);
    for (const trait of planet.traits) {
      weighting += weightOf(input.traitWeights[trait]);
    }
    weighting += achieve * weightOf(input.achievementWeight);
    weighting += planet.orbit * weightOf(input.orbitWeight);

    let numShow =
      input.minersDreamLevel !== null
        ? input.minersDreamLevel >= 4
          ? input.minersDreamLevel * 2 - 3
          : input.minersDreamLevel
        : 0;
    if ((input.lamentisLevel ?? NaN) >= 0) {
      numShow++;
    }
    for (const id of Object.keys(planet.geology)) {
      const deposit = planet.geology[id]!;
      if (deposit === 0) {
        continue;
      }
      if (numShow-- > 0) {
        weighting += (deposit / 0.01) * weightOf(input.geologyWeights[id]);
      } else {
        weighting +=
          (deposit > 0 ? 1 : -1) * weightOf(input.geologyWeights[id]);
      }
    }

    return { planet, achieve, weighting };
  });

  const habitability = (entry: ScoredPlanet) => {
    const traitRanks = entry.planet.traits.map((trait) =>
      input.planetTraitOrder.indexOf(trait),
    );
    // A generated planet normally has at least `none`; retaining -1 for an
    // empty or unknown-only list matches the legacy indexOf fallback.
    const bestTraitRank = traitRanks.length > 0 ? Math.min(...traitRanks) : -1;
    return input.biomeOrder.indexOf(entry.planet.biome) + bestTraitRank;
  };

  const ordered = [...scored];
  if (input.targetName === "weighting") {
    ordered.sort((a, b) => b.weighting - a.weighting);
  }
  if (input.targetName === "habitable") {
    ordered.sort((a, b) => habitability(a) - habitability(b));
  }
  if (input.targetName === "achieve") {
    ordered.sort((a, b) =>
      a.achieve !== b.achieve
        ? b.achieve - a.achieve
        : habitability(a) - habitability(b),
    );
  }

  return Object.freeze({ elementId: ordered[0]!.planet.id });
}
