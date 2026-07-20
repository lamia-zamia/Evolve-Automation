import type {
  PlanetCandidate,
  PlanetSelectionGate,
} from "../domain/planet-selection.ts";

export interface PlanetSelectionCandidatesSample {
  readonly planets: readonly PlanetCandidate[];
  readonly gods: string | null;
  readonly starLevel: number;
  readonly raceGenusById: Readonly<Record<string, string | null>>;
  readonly biomeGenus: Readonly<Record<string, string>>;
  readonly minersDreamLevel: number | null;
  readonly lamentisLevel: number | null;
  readonly biomeWeights: Readonly<Record<string, number | undefined>>;
  readonly traitWeights: Readonly<Record<string, number | undefined>>;
  readonly achievementWeight: number | undefined;
  readonly orbitWeight: number | undefined;
  readonly geologyWeights: Readonly<Record<string, number | undefined>>;
  readonly biomeOrder: readonly string[];
}

export interface PlanetSelectionReader {
  sampleGate(): PlanetSelectionGate;
  sampleCandidates(): PlanetSelectionCandidatesSample;
  achievementsUnlocked(
    ids: readonly string[],
    starLevel: number,
  ): Readonly<Record<string, boolean>>;
}
