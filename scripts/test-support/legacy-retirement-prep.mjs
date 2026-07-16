// Exact copy of the pre-migration run-guards retirement arithmetic and string
// formatting, expressed over the same immutable inputs the domain policy and
// presentation layer consume. Used only to prove old-versus-new equivalence.

export function legacyRetirementAssistActive(input) {
  return Boolean(
    input.assistEnabled &&
    input.truepath &&
    input.retirePrestige &&
    !input.isolationResearched,
  );
}

export function legacyRetirementPreparationMissing(input, getNumberString) {
  const { thresholds } = input;
  const missing = [];
  if (input.fusionGenerators.count < thresholds.fusionGenerators) {
    missing.push(
      `${input.fusionGenerators.name} ${input.fusionGenerators.count}/${thresholds.fusionGenerators}`,
    );
  }
  if (input.factories.count < thresholds.factories) {
    missing.push(
      `${input.factories.name} ${input.factories.count}/${thresholds.factories}`,
    );
  }
  if (input.scienceLabs.count < thresholds.scienceLabs) {
    missing.push(
      `${input.scienceLabs.name} ${input.scienceLabs.count}/${thresholds.scienceLabs}`,
    );
  }
  if (input.graphene.maxQuantity < thresholds.graphene) {
    missing.push(
      `${input.graphene.name} storage ${getNumberString(input.graphene.maxQuantity)}/${getNumberString(thresholds.graphene)}`,
    );
  } else if (input.graphene.currentQuantity < thresholds.graphene) {
    missing.push(
      `${input.graphene.name} stockpile ${getNumberString(input.graphene.currentQuantity)}/${getNumberString(thresholds.graphene)}`,
    );
  }
  return missing;
}
