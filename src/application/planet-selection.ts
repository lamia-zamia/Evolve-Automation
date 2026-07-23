import type { PlanetSelectionDecision } from "../domain/progression/evolution/planet-selection.ts";
import {
  planetSelectionAchievementIds,
  planPlanetSelection,
  shouldSelectPlanet,
} from "../domain/progression/evolution/planet-selection.ts";
import type { DecisionExecutor } from "../ports/decision-executor.ts";
import type { PlanetSelectionReader } from "../ports/planet-selection.ts";

export interface PlanetSelectionCycleDependencies {
  readonly reader: PlanetSelectionReader;
  readonly executor: DecisionExecutor<PlanetSelectionDecision>;
}

/**
 * One planet-selection pass: gate on the selection screen being active, sample
 * the generated candidates, resolve the achievement lookups the planner needs,
 * plan the pick, and click it.
 */
export function runPlanetSelection({
  reader,
  executor,
}: PlanetSelectionCycleDependencies): void {
  const gate = reader.sampleGate();
  if (!shouldSelectPlanet(gate)) {
    return;
  }
  const sample = reader.sampleCandidates();
  const achievementUnlocked = reader.achievementsUnlocked(
    planetSelectionAchievementIds(
      sample.planets,
      sample.raceGenusById,
      sample.biomeGenus,
    ),
    sample.starLevel,
  );
  executor.execute(
    planPlanetSelection({
      planets: sample.planets,
      targetName: gate.targetName,
      gods: sample.gods,
      raceGenusById: sample.raceGenusById,
      biomeGenus: sample.biomeGenus,
      achievementUnlocked,
      minersDreamLevel: sample.minersDreamLevel,
      lamentisLevel: sample.lamentisLevel,
      biomeWeights: sample.biomeWeights,
      traitWeights: sample.traitWeights,
      achievementWeight: sample.achievementWeight,
      orbitWeight: sample.orbitWeight,
      geologyWeights: sample.geologyWeights,
      biomeOrder: sample.biomeOrder,
    }),
  );
}
