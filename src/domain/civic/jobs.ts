export type JobKind =
  | "farmer"
  | "hunter"
  | "lumberjack"
  | "quarry-worker"
  | "crystal-miner"
  | "scavenger"
  | "forager"
  | "miner"
  | "space-miner"
  | "entertainer"
  | "other";

export interface JobsJobInput {
  readonly token: number;
  readonly id: string;
  readonly kind: JobKind;
  readonly workers: number;
  readonly servants: number;
  readonly count: number;
  readonly maximum: number;
  readonly managed: boolean;
  readonly unlocked: boolean;
  readonly smart: boolean;
  readonly crafting: boolean;
  readonly serves: boolean;
  readonly split: boolean;
  readonly isDefault: boolean;
  readonly breakpoints: readonly [number, number, number];
  readonly uncappedBreakpoints: readonly [number, number, number];
  readonly smartMaximum: number | null;
  readonly farmerMinimum: number | null;
  readonly demonicLumber: boolean;
  readonly warlordMiner: boolean;
}

export interface JobsCraftInput {
  readonly jobToken: number;
  readonly enabled: boolean;
  readonly buildingCapacity: number | null;
  readonly affordability: number;
  readonly demanded: boolean;
  readonly useful: boolean;
  readonly currentQuantity: number;
  readonly weighting: number;
  readonly driver: string | null;
  readonly exclusion: string | null;
}

export interface JobsAuthorityInput {
  readonly enabled: boolean;
  readonly current: number;
  readonly morale: number;
  readonly moralePotential: number;
  readonly moraleMaximum: number;
  readonly moraleCeiling: number | null;
  readonly entertainerMorale: number;
  readonly superstarMorale: number;
  readonly previousCap: number | null;
  readonly debug: boolean;
}

export interface JobsCycleInput {
  readonly available: boolean;
  readonly craftOnly: boolean;
  /** In Carnivore/Soul Eater/Unfathomable runs, Hunter is the game's unemployed pool. */
  readonly hunterActsAsUnemployed: boolean;
  readonly autoCraftsmen: boolean;
  readonly autoCraftWithoutBuilding: boolean;
  readonly craftsmenMode: "always" | "nocraft" | "servants" | "other";
  readonly foundryWeighting: "buildings" | "demanded" | "other";
  readonly manageServants: boolean;
  readonly setDefault: boolean;
  readonly servantModifier: number;
  readonly servantsMaximum: number;
  readonly skilledServantsMaximum: number;
  readonly craftsmenMaximum: number;
  readonly minimumDefault: number;
  readonly reserveMiner: boolean;
  readonly defaultJobToken: number | null;
  readonly hunterToken: number | null;
  readonly farmerToken: number | null;
  readonly lumberjackToken: number | null;
  readonly quarryToken: number | null;
  readonly crystalMinerToken: number | null;
  readonly scavengerToken: number | null;
  readonly foragerToken: number | null;
  readonly entertainerToken: number | null;
  readonly minerToken: number | null;
  readonly population: number;
  readonly craftDebug: boolean;
  readonly lastCraftWinner: string | null;
  readonly authority: Readonly<JobsAuthorityInput>;
  readonly jobs: readonly Readonly<JobsJobInput>[];
  readonly crafting: readonly Readonly<JobsCraftInput>[];
  readonly splitEntries: readonly Readonly<JobsSplitInput>[];
  readonly defaultPreference: readonly Readonly<JobsDefaultCandidate>[];
}

export interface JobsSplitInput {
  readonly jobToken: number;
  readonly weighting: number;
  readonly breakpoints: readonly [number, number, number];
}

export interface JobsDefaultCandidate {
  readonly jobToken: number;
  readonly allocationToken: number | null;
  readonly requirement: "managed-with-workers" | "managed" | "unlocked";
  readonly managed: boolean;
  readonly unlocked: boolean;
}

export interface JobsAssignment {
  readonly jobToken: number;
  readonly workers: number;
  readonly servants: number;
}

