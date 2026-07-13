import type { SubsystemDependencies } from "./types.ts";

type Dependencies = SubsystemDependencies<
  | "getJobManager"
  | "getGame"
  | "getJobs"
  | "isDemonRace"
  | "isLumberRace"
  | "getSettings"
  | "traitVal"
  | "getCrafter"
  | "getWindow"
  | "getBuildings"
  | "getHaveTech"
  | "getResources"
  | "ticksPerSecond"
  | "getState"
  | "findRequiredResourceWeight"
  | "getPoly"
  | "isCraftingJob"
  | "getHaveTask"
  | "getFoodConsume"
>;
export function createAutoJobs({ getJobManager, getGame, getJobs, isDemonRace, isLumberRace, getSettings, traitVal, getCrafter, getWindow, getBuildings, getHaveTech, getResources, ticksPerSecond, getState, findRequiredResourceWeight, getPoly, isCraftingJob, getHaveTask, getFoodConsume }: Dependencies) {
  return function autoJobs(craftOnly) {
    const JobManager = getJobManager();
    const game = getGame();
    const jobs = getJobs();
    const settings = getSettings();
    const crafter = getCrafter();
    const window = getWindow();
    const buildings = getBuildings();
    const haveTech = getHaveTech();
    const resources = getResources();
    const state = getState();
    const poly = getPoly();
    const haveTask = getHaveTask();
    let jobList = JobManager.managedPriorityList();

    // No jobs unlocked yet
    if (jobList.length === 0) {
      return;
    }

    let farmerIndex = game.global.race["artifical"]
      ? -1
      : Math.max(jobList.indexOf(jobs.Hunter), jobList.indexOf(jobs.Farmer));
    let lumberjackIndex =
      isDemonRace() && isLumberRace()
        ? farmerIndex
        : jobList.indexOf(jobs.Lumberjack);
    let quarryWorkerIndex = jobList.indexOf(jobs.QuarryWorker);
    let crystalMinerIndex = jobList.indexOf(jobs.CrystalMiner);
    let scavengerIndex = jobList.indexOf(jobs.Scavenger);
    let foragerIndex = jobList.indexOf(jobs.Forager);
    let defaultIndex = jobList.findIndex((job) => job.isDefault());

    let availableWorkers = jobList.reduce(
      (total, job) => total + job.workers,
      0,
    );
    let availableServants = settings.jobManageServants
      ? JobManager.servantsMax()
      : 0;
    let availableSkilledServants = settings.jobManageServants
      ? JobManager.skilledServantsMax()
      : 0;
    let availableCraftsmen = JobManager.craftingMax();
    let servantMod = traitVal("high_pop", 0, 1);

    let crewMissing =
      game.global.civic.crew.max - game.global.civic.crew.workers;
    let minDefault = crewMissing > 0 ? crewMissing + 1 : 0;

    let requiredWorkers = new Array(jobList.length).fill(0);
    let requiredServants = new Array(jobList.length).fill(0);

    // We're only crafting when we have twice amount of workers than needed.
    if (craftOnly) {
      availableCraftsmen = availableWorkers;
      availableWorkers = 0;
      availableServants = 0;
    } else if (
      settings.autoCraftsmen &&
      availableWorkers >= availableCraftsmen * (farmerIndex === -1 ? 1 : 2)
    ) {
      availableWorkers -= availableCraftsmen;
    } else {
      availableCraftsmen = 0;
    }

    // Now assign crafters
    if (settings.autoCraftsmen) {
      // Debug logging — enable with: window.craftDebug = true
      // Logs whenever the crafter target (all crafters go to one resource) changes,
      // with each candidate's sort key and the building driving its weighting.
      const cdbg = window.craftDebug ?? false;
      let craftExcluded = cdbg ? [] : null;
      let craftFilter = "";
      // Taken from game source, no idea what this "140" means.
      let speed = game.global.genes["crafty"] ? 2 : 1;
      let costMod = (speed * traitVal("resourceful", 0, "-")) / 140;
      let totalCraftsmen =
        availableCraftsmen + availableSkilledServants * servantMod;
      let autoCraft =
        settings.productionCraftsmen === "always" ||
        (settings.productionCraftsmen === "nocraft" &&
          game.global.race["no_craft"]);

      // Get list of craftabe resources
      let availableJobs = [];
      for (let job of JobManager.craftingJobs) {
        let resource = job.resource;
        // Check if we're allowed to craft this resource
        if (!job.isManaged() || !resource.autoCraftEnabled) {
          continue;
        }

        // Check workshop
        let craftBuilding =
          job === crafter.Scarletite
            ? buildings.RuinsHellForge
            : job === crafter.Quantium
              ? haveTech("isolation")
                ? buildings.TauDiseaseLab
                : buildings.EnceladusZeroGLab
              : null;
        if (!craftBuilding && !autoCraft) {
          // Other jobs need to be checked only if we have servants to assign
          if (!availableSkilledServants) {
            break;
          }
          // Empty crafters pool, we're not going to assign them
          availableWorkers += availableCraftsmen;
          totalCraftsmen -= availableCraftsmen;
          availableCraftsmen = 0;
        }

        // Check if there's enough resources to craft it for at least 2 ticks
        let affordableAmount = totalCraftsmen;
        for (let res in resource.cost) {
          let reqResource = resources[res];
          if (
            !resource.isDemanded() &&
            ((!settings.useDemanded && reqResource.isDemanded()) ||
              reqResource.storageRatio < resource.craftPreserve)
          ) {
            if (cdbg) {
              craftExcluded.push(`${job.id}(hold:${res})`);
            }
            affordableAmount = 0;
            break;
          } else {
            affordableAmount = Math.min(
              affordableAmount,
              ((resource.rateOfChange + reqResource.currentQuantity) /
                (resource.cost[res] * costMod) /
                2) *
                ticksPerSecond(),
            );
          }
        }

        if (craftBuilding) {
          if (settings.productionCraftsmen === "servants") {
            continue; // Servants can't work in buildings
          }
          // Assigning non-foundry crafters right now, so it won't be filtered out by priority checks below, as we want to have them always crafted among with regular craftables
          let craftMax =
            craftBuilding.stateOnCount * traitVal("high_pop", 0, 1);
          if (affordableAmount < craftMax) {
            requiredWorkers[jobList.indexOf(job)] = 0;
          } else {
            requiredWorkers[jobList.indexOf(job)] = craftMax;
            availableCraftsmen -= craftMax;
            totalCraftsmen -= craftMax;
          }
        } else if (affordableAmount >= totalCraftsmen) {
          availableJobs.push(job);
        } else if (cdbg && affordableAmount > 0) {
          craftExcluded.push(
            `${job.id}(inputs:${affordableAmount.toFixed(1)}<${totalCraftsmen})`,
          );
        }
      }

      let requestedJobs = availableJobs.filter((job) =>
        job.resource.isDemanded(),
      );
      if (requestedJobs.length > 0) {
        availableJobs = requestedJobs;
        craftFilter = "demanded";
      } else if (settings.productionFoundryWeighting === "demanded") {
        let usefulJobs = availableJobs.filter(
          (job) => job.resource.currentQuantity < job.resource.storageRequired,
        );
        if (usefulJobs.length > 0) {
          availableJobs = usefulJobs;
          craftFilter = "useful";
        }
      }

      let scaledWeightings = null;
      if (
        settings.productionFoundryWeighting === "buildings" &&
        state.unlockedBuildings.length > 0
      ) {
        scaledWeightings = Object.fromEntries(
          availableJobs.map((job) => [
            job.id,
            (findRequiredResourceWeight(job.resource) ?? 0) *
              job.resource.craftWeighting,
          ]),
        );
        availableJobs.sort(
          (a, b) =>
            a.resource.currentQuantity / scaledWeightings[a.id] -
            b.resource.currentQuantity / scaledWeightings[b.id],
        );
      } else {
        availableJobs.sort(
          (a, b) =>
            a.resource.currentQuantity / a.resource.craftWeighting -
            b.resource.currentQuantity / b.resource.craftWeighting,
        );
      }

      // Near-tied candidates used to flip-flop the whole crew every tick, as each
      // craft nudged the winner's key just above the runner-up's. Instead split
      // the crafters among all jobs within 10% of the best key, proportional to
      // their weightings — counts stay stable and the ratio holds exactly.
      const keyOf = (job) =>
        job.resource.currentQuantity /
        (scaledWeightings
          ? scaledWeightings[job.id]
          : job.resource.craftWeighting);
      const weightOf = (job) =>
        scaledWeightings
          ? scaledWeightings[job.id]
          : job.resource.craftWeighting;
      let shareWorkers = {};
      let shareServants = {};
      if (availableJobs.length > 0) {
        let winnerKey = keyOf(availableJobs[0]);
        let group = isFinite(winnerKey)
          ? availableJobs.filter((job) => keyOf(job) <= winnerKey * 1.1)
          : [availableJobs[0]];
        let remWorkers = availableCraftsmen;
        let remServants = availableSkilledServants;
        let remWeight = group.reduce((sum, job) => sum + weightOf(job), 0);
        for (let job of group) {
          // Last job of the group always gets the full remainder, so the pools sum up exactly
          let share = remWeight > 0 ? weightOf(job) / remWeight : 1;
          shareWorkers[job.id] = Math.round(remWorkers * share);
          shareServants[job.id] = Math.round(remServants * share);
          remWorkers -= shareWorkers[job.id];
          remServants -= shareServants[job.id];
          remWeight -= weightOf(job);
        }
      }

      if (cdbg) {
        let focusIds = Object.keys(shareWorkers).join("+") || "none";
        if (state.lastCraftWinner !== focusIds) {
          let detail = availableJobs
            .map((job) => {
              let q = job.resource.currentQuantity;
              let assigned =
                `→${shareWorkers[job.id] ?? 0}` +
                (availableSkilledServants > 0
                  ? `+${shareServants[job.id] ?? 0}s`
                  : "");
              if (scaledWeightings) {
                let driver = state.unlockedBuildings.find(
                  (b) => b.cost[job.resource.id] > q,
                );
                return `${job.id} q=${q.toFixed(0)} key=${(
                  q / scaledWeightings[job.id]
                ).toFixed(1)} (${
                  driver
                    ? `${driver._vueBinding}@${driver.weighting.toFixed(1)}`
                    : "no building"
                }×${job.resource.craftWeighting})${assigned}`;
              }
              return `${job.id} q=${q.toFixed(0)} key=${(
                q / job.resource.craftWeighting
              ).toFixed(1)}${assigned}`;
            })
            .join("; ");
          console.log(
            `[craft] focus ${state.lastCraftWinner ?? "none"}⇒${focusIds}` +
              (craftFilter ? ` filter=${craftFilter}` : "") +
              ` | ${detail}` +
              (craftExcluded.length > 0
                ? ` | excluded: ${craftExcluded.join(", ")}`
                : ""),
          );
          state.lastCraftWinner = focusIds;
        }
      }

      for (let job of JobManager.craftingJobs) {
        let jobIndex = jobList.indexOf(job);

        if (
          jobIndex === -1 ||
          (job === crafter.Scarletite &&
            resources.Scarletite.autoCraftEnabled) ||
          (job === crafter.Quantium && resources.Quantium.autoCraftEnabled)
        ) {
          continue;
        }

        // Jobs outside the focus group get zero, so crafters are removed from them.
        requiredWorkers[jobIndex] = shareWorkers[job.id] ?? 0;
        requiredServants[jobIndex] = shareServants[job.id] ?? 0;
      }

      // We didn't assigned crafter for some reason, return employees so we can use them somewhere else
      if (availableJobs[0] === undefined) {
        availableWorkers += availableCraftsmen;
      }
    }

    let coalDisabled =
      settings.jobDisableMiners && buildings.GatewayStarbase.count > 0;
    let minersDisabled =
      coalDisabled &&
      !(game.global.race["sappy"] && game.global.race["smoldering"]);
    let hoovedMiner =
      game.global.race.hooved && resources.Horseshoe.usefulRatio < 1;
    let synthMiner =
      game.global.race.artifical &&
      !game.global.race.deconstructor &&
      resources.Population.storageRatio < 1;
    let minerIndex = jobList.indexOf(jobs.Miner);

    // Make sure our hooved have miner for horseshoes\assemble
    if (
      (hoovedMiner || synthMiner) &&
      !minersDisabled &&
      availableWorkers > 1 &&
      minerIndex !== -1 &&
      jobs.Miner.isSmartEnabled
    ) {
      requiredWorkers[minerIndex] = 1;
      availableWorkers--;
    }

    let jobMax = {};
    let minFarmers = 0;
    state.maxSpaceMiners = 0;
    // And deal with the rest now
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < jobList.length; j++) {
        let job = jobList[j];

        // Don't assign 3rd breakpoints for jobs we're going to split, just first two to reserve some workers
        if (i === 2 && job.is.split) {
          continue;
        }
        // We've already done with crafters
        if (isCraftingJob(job)) {
          continue;
        }

        availableWorkers += requiredWorkers[j];
        let currentEmployees = requiredWorkers[j];
        let availableEmployees = availableWorkers;
        requiredWorkers[j] = 0;
        if (job.is.serve) {
          currentEmployees += requiredServants[j] * servantMod;
          availableServants += requiredServants[j];
          availableEmployees += availableServants * servantMod;
          requiredServants[j] = 0;
        }

        let demonicLumber =
          job === jobs.Hunter && isDemonRace() && isLumberRace() ? true : false;
        let jobsToAssign = Math.min(
          availableEmployees,
          Math.max(currentEmployees, job.breakpointEmployees(i)),
        );

        if (job.isSmartEnabled) {
          if (job === jobs.Farmer || job === jobs.Hunter) {
            if (jobMax[j] === undefined) {
              // Food
              if (
                game.global.race["artifical"] ||
                game.global.race["unfathomable"]
              ) {
                // Artifical hunters and raiders doesn't produce food
                jobMax[j] = 0;
              } else {
                let foodRateOfChange = resources.Food.rateOfChange;
                let minFoodStorage = resources.Food.maxQuantity * 0.2;
                let maxFoodStorage = resources.Food.maxQuantity * 0.6;
                if (game.global.race["ravenous"]) {
                  // Ravenous hunger
                  minFoodStorage = resources.Population.currentQuantity * 1.5;
                  maxFoodStorage = resources.Population.currentQuantity * 3;
                  foodRateOfChange += Math.max(
                    resources.Food.currentQuantity / traitVal("ravenous", 1),
                    0,
                  );
                }
                if (game.global.race["carnivore"]) {
                  // Food spoilage
                  minFoodStorage = resources.Population.currentQuantity;
                  maxFoodStorage = resources.Population.currentQuantity * 2;
                  if (resources.Food.currentQuantity > 10) {
                    foodRateOfChange +=
                      (resources.Food.currentQuantity - 10) *
                      traitVal("carnivore", 0, "=") *
                      0.9 ** buildings.Smokehouse.count;
                  }
                }

                if (
                  resources.Population.currentQuantity >
                  state.lastPopulationCount
                ) {
                  let populationChange =
                    resources.Population.currentQuantity -
                    state.lastPopulationCount;
                  let farmerChange = job.count - state.lastFarmerCount;

                  if (
                    populationChange === farmerChange &&
                    foodRateOfChange > 0
                  ) {
                    jobMax[j] = job.count - populationChange;
                  } else {
                    jobMax[j] = job.count;
                  }
                } else if (resources.Food.isCapped()) {
                  // Full food storage, remove all farmers instantly
                  jobMax[j] = 0;
                } else if (
                  resources.Food.currentQuantity +
                    foodRateOfChange / ticksPerSecond() <
                  minFoodStorage
                ) {
                  // We want food to fluctuate between 0.2 and 0.6 only. We only want to add one per loop until positive
                  if (job.count === 0) {
                    // We can't calculate production with no workers, assign one first
                    jobMax[j] = 1;
                  } else {
                    let foodPerWorker =
                      resources.Food.getProduction("job_" + job.id) / job.count;
                    let missingWorkers =
                      Math.ceil(foodRateOfChange / -foodPerWorker) || 0;
                    jobMax[j] = Math.max(1, job.count + missingWorkers);
                  }
                } else if (
                  resources.Food.currentQuantity > maxFoodStorage &&
                  foodRateOfChange > 0
                ) {
                  // We want food to fluctuate between 0.2 and 0.6 only. We only want to remove one per loop until negative
                  jobMax[j] = job.count - 1;
                } else {
                  // We're good; leave farmers as they are
                  jobMax[j] = job.count;
                }
                minFarmers = jobMax[j];
              }

              // Other byproducts
              if (game.global.race["unfathomable"]) {
                // Raiders brings a lot of different stuff, let's just assume they're always usefull, without wasting time checking all those resources
                jobMax[j] = Number.MAX_SAFE_INTEGER;
              } else if (job === jobs.Hunter) {
                if (
                  resources.Furs.isUnlocked() &&
                  (game.global.race["evil"] || game.global.race["artifical"])
                ) {
                  jobMax[j] = resources.Furs.isUseful()
                    ? Number.MAX_SAFE_INTEGER
                    : Math.max(
                        jobMax[j],
                        resources.Furs.getBusyWorkers(
                          "job_hunter",
                          jobs.Hunter.count,
                        ),
                      );
                }
                if (demonicLumber) {
                  jobMax[j] = resources.Lumber.isUseful()
                    ? Number.MAX_SAFE_INTEGER
                    : Math.max(
                        jobMax[j],
                        resources.Lumber.getBusyWorkers(
                          "job_hunter",
                          jobs.Hunter.count,
                        ),
                      );
                }
              }
            }
            if (demonicLumber) {
              jobsToAssign = Math.min(
                availableEmployees,
                Math.max(
                  currentEmployees,
                  minFarmers,
                  Math.min(jobMax[j], jobs.Lumberjack.breakpointEmployees(i)),
                ),
              );
            } else {
              jobsToAssign = Math.min(jobsToAssign, minFarmers);
            }
          }
          if (job === jobs.Lumberjack) {
            if (jobMax[j] === undefined) {
              jobMax[j] = 0;
              if (!game.global.race["soul_eater"] && game.global.race["evil"]) {
                jobMax[j] = resources.Furs.isUseful()
                  ? Number.MAX_SAFE_INTEGER
                  : resources.Furs.getBusyWorkers(
                      "job_reclaimer",
                      jobs.Lumberjack.count,
                    );
              }
              jobMax[j] = resources.Lumber.isUseful()
                ? Number.MAX_SAFE_INTEGER
                : Math.max(
                    jobMax[j],
                    resources.Lumber.getBusyWorkers(
                      game.global.race["evil"]
                        ? "job_reclaimer"
                        : "job_lumberjack",
                      jobs.Lumberjack.count,
                    ),
                  );
            }
            jobsToAssign = Math.min(jobsToAssign, jobMax[j]);
          }
          if (job === jobs.QuarryWorker) {
            if (jobMax[j] === undefined) {
              jobMax[j] = 0;
              if (resources.Aluminium.isUnlocked()) {
                jobMax[j] = resources.Aluminium.isUseful()
                  ? Number.MAX_SAFE_INTEGER
                  : Math.max(
                      jobMax[j],
                      resources.Aluminium.getBusyWorkers(
                        "workers",
                        jobs.QuarryWorker.count,
                      ),
                    );
              }
              if (resources.Chrysotile.isUnlocked()) {
                jobMax[j] = resources.Chrysotile.isUseful()
                  ? Number.MAX_SAFE_INTEGER
                  : Math.max(
                      jobMax[j],
                      resources.Chrysotile.getBusyWorkers(
                        "workers",
                        jobs.QuarryWorker.count,
                      ),
                    );
              }
              jobMax[j] = resources.Stone.isUseful()
                ? Number.MAX_SAFE_INTEGER
                : Math.max(
                    jobMax[j],
                    resources.Stone.getBusyWorkers(
                      "workers",
                      jobs.QuarryWorker.count,
                    ),
                  );
            }
            jobsToAssign = Math.min(jobsToAssign, jobMax[j]);
          }
          if (job === jobs.CrystalMiner) {
            if (jobMax[j] === undefined) {
              jobMax[j] = resources.Crystal.isUseful()
                ? Number.MAX_SAFE_INTEGER
                : resources.Crystal.getBusyWorkers(
                    "job_crystal_miner",
                    jobs.CrystalMiner.count,
                  );
            }
            jobsToAssign = Math.min(jobsToAssign, jobMax[j]);
          }
          if (job === jobs.Torturer) {
            if (jobMax[j] === undefined) {
              let total = 0;
              for (
                let i = 0;
                i < game.global.city.surfaceDwellers.length;
                i++
              ) {
                total += game.global.city.captive_housing[`race${i}`];
                total += game.global.city.captive_housing[`jailrace${i}`];
              }
              let rank = game.global.stats.achieve.nightmare?.mg ?? 0;
              jobMax[j] = Math.ceil(total / (rank / 2));
            }
            jobsToAssign = Math.min(jobsToAssign, jobMax[j]);
          }
          if (job === jobs.Miner && game.global.race["warlord"]) {
            jobsToAssign = jobs.Miner.max;
          } else if (job === jobs.Miner) {
            if (jobMax[j] === undefined) {
              jobMax[j] = 0;
              if (!minersDisabled) {
                if (game.global.race["sappy"]) {
                  if (resources.Aluminium.isUnlocked()) {
                    jobMax[j] = resources.Aluminium.isUseful()
                      ? Number.MAX_SAFE_INTEGER
                      : Math.max(
                          jobMax[j],
                          resources.Aluminium.getBusyWorkers(
                            game.global.race["cataclysm"] ||
                              game.global.race["orbit_decayed"]
                              ? "space_red_mine_title"
                              : "job_miner",
                            jobs.Miner.count,
                          ),
                        );
                  }
                  if (resources.Chrysotile.isUnlocked()) {
                    jobMax[j] = resources.Chrysotile.isUseful()
                      ? Number.MAX_SAFE_INTEGER
                      : Math.max(
                          jobMax[j],
                          resources.Chrysotile.getBusyWorkers(
                            "job_miner",
                            jobs.Miner.count,
                          ),
                        );
                  }
                }
                if (game.global.tech["titanium"] >= 2) {
                  let shipShift = buildings.BeltIronShip.stateOnCount * 2;
                  jobMax[j] = resources.Titanium.isUseful()
                    ? Number.MAX_SAFE_INTEGER
                    : Math.max(
                        jobMax[j],
                        resources.Titanium.getBusyWorkers(
                          "resource_Iron_name",
                          jobs.Miner.count + shipShift,
                        ) - shipShift,
                      );
                }
                if (resources.Iron.isUnlocked()) {
                  jobMax[j] = resources.Iron.isUseful()
                    ? Number.MAX_SAFE_INTEGER
                    : Math.max(
                        jobMax[j],
                        resources.Iron.getBusyWorkers(
                          "job_miner",
                          jobs.Miner.count,
                        ),
                      );
                }
                jobMax[j] = resources.Copper.isUseful()
                  ? Number.MAX_SAFE_INTEGER
                  : Math.max(
                      jobMax[j],
                      resources.Copper.getBusyWorkers(
                        "job_miner",
                        jobs.Miner.count,
                      ),
                    );
              }
            }
            jobsToAssign = Math.min(jobsToAssign, jobMax[j]);
          }
          if (job === jobs.CoalMiner) {
            if (jobMax[j] === undefined) {
              jobMax[j] = 0;
              if (!coalDisabled) {
                if (resources.Uranium.isUnlocked()) {
                  jobMax[j] = resources.Uranium.isUseful()
                    ? Number.MAX_SAFE_INTEGER
                    : resources.Uranium.getBusyWorkers(
                        "job_coal_miner",
                        jobs.CoalMiner.count,
                      );
                }
                jobMax[j] = resources.Coal.isUseful()
                  ? Number.MAX_SAFE_INTEGER
                  : Math.max(
                      jobMax[j],
                      resources.Coal.getBusyWorkers(
                        "job_coal_miner",
                        jobs.CoalMiner.count,
                      ),
                    );
              }
            }
            jobsToAssign = Math.min(jobsToAssign, jobMax[j]);
          }
          if (job === jobs.SpaceMiner) {
            if (jobMax[j] === undefined) {
              jobMax[j] =
                (buildings.BeltEleriumShip.stateOnCount * 2 +
                  buildings.BeltIridiumShip.stateOnCount +
                  buildings.BeltIronShip.stateOnCount) *
                traitVal("high_pop", 0, 1);
            }
            jobsToAssign = Math.min(jobsToAssign, jobMax[j]);
            state.maxSpaceMiners = Math.max(
              state.maxSpaceMiners,
              Math.min(availableEmployees, job.breakpointEmployees(i, true)),
            );
          }
          if (job === jobs.Entertainer && !haveTech("superstar")) {
            if (jobMax[j] === undefined) {
              let taxBuffer =
                (settings.autoTax || haveTask("tax")) &&
                game.global.civic.taxes.tax_rate < poly.taxCap(false)
                  ? 1
                  : 0;
              let entertainerMorale =
                (game.global.tech["theatre"] + traitVal("musical", 0)) *
                traitVal("emotionless", 0, "-") *
                traitVal("high_pop", 1, "=") *
                (state.astroSign === "sagittarius" ? 1.05 : 1) *
                (game.global.race["lone_survivor"] ? 25 : 1);
              let moraleExtra =
                resources.Morale.rateOfChange -
                resources.Morale.maxQuantity -
                taxBuffer;
              jobMax[j] =
                job.count - Math.floor(moraleExtra / entertainerMorale);
            }
            jobsToAssign = Math.min(jobsToAssign, jobMax[j]);
          }
          // TODO: Remove extra bankers when cap not needed
          // Don't assign bankers if our money is maxed and bankers aren't contributing to our money storage cap
          if (
            job === jobs.Banker &&
            (resources.Money.isCapped() ||
              game.global.civic.taxes.tax_rate <= 0) &&
            !haveTech("banking", 7)
          ) {
            jobsToAssign = 0;
          }
          // Races with the Intelligent trait get bonus production based on the number of professors and scientists
          // Only unassign them when knowledge is max if the race is not intelligent
          // Once we've research shotgun sequencing we get boost and soon autoassemble genes so stop unassigning
          if (job === jobs.Scientist) {
            if (jobMax[j] === undefined) {
              jobMax[j] = Number.MAX_SAFE_INTEGER;
              if (
                game.global.race.universe !== "magic" &&
                resources.Knowledge.isCapped() &&
                !game.global.race["intelligent"] &&
                !haveTech("science", 5) &&
                !haveTech("genetics", 5)
              ) {
                jobsToAssign = 0;
              }
              if (game.global.race["witch_hunter"]) {
                let SusPerWiz =
                  game.global.civic.govern.type === "magocracy" ? 0.5 : 1;
                jobMax[j] =
                  (99 - resources.Sus.currentQuantity) / SusPerWiz +
                  job.count * SusPerWiz;
              }
            }
            jobsToAssign = Math.min(jobsToAssign, jobMax[j]);
          }
          if (
            job === jobs.Professor &&
            !game.global.race["intelligent"] &&
            resources.Knowledge.isCapped() &&
            !haveTech("genetics", 5) &&
            !haveTech("fanaticism", 2)
          ) {
            jobsToAssign = 0;
          }
          if (job === jobs.CementWorker) {
            if (jobMax[j] === undefined) {
              jobMax[j] = Number.MAX_SAFE_INTEGER;
              if (resources.Stone.storageRatio < 0.1) {
                let stoneRateOfChange =
                  resources.Stone.rateOfChange + job.count * 3 - 5;
                if (game.global.race["smoldering"] && settings.autoQuarry) {
                  stoneRateOfChange += resources.Chrysotile.rateOfChange;
                }
                jobMax[j] = Math.min(
                  jobMax[j],
                  Math.floor(stoneRateOfChange / 3),
                );
              }
              if (!resources.Cement.isUseful()) {
                jobMax[j] = Math.min(
                  jobMax[j],
                  resources.Cement.getBusyWorkers(
                    "city_cement_plant_bd",
                    jobs.CementWorker.count,
                  ),
                );
              }
            }
            jobsToAssign = Math.min(jobsToAssign, jobMax[j]);
          }
          if (job === jobs.HellSurveyor) {
            if (jobMax[j] === undefined) {
              if (
                game.global.portal.fortress.threat > 9000 &&
                resources.Population.storageRatio < 1
              ) {
                jobMax[j] = 0;
                /* Keep all surveyors active for gems
                                } else if (!resources.Infernite.isUseful()) {
                                    jobMax[j] = resources.Infernite.getBusyWorkers("job_hell_surveyor", jobs.HellSurveyor.count);
                                */
              } else {
                jobMax[j] = Number.MAX_SAFE_INTEGER;
              }
            }
            jobsToAssign = Math.min(jobsToAssign, jobMax[j]);
          }
          if (job === jobs.Teamster) {
            if (jobMax[j] === undefined) {
              jobMax[j] = Math.round(
                (game.global.race.teamster /
                  (game.global.tech.transport ?? 0)) *
                  1.5,
              );
              jobMax[j] -= (game.global.tech["railway"] ?? 0) * 2;
            }
            jobsToAssign = Math.min(jobsToAssign, jobMax[j]);
          }
          if (job === jobs.Meditator) {
            if (jobMax[j] === undefined) {
              // TODO: slitheryn fathom
              let infusion = 0.95 ** buildings.LakeLifeInfuser.stateOnCount;
              let threshold =
                (1.25 +
                  traitVal("slow_digestion", 0) +
                  traitVal("humpback", 0) -
                  traitVal("atrophy", 0)) *
                infusion;
              let meditator = 0.03 * traitVal("high_pop", 1, "=") * infusion;
              jobMax[j] = Math.ceil(
                ((resources.Population.currentQuantity / 100) *
                  getFoodConsume() -
                  threshold) /
                  meditator,
              );
              jobMax[j] += 1; // One extra meditator to make it more fluctuation-proof
            }
            jobsToAssign = Math.min(jobsToAssign, jobMax[j]);
          }
        }

        if (j === defaultIndex && minDefault > 0) {
          requiredWorkers[j] += Math.min(availableWorkers, minDefault);
          availableWorkers -= requiredWorkers[j];
          jobsToAssign -= requiredWorkers[j];
        }
        if (jobsToAssign > 0 && job.is.serve) {
          let servantsToAssign = Math.min(
            availableServants,
            Math.floor(jobsToAssign / servantMod),
          );
          requiredServants[j] += servantsToAssign;
          availableServants -= servantsToAssign;
          jobsToAssign -= servantsToAssign * servantMod;
        }
        if (jobsToAssign > 0) {
          let workersToAssign = Math.min(jobsToAssign, availableWorkers);
          requiredWorkers[j] += workersToAssign;
          availableWorkers -= workersToAssign;
        }
      }

      // No more workers available
      if (availableWorkers <= 0 && availableServants <= 0) {
        break;
      }
    }

    // Avoid adjusting both tax and entertainers at same tick, it can cause flickering
    let entertainerIndex = jobList.indexOf(jobs.Entertainer);
    if (
      entertainerIndex !== -1 &&
      requiredWorkers[entertainerIndex] !== jobList[entertainerIndex].count
    ) {
      resources.Morale.incomeAdusted = true;
    }
    if (
      minerIndex !== -1 &&
      requiredWorkers[minerIndex] !== jobList[minerIndex].count
    ) {
      resources.Iron.incomeAdusted = true;
    }

    let splitJobs = [];
    if (
      game.global.race["unfathomable"] &&
      farmerIndex !== -1 &&
      settings.jobRaiderWeighting > 0
    )
      splitJobs.push({
        index: farmerIndex,
        job: jobs.Hunter,
        weighting: settings.jobRaiderWeighting,
      });
    if (lumberjackIndex !== -1 && settings.jobLumberWeighting > 0)
      splitJobs.push({
        index: lumberjackIndex,
        job: jobs.Lumberjack,
        weighting: settings.jobLumberWeighting,
      });
    if (quarryWorkerIndex !== -1 && settings.jobQuarryWeighting > 0)
      splitJobs.push({
        index: quarryWorkerIndex,
        job: jobs.QuarryWorker,
        weighting: settings.jobQuarryWeighting,
      });
    if (crystalMinerIndex !== -1 && settings.jobCrystalWeighting > 0)
      splitJobs.push({
        index: crystalMinerIndex,
        job: jobs.CrystalMiner,
        weighting: settings.jobCrystalWeighting,
      });
    if (scavengerIndex !== -1 && settings.jobScavengerWeighting > 0)
      splitJobs.push({
        index: scavengerIndex,
        job: jobs.Scavenger,
        weighting: settings.jobScavengerWeighting,
      });
    if (foragerIndex !== -1 && settings.jobForagerWeighting > 0)
      splitJobs.push({
        index: foragerIndex,
        job: jobs.Forager,
        weighting: settings.jobForagerWeighting,
      });

    // Balance lumberjacks, quarry workers, crystal miners and scavengers if they are unlocked
    if (splitJobs.length > 0) {
      // Reduce jobs required down to minimum and add them to the available employee pool so that we can split them according to weightings
      splitJobs.forEach((jobDetails) => {
        availableWorkers += requiredWorkers[jobDetails.index];
        requiredWorkers[jobDetails.index] = 0;
        availableServants += requiredServants[jobDetails.index];
        requiredServants[jobDetails.index] = 0;
      });

      if (
        splitJobs.find((s) => s.index === defaultIndex) &&
        minDefault > requiredWorkers[defaultIndex]
      ) {
        let restoreDef = Math.min(
          availableWorkers,
          minDefault - requiredWorkers[defaultIndex],
        );
        requiredWorkers[defaultIndex] += restoreDef;
        availableWorkers -= restoreDef;
      }
      let currentFarmers =
        requiredWorkers[farmerIndex] +
        requiredServants[farmerIndex] * servantMod;
      if (
        splitJobs.find((s) => s.index === farmerIndex) &&
        minFarmers > currentFarmers
      ) {
        let missingFarmers = minFarmers - currentFarmers;
        let servantsToAssign = Math.min(
          availableServants,
          Math.floor(missingFarmers / servantMod),
        );
        requiredServants[farmerIndex] += servantsToAssign;
        availableServants -= servantsToAssign;
        missingFarmers -= servantsToAssign * servantMod;
        if (missingFarmers > 0) {
          let workersToAssign = Math.min(availableWorkers, missingFarmers);
          requiredWorkers[farmerIndex] += workersToAssign;
          availableWorkers -= workersToAssign;
          missingFarmers -= workersToAssign;
        }
      }

      // Bring them all up to required breakpoints, one each at a time
      let splitSorter = (a, b) =>
        (requiredWorkers[a.index] + requiredServants[a.index] * servantMod) /
          a.weighting -
          (requiredWorkers[b.index] + requiredServants[b.index] * servantMod) /
            b.weighting || a.index - b.index;
      for (
        let b = 0;
        b < 3 && (availableWorkers > 0 || availableServants > 0);
        b++
      ) {
        let remainingJobs = splitJobs.slice();
        while (
          availableWorkers + availableServants > 0 &&
          remainingJobs.length > 0
        ) {
          let jobDetails = remainingJobs.sort(splitSorter)[0];
          let total =
            requiredWorkers[jobDetails.index] +
            requiredServants[jobDetails.index] * servantMod;
          let bp =
            jobDetails.job.getBreakpoint(b) > 0
              ? jobDetails.job.breakpointEmployees(b)
              : 0;
          if ((b === 2 || total < bp) && !(total >= jobMax[jobDetails.index])) {
            if (availableServants > 0) {
              requiredServants[jobDetails.index]++;
              availableServants--;
            } else {
              requiredWorkers[jobDetails.index]++;
              availableWorkers--;
            }
          } else {
            remainingJobs.shift();
          }
        }
      }
    }

    // Still have free workers, drop them anywhere
    let fallback = [
      farmerIndex,
      lumberjackIndex,
      quarryWorkerIndex,
      crystalMinerIndex,
      scavengerIndex,
    ];
    while (
      (availableWorkers > 0 || availableServants > 0) &&
      fallback.length > 0
    ) {
      let idx = fallback.pop();
      if (idx !== -1) {
        requiredWorkers[idx] += availableWorkers;
        availableWorkers = 0;
        requiredServants[idx] += availableServants;
        availableServants = 0;
      }
    }

    let workerDeltas = requiredWorkers.map(
      (req, index) => req - jobList[index].workers,
    );
    workerDeltas.forEach(
      (delta, index) => delta < 0 && jobList[index].removeWorkers(delta * -1),
    );
    workerDeltas.forEach(
      (delta, index) => delta > 0 && jobList[index].addWorkers(delta),
    );

    if (settings.jobManageServants) {
      let servantDeltas = requiredServants.map(
        (req, index) => req - jobList[index].servants,
      );
      servantDeltas.forEach(
        (delta, index) =>
          delta < 0 && jobList[index].removeServants(delta * -1),
      );
      servantDeltas.forEach(
        (delta, index) => delta > 0 && jobList[index].addServants(delta),
      );
    }

    state.lastPopulationCount = resources.Population.currentQuantity;
    state.lastFarmerCount =
      farmerIndex === -1
        ? 0
        : requiredWorkers[farmerIndex] +
          requiredServants[farmerIndex] * servantMod;

    // After reassignments adjust default job to something with workers, we need that for sacrifices.
    // Meditators not allowed to be default, to prevent other jobs from pulling them. That's a double-edged sword: while single extra meditator should still cover natural growth of population, it's now vulnerable to massive spikes of homelessnes.
    if (!craftOnly && settings.jobSetDefault) {
      if (
        jobs.QuarryWorker.isManaged() &&
        requiredWorkers[quarryWorkerIndex] > 0
      ) {
        jobs.QuarryWorker.setAsDefault();
      } else if (
        jobs.Lumberjack.isManaged() &&
        requiredWorkers[lumberjackIndex] > 0
      ) {
        jobs.Lumberjack.setAsDefault();
      } else if (
        jobs.CrystalMiner.isManaged() &&
        requiredWorkers[crystalMinerIndex] > 0
      ) {
        jobs.CrystalMiner.setAsDefault();
      } else if (
        jobs.Scavenger.isManaged() &&
        requiredWorkers[scavengerIndex] > 0
      ) {
        jobs.Scavenger.setAsDefault();
      } else if (jobs.Forager.isManaged()) {
        jobs.Forager.setAsDefault();
      } else if (jobs.Hunter.isManaged()) {
        jobs.Hunter.setAsDefault();
      } else if (jobs.Farmer.isManaged()) {
        jobs.Farmer.setAsDefault();
      } else if (jobs.Teamster.isManaged()) {
        jobs.Teamster.setAsDefault();
      } else {
        // Fallback case: will really only happen in scenarios where no basic jobs are useful and pop is excess.
        // Like high-prestige low-challenge OD.
        // We really only care to avoid Unemployed for the morale hit now. Presumably Scavenger and Crystal Miner are the most useful jobs here.
        if (jobs.Scavenger.isUnlocked()) {
          jobs.Scavenger.setAsDefault();
        } else if (jobs.CrystalMiner.isUnlocked()) {
          jobs.CrystalMiner.setAsDefault();
        } else if (jobs.QuarryWorker.isUnlocked()) {
          jobs.QuarryWorker.setAsDefault();
        } else if (jobs.Lumberjack.isUnlocked()) {
          jobs.Lumberjack.setAsDefault();
        } else if (jobs.Forager.isUnlocked()) {
          jobs.Forager.setAsDefault();
        } else if (jobs.Hunter.isManaged()) {
          jobs.Hunter.setAsDefault();
        } else {
          // Can't avoid it...
          jobs.Unemployed.setAsDefault();
        }
      }
    }
  }
}
