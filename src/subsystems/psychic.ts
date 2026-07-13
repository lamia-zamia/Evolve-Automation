import type { SubsystemDependencies } from "./types.ts";

type Dependencies = SubsystemDependencies<
  | "getGame"
  | "getSettings"
  | "getResources"
  | "getVueById"
  | "clickSelector"
  | "psychicPowerCost"
>;
export function createAutoPsychic({ getGame, getSettings, getResources, getVueById, clickSelector, psychicPowerCost }: Dependencies) {
  return function autoPsychic() {
    const game = getGame();
    const settings = getSettings();
    const resources = getResources();
    if (
      settings.psychicPower === "none" ||
      !game.global.race["psychic"] ||
      !game.global.tech["psychic"] ||
      resources.Energy.storageRatio < 1
    ) {
      return false;
    }
    let vue = null;
    const canAfford = (p) =>
      resources.Energy.currentQuantity >=
      psychicPowerCost[p][game.global.tech.psychic >= 5 ? 1 : 0];

    if (
      settings.psychicPower === "murder" ||
      (settings.psychicPower !== "boost" && game.global.stats.psykill < 10)
    ) {
      if (
        resources.Population.currentQuantity > 0 &&
        canAfford("murder") &&
        (vue = getVueById("psychicKill"))
      ) {
        vue.murder();
        return; // Always perform 10 murders asap to unlock advanced powers
      }
    }

    if (
      game.global.tech["psychicthrall"] &&
      game.global.tech["unfathomable"] &&
      game.global.race["unfathomable"]
    ) {
      let jailed = resources.Thrall.rateOfChange;
      let cells = resources.Thrall.storageRatio;

      if (
        settings.psychicPower === "auto" ||
        settings.psychicPower === "mind_break"
      ) {
        if (
          (jailed > 1 || (jailed === 1 && cells === 1)) &&
          canAfford("mind_break") &&
          (vue = getVueById("psychicMindBreak"))
        ) {
          vue.breakMind();
          return; // If we have more than one jailed it means that tormenter can't keep up with capture speed for some reason, and need some assistment
        }
      }

      if (
        settings.psychicPower === "auto" ||
        settings.psychicPower === "stun"
      ) {
        if (
          game.global.tech.psychicthrall >= 2 &&
          cells < 1 &&
          canAfford("stun") &&
          (vue = getVueById("psychicCapture"))
        ) {
          vue.stun();
          return; // That's what we really want, new thrall
        }
      }
    }

    const haveRoom = (r) =>
      r.currentQuantity + r.income * 1.5 * 300 < r.maxQuantity;
    let powers = game.global.race.psychicPowers;
    if (
      settings.psychicPower === "auto" ||
      settings.psychicPower === "profit"
    ) {
      if (
        game.global.tech.psychic >= 3 &&
        haveRoom(resources.Money) &&
        !powers.cash &&
        canAfford("profit") &&
        (vue = getVueById("psychicFinance"))
      ) {
        vue.boostVal();
        return; // More money is always welcomed
      }
    }

    if (settings.psychicPower === "auto" || settings.psychicPower === "boost") {
      if (!powers.boostTime && canAfford("boost")) {
        let boosted = null;
        if (settings.psychicBoostRes === "auto") {
          let boostable = (Object.values(resources) as any[])
            .filter((r) => r.isUnlocked() && r.atomicMass > 0 && haveRoom(r))
            .sort((a, b) => b.income - a.income);
          if (boostable.length > 0) {
            boosted = boostable[0].id;
          }
        } else {
          boosted = settings.psychicBoostRes;
        }

        if (boosted && (vue = getVueById("psychicBoost"))) {
          clickSelector(
            `#psychicBoost #psyhscrolltarget input[value="${boosted}"]`,
          );
          vue.boostVal();
          return; // Try to find something that have some good income, and still have a room for more resources
        }
      }
    }

    if (
      settings.psychicPower === "auto" ||
      settings.psychicPower === "assault"
    ) {
      if (
        game.global.tech.psychic >= 2 &&
        !powers.assaultTime &&
        canAfford("assault") &&
        (vue = getVueById("psychicAssault"))
      ) {
        vue.boostVal();
        return; // Very last option, attack boost
      }
    }
  }
}
