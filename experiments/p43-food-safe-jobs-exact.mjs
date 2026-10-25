// Runs three fresh P42 Construction-priority Chromium replays with a test-only Jobs-boundary
// Food-sustainability diagnostic in B and B-repeat.
process.argv.push(
  "--p40-construction-trace",
  "--p42-construction-priority-counterfactual",
  "--p43-food-safe-jobs",
);
await import("./p38-quarry-production-validation-exact.mjs");
