import type { SubsystemDependencies } from "./types.ts";

type Dependencies = SubsystemDependencies<
  | "SpyManager"
  | "WarManager"
  | "GameLog"
  | "getState"
  | "getSettings"
  | "getGame"
  | "guardActive"
  | "getHealingRate"
  | "traitVal"
  | "getOccCosts"
  | "getGovName"
>;
export function createAutoBattle({
  SpyManager,
  WarManager,
  GameLog,
  getState,
  getSettings,
  getGame,
  guardActive,
  getHealingRate,
  traitVal,
  getOccCosts,
  getGovName,
}: Dependencies) {
  return function autoBattle() {
    const state = getState();
    const settings = getSettings();
    const game = getGame();
    let sm = SpyManager;
    let m = WarManager;
    if (
      !m._garrisonVue ||
      !sm._foreignVue ||
      m.maxCityGarrison <= 0 ||
      state.goal === "Reset" ||
      settings.foreignPacifist ||
      guardActive("guardPacifist")
    ) {
      return;
    }

    // If we are not fully ready then return
    let healthyMin = settings.foreignAttackHealthySoldiersPercent / 100;
    let livingMin =
      settings.foreignProtect === "auto" && m.wounded <= 0
        ? 0
        : settings.foreignAttackLivingSoldiersPercent / 100;
    if (
      m.wounded > (1 - healthyMin) * m.maxCityGarrison ||
      m.currentCityGarrison < livingMin * m.maxCityGarrison
    ) {
      return;
    }

    let minAdv = settings.foreignMinAdvantage;
    let maxAdv = settings.foreignMaxAdvantage;

    // Calculating safe size of battalions, if needed
    let protectSoldiers = settings.foreignProtect === "always" ? true : false;
    if (settings.foreignProtect === "auto") {
      let garrison = game.global.civic.garrison;
      let timeToRecruit =
        (m.deadSoldiers * 100 - garrison.progress) / (garrison.rate * 4); // Recruitmen ticks in short loop - 4 times per second
      let timeToHeal = (m.wounded / getHealingRate()) * 5; // Heal tick in long loop - once per 5 seconds
      protectSoldiers = timeToRecruit > timeToHeal;
    }
    if (protectSoldiers) {
      minAdv = Math.max(minAdv, 80);
      maxAdv = Math.max(maxAdv, minAdv);
    }

    // TODO: Configurable max
    let maxBattalion = new Array(5).fill(m.availableGarrison);
    let requiredBattalion = m.maxCityGarrison;
    if (protectSoldiers) {
      let armor =
        (traitVal("scales", 0) + (game.global.tech.armor ?? 0)) /
          traitVal("armored", 0, "-") -
        traitVal("frail", 0);
      let protectedBattalion = [5, 10, 25, 50, 999].map((cap, tactic) =>
        armor >= cap * traitVal("high_pop", 0, 1)
          ? Number.MAX_SAFE_INTEGER
          : (5 - tactic) *
              (armor + (game.global.city.ptrait.includes("rage") ? 1 : 2)) -
            1,
      );
      maxBattalion = protectedBattalion.map((soldiers) =>
        Math.min(soldiers, m.availableGarrison),
      );
      requiredBattalion = 0;
    }
    maxBattalion[4] = Math.min(
      maxBattalion[4],
      settings.foreignMaxSiegeBattalion,
    );

    let requiredTactic = 0;

    // Check if there's something that we want and can occupy, and switch to that target if found
    let currentTarget = sm.foreignTarget;
    for (let foreign of sm.foreignActive) {
      if (foreign.policy === "Occupy" && !foreign.gov.occ) {
        let soldiersMin = m.getSoldiersForAdvantage(
          settings.foreignMinAdvantage,
          4,
          foreign.id,
        );
        if (
          soldiersMin <=
          (settings.autoHell && m._hellVue
            ? m.maxSoldiers - m.hellReservedSoldiers
            : m.maxCityGarrison)
        ) {
          currentTarget = foreign;
          requiredBattalion = Math.max(
            soldiersMin,
            Math.min(
              m.availableGarrison,
              m.getSoldiersForAdvantage(
                settings.foreignMaxAdvantage,
                4,
                foreign.id,
              ) - 1,
            ),
          );
          requiredTactic = 4;
          if (
            m.availableGarrison < requiredBattalion / 2 + getOccCosts() &&
            m.availableGarrison < m.maxCityGarrison
          ) {
            return; // Wait for more soldiers
          } else {
            break;
          }
        }
      }
    }
    // Nothing to attack
    if (!currentTarget) {
      return;
    }

    if (requiredTactic !== 4) {
      // If we don't need to occupy our target, then let's find best tactic for plundering
      // Never try siege if it can mess with unification
      for (
        let i =
          !settings.foreignUnification || settings.foreignOccupyLast ? 4 : 3;
        i >= 0;
        i--
      ) {
        let soldiersMin = m.getSoldiersForAdvantage(
          minAdv,
          i,
          currentTarget.id,
        );
        if (soldiersMin <= maxBattalion[i]) {
          requiredBattalion = Math.max(
            soldiersMin,
            Math.min(
              maxBattalion[i],
              m.availableGarrison,
              m.getSoldiersForAdvantage(maxAdv, i, currentTarget.id) - 1,
            ),
          );
          requiredTactic = i;
          break;
        }
      }
      // Not enough healthy soldiers, keep resting
      if (!requiredBattalion || requiredBattalion > m.availableGarrison) {
        return;
      }
    }

    // Occupy can pull soldiers from ships, let's make sure it won't happen
    if (
      !currentTarget.released &&
      (currentTarget.gov.anx || currentTarget.gov.buy || currentTarget.gov.occ)
    ) {
      // If it occupied currently - we'll get enough soldiers just by unoccupying it
      m.release(currentTarget.id);
    } else if (requiredTactic === 4 && game.global.settings.showPortal) {
      let missingSoldiers =
        getOccCosts() - (m.currentCityGarrison - requiredBattalion);
      if (missingSoldiers > 0) {
        // Not enough soldiers in city, let's try to pull them from hell
        if (
          !settings.autoHell ||
          !m._hellVue ||
          m.hellSoldiers - m.hellReservedSoldiers < missingSoldiers
        ) {
          return;
        }
        let patrolsToRemove = Math.ceil(
          (missingSoldiers - m.hellGarrison) / m.hellPatrolSize,
        );
        if (patrolsToRemove > 0) {
          m.removeHellPatrol(patrolsToRemove);
        }
        m.removeHellGarrison(missingSoldiers);
      }
    }

    // Set attack type
    m.setTactic(requiredTactic);

    // Now adjust our battalion size to fit between our campaign attack rating ranges
    let deltaBattalion = requiredBattalion - m.raid;
    if (deltaBattalion > 0) {
      m.addBattalion(deltaBattalion);
    }
    if (deltaBattalion < 0) {
      m.removeBattalion(deltaBattalion * -1);
    }

    // Log the interaction
    let campaignTitle = m.getCampaignTitle(requiredTactic);
    let battalionRating = game.armyRating(m.raid, "army");
    let advantagePercent = m
      .getAdvantage(battalionRating, requiredTactic, currentTarget.id)
      .toFixed(1);
    GameLog.logSuccess(
      "attack",
      `Launching ${campaignTitle} campaign against ${getGovName(
        currentTarget.id,
      )} with ${
        currentTarget.gov.spy < 1 ? "~" : ""
      }${advantagePercent}% advantage.`,
      ["combat"],
    );

    m.launchCampaign(currentTarget.id);
  };
}
