import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  "getMinorTraitManager" | "getResources"
>;
export function createAutoMinorTrait({
  getMinorTraitManager,
  getResources,
}: Dependencies) {
  return function autoMinorTrait() {
    const MinorTraitManager = getMinorTraitManager();
    const resources = getResources();
    let m = MinorTraitManager;
    if (!m.isUnlocked()) {
      return;
    }

    let traitList = m.managedPriorityList();
    if (traitList.length === 0) {
      return;
    }

    let totalWeighting = 0;
    let totalGeneCost = 0;

    traitList.forEach((trait) => {
      totalWeighting += trait.weighting;
      totalGeneCost += trait.geneCost();
    });

    traitList.forEach((trait) => {
      let traitCost = trait.geneCost();
      if (
        trait.weighting / totalWeighting >= traitCost / totalGeneCost &&
        resources.Genes.currentQuantity >= traitCost
      ) {
        m.buyTrait(trait.traitName);
        resources.Genes.currentQuantity -= traitCost;
      }
    });
  };
}
