import type {
  AuthorityPolicyView,
  AuthorityRemovalAssessment,
} from "../domain/civic/authority.ts";
import {
  assessAuthorityRemoval as assessAuthorityRemovalPolicy,
  calculateAuthorityPerSoldier,
  calculateRequiredAuthorityGarrison,
  predictAuthorityAfterRemovingSoldiers,
  resolveAuthorityTarget,
} from "../domain/civic/authority.ts";

type Unavailable = {
  readonly status: "unavailable";
  readonly reason: string;
};
type ViewReadResult =
  | { readonly status: "ready"; readonly view: Readonly<AuthorityPolicyView> }
  | Unavailable;
type QuantityReadResult =
  { readonly status: "ready"; readonly value: number } | Unavailable;
type ReadAuthorityView = (
  game: unknown,
  settings: unknown,
  resources: unknown,
  readHighPopulationPercent: () => unknown,
) => ViewReadResult;
type ReadAuthorityQuantity = (quantity: unknown) => QuantityReadResult;

interface AuthorityPolicyDependencies {
  readonly getGame: () => unknown;
  readonly getSettings: () => unknown;
  readonly getResources: () => unknown;
  readonly readHighPopulationPercent: () => unknown;
  readonly readAuthorityPolicyView: ReadAuthorityView;
  readonly readAuthorityQuantity: ReadAuthorityQuantity;
}

export interface AuthorityPolicy {
  getAuthorityTarget(): number | null | Unavailable;
  getAuthorityPerSoldier(): number | Unavailable;
  getRequiredAuthorityGarrison(
    currentGarrison: unknown,
  ):
    | { readonly status: "ready"; readonly requiredGarrison: number }
    | Unavailable;
  getPredictedAuthorityAfterRemovingSoldiers(
    removedSoldiers: unknown,
  ): number | Unavailable;
  assessAuthorityRemoval(
    removedSoldiers: unknown,
  ): AuthorityRemovalAssessment | Unavailable;
}

export function createAuthorityPolicy({
  getGame,
  getSettings,
  getResources,
  readHighPopulationPercent,
  readAuthorityPolicyView,
  readAuthorityQuantity,
}: AuthorityPolicyDependencies): AuthorityPolicy {
  const readView = () =>
    readAuthorityPolicyView(
      getGame(),
      getSettings(),
      getResources(),
      readHighPopulationPercent,
    );

  function getAuthorityTarget() {
    const view = readView();
    return view.status === "ready"
      ? resolveAuthorityTarget(view.view.target)
      : view;
  }

  function getAuthorityPerSoldier() {
    const view = readView();
    return view.status === "ready"
      ? calculateAuthorityPerSoldier(view.view.modifiers)
      : view;
  }

  function getRequiredAuthorityGarrison(currentGarrison: unknown) {
    const quantity = readAuthorityQuantity(currentGarrison);
    if (quantity.status === "unavailable") return quantity;
    const view = readView();
    return view.status === "ready"
      ? calculateRequiredAuthorityGarrison(view.view, quantity.value)
      : view;
  }

  function getPredictedAuthorityAfterRemovingSoldiers(
    removedSoldiers: unknown,
  ) {
    const quantity = readAuthorityQuantity(removedSoldiers);
    if (quantity.status === "unavailable") return quantity;
    const view = readView();
    return view.status === "ready"
      ? predictAuthorityAfterRemovingSoldiers(view.view, quantity.value)
      : view;
  }

  function assessAuthorityRemoval(removedSoldiers: unknown) {
    const quantity = readAuthorityQuantity(removedSoldiers);
    if (quantity.status === "unavailable") return quantity;
    const view = readView();
    return view.status === "ready"
      ? assessAuthorityRemovalPolicy(view.view, quantity.value)
      : view;
  }

  return {
    getAuthorityTarget,
    getAuthorityPerSoldier,
    getRequiredAuthorityGarrison,
    getPredictedAuthorityAfterRemovingSoldiers,
    assessAuthorityRemoval,
  };
}
