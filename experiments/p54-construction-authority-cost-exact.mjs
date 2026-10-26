process.argv.push(
  "--p42-construction-priority-counterfactual",
  "--p51-construction-jobs-handoff",
  "--p52-independent-construction-jobs-identity",
  "--p53-construction-owned-target-authority",
  "--p54-construction-authority-cost",
);

await import("./p38-quarry-production-validation-exact.mjs");
