// Exact copy of the pre-migration checkEvolutionResult decision logic (the pure
// part only — logging, DOM reset, and queue rotation stay at the caller), expressed
// over the same immutable input the domain policy consumes. The legacy code emitted
// strings directly; here it emits the same structured events the migrated formatter
// renders, so the comparison is against decision content and ordering.

const INTENTIONAL_SPECIES = ["junker", "sludge", "ultra_sludge", "hellspawn"];

export function legacyDecideEvolutionResult(input) {
  const logs = [];
  let needReset = false;

  if (
    input.autoEvolution &&
    input.evolutionBackup &&
    !INTENTIONAL_SPECIES.includes(input.species)
  ) {
    if (input.userEvolutionTarget === "auto") {
      if (input.speciesRace.weighting <= 0) {
        if (input.bestWeighting > 0) {
          logs.push({
            level: "danger",
            code: "backup-no-achievements",
            raceName: input.speciesRace.name,
          });
          needReset = true;
        } else {
          logs.push({
            level: "warning",
            code: "backup-no-race",
            raceName: input.speciesRace.name,
          });
        }
      }
    } else if (
      input.userEvolutionTarget !== input.species &&
      (input.targetHabitability ?? 0) > 0
    ) {
      logs.push({ level: "danger", code: "wrong-race" });
      needReset = true;
    }
  }

  if (input.autoMutateTraits) {
    for (const trait of input.traits) {
      if (trait.resetEnabled && trait.gained && !trait.inheritedFromBase) {
        logs.push({
          level: "danger",
          code: "gained-trait",
          traitName: trait.name,
        });
        needReset = true;
        break;
      }
    }
  }

  if (
    !needReset &&
    input.autoEvolution &&
    input.userEvolutionTarget === "auto"
  ) {
    logs.push(
      input.speciesRace.goals.length > 0
        ? { level: "info", code: "auto-goals", goals: input.speciesRace.goals }
        : { level: "info", code: "auto-goals-none" },
    );
  }

  return { logs, needReset };
}