export interface JobsDecision {
  readonly kind: "assign-jobs";
  readonly assignments: readonly Readonly<JobsAssignment>[];
  readonly selectedDefaultToken: number | null;
  readonly moraleIncomeAdjusted: boolean;
  readonly ironIncomeAdjusted: boolean;
  readonly maximumSpaceMiners: number;
  readonly lastPopulationCount: number;
  readonly lastFarmerCount: number;
  readonly authorityEntertainerCap: number | null;
  readonly clearAuthorityEntertainerCap: boolean;
  readonly craftWinner: string | null;
  readonly craftDebugMessage: string | null;
  readonly authorityDebugMessage: string | null;
}

interface CraftPlan {
  readonly workers: ReadonlyMap<number, number>;
  readonly servants: ReadonlyMap<number, number>;
  readonly availableWorkers: number;
  readonly availableCraftsmen: number;
  readonly craftWinner: string | null;
  readonly debugMessage: string | null;
}

function createJobIndex(
  input: Readonly<JobsCycleInput>,
): ReadonlyMap<number, number> {
  const index = new Map<number, number>();
  for (let position = 0; position < input.jobs.length; position++) {
    const token = input.jobs[position]!.token;
    // Preserve findIndex's first-match behavior if malformed input repeats a token.
    if (!index.has(token)) {
      index.set(token, position);
    }
  }
  return index;
}

function indexOfToken(
  index: ReadonlyMap<number, number>,
  token: number | null,
): number {
  return token === null ? -1 : (index.get(token) ?? -1);
}

