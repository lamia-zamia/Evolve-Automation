import {
  createJobSettingsReadModel,
  type JobSettingsBreakpoint,
  type JobSettingsReadModel,
  type JobSettingsRow,
} from "../../../domain/civic/job-settings.ts";
import {
  requireFunction,
  requireRecord,
  requireString,
  type UnknownRecord,
} from "../../validation.ts";

interface JobSettingsEvolveDependencies {
  readonly getBasicJob: () => unknown;
  readonly getCraftingJob: () => unknown;
  readonly getJobManager: () => unknown;
  readonly getJobs: () => unknown;
  readonly getSettingsRaw: () => unknown;
}

export interface JobSettingsEvolveAdapter {
  readJobSettingsReadModel(): JobSettingsReadModel;
  resetPriorities(): void;
  reorderJobs(jobIds: readonly string[]): void;
}

function readPriorityList(manager: UnknownRecord): readonly UnknownRecord[] {
  const priorityList = manager["priorityList"];
  if (!Array.isArray(priorityList)) {
    throw new TypeError("JobManager.priorityList must be an array");
  }
  return priorityList.map((job, index) =>
    requireRecord(job, `JobManager.priorityList[${index}]`),
  );
}

function readJobId(job: UnknownRecord, path: string): string {
  return requireString(job["_originalId"], `${path}._originalId`);
}

function readJobRows(
  manager: UnknownRecord,
  jobs: UnknownRecord,
  settingsRaw: UnknownRecord,
  BasicJob: (...args: unknown[]) => unknown,
  CraftingJob: (...args: unknown[]) => unknown,
): readonly JobSettingsRow[] {
  const overrides = requireRecord(
    settingsRaw["overrides"],
    "settingsRaw.overrides",
  );
  return readPriorityList(manager).map((job, index) => {
    const path = `JobManager.priorityList[${index}]`;
    const id = readJobId(job, path);
    const flags = requireRecord(job["is"], `${path}.is`);
    const settingName = `job_${id}`;
    const breakpoint = (number: 1 | 2 | 3): JobSettingsBreakpoint => {
      if (job instanceof CraftingJob) {
        return { kind: "managed" };
      }
      if (number === 3 && Boolean(flags["split"])) {
        return { kind: "weighted" };
      }
      return { kind: "input", settingName: `job_b${number}_${id}` };
    };
    const color =
      job === jobs["Unemployed"]
        ? "warning"
        : job instanceof CraftingJob
          ? "danger"
          : job instanceof BasicJob
            ? "info"
            : "advanced";
    return {
      id,
      label: requireString(job["_originalName"], `${path}._originalName`),
      color,
      enabledSettingName: settingName,
      enabled: Boolean(settingsRaw[settingName]),
      hasOverride: Boolean(overrides[settingName]),
      breakpoints: [breakpoint(1), breakpoint(2), breakpoint(3)],
      ...(flags["smart"] ? { smartSettingName: `job_s_${id}` } : {}),
    };
  });
}

/** Maps volatile Evolve job classes, catalog, settings, and manager state. */
export function createJobSettingsEvolveAdapter({
  getBasicJob,
  getCraftingJob,
  getJobManager,
  getJobs,
  getSettingsRaw,
}: JobSettingsEvolveDependencies): JobSettingsEvolveAdapter {
  function readJobSettingsReadModel(): JobSettingsReadModel {
    const BasicJob = requireFunction(getBasicJob(), "BasicJob");
    const CraftingJob = requireFunction(getCraftingJob(), "CraftingJob");
    return createJobSettingsReadModel({
      rows: readJobRows(
        requireRecord(getJobManager(), "JobManager"),
        requireRecord(getJobs(), "jobs"),
        requireRecord(getSettingsRaw(), "settingsRaw"),
        BasicJob,
        CraftingJob,
      ),
    });
  }

  function resetPriorities(): void {
    const manager = requireRecord(getJobManager(), "JobManager");
    const jobs = requireRecord(getJobs(), "jobs");
    const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");
    const priorityList = Object.values(jobs).map((job, index) =>
      requireRecord(job, `jobs[${index}]`),
    );
    manager["priorityList"] = priorityList;
    for (let index = 0; index < priorityList.length; index += 1) {
      const id = readJobId(
        requireRecord(priorityList[index], `JobManager.priorityList[${index}]`),
        `JobManager.priorityList[${index}]`,
      );
      settingsRaw[`job_p_${id}`] = index;
    }
  }

  function reorderJobs(jobIds: readonly string[]): void {
    const manager = requireRecord(getJobManager(), "JobManager");
    const settingsRaw = requireRecord(getSettingsRaw(), "settingsRaw");
    const sortByPriority = requireFunction(
      manager["sortByPriority"],
      "JobManager.sortByPriority",
    );
    jobIds.forEach((jobId, index) => {
      const id = requireString(jobId, `jobIds[${index}]`);
      settingsRaw[`job_p_${id}`] = index;
    });
    Reflect.apply(sortByPriority, manager, []);
  }

  return Object.freeze({
    readJobSettingsReadModel,
    resetPriorities,
    reorderJobs,
  });
}
