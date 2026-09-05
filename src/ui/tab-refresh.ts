export interface TabRefreshState {
  tabHash: number;
  [key: string]: unknown;
}

export interface TabRefreshGame {
  global: {
    race: Record<string, unknown> & { ss_genus?: string };
    settings: Record<string, unknown> & { civTabs: number };
    galaxy: Record<string, unknown>;
    space: Record<string, { count?: number }>;
    tauceti: Record<string, { count?: number }>;
    tech: Record<string, number>;
  };
}

/** The Vue instance behind the game's main column, which owns tab rendering. */
export interface TabRefreshMainVue {
  s: { civTabs: number; tabLoad: boolean; animated?: boolean };
  toggleTabLoad: () => void;
}

/** The three buildings whose count unlocks a tab or a tab's contents. */
export interface TabRefreshBuildings {
  RockQuarry: { count: number };
  TitanQuarters: { count: number };
  TauStarRingworld: { count: number };
}

/** The two storage resources whose unlock adds a row to the storage tab. */
export interface TabRefreshResources {
  Crates: { isUnlocked: () => boolean };
  Containers: { isUnlocked: () => boolean };
}

export interface TabRefreshDependencies {
  getState: () => TabRefreshState;
  getGame: () => TabRefreshGame;
  getBuildings: () => TabRefreshBuildings;
  getResources: () => TabRefreshResources;
  getHaveTech: () => (tech: string, level?: number) => boolean;
  getMainVue: () => TabRefreshMainVue;
}

