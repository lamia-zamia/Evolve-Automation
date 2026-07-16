export function legacyAuthorityTarget(view) {
  if (!view.target.manage || view.target.configuredTarget === 0) return null;
  return view.target.configuredTarget < 0
    ? view.target.maximum
    : view.target.configuredTarget;
}

export function legacyAuthorityPerSoldier(view) {
  let authorityPerSoldier =
    (0.7 + 0.1 * view.modifiers.evilTechLevel) *
    (view.modifiers.highPopulationPercent / 100);
  if (view.modifiers.grenadier) authorityPerSoldier *= 1.75;
  if (view.modifiers.governmentType === "autocracy") {
    authorityPerSoldier *= 1.08;
  } else if (view.modifiers.governmentType === "dictator") {
    authorityPerSoldier *= 1.12;
  }
  return authorityPerSoldier;
}

export function legacyRequiredAuthorityGarrison(view, currentGarrison) {
  const target = legacyAuthorityTarget(view);
  if (target === null) return 0;
  const authorityPerSoldier = legacyAuthorityPerSoldier(view);
  if (authorityPerSoldier <= 0) return currentGarrison;
  const nonGarrisonAuthority =
    view.current - currentGarrison * authorityPerSoldier;
  return Math.max(
    0,
    Math.ceil((target - nonGarrisonAuthority) / authorityPerSoldier - 1e-9),
  );
}

export function legacyPredictedAuthority(view, removedSoldiers) {
  return Math.floor(
    view.current - removedSoldiers * legacyAuthorityPerSoldier(view),
  );
}
