/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TickDiagnostics } from "../ports/tick.ts";
import type { BuildingWeightingRule } from "../ports/building-weighting.ts";

interface CoreManagersDependencies {
  getGame: () => any;
  getSettings: () => Record<string, any>;
  getState: () => any;
  getBuildings: () => Record<string, any>;
  getProjects: () => Record<string, any>;
  isVacuumSyphonStage: () => boolean;
  getNiceNumber: (value: number) => string;
  weightingRules: readonly BuildingWeightingRule[];
  isEarlyGame: () => boolean;
  getIsPrestigeAllowed: () => (prestige: string) => boolean;
  getBananaRepublicObjectiveComplete: () => (objective: string) => boolean;
  getInflationChallengeAssistActive: () => () => boolean;
  Trigger: any;
  getWindow: () => any;
  diagnostics?: TickDiagnostics | undefined;
}

export function createCoreManagers({
  getGame,
  getSettings,
  getState,
  getBuildings,
  getProjects,
  isVacuumSyphonStage,
  getNiceNumber,
  weightingRules,
  isEarlyGame,
  getIsPrestigeAllowed,
  getBananaRepublicObjectiveComplete,
  getInflationChallengeAssistActive,
  Trigger,
  getWindow,
  diagnostics,
}: CoreManagersDependencies) {
  const niceWeightingCache = new Map<any, { value: number; text: string }>();
  const JobManager = {
    priorityList: [] as any[],
    craftingJobs: [] as any[],

    sortByPriority() {
      this.priorityList.sort((a, b) => a.priority - b.priority);
    },

    managedPriorityList() {
      const settings = getSettings();
      let ret: any[] = [];
      if (settings.autoJobs) {
        ret = this.priorityList.filter((job) => job.isManaged());
      }
      if (settings.autoCraftsmen) {
        ret = ret.concat(this.craftingJobs.filter((job) => job.isManaged()));
      }
      return ret;
    },

    servantsMax() {
      const game = getGame();
      if (!game.global.race.servants) {
        return 0;
      }

      let max = game.global.race.servants.max;
      for (let job of this.priorityList) {
        if (job.is.serve && !job.isManaged()) {
          max -= job.servants;
        }
      }
      return max;
    },

    skilledServantsMax() {
      const game = getGame();
      if (!game.global.race.servants) {
        return 0;
      }

      let max = game.global.race.servants.smax;
      for (let job of this.craftingJobs) {
        if (!job.isManaged()) {
          max -= job.servants;
        }
      }
      return max;
    },

    craftingMax() {
      const game = getGame();
      if (!game.global.city.foundry) {
        return 0;
      }

      let max = game.global.civic.craftsman.max;
      for (let job of this.craftingJobs) {
        if (!job.isManaged()) {
          max -= job.count;
        }
      }
      // Thermite is ignored by script, let's pretend it's not exists
      max -= game.global.city.foundry.Thermite ?? 0;
      return max;
    },
  };

  const BuildingManager = {
    priorityList: [] as any[],
    statePriorityList: [] as any[],

    updateBuildings() {
      const buildings = getBuildings();
      for (let building of Object.values(buildings)) {
        building.updateResourceRequirements();
        building.extraDescription = "";
      }
    },

    updateWeighting() {
      const profiling = diagnostics;
      const measure = <T>(phase: string, action: () => T): T => {
        if (profiling === undefined || !profiling.readPerformanceEnabled()) {
          return action();
        }
        const startedAtMs = profiling.nowMs();
        try {
          return action();
        } finally {
          profiling.recordPerformance(phase, profiling.nowMs() - startedAtMs);
        }
      };
      // Check generic conditions, and multiplier - x1 have no effect, so skip them too.
      const activeRules = measure(
        "autoBuild.beginCycle.updateBuildingWeighting.selectRules",
        () =>
          weightingRules.filter(
            (rule) => rule.enabled() && rule.multiplier() !== 1,
          ),
      );

      // Iterate over buildings
      measure("autoBuild.beginCycle.updateBuildingWeighting.applyRules", () => {
        for (let building of this.priorityList) {
          building.weighting = building._weighting;

          // Apply weighting rules
          for (const rule of activeRules) {
            const result = rule.match(building);
            // Rule passed
            if (result) {
              const note = rule.describe(result, building);
              if (note !== "") {
                building.extraDescription += note + "<br>";
              }
              building.weighting *= rule.multiplier(result);

              // Last rule disabled building, no need to check the rest
              if (building.weighting <= 0) {
                break;
              }
            }
          }
          if (building.weighting > 0) {
            building.weighting = Math.max(
              Number.MIN_VALUE,
              building.weighting - 1e-7 * building.count,
            );
            const cached = niceWeightingCache.get(building);
            let text: string;
            if (cached !== undefined && cached.value === building.weighting) {
              text = cached.text;
            } else {
              text = getNiceNumber(building.weighting);
              niceWeightingCache.set(building, {
                value: building.weighting,
                text,
              });
            }
            building.extraDescription =
              "AutoBuild weighting: " +
              text +
              "<br>" +
              building.extraDescription;
          }
        }
      });
    },

    sortByPriority() {
      this.priorityList.sort((a, b) => a.priority - b.priority);
      this.statePriorityList.sort((a, b) => a.priority - b.priority);
    },

    managedPriorityList() {
      return this.priorityList.filter((building) => building.weighting > 0);
    },

    managedStatePriorityList() {
      return this.statePriorityList.filter(
        (building) =>
          building.hasState() &&
          building.autoStateEnabled &&
          building.count > 0,
      );
    },
  };

  const ProjectManager = {
    priorityList: [] as any[],

    updateProjects() {
      for (let project of this.priorityList) {
        project.updateResourceRequirements();
        project.extraDescription = "";
      }
    },

    updateWeighting() {
      const settings = getSettings();
      const projects = getProjects();
      const state = getState();
      const game = getGame();
      const queuedTargetSet = new Set(state.queuedTargets);
      const triggerTargetSet = new Set(state.triggerTargets);
      const isPrestigeAllowed = getIsPrestigeAllowed();
      const bananaRepublicObjectiveComplete =
        getBananaRepublicObjectiveComplete();
      const inflationChallengeAssistActive =
        getInflationChallengeAssistActive();
      // Iterate over projects
      for (let project of this.priorityList) {
        project.weighting = project._weighting * project.currentStep;

        if (!project.isUnlocked()) {
          project.weighting = 0;
          project.extraDescription = "Locked<br>";
        }
        if (!project.autoBuildEnabled || !settings.autoARPA) {
          project.weighting = 0;
          project.extraDescription = "AutoBuild disabled<br>";
        }
        if (
          project.count >= project.autoMax &&
          (project !== projects.ManaSyphon || !isPrestigeAllowed("vacuum"))
        ) {
          project.weighting = 0;
          project.extraDescription = "Maximum amount reached<br>";
        }
        if (settings.prestigeMADIgnoreArpa && isEarlyGame()) {
          project.weighting = 0;
          project.extraDescription = "Projects ignored Pre-MAD<br>";
        }
        if (queuedTargetSet.has(project)) {
          project.weighting = 0;
          project.extraDescription = "Queued project, processing...<br>";
        }
        if (triggerTargetSet.has(project)) {
          project.weighting = 0;
          project.extraDescription = "Active trigger, processing...<br>";
        }
        if (!project.isAffordable(true)) {
          project.weighting = 0;
          project.extraDescription = "Not enough storage<br>";
        }
        if (
          project === projects.ManaSyphon &&
          settings.prestigeBioseedConstruct &&
          settings.prestigeType !== "vacuum" &&
          game.global.race["witch_hunter"]
        ) {
          project.weighting = 0;
          project.extraDescription = "Not needed for current prestige<br>";
        }
        if (
          project === projects.ManaSyphon &&
          isVacuumSyphonStage() &&
          project.weighting > 0
        ) {
          project.weighting *= settings.buildingWeightingVacuumCollapse ?? 10;
          project.extraDescription +=
            "Vacuum Collapse Mana Syphon multiplier<br>";
        }
        if (
          project.weighting > 0 &&
          settings.achievementGuards &&
          settings.guardBananaRepublic &&
          game.global.race["banana"] &&
          project === projects.Monument &&
          !bananaRepublicObjectiveComplete("b5")
        ) {
          project.weighting *= settings.buildingWeightingBananaObjective;
          project.extraDescription += "Banana Republic objective<br>";
        }
        if (
          project.weighting > 0 &&
          inflationChallengeAssistActive() &&
          project === projects.StockExchange
        ) {
          project.weighting *= settings.buildingWeightingInflationMoney;
          project.extraDescription += "Inflation challenge Money helper<br>";
        }

        if (settings.arpaScaleWeighting) {
          project.weighting /= 1 - 0.01 * project.progress;
        }
        if (project.weighting > 0) {
          project.extraDescription = `AutoARPA weighting: ${getNiceNumber(
            project.weighting,
          )} (${project.currentStep}%)<br>${project.extraDescription}`;
        }
      }
    },

    sortByPriority() {
      this.priorityList.sort((a, b) => a.priority - b.priority);
    },

    managedPriorityList() {
      return this.priorityList.filter((project) => project.weighting > 0);
    },
  };

  const TriggerManager = {
    priorityList: [] as any[],
    targetTriggers: [] as any[],

    resetTargetTriggers() {
      this.targetTriggers = [];
      for (let trigger of this.priorityList) {
        trigger.updateComplete();
        if (
          !trigger.complete &&
          trigger.areRequirementsMet() &&
          trigger.isActionPossible() &&
          !this.actionConflicts(trigger)
        ) {
          this.targetTriggers.push(trigger);
        }
      }
    },

    getTrigger(seq: number) {
      return this.priorityList.find((trigger) => trigger.seq === seq);
    },

    sortByPriority() {
      this.priorityList.sort((a, b) => a.priority - b.priority);
    },

    AddTrigger(
      requirementType: any,
      requirementId: any,
      requirementCount: any,
      actionType: any,
      actionId: any,
      actionCount: any,
    ) {
      let trigger = new Trigger(
        this.priorityList.length,
        this.priorityList.length,
        requirementType,
        requirementId,
        requirementCount,
        actionType,
        actionId,
        actionCount,
      );
      this.priorityList.push(trigger);
      return trigger;
    },

    AddTriggerFromSetting(raw: any) {
      let existingSequence = this.priorityList.some(
        (trigger) => trigger.seq === raw.seq,
      );
      if (!existingSequence) {
        let trigger = new Trigger(
          raw.seq,
          raw.priority,
          raw.requirementType,
          raw.requirementId,
          raw.requirementCount,
          raw.actionType,
          raw.actionId,
          raw.actionCount,
        );
        this.priorityList.push(trigger);
      }
    },

    RemoveTrigger(seq: number) {
      let indexToRemove = this.priorityList.findIndex(
        (trigger) => trigger.seq === seq,
      );

      if (indexToRemove === -1) {
        return;
      }

      this.priorityList.splice(indexToRemove, 1);

      for (let i = 0; i < this.priorityList.length; i++) {
        let trigger = this.priorityList[i];
        trigger.seq = i;
        trigger.priority = i;
      }
    },

    DuplicateTrigger(seq: number) {
      let indexToDuplicate = this.priorityList.findIndex(
        (trigger) => trigger.seq === seq,
      );

      if (indexToDuplicate === -1) {
        return;
      }

      let triggerToDuplicate = this.priorityList[indexToDuplicate];
      let trigger = new Trigger(
        0,
        0,
        triggerToDuplicate.requirementType,
        triggerToDuplicate.requirementId,
        triggerToDuplicate.requirementCount,
        triggerToDuplicate.actionType,
        triggerToDuplicate.actionId,
        triggerToDuplicate.actionCount,
      );
      this.priorityList.splice(indexToDuplicate, 0, trigger);

      for (let i = 0; i < this.priorityList.length; i++) {
        let trigger = this.priorityList[i];
        trigger.seq = i;
        trigger.priority = i;
      }
    },

    EvalizeTrigger(seq: number) {
      let indexToEval = this.priorityList.findIndex(
        (trigger) => trigger.seq === seq,
      );

      if (indexToEval === -1) {
        return;
      }

      let trigger = this.priorityList[indexToEval];

      let check = "";
      switch (trigger.requirementType) {
        case "Eval":
          check = trigger.requirementId;
          break;
        default:
          check = `_("${trigger.requirementType}",${JSON.stringify(
            trigger.requirementId,
          )})`;
      }

      getWindow().prompt("Eval of this condition:", check);
    },

    // This function only checks if two triggers use the same resource, it does not check storage
    actionConflicts(trigger: any) {
      for (let targetTrigger of this.targetTriggers) {
        if (
          Object.keys(targetTrigger.cost()).some((cost) =>
            Object.keys(trigger.cost()).includes(cost),
          )
        ) {
          return true;
        }
      }

      return false;
    },
  };

  return { JobManager, BuildingManager, ProjectManager, TriggerManager };
}