function craftPlan(
  input: Readonly<JobsCycleInput>,
  initialWorkers: number,
  initialCraftsmen: number,
  jobIndex: ReadonlyMap<number, number>,
): CraftPlan {
  const workers = new Map<number, number>();
  const servants = new Map<number, number>();
  let availableWorkers = initialWorkers;
  let availableCraftsmen = initialCraftsmen;
  let totalCraftsmen =
    availableCraftsmen + input.skilledServantsMaximum * input.servantModifier;
  const available: Readonly<JobsCraftInput>[] = [];
  const excluded: string[] = [];

  if (!input.autoCraftsmen) {
    return {
      workers,
      servants,
      availableWorkers,
      availableCraftsmen,
      craftWinner: null,
      debugMessage: null,
    };
  }

  for (const craft of input.crafting) {
    if (!craft.enabled) continue;
    if (craft.buildingCapacity === null && !input.autoCraftWithoutBuilding) {
      if (input.skilledServantsMaximum === 0) break;
      availableWorkers += availableCraftsmen;
      totalCraftsmen -= availableCraftsmen;
      availableCraftsmen = 0;
    }
    const affordableAmount = Math.min(totalCraftsmen, craft.affordability);
    if (craft.exclusion !== null) excluded.push(craft.exclusion);
    if (craft.buildingCapacity !== null) {
      if (input.craftsmenMode === "servants") continue;
      if (affordableAmount >= craft.buildingCapacity) {
        workers.set(craft.jobToken, craft.buildingCapacity);
        availableCraftsmen -= craft.buildingCapacity;
        totalCraftsmen -= craft.buildingCapacity;
      }
    } else if (affordableAmount >= totalCraftsmen) {
      available.push(craft);
    } else if (input.craftDebug && affordableAmount > 0) {
      const job = input.jobs[indexOfToken(jobIndex, craft.jobToken)]!;
      excluded.push(
        `${job.id}(inputs:${affordableAmount.toFixed(1)}<${totalCraftsmen})`,
      );
    }
  }

  let filtered = available;
  let filter = "";
  const demanded = filtered.filter((craft) => craft.demanded);
  if (demanded.length > 0) {
    filtered = demanded;
    filter = "demanded";
  } else if (input.foundryWeighting === "demanded") {
    const useful = filtered.filter((craft) => craft.useful);
    if (useful.length > 0) {
      filtered = useful;
      filter = "useful";
    }
  }
  filtered = [...filtered].sort(
    (left, right) =>
      left.currentQuantity / left.weighting -
      right.currentQuantity / right.weighting,
  );
  const shareWorkers = new Map<number, number>();
  const shareServants = new Map<number, number>();
  if (filtered.length > 0) {
    const winnerKey = filtered[0]!.currentQuantity / filtered[0]!.weighting;
    const group = Number.isFinite(winnerKey)
      ? filtered.filter(
          (craft) => craft.currentQuantity / craft.weighting <= winnerKey * 1.1,
        )
      : [filtered[0]!];
    let remainingWorkers = availableCraftsmen;
    let remainingServants = input.skilledServantsMaximum;
    let remainingWeight = group.reduce(
      (sum, craft) => sum + craft.weighting,
      0,
    );
    for (const craft of group) {
      const share = remainingWeight > 0 ? craft.weighting / remainingWeight : 1;
      const workerShare = Math.round(remainingWorkers * share);
      const servantShare = Math.round(remainingServants * share);
      shareWorkers.set(craft.jobToken, workerShare);
      shareServants.set(craft.jobToken, servantShare);
      remainingWorkers -= workerShare;
      remainingServants -= servantShare;
      remainingWeight -= craft.weighting;
    }
  }
  for (const craft of input.crafting) {
    if (craft.buildingCapacity !== null) continue;
    workers.set(craft.jobToken, shareWorkers.get(craft.jobToken) ?? 0);
    servants.set(craft.jobToken, shareServants.get(craft.jobToken) ?? 0);
  }
  if (filtered.length === 0) availableWorkers += availableCraftsmen;

  const focus =
    [...shareWorkers.keys()]
      .map((token) => input.jobs[indexOfToken(jobIndex, token)]!.id)
      .join("+") || "none";
  let debugMessage: string | null = null;
  if (input.craftDebug && input.lastCraftWinner !== focus) {
    const detail = filtered
      .map((craft) => {
        const job = input.jobs[indexOfToken(jobIndex, craft.jobToken)]!;
        const assigned =
          `→${shareWorkers.get(craft.jobToken) ?? 0}` +
          (input.skilledServantsMaximum > 0
            ? `+${shareServants.get(craft.jobToken) ?? 0}s`
            : "");
        const key = (craft.currentQuantity / craft.weighting).toFixed(1);
        return input.foundryWeighting === "buildings"
          ? `${job.id} q=${craft.currentQuantity.toFixed(0)} key=${key} (${craft.driver ?? "no building"})${assigned}`
          : `${job.id} q=${craft.currentQuantity.toFixed(0)} key=${key}${assigned}`;
      })
      .join("; ");
    debugMessage =
      `[craft] focus ${input.lastCraftWinner ?? "none"}⇒${focus}` +
      (filter ? ` filter=${filter}` : "") +
      ` | ${detail}` +
      (excluded.length > 0 ? ` | excluded: ${excluded.join(", ")}` : "");
  }
  return {
    workers,
    servants,
    availableWorkers,
    availableCraftsmen,
    craftWinner: input.craftDebug ? focus : null,
    debugMessage,
  };
}

function authorityMaximum(
  input: Readonly<JobsCycleInput>,
  jobIndex: ReadonlyMap<number, number>,
): {
  readonly cap: number;
  readonly storedCap: number | null;
  readonly debug: string | null;
} {
  const authority = input.authority;
  if (!authority.enabled) {
    return { cap: Number.MAX_SAFE_INTEGER, storedCap: null, debug: null };
  }
  let storedCap = authority.previousCap;
  let debug: string | null = null;
  const entertainerIndex = indexOfToken(jobIndex, input.entertainerToken);
  const entertainer = input.jobs[entertainerIndex];
  if (authority.moraleCeiling !== null && entertainer !== undefined) {
    const limits: number[] = [];
    if (authority.entertainerMorale > 0) {
      const without =
        authority.moralePotential -
        entertainer.count * authority.entertainerMorale;
      limits.push(
        Math.floor(
          (authority.moraleCeiling - without + 1e-9) /
            authority.entertainerMorale,
        ),
      );
    }
    if (authority.superstarMorale > 0) {
      const without =
        authority.moraleMaximum - entertainer.count * authority.superstarMorale;
      limits.push(
        Math.floor(
          (authority.moraleCeiling - without + 1e-9) /
            authority.superstarMorale,
        ),
      );
    }
    const calculated =
      limits.length === 0 ? entertainer.count : Math.max(0, ...limits);
    storedCap =
      authority.current < 100 && authority.previousCap !== null
        ? Math.min(authority.previousCap, calculated)
        : calculated;
    if (authority.debug && storedCap !== authority.previousCap) {
      debug =
        `[authority] entertainers cap ${authority.previousCap ?? entertainer.count}→${storedCap}` +
        ` (amount=${authority.current.toFixed(1)}, morale=${authority.morale.toFixed(1)}` +
        `→max=${authority.moraleCeiling.toFixed(1)})`;
    }
  }
  return {
    cap: storedCap ?? Number.MAX_SAFE_INTEGER,
    storedCap,
    debug,
  };
}

