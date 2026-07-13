import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  | "WarManager"
  | "getGame"
  | "getSettings"
  | "getBuildings"
  | "getResources"
  | "getWindow"
>;
export function createAutoHell({
  WarManager,
  getGame,
  getSettings,
  getBuildings,
  getResources,
  getWindow,
}: Dependencies) {
  return function autoHell() {
    const game = getGame();
    const settings = getSettings();
    const buildings = getBuildings();
    const resources = getResources();
    const debugWindow = getWindow();
    let m = WarManager;
    if (!m._garrisonVue || !m._hellVue) {
      return;
    }

    if (game.global.race["warlord"]) {
      let enemies = m.enemies;

      if (enemies > 0 && settings.warlordHandleFortress) {
        let targetMinions = settings.warlordMinimumMinions;
        let minionCount = m.minions;

        if (minionCount > targetMinions) {
          m.attackEnemyFortress(0); // first enemy fortress
        }
      }

      return; // the rest of autoHell is broken for Warlord
    }

    // Determine Patrol size and count
    let targetHellSoldiers = 0;
    let targetHellPatrols = 0;
    let targetHellPatrolSize = 0;
    let homeSoldiers = settings.hellHomeGarrison;
    if (
      (buildings.ElysiumFortress.isUnlocked() ||
        buildings.ElysiumScout.isUnlocked()) &&
      homeSoldiers < 100
    ) {
      homeSoldiers = 100;
    }
    // First handle not having enough soldiers, then handle patrols
    // Only go into hell at all if soldiers are close to full, or we are already there
    if (
      m.maxSoldiers > homeSoldiers + settings.hellMinSoldiers &&
      (m.hellSoldiers > settings.hellMinSoldiers ||
        m.currentSoldiers >=
          (m.maxSoldiers * settings.hellMinSoldiersPercent) / 100)
    ) {
      targetHellSoldiers =
        Math.min(m.currentSoldiers, m.maxSoldiers) - homeSoldiers; // Leftovers from an incomplete patrol go to hell garrison
      let availableHellSoldiers = targetHellSoldiers - m.hellReservedSoldiers;

      // Determine target hell garrison size
      // Estimated average damage is roughly 35 * threat / defense, so required defense = 35 * threat / targetDamage
      // But the threat hitting the fortress is only an intermediate result in the bloodwar calculation, it happens after predators and patrols but before repopulation,
      // So siege threat is actually lower than what we can see. Patrol and drone damage is wildly swingy and hard to estimate, so don't try to estimate the post-fight threat.
      // Instead base the defense on the displayed threat, and provide an option to bolster defenses when the walls get low. The threat used in the calculation
      // ranges from 1 * threat for 100% walls to the multiplier entered in the settings at 0% walls.
      let hellWallsMulti =
        settings.hellLowWallsMulti *
        (1 - game.global.portal.fortress.walls / 100); // threat modifier from damaged walls = 1 to lowWallsMulti
      let hellTargetFortressDamage =
        (game.global.portal.fortress.threat * 35) /
        settings.hellTargetFortressDamage; // required defense to meet target average damage based on current threat
      let hellTurretPower =
        buildings.PortalTurret.stateOnCount *
        (game.global.tech["turret"]
          ? game.global.tech["turret"] >= 2
            ? 70
            : 50
          : 35); // turrets count and power
      let hellGarrison = m.getSoldiersForAttackRating(
        Math.max(
          0,
          hellWallsMulti * hellTargetFortressDamage - hellTurretPower,
        ),
      ); // don't go below 0

      // Always have at least half our hell contingent available for patrols, and if we cant defend properly just send everyone
      if (availableHellSoldiers < hellGarrison) {
        hellGarrison = 0; // If we cant defend adequately, send everyone out on patrol
      } else if (availableHellSoldiers < hellGarrison * 2) {
        hellGarrison = Math.floor(availableHellSoldiers / 2); // Always try to send out at least half our people
      }

      // Determine the patrol attack rating
      if (settings.hellHandlePatrolSize) {
        let patrolRating =
          (game.global.portal.fortress.threat *
            settings.hellPatrolThreatPercent) /
          100;

        // Now reduce rating based on drones, droids and bootcamps
        if (game.global.portal.war_drone) {
          patrolRating -=
            settings.hellPatrolDroneMod *
            game.global.portal.war_drone.on *
            (game.global.tech["portal"] >= 7 ? 1.5 : 1);
        }
        if (game.global.portal.war_droid) {
          patrolRating -=
            settings.hellPatrolDroidMod *
            game.global.portal.war_droid.on *
            (game.global.tech["hdroid"] ? 2 : 1);
        }
        if (game.global.city.boot_camp) {
          patrolRating -=
            settings.hellPatrolBootcampMod * game.global.city.boot_camp.count;
        }

        // In the end, don't go lower than the minimum...
        patrolRating = Math.max(patrolRating, settings.hellPatrolMinRating);

        // Increase patrol attack rating if alive soldier count is low to reduce patrol losses
        if (
          settings.hellBolsterPatrolRating > 0 &&
          settings.hellBolsterPatrolPercentTop > 0
        ) {
          // Check if settings are on
          const homeGarrisonFillRatio =
            m.currentCityGarrison / m.maxCityGarrison;
          if (
            homeGarrisonFillRatio <=
            settings.hellBolsterPatrolPercentTop / 100
          ) {
            // If less than top
            if (
              homeGarrisonFillRatio <=
              settings.hellBolsterPatrolPercentBottom / 100
            ) {
              // and less than bottom
              patrolRating += settings.hellBolsterPatrolRating; // add full rating
            } else if (
              settings.hellBolsterPatrolPercentBottom <
              settings.hellBolsterPatrolPercentTop
            ) {
              // If between bottom and top
              patrolRating +=
                ((settings.hellBolsterPatrolRating *
                  (settings.hellBolsterPatrolPercentTop / 100 -
                    homeGarrisonFillRatio)) / // add rating proportional to where in the range we are
                  (settings.hellBolsterPatrolPercentTop -
                    settings.hellBolsterPatrolPercentBottom)) *
                100;
            }
          }
        }

        // Patrol size
        targetHellPatrolSize = m.getSoldiersForAttackRating(patrolRating);

        // If patrol size is larger than available soldiers, send everyone available instead of 0
        targetHellPatrolSize = Math.min(
          targetHellPatrolSize,
          availableHellSoldiers - hellGarrison,
        );
      } else {
        targetHellPatrolSize = m.hellPatrolSize;
      }

      // Evil universe (Authority v2): station just enough surplus soldiers in the fortress
      // garrison to hold Authority at the target, leaving the rest on patrol. Stationed defenders
      // count toward Authority (the game adds garrison - patrols*patrol_size); patrol soldiers do
      // not. Authority is linear in stationed soldiers, so this is a proportional controller run
      // *every* tick (not gated on "below target"): desiredStationed = currentStationed +
      // (target - currentAuthority)/perSoldier. Its fixed point is independent of the current
      // stationed count, so it settles at the target — adding soldiers when short and releasing
      // them to patrol when over — instead of the earlier bang-bang that slammed to max and back.
      // Clamped to [defence-need garrison, one-patrol-reserve], so when Authority is comfortably
      // met it collapses to normal defence-only behaviour, and it always keeps a patrol running.
      if (
        settings.generalMinimumAuthority !== 0 &&
        resources.Authority.isUnlocked() &&
        targetHellPatrolSize > 0
      ) {
        // Marginal Authority per stationed soldier (game portal.js): (0.7 + 0.1*evil), then
        // grenadier x1.75, autocracy x1.08 / dictator x1.12. The high_pop scaling (<1) is
        // omitted, which only over-estimates perSoldier -> undershoots -> still converges.
        let perSoldier = 0.7 + 0.1 * (game.global.tech["evil"] ?? 0);
        if (game.global.race["grenadier"]) perSoldier *= 1.75;
        if (game.global.civic.govern.type === "autocracy") perSoldier *= 1.08;
        else if (game.global.civic.govern.type === "dictator")
          perSoldier *= 1.12;

        // A negative target (e.g. -1) pins Authority at its current max while respecting the
        // configured patrol reserve; a positive target holds Authority at that literal value.
        let authorityTarget =
          settings.generalMinimumAuthority < 0
            ? resources.Authority.maxQuantity
            : settings.generalMinimumAuthority;
        let deficit = authorityTarget - resources.Authority.currentQuantity;
        let neededStationed = m.hellGarrison + Math.ceil(deficit / perSoldier); // m.hellGarrison = current stationed defenders
        // Always leave soldiers for at least one patrol; in -1 (pin-at-max) mode reserve the
        // configured percentage so pinning Authority at its cap doesn't starve soul gem income.
        // Do not reserve the already-calculated patrol size here: at 0 Authority armyRating is
        // also 0, which makes that calculation expand to every available soldier. Reserving that
        // oversized patrol would leave nobody stationed, keeping Authority and armyRating at 0.
        let patrolReserve = 1;
        if (
          settings.generalMinimumAuthority < 0 &&
          settings.generalAuthorityMinPatrolPercent > 0
        ) {
          patrolReserve = Math.min(
            availableHellSoldiers,
            Math.ceil(
              (availableHellSoldiers *
                settings.generalAuthorityMinPatrolPercent) /
                100,
            ),
          );
        }
        let maxStationed = Math.max(0, availableHellSoldiers - patrolReserve);
        let authGarrison = Math.max(
          hellGarrison,
          Math.min(neededStationed, maxStationed),
        );

        // Authority can change the attack rating used to choose patrol size. Clamp the patrol
        // only after choosing the Authority garrison so a zero-rating patrol cannot consume the
        // soldiers needed to bootstrap Authority. The remaining soldiers still all patrol; this
        // only controls how many are grouped into each patrol.
        let availableForPatrol = Math.max(
          1,
          availableHellSoldiers - authGarrison,
        );
        targetHellPatrolSize = Math.min(
          targetHellPatrolSize,
          availableForPatrol,
        );

        if (debugWindow.authorityDebug && authGarrison !== hellGarrison) {
          console.log(
            `[authority] amount=${resources.Authority.currentQuantity.toFixed(
              1,
            )}/${authorityTarget.toFixed(0)}, perSoldier=${perSoldier.toFixed(
              2,
            )}, stationed=${
              m.hellGarrison
            }→need=${neededStationed}, garrison ${hellGarrison}→${authGarrison} (cap=${maxStationed}, patrolReserve=${patrolReserve}, patrolSize=${targetHellPatrolSize}, avail=${availableHellSoldiers})`,
          );
        }
        hellGarrison = authGarrison;
      }

      // Determine patrol count
      targetHellPatrols = Math.max(
        1,
        Math.floor(
          (availableHellSoldiers - hellGarrison) / targetHellPatrolSize,
        ),
      );

      // Special logic for small number of patrols
      if (settings.hellHandlePatrolSize && targetHellPatrols === 1) {
        // If we could send 1.5 patrols, send 3 half-size ones instead
        if (
          availableHellSoldiers - hellGarrison >=
          1.5 * targetHellPatrolSize
        ) {
          targetHellPatrolSize = Math.floor(
            (availableHellSoldiers - hellGarrison) / 3,
          );
          targetHellPatrols = Math.floor(
            (availableHellSoldiers - hellGarrison) / targetHellPatrolSize,
          );
        }
      }
    } else {
      // Try to leave hell if any soldiers are still assigned so the game doesn't put miniscule amounts of soldiers back
      if (m.hellAssigned > 0) {
        m.removeHellPatrolSize(m.hellPatrolSize);
        m.removeHellPatrol(m.hellPatrols);
        m.removeHellGarrison(m.hellSoldiers);
        return;
      }
    }

    // Adjust values ingame
    // First decrease patrols, then put hell soldiers to the right amount, then increase patrols, to make sure all actions go through
    if (
      settings.hellHandlePatrolSize &&
      m.hellPatrolSize > targetHellPatrolSize
    )
      m.removeHellPatrolSize(m.hellPatrolSize - targetHellPatrolSize);
    if (m.hellPatrols > targetHellPatrols)
      m.removeHellPatrol(m.hellPatrols - targetHellPatrols);
    if (m.hellSoldiers > targetHellSoldiers)
      m.removeHellGarrison(m.hellSoldiers - targetHellSoldiers);
    if (m.hellSoldiers < targetHellSoldiers)
      m.addHellGarrison(targetHellSoldiers - m.hellSoldiers);
    if (
      settings.hellHandlePatrolSize &&
      m.hellPatrolSize < targetHellPatrolSize
    )
      m.addHellPatrolSize(targetHellPatrolSize - m.hellPatrolSize);
    if (m.hellPatrols < targetHellPatrols)
      m.addHellPatrol(targetHellPatrols - m.hellPatrols);
  };
}
