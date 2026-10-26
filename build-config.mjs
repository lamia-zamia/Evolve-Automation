export function createBuildOptions({
  root,
  outfile,
  banner,
  logLevel = "info",
  plugins = [],
  researchConditionGate = false,
  testSurface = false,
  p53Surface = false,
  p54Surface = false,
}) {
  if (p54Surface && !p53Surface)
    throw new Error(
      "P54 activation requires the P53 test-only authority surface",
    );
  return {
    absWorkingDir: root,
    entryPoints: ["src/main.ts"],
    outfile,
    bundle: true,
    banner,
    charset: "utf8",
    format: "iife",
    legalComments: "inline",
    logLevel,
    platform: "browser",
    target: ["esnext"],
    define: {
      "globalThis.__EA_TEST_SURFACE_ENABLED__": String(testSurface),
      "globalThis.__EA_P53_CONSTRUCTION_AUTHORITY_ENABLED__":
        String(p53Surface),
      "globalThis.__EA_P54_CONSTRUCTION_ACTIVATION_ENABLED__":
        String(p54Surface),
      __EA_TEST_SURFACE_ENABLED__: String(testSurface),
      __EA_RESEARCH_CONDITION_GATE_ENABLED__: String(researchConditionGate),
    },
    minifySyntax: true,
    treeShaking: true,
    plugins,
  };
}