export function planJobs(
  input: Readonly<JobsCycleInput>,
): Readonly<JobsDecision> | null {
  if (!input.available || input.jobs.length === 0) return null;
  const jobIndex = createJobIndex(input);
  const requiredWorkers = input.jobs.map(() => 0);
  const requiredServants = input.jobs.map(() => 0);
  let availableWorkers = input.jobs.reduce((sum, job) => sum + job.workers, 0);
  let availableServants = input.manageServants ? input.servantsMaximum : 0;
  let availableCraftsmen = input.craftsmenMaximum;
  const farmerIndex = indexOfToken(jobIndex, input.farmerToken);
  const hunterIndex = indexOfToken(jobIndex, input.hunterToken);
  const defaultIndex = indexOfToken(jobIndex, input.defaultJobToken);

  if (input.craftOnly) {
    availableCraftsmen = availableWorkers;
    availableWorkers = 0;
    availableServants = 0;
  } else if (
    input.autoCraftsmen &&
    availableWorkers >= availableCraftsmen * (farmerIndex === -1 ? 1 : 2)
  ) {
    availableWorkers -= availableCraftsmen;
  } else {
    availableCraftsmen = 0;
  }

  const craft = craftPlan(
    input,
    availableWorkers,
    availableCraftsmen,
    jobIndex,
  );
  availableWorkers = craft.availableWorkers;
  for (const [token, count] of craft.workers) {
    const index = indexOfToken(jobIndex, token);
    if (index !== -1) requiredWorkers[index] = count;
  }
  for (const [token, count] of craft.servants) {
    const index = indexOfToken(jobIndex, token);
    if (index !== -1) requiredServants[index] = count;
  }

  const minerIndex = indexOfToken(jobIndex, input.minerToken);
  if (
    input.reserveMiner &&
    availableWorkers > 1 &&
    minerIndex !== -1 &&
    input.jobs[minerIndex]!.smart
  ) {
    requiredWorkers[minerIndex] = 1;
    availableWorkers--;
  }

  const authority = authorityMaximum(input, jobIndex);
  let minimumFarmers = 0;
  let maximumSpaceMiners = 0;
  const jobMaximums = input.jobs.map((job) => job.smartMaximum);
  for (let pass = 0; pass < 3; pass++) {
    for (let index = 0; index < input.jobs.length; index++) {
      const job = input.jobs[index]!;
      if (
        (pass === 2 && job.split) ||
        job.crafting ||
        (input.hunterActsAsUnemployed && index === hunterIndex)
      )
        continue;
      availableWorkers += requiredWorkers[index]!;
      let currentEmployees = requiredWorkers[index]!;
      let availableEmployees = availableWorkers;
      requiredWorkers[index] = 0;
      if (job.serves) {
        currentEmployees += requiredServants[index]! * input.servantModifier;
        availableServants += requiredServants[index]!;
        availableEmployees += availableServants * input.servantModifier;
        requiredServants[index] = 0;
      }
      let jobsToAssign = Math.min(
        availableEmployees,
        Math.max(currentEmployees, job.breakpoints[pass]!),
      );
      if (job.smart) {
        if (job.kind === "farmer" || job.kind === "hunter") {
          const maximum = jobMaximums[index] ?? Number.MAX_SAFE_INTEGER;
          minimumFarmers = job.farmerMinimum ?? maximum;
          if (job.demonicLumber) {
            const lumberIndex = indexOfToken(jobIndex, input.lumberjackToken);
            const lumberBreakpoint =
              lumberIndex === -1
                ? 0
                : input.jobs[lumberIndex]!.breakpoints[pass]!;
            jobsToAssign = Math.min(
              availableEmployees,
              Math.max(
                currentEmployees,
                minimumFarmers,
                Math.min(maximum, lumberBreakpoint),
              ),
            );
          } else {
            jobsToAssign = Math.min(jobsToAssign, minimumFarmers);
          }
        } else if (job.warlordMiner) {
          jobsToAssign = job.maximum;
        } else if (jobMaximums[index] !== null) {
          jobsToAssign = Math.min(jobsToAssign, jobMaximums[index]!);
        }
        if (job.kind === "space-miner") {
          maximumSpaceMiners = Math.max(
            maximumSpaceMiners,
            Math.min(availableEmployees, job.uncappedBreakpoints[pass]!),
          );
        }
      }
      if (job.kind === "entertainer") {
        jobsToAssign = Math.min(jobsToAssign, authority.cap);
      }
      if (index === defaultIndex && input.minimumDefault > 0) {
        requiredWorkers[index] =
          requiredWorkers[index]! +
          Math.min(availableWorkers, input.minimumDefault);
        availableWorkers -= requiredWorkers[index]!;
        jobsToAssign -= requiredWorkers[index]!;
      }
      if (jobsToAssign > 0 && job.serves) {
        const servants = Math.min(
          availableServants,
          Math.floor(jobsToAssign / input.servantModifier),
        );
        requiredServants[index] = requiredServants[index]! + servants;
        availableServants -= servants;
        jobsToAssign -= servants * input.servantModifier;
      }
      if (jobsToAssign > 0) {
        const workers = Math.min(jobsToAssign, availableWorkers);
        requiredWorkers[index] = requiredWorkers[index]! + workers;
        availableWorkers -= workers;
      }
    }
    if (availableWorkers <= 0 && availableServants <= 0) break;
  }

  const splitJobs = input.splitEntries
    .map((entry) => ({
      entry,
      index: indexOfToken(jobIndex, entry.jobToken),
    }))
    .filter(({ index }) => index !== -1);
  if (splitJobs.length > 0) {
    for (const { index } of splitJobs) {
      availableWorkers += requiredWorkers[index]!;
      requiredWorkers[index] = 0;
      availableServants += requiredServants[index]!;
      requiredServants[index] = 0;
    }
    if (
      splitJobs.some(({ index }) => index === defaultIndex) &&
      input.minimumDefault > (requiredWorkers[defaultIndex] ?? 0)
    ) {
      const restored = Math.min(
        availableWorkers,
        input.minimumDefault - requiredWorkers[defaultIndex]!,
      );
      requiredWorkers[defaultIndex]! += restored;
      availableWorkers -= restored;
    }
    const farmerIsSplit = splitJobs.some(({ index }) => index === farmerIndex);
    const currentFarmers =
      (requiredWorkers[farmerIndex] ?? 0) +
      (requiredServants[farmerIndex] ?? 0) * input.servantModifier;
    if (farmerIsSplit && minimumFarmers > currentFarmers) {
      let missing = minimumFarmers - currentFarmers;
      const servants = Math.min(
        availableServants,
        Math.floor(missing / input.servantModifier),
      );
      requiredServants[farmerIndex]! += servants;
      availableServants -= servants;
      missing -= servants * input.servantModifier;
      const workers = Math.min(availableWorkers, missing);
      requiredWorkers[farmerIndex]! += workers;
      availableWorkers -= workers;
    }
    const compare = (
      left: (typeof splitJobs)[number],
      right: (typeof splitJobs)[number],
    ) =>
      (requiredWorkers[left.index]! +
        requiredServants[left.index]! * input.servantModifier) /
        left.entry.weighting -
        (requiredWorkers[right.index]! +
          requiredServants[right.index]! * input.servantModifier) /
          right.entry.weighting || left.index - right.index;
    for (
      let pass = 0;
      pass < 3 && (availableWorkers > 0 || availableServants > 0);
      pass++
    ) {
      const remaining = [...splitJobs];
      while (availableWorkers + availableServants > 0 && remaining.length > 0) {
        remaining.sort(compare);
        const selected = remaining[0]!;
        const total =
          requiredWorkers[selected.index]! +
          requiredServants[selected.index]! * input.servantModifier;
        const breakpoint =
          selected.entry.breakpoints[pass]! > 0
            ? selected.entry.breakpoints[pass]!
            : 0;
        if (
          (pass === 2 || total < breakpoint) &&
          !(total >= (jobMaximums[selected.index] ?? Number.MAX_SAFE_INTEGER))
        ) {
          if (availableServants > 0) {
            requiredServants[selected.index]!++;
            availableServants--;
          } else {
            requiredWorkers[selected.index]!++;
            availableWorkers--;
          }
        } else {
          remaining.shift();
        }
      }
    }
  }

  const fallback = [
    input.farmerToken,
    input.lumberjackToken,
    input.quarryToken,
    input.crystalMinerToken,
    input.scavengerToken,
  ];
  while (
    (availableWorkers > 0 || availableServants > 0) &&
    fallback.length > 0
  ) {
    const index = indexOfToken(jobIndex, fallback.pop() ?? null);
    if (index !== -1) {
      const maximum = jobMaximums[index] ?? Number.MAX_SAFE_INTEGER;
      const currentEmployees =
        requiredWorkers[index]! +
        requiredServants[index]! * input.servantModifier;
      let remaining = Math.max(0, maximum - currentEmployees);
      const servants = Math.min(
        availableServants,
        Math.floor(remaining / input.servantModifier),
      );
      requiredServants[index]! += servants;
      availableServants -= servants;
      remaining -= servants * input.servantModifier;
      const workers = Math.min(availableWorkers, remaining);
      requiredWorkers[index]! += workers;
      availableWorkers -= workers;
    }
  }

  const entertainerIndex = indexOfToken(jobIndex, input.entertainerToken);
  let selectedDefaultToken: number | null = null;
  if (!input.craftOnly && input.setDefault) {
    selectedDefaultToken =
      input.defaultPreference.find((candidate) => {
        const index = indexOfToken(jobIndex, candidate.allocationToken);
        if (candidate.requirement === "managed-with-workers") {
          return (
            candidate.managed && index !== -1 && requiredWorkers[index]! > 0
          );
        }
        return candidate.requirement === "managed"
          ? candidate.managed
          : candidate.unlocked;
      })?.jobToken ?? null;
  }
  const assignments = input.jobs.map((job, index) =>
    Object.freeze({
      jobToken: job.token,
      workers: requiredWorkers[index]!,
      servants: requiredServants[index]!,
    }),
  );
  return Object.freeze({
    kind: "assign-jobs",
    assignments: Object.freeze(assignments),
    selectedDefaultToken,
    moraleIncomeAdjusted:
      entertainerIndex !== -1 &&
      requiredWorkers[entertainerIndex] !== input.jobs[entertainerIndex]!.count,
    ironIncomeAdjusted:
      minerIndex !== -1 &&
      requiredWorkers[minerIndex] !== input.jobs[minerIndex]!.count,
    maximumSpaceMiners,
    lastPopulationCount: input.population,
    lastFarmerCount:
      farmerIndex === -1
        ? 0
        : requiredWorkers[farmerIndex]! +
          requiredServants[farmerIndex]! * input.servantModifier,
    authorityEntertainerCap: authority.storedCap,
    clearAuthorityEntertainerCap: !input.authority.enabled,
    craftWinner: craft.craftWinner,
    craftDebugMessage: craft.debugMessage,
    authorityDebugMessage: authority.debug,
  });
}
