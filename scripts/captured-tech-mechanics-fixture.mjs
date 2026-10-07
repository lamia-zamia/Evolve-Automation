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
  });
}

export function withCapturedTechMechanicsFixture(pageCapture, actionIds = []) {
  return Object.freeze({
    ...pageCapture,
    mechanics: Object.freeze({
      ...pageCapture.mechanics,
      ...makeCapturedTechMechanicsFixture(actionIds),
    }),
  });
}
