import { createBuildingWeightingDecider } from "../domain/progression/build/building-weighting-decision.ts";
import { createBuildingWeightingPolicy } from "../domain/progression/build/building-weighting-rules.ts";
import { createBuildingWeightingDescriber } from "../ui/building-weighting-description.ts";

type PolicyDependencies = Parameters<typeof createBuildingWeightingPolicy>[0];

export interface BuildingWeightingControlDependencies {
  readonly formatNumber: PolicyDependencies["formatNumber"];
  readonly formatNiceNumber: PolicyDependencies["formatNiceNumber"];
  readonly nextRandomUnit: PolicyDependencies["nextRandomUnit"];
}

export function createBuildingWeightingControl({
  formatNumber,
  formatNiceNumber,
  nextRandomUnit,
}: BuildingWeightingControlDependencies) {
  const policy = createBuildingWeightingPolicy({
    formatNumber,
    formatNiceNumber,
    nextRandomUnit,
  });
  const buildingWeightingDescriber = createBuildingWeightingDescriber({
    formatNiceNumber,
  });
  const buildingWeightingDecider = createBuildingWeightingDecider({
    weightingRules: policy.weightingRules,
  });

  return Object.freeze({
    ...policy,
    buildingWeightingDescriber,
    buildingWeightingDecider,
  });
}
