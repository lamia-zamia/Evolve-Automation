import { createGovernmentControl } from "./government-control.ts";
import { createBattleControl } from "./battle-control.ts";
import { createHellControl } from "./hell-control.ts";

type GovernmentDependencies = Parameters<typeof createGovernmentControl>[0];
type BattleDependencies = Parameters<typeof createBattleControl>[0];
type HellDependencies = Parameters<typeof createHellControl>[0];

interface CombatCivicControlDependencies {
  readonly government: GovernmentDependencies;
  readonly battle: BattleDependencies;
  readonly hell: HellDependencies;
}

// Composition seam for civic and combat automation. Individual adapters retain
// their effects and the returned entries preserve the runtime's tick positions.
export function createCombatCivicControls({
  government,
  battle,
  hell,
}: CombatCivicControlDependencies) {
  const governmentControl = createGovernmentControl(government);
  const battleControl = createBattleControl(battle);
  const hellControl = createHellControl(hell);

  return Object.freeze({
    ...governmentControl,
    ...battleControl,
    ...hellControl,
  });
}
