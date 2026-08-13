import { createMinorTraitControl } from "./minor-trait-control.ts";
import { createMutationControl } from "./mutation-control.ts";

type MinorTraitDependencies = Parameters<typeof createMinorTraitControl>[0];
type MutationDependencies = Parameters<typeof createMutationControl>[0];

interface TraitResourceControlDependencies {
  readonly minorTrait: MinorTraitDependencies;
  readonly mutation: MutationDependencies;
}

// Composition seam for the resource-backed trait controls. Their mutable game
// managers stay behind the individual adapters, while the returned entries keep
// their existing tick positions and characterization ownership.
export function createTraitResourceControls({
  minorTrait,
  mutation,
}: TraitResourceControlDependencies) {
  const minorTraitControl = createMinorTraitControl(minorTrait);
  const mutationControl = createMutationControl(mutation);

  return Object.freeze({
    ...minorTraitControl,
    ...mutationControl,
  });
}
