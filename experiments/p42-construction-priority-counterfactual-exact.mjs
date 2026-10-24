// Runs the retained P38 exact Chromium replay with P42's one-cycle,
// test-only Construction reservation substitution.
process.argv.push(
  "--p40-construction-trace",
  "--p42-construction-priority-counterfactual",
);
await import("./p38-quarry-production-validation-exact.mjs");
