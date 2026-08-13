import { createShapeshiftControl } from "./shapeshift-control.ts";
import { createPsychicControl } from "./psychic-control.ts";
import { createOcularPowerControl } from "./ocular-power-control.ts";
import { createWishControl } from "./wish-control.ts";
import { createGeneticsControl } from "./genetics-control.ts";

type ShapeshiftDependencies = Parameters<typeof createShapeshiftControl>[0];
type PsychicDependencies = Parameters<typeof createPsychicControl>[0];
type OcularPowerDependencies = Parameters<typeof createOcularPowerControl>[0];
type WishDependencies = Parameters<typeof createWishControl>[0];
type GeneticsDependencies = Parameters<typeof createGeneticsControl>[0];

interface TraitAutomationControlDependencies {
  readonly shapeshift: ShapeshiftDependencies;
  readonly psychic: PsychicDependencies;
  readonly ocularPower: OcularPowerDependencies;
  readonly wish: WishDependencies;
  readonly genetics: GeneticsDependencies;
}

// Composition seam for the trait controls that share the initial automation
// surface. Their browser effects stay inside the individual controls and the
// returned entries retain the runtime's existing tick capabilities.
export function createTraitAutomationControls({
  shapeshift,
  psychic,
  ocularPower,
  wish,
  genetics,
}: TraitAutomationControlDependencies) {
  const shapeshiftControl = createShapeshiftControl(shapeshift);
  const psychicControl = createPsychicControl(psychic);
  const ocularPowerControl = createOcularPowerControl(ocularPower);
  const wishControl = createWishControl(wish);
  const geneticsControl = createGeneticsControl(genetics);

  return Object.freeze({
    ...shapeshiftControl,
    ...psychicControl,
    ...ocularPowerControl,
    ...wishControl,
    ...geneticsControl,
  });
}
