// Runs the retained P38 exact Chromium replay with P40's test-only gate tracing enabled.
process.argv.push("--p40-construction-trace");
await import("./p38-quarry-production-validation-exact.mjs");
