export function createBuildOptions({
  root,
  outfile,
  banner,
  logLevel = "info",
  plugins = [],
  researchConditionGate = false,
}) {
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
      "globalThis.__EA_TEST_SURFACE_ENABLED__": "false",
      __EA_TEST_SURFACE_ENABLED__: "false",
      __EA_RESEARCH_CONDITION_GATE_ENABLED__: String(researchConditionGate),
    },
    minifySyntax: true,
    treeShaking: true,
    plugins,
  };
}
