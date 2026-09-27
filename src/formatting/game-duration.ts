export function formatGameDuration(seconds: number): string {
  if (!Number.isFinite(seconds))
    return seconds === Number.POSITIVE_INFINITY ? "∞" : "Unavailable";
  if (seconds < 0) return "Never";

  const wholeSeconds = Math.round(seconds);
  if (wholeSeconds < 60) return `${wholeSeconds}s`;

  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  if (wholeSeconds < 3600) {
    return remainingSeconds === 0
      ? `${minutes}m`
      : `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(wholeSeconds / 3600);
  const remainingMinutes = minutes % 60;
  if (wholeSeconds < 86400) {
    return remainingMinutes === 0
      ? `${hours}h`
      : `${hours}h ${remainingMinutes}m`;
  }

  const days = Math.floor(wholeSeconds / 86400);
  const remainingHours = hours % 24;
  return remainingHours === 0 ? `${days}d` : `${days}d ${remainingHours}h`;
}
