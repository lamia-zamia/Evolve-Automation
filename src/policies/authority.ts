type LooseObject = Record<PropertyKey, any>;
type TraitValue = (trait: string, index: number, fallback?: number) => number;

type AuthorityPolicyDependencies = {
  getGame: () => LooseObject;
  getSettings: () => LooseObject;
  getResources: () => LooseObject;
  traitVal: TraitValue;
};

export function createAuthorityPolicy({
  getGame,
  getSettings,
  getResources,
  traitVal,
}: AuthorityPolicyDependencies) {
  function getAuthorityTarget(): number | null {
    const settings = getSettings();
    if (!settings.authorityManage || settings.generalMinimumAuthority === 0) {
      return null;
    }
    return settings.generalMinimumAuthority < 0
      ? getResources().Authority.maxQuantity
      : settings.generalMinimumAuthority;
  }

  function getAuthorityPerSoldier(): number {
    const game = getGame();
    let authorityPerSoldier =
      (0.7 + 0.1 * (game.global.tech["evil"] ?? 0)) *
      (traitVal("high_pop", 1, 100) / 100);
    if (game.global.race["grenadier"]) authorityPerSoldier *= 1.75;
    if (game.global.civic.govern.type === "autocracy") {
      authorityPerSoldier *= 1.08;
    } else if (game.global.civic.govern.type === "dictator") {
      authorityPerSoldier *= 1.12;
    }
    return authorityPerSoldier;
  }

  function getRequiredAuthorityGarrison(currentGarrison: number): number {
    const authorityTarget = getAuthorityTarget();
    if (authorityTarget === null) {
      return 0;
    }
    const authorityPerSoldier = getAuthorityPerSoldier();
    if (authorityPerSoldier <= 0) {
      return currentGarrison;
    }
    const currentAuthority = getResources().Authority.currentQuantity;
    const nonGarrisonAuthority =
      currentAuthority - currentGarrison * authorityPerSoldier;
    return Math.max(
      0,
      Math.ceil(
        (authorityTarget - nonGarrisonAuthority) / authorityPerSoldier - 1e-9,
      ),
    );
  }

  function getPredictedAuthorityAfterRemovingSoldiers(
    removedSoldiers: number,
  ): number {
    return Math.floor(
      getResources().Authority.currentQuantity -
        removedSoldiers * getAuthorityPerSoldier(),
    );
  }

  return {
    getAuthorityTarget,
    getAuthorityPerSoldier,
    getRequiredAuthorityGarrison,
    getPredictedAuthorityAfterRemovingSoldiers,
  };
}
