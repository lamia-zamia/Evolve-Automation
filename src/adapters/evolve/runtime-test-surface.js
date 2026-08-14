/**
 * Characterization-only runtime surface. This module is imported by the test
 * bundle entry, never by the production userscript entry.
 */
export function createRuntimeTestSurface() {
  const contexts = new Map();
  const parts = [];

  return {
    add(part) {
      parts.push(part);
    },
    addContext(name, part, publicName = name) {
      const setterName = `set${publicName[0].toUpperCase()}${publicName.slice(1)}TestContext`;
      parts.push({
        ...part,
        [setterName]: (context) => contexts.set(name, context),
      });
    },
    getContext(name) {
      return contexts.get(name);
    },
    setContext(name, context) {
      contexts.set(name, context);
    },
    finish() {
      return Object.assign({}, ...parts);
    },
  };
}

export function registerRuntimeSupportTestSurface(testSurface, registration) {
  if (!testSurface) return;

  for (const part of registration.parts ?? []) testSurface.add(part);
  for (const [name, part, publicName] of registration.contexts ?? [])
    testSurface.addContext(name, part, publicName);

  const {
    finalInlineUiBoundaries,
    sorterHelper,
    gameRates,
    getCostConflict,
    numberFormatting,
    runtimeQueries,
    raceProfile,
    foreignGovernment,
    fastEvaluator,
    propertyHelpers,
    browserRuntime,
    traitVal,
    settingsTransfer,
    gameCompatibility,
    setters,
  } = registration;

  testSurface.add({
    finalInlineUiBoundaries,
    setFinalInlineUiBoundariesTestContext: setters.finalInlineUiBoundaries,
  });
  testSurface.add({ sorterHelper });
  testSurface.add({
    gameRates,
    setGameRateTestContext: setters.gameRates,
  });
  testSurface.add({
    getCostConflict,
    setCostConflictTestContext: setters.costConflict,
  });
  testSurface.add({ numberFormatting });
  testSurface.add({
    runtimeQueries,
    setRuntimeQueryTestContext: setters.runtimeQueries,
  });
  testSurface.add({
    raceProfile,
    setRaceProfileTestContext: setters.raceProfile,
  });
  testSurface.add({
    foreignGovernment,
    setForeignGovernmentTestContext: setters.foreignGovernment,
  });
  testSurface.add({
    fastEvaluator,
    setFastEvaluatorTestContext: setters.fastEvaluator,
  });
  testSurface.add({
    propertyHelpers,
    setPropertyHelperTestContext: setters.propertyHelpers,
  });
  testSurface.add({
    browserRuntime,
    setBrowserRuntimeTestContext: setters.browserRuntime,
  });
  testSurface.add({
    traitVal,
    setTraitValueTestContext: setters.traitVal,
  });
  testSurface.add({
    settingsTransfer,
    setSettingsTransferTestContext: setters.settingsTransfer,
  });
  testSurface.add({ gameCompatibility });
}
