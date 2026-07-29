export type WomlingStat = "friend" | "god" | "lord";

type WomlingGame = {
  global: {
    stats: {
      womling?: Partial<
        Record<WomlingStat, Record<string, number | undefined>>
      >;
    };
  };
};

type WomlingAchievementDependencies = {
  getGame: () => WomlingGame;
  getPoly: () => { universeAffix: () => string };
};

export function createWomlingAchievements({
  getGame,
  getPoly,
}: WomlingAchievementDependencies) {
  // Whether the Overlord achievement's womling stat has been earned in the
  // current universe. `global.stats.womling` only exists once a run has met the
  // Tau Ceti womlings, and each stat is a count rather than a flag, which is why
  // both the branch and the value are read leniently.
  function womlingStatEarned(stat: WomlingStat): boolean {
    const universe = getPoly().universeAffix();
    return Boolean(getGame().global.stats.womling?.[stat]?.[universe]);
  }

  return { womlingStatEarned };
}
