export function legacyBananaRepublicTrace(
  progress,
  enabled = true,
  bananaRace = true,
) {
  const smoothie =
    progress.smoothie.featStar > 0 ||
    (progress.smoothie.tradeRoutes.some((trade) => trade <= -500) &&
      progress.smoothie.tradeRoutes
        .filter((trade) => trade > 0)
        .reduce((sum, trade) => sum + trade, 0) >= 500);
  const ready =
    ["b1", "b2", "b3", "b4", "b5"].every(
      (objective) => progress.objectives[objective],
    ) && smoothie;
  return {
    objectives: { ...progress.objectives },
    smoothie,
    ready,
    guarded: enabled && bananaRace && !ready,
  };
}
