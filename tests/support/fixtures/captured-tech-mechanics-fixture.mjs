const UNUSED_TEST_TECH_ID = "tech-test-fixture-unused";

export function makeCapturedTechMechanicsFixture(actionIds = []) {
  const ids = [...new Set(actionIds)];
  if (ids.length === 0) ids.push(UNUSED_TEST_TECH_ID);
  const definitions = Object.freeze(
    ids.map((actionId) => {
      const registryKey = actionId.slice("tech-".length);
      return Object.freeze({
        registryKey,
        actionId,
        grantTechnology: registryKey,
        grantLevel: 1,
      });
    }),
  );
  return Object.freeze({
    captureTechDefinitionsDuring: (draw) => draw(),
    readTechDefinitions: () => definitions,
    withTechQueueCostAlias: (actionId, readProbeCost) =>
      definitions.filter((definition) => definition.actionId === actionId)
        .length === 1
        ? readProbeCost("tech-__ea_research_cost_probe__")
        : undefined,
  });
}

export function makeCapturedTechBindingFixture(controls) {
  return (listener) => {
    for (const elementId of controls?.capturedElementIds?.() ?? []) {
      if (elementId.startsWith("tech-")) listener(elementId, Object.freeze({}));
    }
    return () => {};
  };
}

export function withCapturedTechMechanicsFixture(pageCapture, actionIds = []) {
  return Object.freeze({
    ...pageCapture,
    // Older runtime fixtures model captured controls without installing the page's Vue hook. Their
    // currently captured technology controls stand in for that page capture; Research binding
    // behavior itself is exercised through installVueCapture in captured-tech-catalog-test.mjs.
    bindings:
      pageCapture.bindings ??
      makeCapturedTechBindingFixture(pageCapture.controls),
    mechanics: Object.freeze({
      ...pageCapture.mechanics,
      ...makeCapturedTechMechanicsFixture(actionIds),
    }),
  });
}
