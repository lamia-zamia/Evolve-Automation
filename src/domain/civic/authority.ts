export interface AuthorityTargetInput {
  readonly manage: boolean;
  readonly configuredTarget: number;
  readonly maximum: number;
}

export interface AuthorityModifiers {
  readonly evilTechLevel: number;
  readonly highPopulationPercent: number;
  readonly grenadier: boolean;
  readonly governmentType: string;
}

export interface AuthorityPolicyView {
  readonly target: Readonly<AuthorityTargetInput>;
  readonly current: number;
  readonly modifiers: Readonly<AuthorityModifiers>;
}

export type AuthorityRemovalAssessment =
  | { readonly status: "unmanaged" }
  | {
      readonly status: "ready";
      readonly target: number;
      readonly predicted: number;
      readonly blocksRemoval: boolean;
    };

export interface AuthorityGarrisonRequirement {
  readonly status: "ready";
  readonly requiredGarrison: number;
}

export function resolveAuthorityTarget(
  input: Readonly<AuthorityTargetInput>,
): number | null {
  if (!input.manage || input.configuredTarget === 0) return null;
  return input.configuredTarget < 0 ? input.maximum : input.configuredTarget;
}

export function calculateAuthorityPerSoldier(
  modifiers: Readonly<AuthorityModifiers>,
): number {
  let authorityPerSoldier =
    (0.7 + 0.1 * modifiers.evilTechLevel) *
    (modifiers.highPopulationPercent / 100);
  if (modifiers.grenadier) authorityPerSoldier *= 1.75;
  if (modifiers.governmentType === "autocracy") {
    authorityPerSoldier *= 1.08;
  } else if (modifiers.governmentType === "dictator") {
    authorityPerSoldier *= 1.12;
  }
  return authorityPerSoldier;
}

export function calculateRequiredAuthorityGarrison(
  view: Readonly<AuthorityPolicyView>,
  currentGarrison: number,
): AuthorityGarrisonRequirement {
  const target = resolveAuthorityTarget(view.target);
  if (target === null) {
    return Object.freeze({ status: "ready", requiredGarrison: 0 });
  }

  const authorityPerSoldier = calculateAuthorityPerSoldier(view.modifiers);
  if (authorityPerSoldier <= 0) {
    return Object.freeze({
      status: "ready",
      requiredGarrison: currentGarrison,
    });
  }
  const nonGarrisonAuthority =
    view.current - currentGarrison * authorityPerSoldier;
  return Object.freeze({
    status: "ready",
    requiredGarrison: Math.max(
      0,
      Math.ceil((target - nonGarrisonAuthority) / authorityPerSoldier - 1e-9),
    ),
  });
}

export function predictAuthorityAfterRemovingSoldiers(
  view: Readonly<AuthorityPolicyView>,
  removedSoldiers: number,
): number {
  return Math.floor(
    view.current -
      removedSoldiers * calculateAuthorityPerSoldier(view.modifiers),
  );
}

export function assessAuthorityRemoval(
  view: Readonly<AuthorityPolicyView>,
  removedSoldiers: number,
): AuthorityRemovalAssessment {
  const target = resolveAuthorityTarget(view.target);
  if (target === null) return Object.freeze({ status: "unmanaged" });
  const predicted = predictAuthorityAfterRemovingSoldiers(
    view,
    removedSoldiers,
  );
  return Object.freeze({
    status: "ready",
    target,
    predicted,
    blocksRemoval: predicted < target,
  });
}
