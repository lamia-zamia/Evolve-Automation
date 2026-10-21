export function allocationDenialReason({
  targetAlreadyAuthorized,
  episodeCount,
  maxEpisodes,
  totalClicks,
  maxTotalClicks,
}) {
  if (targetAlreadyAuthorized) return "same-target-already-authorized";
  if (episodeCount >= maxEpisodes || totalClicks >= maxTotalClicks)
    return "episode-or-total-budget-exhausted";
  return undefined;
}

export function allocationClickBudget({
  episodeClicks,
  maxEpisodeClicks,
  totalClicks,
  maxTotalClicks,
}) {
  const remaining = Math.min(
    maxEpisodeClicks - episodeClicks,
    maxTotalClicks - totalClicks,
  );
  return remaining > 0 ? Math.min(5, remaining) : 0;
}
