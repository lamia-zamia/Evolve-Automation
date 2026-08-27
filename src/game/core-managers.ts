import type { TickDiagnostics } from "../ports/tick.ts";
import {
  createCountTally,
  createPhaseMeasure,
  type PhaseTimingSink,
} from "../utils/performance.ts";
import type {
  BuildingWeightingCandidate,
  BuildingWeightingDecider,
  BuildingWeightingDecision,
  BuildingWeightingSnapshot,
} from "../domain/progression/build/building-weighting.ts";

type TriggerValue = string | number | boolean;

const APPLY_RULES_PHASE =
  "autoBuild.beginCycle.updateBuildingWeighting.applyRules";
const ZEROED_BY_PREFIX = "autoBuild.weighting.zeroedBy.";

interface CoreSettings {
  autoARPA: boolean;
  autoCraftsmen: boolean;
  autoJobs: boolean;
  prestigeMADIgnoreArpa: boolean;
  prestigeBioseedConstruct: boolean;
  prestigeType: string;
  buildingWeightingVacuumCollapse: number;
  achievementGuards: boolean;
  guardBananaRepublic: boolean;
  buildingWeightingBananaObjective: number;
  buildingWeightingInflationMoney: number;
  arpaScaleWeighting: boolean;
  [key: string]: boolean | number | string | undefined;
}

interface CoreServants {
  max: number;
  smax: number;
}

interface CoreGame {
  global: {
    race: {
      servants?: CoreServants;
      [key: string]: boolean | CoreServants | undefined;
    };
    city: { foundry?: Record<string, number> };
    civic: { craftsman: { max: number } };
  };
}

interface CoreState {
  queuedTargets: CoreProject[];
  triggerTargets: CoreProject[];
}

interface CoreJob {
  priority: number;
  servants: number;
  count: number;
  is: { serve?: boolean };
  isManaged: () => boolean;
}

interface CoreBuilding {
  priority: number;
  weighting: number;
  count: number;
  autoStateEnabled: boolean;
  extraDescription: string;
  updateResourceRequirements: () => void;
  hasState: () => boolean;
}

interface CoreProject {
  priority: number;
  weighting: number;
  _weighting: number;
  currentStep: number;
  progress: number;
  count: number;
  autoMax: number;
  autoBuildEnabled: boolean;
  extraDescription: string;
  isUnlocked: () => boolean;
  isAffordable: (includeStorage: boolean) => boolean;
  updateResourceRequirements: () => void;
}

interface CoreProjects extends Record<string, CoreProject> {
  ManaSyphon: CoreProject;
  Monument: CoreProject;
  StockExchange: CoreProject;
}

interface CoreTrigger {
  seq: number;
  priority: number;
  requirementType: TriggerValue;
  requirementId: TriggerValue;
  requirementCount: number;
  actionType: TriggerValue;
  actionId: TriggerValue;
  actionCount: number;
  complete: boolean;
  updateComplete: () => void;
  areRequirementsMet: () => boolean;
  isActionPossible: () => boolean;
  cost: () => Record<string, unknown>;
}

interface TriggerConstructor {
  new (
    seq: number,
    priority: number,
    requirementType: TriggerValue,
    requirementId: TriggerValue,
    requirementCount: number,
    actionType: TriggerValue,
    actionId: TriggerValue,
    actionCount: number,
  ): CoreTrigger;
}

interface TriggerSetting {
  seq: number;
  priority: number;
  requirementType: TriggerValue;
  requirementId: TriggerValue;
  requirementCount: number;
  actionType: TriggerValue;
  actionId: TriggerValue;
  actionCount: number;
}

interface CoreWindow {
  prompt: (message: string, defaultValue: TriggerValue) => unknown;
}

