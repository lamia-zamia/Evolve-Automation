type UnlockableBuilding = { isUnlocked: () => boolean };
type CountedBuilding = UnlockableBuilding & { count: number };

type HellSupression = { supress: number; rating: number };

type HellGame = {
  armyRating: (soldiers: number, type: string, wounded: number) => number;
};

type HellBuildings = {
  RuinsGuardPost: CountedBuilding;
  GateEastTower: UnlockableBuilding;
  GateWestTower: UnlockableBuilding;
  GateTurret: UnlockableBuilding;
};

type HellIntelligenceDependencies = {
  getGame: () => HellGame;
  getBuildings: () => HellBuildings;
  getPoly: () => { hellSupression: (area: string) => HellSupression };
  getSettings: () => { buildingTowerSuppression: number };
  getTraitVal: () => (
    trait: string,
    index: number,
    operation?: string | number,
  ) => number;
};

/** Combined guard post rating that fully supresses the Ruins. */
const RUINS_SUPRESSION_RATING = 5000;
/** Gate rating above which its demon spawn is fully supressed. */
const GATE_SUPRESSION_RATING = 7501;

export function createHellIntelligence({
  getGame,
  getBuildings,
  getPoly,
  getSettings,
  getTraitVal,
}: HellIntelligenceDependencies) {
  // Supression rating a single Ruins Guard Post contributes.
  function getGuardPostRating(): number {
    const traitVal = getTraitVal();
    return (
      getGame().armyRating(traitVal("high_pop", 0, 1), "hellArmy", 0) *
      traitVal("holy", 1, "+")
    );
  }

  // Gate supression is still under the configured floor, so more towers help.
  // Both towers gate the read because `hellSupression` computes an army rating,
  // which is not worth doing in every run that never reaches the gate.
  function gateTowerSupressionTooLow(): boolean {
    const buildings = getBuildings();
    if (
      !buildings.GateEastTower.isUnlocked() ||
      !buildings.GateWestTower.isUnlocked()
    ) {
      return false;
    }
    return (
      getPoly().hellSupression("gate").supress <
      getSettings().buildingTowerSuppression / 100
    );
  }

  // The gate's demons are already fully supressed, so another turret cannot
  // help. The turret gates the read for the same reason as the towers above.
  function gateDemonsSupressed(): boolean {
    if (!getBuildings().GateTurret.isUnlocked()) {
      return false;
    }
    return (
      getPoly().hellSupression("gate").rating >
      GATE_SUPRESSION_RATING + getGuardPostRating()
    );
  }

  // Guard posts are worth prebuilding until they fully supress the Ruins, even
  // while supression is not needed yet. A locked guard post has nothing to
  // prebuild, and skipping it avoids the army rating in pre-hell runs.
  function guardPostPrebuildIncomplete(): boolean {
    const guardPost = getBuildings().RuinsGuardPost;
    if (!guardPost.isUnlocked()) {
      return false;
    }
    return (
      guardPost.count <
      Math.ceil(RUINS_SUPRESSION_RATING / getGuardPostRating())
    );
  }

  return {
    gateTowerSupressionTooLow,
    gateDemonsSupressed,
    guardPostPrebuildIncomplete,
  };
}
