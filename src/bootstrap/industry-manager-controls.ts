import { createTraitManagers } from "../game/trait-managers.ts";
import { createIndustryManagers } from "../game/industry-managers.ts";
import { createDisposalManagers } from "../game/disposal-managers.ts";
import { createMagicManagers } from "../game/magic-managers.ts";
import { createProductionManagers } from "../game/production-managers.ts";

type TraitDependencies = Parameters<typeof createTraitManagers>[0];
type IndustryDependencies = Parameters<typeof createIndustryManagers>[0];
type DisposalDependencies = Parameters<typeof createDisposalManagers>[0];
type MagicDependencies = Parameters<typeof createMagicManagers>[0];
type ProductionDependencies = Parameters<typeof createProductionManagers>[0];

interface IndustryManagerControlDependencies {
  readonly trait: TraitDependencies;
  readonly industry: IndustryDependencies;
  readonly disposal: DisposalDependencies;
  readonly magic: MagicDependencies;
  readonly production: ProductionDependencies;
}

// Composition seam for the manager family that backs industry and trait
// automation. Construction order is explicit because later managers consume
// controls produced by earlier manager families; no registry or lookup map is
// introduced.
export function createIndustryManagerControls({
  trait,
  industry,
  disposal,
  magic,
  production,
}: IndustryManagerControlDependencies) {
  const traitManagers = createTraitManagers(trait);
  const industryManagers = createIndustryManagers(industry);
  const disposalManagers = createDisposalManagers(disposal);
  const magicManagers = createMagicManagers(magic);
  const productionManagers = createProductionManagers(production);

  return Object.freeze({
    ...traitManagers,
    ...industryManagers,
    ...disposalManagers,
    ...magicManagers,
    ...productionManagers,
  });
}
