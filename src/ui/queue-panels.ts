type AnyRecord = Record<string, any>;

export interface QueuePanelsDependencies {
  getJQuery: () => any;
  getGame: () => AnyRecord;
  getResources: () => AnyRecord;
  getPoly: () => AnyRecord;
  getSettingsRaw: () => AnyRecord;
  getState: () => AnyRecord;
  getMultiSegmentedTimeLeft: (target: AnyRecord) => AnyRecord;
  isProject: (target: unknown) => boolean;
  isTechnology: (target: unknown) => boolean;
  getResizeObserver: () => any;
  updateSettingsFromState: () => void;
  makePlannerStats: () => AnyRecord;
  savePlannerStats: () => void;
}

export function createQueuePanels({
  getJQuery,
  getGame,
  getResources,
  getPoly,
  getSettingsRaw,
  getState,
  getMultiSegmentedTimeLeft,
  isProject,
  isTechnology,
  getResizeObserver,
  updateSettingsFromState,
  makePlannerStats,
  savePlannerStats,
}: QueuePanelsDependencies) {
  const dependencies = {
    getJQuery,
    getGame,
    getResources,
    getPoly,
    getSettingsRaw,
    getState,
    getMultiSegmentedTimeLeft,
    isProject,
    isTechnology,
    getResizeObserver,
    updateSettingsFromState,
    makePlannerStats,
    savePlannerStats,
  };
  function updateActiveTargetsUI(queuedTargets: AnyRecord[], type: string) {
    const $ = dependencies.getJQuery();
    const game = dependencies.getGame();
    const resources = dependencies.getResources();
    const poly = dependencies.getPoly();

    if (queuedTargets.length) {
      $(`#active_targets .target-type-box.${type}`).show();
    } else {
      $(`#active_targets .target-type-box.${type}`).hide();
      return;
    }

    $(`#active_targets ul.active_targets-list.${type}`).html(
      queuedTargets.map((target) => {
        let targetName = target.name,
          targetTimeLeft = "",
          targetSegments = "",
          researchTimeLeft = 0,
          isArpaProject = type === "arpa" || dependencies.isProject(target),
          isMultiSegmented = target.is && target.is.multiSegmented,
          isTablessBuilding = type === "buildings" && !target._tab;

        if (target.count && !isMultiSegmented) {
          targetName += ` #${target.count + 1}`;
        }

        if (target.instance && target.instance.time) {
          targetTimeLeft = `${target.instance.time}`;
        }

        const costs = target.cost;

        if (dependencies.isTechnology(target)) {
          if ($.isEmptyObject(target.cost)) {
            targetTimeLeft = "Waiting on prerequisite";
          } else if (
            target.cost.Knowledge > game.global.resource.Knowledge.max
          ) {
            targetTimeLeft = "Not enough Knowledge";
          }
        } else if (isArpaProject) {
          targetName += ` (${target.progress}%)`;

          const segmentedTimeLeft =
            dependencies.getMultiSegmentedTimeLeft(target);
          targetTimeLeft = `${segmentedTimeLeft.timeLeft}</span> <span class="has-text-danger">(${segmentedTimeLeft.resource})</span>`;
        }

        const costsHTML = Object.keys(costs)
          .map((resource) => {
            let res = resources[resource],
              className = "has-text-success",
              resourceTimeLeft = "";

            let resourceCost = costs[resource];

            if (isArpaProject) {
              resourceCost =
                costs[resource] *
                ((100 - target.progress) / target.currentStep);
            } else if (isMultiSegmented) {
              resourceCost = costs[resource] * (target.gameMax - target.count);
            }

            if (res.currentQuantity < resourceCost) {
              className = "has-text-danger";

              if (res.maxQuantity >= resourceCost && res.income > 0) {
                const timeLeftRaw =
                  (resourceCost - res.currentQuantity) / res.income;

                if (
                  dependencies.isTechnology(target) &&
                  timeLeftRaw > researchTimeLeft
                ) {
                  researchTimeLeft = timeLeftRaw;
                }

                resourceTimeLeft = `${poly.timeFormat(timeLeftRaw)}`;
                if (res === resources.Soul_Gem) {
                  resourceTimeLeft = `~${resourceTimeLeft}`;
                }
              } else if (
                isArpaProject &&
                res.name === "Knowledge" &&
                res.income > 0
              ) {
                resourceTimeLeft = poly.timeFormat(
                  res.currentQuantity / res.income,
                );
              } else {
                targetTimeLeft = resourceTimeLeft = "Never";
              }
            }

            const progressBarWidth = (res.currentQuantity / resourceCost) * 100;

            const isReplicatingClassName =
              game.global.race.replicator &&
              game.global.race.replicator.res === resource
                ? "is-replicating"
                : "";

            return `
                    <li>
                        <div class='active_targets-resource-row'>
                            <div class='active_targets-resource-text'>
                                <span class='${className}'>${res.title}</span>
                            </div>
                            <div class="percentage-full-progress-bar-wrapper ${isReplicatingClassName}">
                                <div class="percentage-full-progress-bar" style="width: ${progressBarWidth}%;"></div>
                            </div>
                            <div class="active_targets-time-left">${resourceTimeLeft}</div>
                        </div>
                    </li>`;
          })
          .join("");

        if (isMultiSegmented) {
          targetSegments = `(${target.count} / ${target.gameMax})`;

          const segmentedTimeLeft =
            dependencies.getMultiSegmentedTimeLeft(target);
          targetTimeLeft = `${segmentedTimeLeft.timeLeft} <span class="has-text-danger">(${segmentedTimeLeft.resource})</span>`;
        }

        if (dependencies.isTechnology(target) && targetTimeLeft === "") {
          targetTimeLeft = poly.timeFormat(researchTimeLeft);
        }

        const targetNameDisplay = `<span class="active-target-title name">${targetName} </span><span class="active-target-title time">${targetTimeLeft} <span class="active-target-segments has-text-special">${targetSegments}</span></span>`;

        let queueid = "";
        if (type === "buildings") {
          queueid = isTablessBuilding
            ? `${target.id}`
            : `${target._tab}-${target.id}`;
        } else if (type === "arpa") {
          queueid = `${target._tab}${target.id}`;
        } else if (type === "research" || type === "triggers") {
          queueid = target.id;
        }

        return `
                    <li class="active-target-li">
                        ${targetNameDisplay} <span class="active-target-remove-x ${type}" data-queueid="${queueid}" data-type="${type}">＋</span>
                        <ul class="active_targets-sub-list">
                            ${costsHTML}
                        </ul>
                    </li>
                `;
      }),
    );
  }

  function buildActiveTargetsUI() {
    const $ = dependencies.getJQuery();
    $("#buildQueue").before(`
            <div id="active_targets-wrapper" class="bldQueue vscroll right">
                <h2 class="has-text-success">Detailed Queue</h2>
                <div id="active_targets">
                    <div class="target-type-box triggers" style="display: none;">
                        <h2>Triggers</h2>
                        <ul class="active_targets-list triggers"></ul>
                    </div>
                    <div class="target-type-box buildings" style="display: none;">
                        <h2>Buildings</h2>
                        <ul class="active_targets-list buildings"></ul>
                    </div>
                    <div class="target-type-box research" style="display: none;">
                        <h2>Research</h2>
                        <ul class="active_targets-list research"></ul>
                    </div>
                    <div class="target-type-box arpa" style="display: none;">
                        <h2>A.R.P.A.</h2>
                        <ul class="active_targets-list arpa"></ul>
                    </div>
                </div>
            </div>`);

    const ResizeObserver = dependencies.getResizeObserver();
    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver((entries: AnyRecord[]) => {
        for (const entry of entries) {
          if (entry.borderBoxSize) {
            const elementHeight = entry.borderBoxSize[0].blockSize;
            const totalHeight = `${
              elementHeight + $("#buildQueue").outerHeight()
            }px`;

            $("#msgQueue").css(
              "max-height",
              `calc((100vh - ${totalHeight}) - 6rem)`,
            );
          }
        }
      });

      resizeObserver.observe($("#active_targets-wrapper")[0]);
    }
  }

  function removeActiveTargetsUI() {
    dependencies.getJQuery()("#active_targets-wrapper").remove();
  }

  function buildBuildPlannerUI() {
    const $ = dependencies.getJQuery();
    const settingsRaw = dependencies.getSettingsRaw();
    if ($("#buildQueue").length === 0) {
      return;
    }
    $("#buildQueue").before(`
            <div id="script_planner-wrapper" class="bldQueue vscroll right">
                <h2 id="script_planner-header" class="has-text-success">Script Planner</h2>
                <div id="script_planner">
                    <ul id="script_planner-list"></ul>
                    <div id="script_planner-stats">
                        <h2>Bottlenecks <a id="script_planner-reset">reset</a></h2>
                        <div id="script_planner-stats-text"></div>
                    </div>
                </div>
            </div>`);

    $("#script_planner").toggle(!settingsRaw.buildPlannerCollapsed);
    $("#script_planner-header").on("click", function () {
      settingsRaw.buildPlannerCollapsed = !settingsRaw.buildPlannerCollapsed;
      $("#script_planner").toggle(!settingsRaw.buildPlannerCollapsed);
      dependencies.updateSettingsFromState();
    });
    $("#script_planner-reset").on("click", function () {
      dependencies.getState().plannerStats = dependencies.makePlannerStats();
      dependencies.savePlannerStats();
      $("#script_planner-stats-text").html("");
    });
  }

  function removeBuildPlannerUI() {
    dependencies.getJQuery()("#script_planner-wrapper").remove();
  }

  return {
    updateActiveTargetsUI,
    buildActiveTargetsUI,
    removeActiveTargetsUI,
    buildBuildPlannerUI,
    removeBuildPlannerUI,
  };
}
