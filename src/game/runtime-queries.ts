type RuntimeRace = {
  governor?: {
    g?: { bg?: string };
    tasks?: Record<string, string>;
  };
  [key: string]: unknown;
};

type RuntimeGame = {
  global: {
    race: RuntimeRace;
    tech: Record<string, number | undefined>;
  };
};

type RuntimeQueryDependencies = {
  getGame: () => RuntimeGame;
};

export function createRuntimeQueries({ getGame }: RuntimeQueryDependencies) {
  function getGovernor() {
    return getGame().global.race.governor?.g?.bg ?? "none";
  }

  function haveTask(task: string) {
    return Object.values(getGame().global.race.governor?.tasks ?? {}).includes(
      task,
    );
  }

  function haveTech(research: string, level = 1) {
    const technology = getGame().global.tech[research];
    return technology && technology >= level;
  }

  function isEarlyGame() {
    const race = getGame().global.race;
    if (
      race["cataclysm"] ||
      race["orbit_decayed"] ||
      race["lone_survivor"] ||
      race["warlord"]
    ) {
      return false;
    } else if (race["truepath"] || race["sludge"] || race["ultra_sludge"]) {
      return !haveTech("high_tech", 7);
    } else {
      return !haveTech("mad");
    }
  }

  return { getGovernor, haveTask, haveTech, isEarlyGame };
}
