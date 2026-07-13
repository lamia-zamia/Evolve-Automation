import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  "getMutableTraitManager" | "getGame" | "getResources" | "GameLog"
>;
export function createAutoMutateTrait({
  getMutableTraitManager,
  getGame,
  getResources,
  GameLog,
}: Dependencies) {
  return function autoMutateTrait() {
    const MutableTraitManager = getMutableTraitManager();
    const game = getGame();
    const resources = getResources();
    let m = MutableTraitManager;
    if (!m.isUnlocked()) {
      return;
    }

    let currency =
      game.global.race.universe === "antimatter"
        ? resources.AntiPlasmid
        : resources.Plasmid;

    for (let trait of m.priorityList) {
      if (trait.canGain()) {
        let mutationCost = trait.mutationCost("gain");
        m.gainTrait(trait.traitName);
        GameLog.logSuccess(
          "mutation",
          `Mutating in ${trait.name} for ${mutationCost} ${currency.name}`,
          ["progress"],
        );
        currency.currentQuantity -= mutationCost;
        return; // only mutate one trait per tick, to reduce lag
      }

      if (trait.canPurge()) {
        let mutationCost = trait.mutationCost("purge");
        m.purgeTrait(trait.traitName);
        GameLog.logSuccess(
          "mutation",
          `Mutating out ${trait.name} for ${mutationCost} ${currency.name}`,
          ["progress"],
        );
        currency.currentQuantity -= mutationCost;
        return; // only mutate one trait per tick, to reduce lag
      }
    }
  };
}