// TODO: quantium lab
export function createTabRefresh({
  getState,
  getGame,
  getBuildings,
  getResources,
  getHaveTech,
  getMainVue,
}: TabRefreshDependencies) {
  /**
   * Tracks which game tabs and tab contents are unlocked, and forces the game to redraw them when
   * that changes. The game only builds a tab's DOM when the tab is first shown, so a newly unlocked
   * tab leaves the script with stale (or missing) buttons until the redraw happens.
   *
   * Returns true when a redraw was performed, meaning the caller must abandon the current tick: the
   * DOM it was about to act on has just been replaced.
   */
  function updateTabs(update: boolean): boolean {
    const state = getState();
    const game = getGame();
    const buildings = getBuildings();
    const resources = getResources();
    const haveTech = getHaveTech();

    const oldHash = state.tabHash;
    state.tabHash =
      0 + // Not really a hash, but it should never go down, that's enough to track unlocks. (Except market after mutation in terrifying, 1000 weight should prevent all possible issues)
      (game.global.race["smoldering"] && buildings.RockQuarry.count ? 1 : 0) + // Chrysotile production
      (game.global.race["shapeshifter"] ? 1 : 0) + // Shifter UI
      (game.global.race["servants"] ? 1 : 0) + // Servants UI
      (game.global.settings.showMarket ? 1000 : 0) + // Market tab unlocked
      (game.global.galaxy.trade ? 1 : 0) + // Galaxy trades unlocked
      (game.global.settings.showEjector ? 1 : 0) + // Ejector tab unlocked
      (game.global.settings.showCargo ? 1 : 0) + // Supply tab unlocked
      (game.global.tech.alchemy ?? 0) + // Basic & advanced transmutations
      (game.global.tech.queue ? 1 : 0) + // Queue unlocked
      (game.global.tech.r_queue ? 1 : 0) + // Research queue unlocked
      (game.global.tech.govern ? 1 : 0) + // Government unlocked
      ((game.global.tech.spy ?? 0) >= 2 ? 1 : 0) + // SpyOp governor task
      (game.global.tech.trade ? 1 : 0) + // Trade Routes unlocked
      (resources.Crates.isUnlocked() ? 1 : 0) + // Crates in storage tab
      (resources.Containers.isUnlocked() ? 1 : 0) + // Containers in storage tab
      ((game.global.tech.m_smelting ?? 0) >= 2 ? 1 : 0) + // TP Iridium smelting
      (game.global.tech.irid_smelting ? 1 : 0) + // Iridium smelting
      (buildings.TitanQuarters.count > 0 ? 1 : 0) + // Titan Mine unlocked
      (game.global.race["orbit_decayed"] ? 1 : 0) + // City tab gone
      (game.global.tech.womling_tech ?? 0) + // Womling techs
      (game.global.tech.focus_cure ?? 0) + // Cure techs
      (game.global.tech.isolation ? 1 : 0) + // Solar tabs gone
      (game.global.tech.m_ignite ? 1 : 0) + // Ignition Device built
      (buildings.TauStarRingworld.count >= 1000 ? 1 : 0) + // Ringworld built
      ((game.global.tech.tau_gas2 ?? 0) >= 5 ? 1 : 0) + // Alien Space Station built
      (game.global.tech.replicator ? 1 : 0) + // Matter Replicator unlocked
      ((game.global.tauceti.tau_factory?.count ?? 0) > 0 ? 1 : 0) + // Factory built in lone survivor
      ((game.global.space.g_factory?.count ?? 0) > 0 ? 1 : 0) + // Graphene plant built in lone survivor
      ((game.global.tauceti.mining_ship?.count ?? 0) > 0 ? 1 : 0) + // Extractor ship built
      (game.global.tech.psychicthrall ?? 0) + // Psychic powers
      (game.global.tech.psychic ?? 0) + // Psychic powers
      ((game.global.tech.edenic ?? 0) >= 1 ? 1 : 0) + // Spire floor 50 Eden access
      ((game.global.tech.isle ?? 0) >= 3 ? 1 : 0) + // Edenic north/south piers -> spirit syphon tech
      ((game.global.tech.palace ?? 0) >= 4 ? 1 : 0); // Edenic sealed tomb -> energy drain tech

    if (game.global.settings.showShipYard) {
      // TP Ship Yard
      state.tabHash +=
        1 +
        (game.global.tech.syard_class ?? 0) + // Tiers of unlocked components
        (game.global.tech.syard_power ?? 0) +
        (game.global.tech.syard_weapon ?? 0) +
        (game.global.tech.syard_armor ?? 0) +
        (game.global.tech.syard_engine ?? 0) +
        (game.global.tech.syard_sensor ?? 0) +
        (haveTech("titan", 3) && haveTech("enceladus", 2) ? 1 : 0) + // Enceladus syndicate
        (haveTech("triton", 2) ? 1 : 0) + // Triton syndicate
        (haveTech("makemake") ? 1 : 0) + // Makemake syndicate
        (haveTech("eris") ? 1 : 0) + // Eris syndicate
        (haveTech("eris", 2) ? 1 : 0) + // Eris scanning
        (haveTech("titan_ai_core") ? 1 : 0) + // AI core built, drones unlocked
        (haveTech("tauceti") ? 1 : 0); // Interstellar drive researched, explorer inlocked
    }

    if (game.global.race["shapeshifter"]) {
      state.tabHash += (game.global.race.ss_genus ?? "none")
        .split("")
        .reduce((a, b) => {
          a = (a << 5) - a + b.charCodeAt(0);
          return a & a;
        }, 0);
    }

    if (update && state.tabHash !== oldHash) {
      const mainVue = getMainVue();
      const animated = mainVue.s.animated;
      try {
        // The Vue 3 game defers animated panel teardown for 300 ms. This redraw clears and
        // recreates every panel synchronously, so leaving animations enabled lets the old delayed
        // teardown erase the freshly rebuilt content when its timer fires (especially after a
        // background-tab transition in Firefox).
        mainVue.s.animated = false;
        mainVue.s.civTabs = 7;
        mainVue.s.tabLoad = false;
        mainVue.toggleTabLoad();
        mainVue.s.tabLoad = true;
        mainVue.toggleTabLoad();
        mainVue.s.civTabs = game.global.settings.civTabs;
      } finally {
        if (animated === undefined) {
          delete mainVue.s.animated;
        } else {
          mainVue.s.animated = animated;
        }
      }
      return true;
    } else {
      return false;
    }
  }

  return { updateTabs };
}