interface CoreManagersDependencies {
  getGame: () => CoreGame;
  getSettings: () => CoreSettings;
  getState: () => CoreState;
  getBuildings: () => Record<string, CoreBuilding>;
  getProjects: () => CoreProjects;
  isVacuumSyphonStage: () => boolean;
  getNiceNumber: (value: number) => string;
  weightingDecider: BuildingWeightingDecider;
  readWeightingSnapshot: () => BuildingWeightingSnapshot;
  readWeightingCandidate: (
    building: unknown,
    timing?: PhaseTimingSink,
  ) => BuildingWeightingCandidate;
  describeBuildingWeighting: (
    candidateId: string,
    decision: BuildingWeightingDecision,
  ) => string;
  isEarlyGame: () => boolean;
  getIsPrestigeAllowed: () => (prestige: string) => boolean;
  getBananaRepublicObjectiveComplete: () => (objective: string) => boolean;
  getInflationChallengeAssistActive: () => () => boolean;
  Trigger: TriggerConstructor;
  getWindow: () => CoreWindow;
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
  weightingDecider,
  readWeightingSnapshot,
  readWeightingCandidate,
  describeBuildingWeighting,
  isEarlyGame,
  getIsPrestigeAllowed,
  getBananaRepublicObjectiveComplete,
  getInflationChallengeAssistActive,
  Trigger,
  getWindow,
  diagnostics,
}: CoreManagersDependencies) {
  const JobManager = {
    priorityList: [] as CoreJob[],
    craftingJobs: [] as CoreJob[],

    sortByPriority() {
      this.priorityList.sort((a, b) => a.priority - b.priority);
    },

    managedPriorityList() {
      const settings = getSettings();
      let ret: CoreJob[] = [];
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
    priorityList: [] as CoreBuilding[],
    statePriorityList: [] as CoreBuilding[],

    updateBuildings() {
      const buildings = getBuildings();
      for (let building of Object.values(buildings)) {
        building.updateResourceRequirements();
        building.extraDescription = "";
      }
    },

    updateWeighting() {
      const measure = createPhaseMeasure(diagnostics);
      // One sample for the whole phase, so every rule sees the same state.
      const snapshot = measure(
        "autoBuild.beginCycle.updateBuildingWeighting.readSnapshot",
        () => readWeightingSnapshot(),
      );
      const phase = measure(
        "autoBuild.beginCycle.updateBuildingWeighting.selectRules",
        () => weightingDecider.beginPhase(snapshot),
      );

      // The decision is pure; only these two writes reach the wrapper.
      // `extraDescription` is assigned rather than appended because
      // `updateBuildings` cleared it earlier in the same cycle, and the phases
      // that add their own notes all run after this one.
      measure(APPLY_RULES_PHASE, () => {
        // The three steps are timed inline rather than through `measure`,
        // and their totals recorded once, because a closure and a map write
        // per candidate would be a visible share of the loop this timing
        // exists to size. `timing` is undefined unless diagnostics are on, so
        // the normal path costs three optional calls and three additions.
        const timing =
          diagnostics?.readPerformanceEnabled() === true
            ? diagnostics
            : undefined;
        const tally = createCountTally(diagnostics);
        let sampleMs = 0;
        let decideMs = 0;
        let describeMs = 0;
        let unlockedCount = 0;
        let survivingCount = 0;
        for (const building of this.priorityList) {
          const sampleStartedMs = timing?.nowMs() ?? 0;
          const candidate = readWeightingCandidate(building, timing);
          const decideStartedMs = timing?.nowMs() ?? 0;
          const decision = phase.decide(candidate);
          const describeStartedMs = timing?.nowMs() ?? 0;
          building.weighting = decision.weight;
          building.extraDescription = describeBuildingWeighting(
            candidate.id,
            decision,
          );
          if (timing !== undefined) {
            const finishedMs = timing.nowMs();
            sampleMs += decideStartedMs - sampleStartedMs;
            decideMs += describeStartedMs - decideStartedMs;
            describeMs += finishedMs - describeStartedMs;
          }
          if (tally.enabled) {
            if (candidate.unlocked) unlockedCount++;
            if (decision.weight > 0) survivingCount++;
            if (decision.zeroedBy !== null) {
              tally.count(`${ZEROED_BY_PREFIX}${decision.zeroedBy}`);
            }
          }
        }
        if (timing !== undefined) {
          timing.recordPerformance(`${APPLY_RULES_PHASE}.sample`, sampleMs);
          timing.recordPerformance(`${APPLY_RULES_PHASE}.decide`, decideMs);
          timing.recordPerformance(`${APPLY_RULES_PHASE}.describe`, describeMs);
        }
        tally.count("autoBuild.weighting.candidates", this.priorityList.length);
        // An unlocked candidate is exactly the one whose sampling calls
        // `isAffordable`, rebuilds `cost`, and asks the three consumption
        // questions. This is the funnel width a two-pass sampler would narrow.
        tally.count("autoBuild.weighting.sampledUnlocked", unlockedCount);
        tally.count("autoBuild.weighting.surviving", survivingCount);
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
    priorityList: [] as CoreProject[],

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
    priorityList: [] as CoreTrigger[],
    targetTriggers: [] as CoreTrigger[],

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
      requirementType: TriggerValue,
      requirementId: TriggerValue,
      requirementCount: number,
      actionType: TriggerValue,
      actionId: TriggerValue,
      actionCount: number,
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

    AddTriggerFromSetting(raw: TriggerSetting) {
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

      for (const [i, trigger] of this.priorityList.entries()) {
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

      const triggerToDuplicate = this.priorityList[indexToDuplicate];
      if (!triggerToDuplicate) {
        return;
      }
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

      for (const [i, trigger] of this.priorityList.entries()) {
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

      const trigger = this.priorityList[indexToEval];
      if (!trigger) {
        return;
      }

      const check =
        trigger.requirementType === "Eval"
          ? trigger.requirementId
          : `_("${trigger.requirementType}",${JSON.stringify(
              trigger.requirementId,
            )})`;

      getWindow().prompt("Eval of this condition:", check);
    },

    // This function only checks if two triggers use the same resource, it does not check storage
    actionConflicts(trigger: CoreTrigger) {
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
