import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface JobSettingsDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createJobSettings({
  getDependency,
  getOverride,
}: JobSettingsDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const BasicJob = liveFunction(() => getDependency("BasicJob"));
  const CraftingJob = liveFunction(() => getDependency("CraftingJob"));
  const JobManager = liveObject(() => getDependency("JobManager"));
  const addSettingsNumber = liveFunction(() =>
    getDependency("addSettingsNumber"),
  );
  const addSettingsToggle = liveFunction(() =>
    getDependency("addSettingsToggle"),
  );
  const addTableInput = liveFunction(() => getDependency("addTableInput"));
  const addTableToggle = liveFunction(() => getDependency("addTableToggle"));
  const addToggleCallbacks = liveFunction(() =>
    getDependency("addToggleCallbacks"),
  );
  const buildSettingsSection = liveFunction(() =>
    getDependency("buildSettingsSection"),
  );
  const confirm = liveFunction(() => getDependency("confirm"));
  const document = liveObject(() => getDependency("document"));
  const jobs = liveObject(() => getDependency("jobs"));
  const resetCheckbox = liveFunction(() => getDependency("resetCheckbox"));
  const resetJobSettings = liveFunction(() =>
    getDependency("resetJobSettings"),
  );
  const settingsRaw = liveObject(() => getDependency("settingsRaw"));
  const sorterHelper = liveFunction(() => getDependency("sorterHelper"));
  const updateSettingsFromState = liveFunction(() =>
    getDependency("updateSettingsFromState"),
  );

  function buildJobSettingsImpl() {
    let sectionId = "job";
    let sectionName = "Job";

    let resetFunction = function () {
      resetJobSettings(true);
      updateSettingsFromState();
      updateJobSettingsContent();

      resetCheckbox("autoJobs", "autoCraftsmen");
    };

    buildSettingsSection(
      sectionId,
      sectionName,
      resetFunction,
      updateJobSettingsContent,
    );
  }

  function updateJobSettingsContentImpl() {
    let currentScrollPosition =
      document.documentElement.scrollTop || document.body.scrollTop;

    let currentNode = $("#script_jobContent");
    currentNode.empty().off("*");

    addSettingsToggle(
      currentNode,
      "jobSetDefault",
      "Set default job",
      "Automatically sets the default job in order of Quarry Worker -> Lumberjack -> Crystal Miner -> Scavenger -> Hunter -> Farmer -> Unemployed",
    );
    addSettingsToggle(
      currentNode,
      "jobManageServants",
      "Manage Servants",
      "Automatically manage servants, they will be used as substitute of regular workers, sharing same breakpoints and priorities, i.e. for breakpoint 10 script might assign 8 workers and 2 servants, and such.",
    );
    addSettingsNumber(
      currentNode,
      "jobLumberWeighting",
      "Final Lumberjack Weighting",
      "AFTER allocating breakpoints this weighting will be used to split weighted jobs",
    );
    addSettingsNumber(
      currentNode,
      "jobQuarryWeighting",
      "Final Quarry Worker Weighting",
      "AFTER allocating breakpoints this weighting will be used to split weighted jobs",
    );
    addSettingsNumber(
      currentNode,
      "jobCrystalWeighting",
      "Final Crystal Miner Weighting",
      "AFTER allocating breakpoints this weighting will be used to split weighted jobs",
    );
    addSettingsNumber(
      currentNode,
      "jobScavengerWeighting",
      "Final Scavenger Weighting",
      "AFTER allocating breakpoints this weighting will be used to split weighted jobs",
    );
    addSettingsNumber(
      currentNode,
      "jobRaiderWeighting",
      "Final Raider Weighting",
      "AFTER allocating breakpoints this weighting will be used to split weighted jobs",
    );
    addSettingsNumber(
      currentNode,
      "jobForagerWeighting",
      "Final Forager Weighting",
      "AFTER allocating breakpoints this weighting will be used to split weighted jobs",
    );
    addSettingsToggle(
      currentNode,
      "jobDisableMiners",
      "Disable miners in Andromeda",
      "Disable Miners and Coal Miners after reaching Andromeda",
    );

    currentNode.append(`
          <table style="width:100%">
            <tr>
              <th class="has-text-warning" style="width:35%">Job</th>
              <th class="has-text-warning" style="width:17%">1st Pass</th>
              <th class="has-text-warning" style="width:17%">2nd Pass</th>
              <th class="has-text-warning" style="width:17%">3rd Pass</th>
              <th class="has-text-warning" style="width:9%" title="When enabled script will limit amount of assigned workers down to maximum useful quantity, moving idling workers to other jobs">Smart</th>
              <td style="width:5%"><span id="script_resetJobsPriority" class="script-refresh"></span></td>
            </tr>
            <tbody id="script_jobTableBody"></tbody>
          </table>`);

    $("#script_resetJobsPriority").on("click", function () {
      if (confirm("Are you sure you wish to reset jobs priority?")) {
        JobManager.priorityList = Object.values(jobs);
        for (let i = 0; i < JobManager.priorityList.length; i++) {
          let id = JobManager.priorityList[i]._originalId;
          settingsRaw["job_p_" + id] = i;
        }
        updateSettingsFromState();
        updateJobSettingsContent();
      }
    });

    let tableBodyNode = $("#script_jobTableBody");
    let newTableBodyText = "";

    for (let i = 0; i < JobManager.priorityList.length; i++) {
      const job = JobManager.priorityList[i];
      newTableBodyText += `<tr value="${job._originalId}" class="script-draggable"><td id="script_${job._originalId}" style="width:35%"></td><td style="width:17%"></td><td style="width:17%"></td><td style="width:17%"></td><td style="width:9%"></td><td style="width:5%"></td></tr>`;
    }
    tableBodyNode.append($(newTableBodyText));

    for (let i = 0; i < JobManager.priorityList.length; i++) {
      const job = JobManager.priorityList[i];
      let jobElement = $("#script_" + job._originalId);

      buildJobSettingsToggle(jobElement, job);
      jobElement = jobElement.next();
      buildJobSettingsInput(jobElement, job, 1);
      jobElement = jobElement.next();
      buildJobSettingsInput(jobElement, job, 2);
      jobElement = jobElement.next();
      buildJobSettingsInput(jobElement, job, 3);
      jobElement = jobElement.next();
      if (job.is.smart) {
        addTableToggle(jobElement, "job_s_" + job._originalId);
      }

      jobElement = jobElement.next();
      jobElement.append($('<span class="script-lastcolumn"></span>'));
    }

    tableBodyNode.sortable({
      items: "tr:not(.unsortable)",
      helper: sorterHelper,
      update: function () {
        let sortedIds = tableBodyNode.sortable("toArray", {
          attribute: "value",
        });
        for (let i = 0; i < sortedIds.length; i++) {
          settingsRaw["job_p_" + sortedIds[i]] = i;
        }

        JobManager.sortByPriority();
        updateSettingsFromState();
      },
    });

    document.documentElement.scrollTop = document.body.scrollTop =
      currentScrollPosition;
  }

  function buildJobSettingsToggleImpl(node, job) {
    let settingKey = "job_" + job._originalId;
    let color =
      job === jobs.Unemployed
        ? "warning"
        : job instanceof CraftingJob
          ? "danger"
          : job instanceof BasicJob
            ? "info"
            : "advanced";
    node
      .addClass(
        "script_bg_" +
          settingKey +
          (settingsRaw.overrides[settingKey] ? " inactive-row" : ""),
      )
      .append(
        addToggleCallbacks(
          $(`
          <label tabindex="0" class="switch" style="margin-top:4px; margin-left:10px;">
            <input class="script_${settingKey}" type="checkbox"${
              settingsRaw[settingKey] ? " checked" : ""
            }>
            <span class="check" style="height:5px; max-width:15px"></span>
            <span class="has-text-${color}" style="margin-left: 20px;">${
              job._originalName
            }</span>
          </label>`),
          settingKey,
        ),
      );
  }

  function buildJobSettingsInputImpl(node, job, breakpoint) {
    if (job instanceof CraftingJob) {
      node.append(`<span>Managed</span>`);
    } else if (breakpoint === 3 && job.is.split) {
      node.append(`<span>Weighted</span>`);
    } else {
      addTableInput(node, `job_b${breakpoint}_${job._originalId}`);
    }
  }

  function buildJobSettings(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildJobSettings") ?? buildJobSettingsImpl;
    return implementation.apply(this, args);
  }

  function updateJobSettingsContent(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateJobSettingsContent") ?? updateJobSettingsContentImpl;
    return implementation.apply(this, args);
  }

  function buildJobSettingsToggle(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildJobSettingsToggle") ?? buildJobSettingsToggleImpl;
    return implementation.apply(this, args);
  }

  function buildJobSettingsInput(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("buildJobSettingsInput") ?? buildJobSettingsInputImpl;
    return implementation.apply(this, args);
  }

  return {
    buildJobSettings,
    updateJobSettingsContent,
    buildJobSettingsToggle,
    buildJobSettingsInput,
  };
}
