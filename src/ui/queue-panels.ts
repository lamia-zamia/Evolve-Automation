/**
 * The two queue panels: the detailed active-targets readout beside the build queue, and the build
 * planner wrapper.
 *
 * TRANSITIONAL: the DOM implementation is the game's jQuery today. The structural types below are
 * the whole surface these panels need, so the implementation can be replaced without touching them.
 */

interface QueuePanelNode {
  readonly length: number;
  readonly [index: number]: unknown;
  before(content: string): unknown;
  css(property: string, value: string): unknown;
  hide(): unknown;
  html(content: string | readonly string[]): unknown;
  on(events: string, handler: () => void): unknown;
  outerHeight(): number;
  remove(): unknown;
  show(): unknown;
  toggle(state: boolean): unknown;
}

interface QueuePanelJQuery {
  (selector: string): QueuePanelNode;
  isEmptyObject(value: unknown): boolean;
}

/** The fields the readout reads off one queued target, whatever kind of target it is. */
interface QueuedTarget {
  readonly name: string;
  readonly id: string;
  readonly cost: Readonly<Record<string, number>>;
  readonly count?: number;
  readonly is?: { readonly multiSegmented?: boolean };
  readonly instance?: { readonly time?: unknown };
  readonly _tab?: string;
  readonly progress?: number;
  readonly currentStep?: number;
  readonly gameMax?: number;
}

/** The resource fields one cost row reads. */
interface QueuePanelResource {
  readonly name: string;
  readonly title: string;
  readonly currentQuantity: number;
  readonly maxQuantity: number;
  readonly income: number;
}

interface QueuePanelGame {
  readonly global: {
    readonly resource: Readonly<Record<string, { readonly max: number }>>;
    readonly race: { readonly replicator?: { readonly res?: string } };
  };
}

interface QueuePanelPoly {
  timeFormat(seconds: number): string;
}

interface QueuePanelSettings {
  buildPlannerCollapsed?: boolean;
}

interface QueuePanelState {
  plannerStats: unknown;
}

interface SegmentedTimeLeft {
  readonly timeLeft: string;
  readonly resource: string;
}

interface ResizeEntry {
  readonly borderBoxSize?: readonly { readonly blockSize: number }[];
}

type ResizeObserverConstructor = new (
  callback: (entries: readonly ResizeEntry[]) => void,
) => { observe(target: unknown): void };

export interface QueuePanelsDependencies {
  getJQuery: () => QueuePanelJQuery;
  getGame: () => QueuePanelGame;
  getResources: () => Readonly<Record<string, QueuePanelResource>>;
  getPoly: () => QueuePanelPoly;
  getSettingsRaw: () => QueuePanelSettings;
  getState: () => QueuePanelState;
  getMultiSegmentedTimeLeft: (target: QueuedTarget) => SegmentedTimeLeft;
  isProject: (target: unknown) => boolean;
  isTechnology: (target: unknown) => boolean;
  getResizeObserver: () => ResizeObserverConstructor | undefined;
  updateSettingsFromState: () => void;
  makePlannerStats: () => Record<string, unknown> | null;
  savePlannerStats: (stats: unknown) => boolean;
}

/**
 * How many times a target's listed cost is still owed. A target that does not declare its steps
 * owes its listed cost once; that is the whole cost of a plain building.
 */
function remainingCostMultiplier(
  target: QueuedTarget,
  isArpaProject: boolean,
  isMultiSegmented: boolean,
): number {
  if (isArpaProject) {
    const { progress, currentStep } = target;
    if (progress === undefined || currentStep === undefined) return 1;
    return (100 - progress) / currentStep;
  }
  if (isMultiSegmented) {
    const { gameMax, count } = target;
    if (gameMax === undefined || count === undefined) return 1;
    return gameMax - count;
  }
  return 1;
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
  function updateActiveTargetsUI(
    queuedTargets: readonly QueuedTarget[],
    type: string,
  ) {
    const $ = getJQuery();
    const game = getGame();
    const resources = getResources();
    const poly = getPoly();

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
          researchTimeLeft = 0;
        const isArpaProject = type === "arpa" || isProject(target),
          isMultiSegmented = target.is?.multiSegmented === true,
          isTablessBuilding = type === "buildings" && !target._tab;

        if (target.count && !isMultiSegmented) {
          targetName += ` #${target.count + 1}`;
        }

        if (target.instance && target.instance.time) {
          targetTimeLeft = `${target.instance.time}`;
        }

        const costs = target.cost;
        const costMultiplier = remainingCostMultiplier(
          target,
          isArpaProject,
          isMultiSegmented,
        );

        if (isTechnology(target)) {
          if ($.isEmptyObject(target.cost)) {
            targetTimeLeft = "Waiting on prerequisite";
          } else if (
            target.cost.Knowledge > game.global.resource.Knowledge.max
          ) {
            targetTimeLeft = "Not enough Knowledge";
          }
        } else if (isArpaProject) {
          targetName += ` (${target.progress}%)`;

          const segmentedTimeLeft = getMultiSegmentedTimeLeft(target);
          targetTimeLeft = `${segmentedTimeLeft.timeLeft}</span> <span class="has-text-danger">(${segmentedTimeLeft.resource})</span>`;
        }

        const costsHTML = Object.keys(costs)
          .map((resource) => {
            const res = resources[resource];
            let className = "has-text-success",
              resourceTimeLeft = "";

            const resourceCost = costs[resource] * costMultiplier;

            if (res.currentQuantity < resourceCost) {
              className = "has-text-danger";

              if (res.maxQuantity >= resourceCost && res.income > 0) {
                const timeLeftRaw =
                  (resourceCost - res.currentQuantity) / res.income;

                if (isTechnology(target) && timeLeftRaw > researchTimeLeft) {
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
              game.global.race.replicator?.res === resource
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

          const segmentedTimeLeft = getMultiSegmentedTimeLeft(target);
          targetTimeLeft = `${segmentedTimeLeft.timeLeft} <span class="has-text-danger">(${segmentedTimeLeft.resource})</span>`;
        }

        if (isTechnology(target) && targetTimeLeft === "") {
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
    const $ = getJQuery();
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

    const ResizeObserver = getResizeObserver();
    if (typeof ResizeObserver === "function") {
      const resizeObserver = new ResizeObserver((entries) => {
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
    getJQuery()("#active_targets-wrapper").remove();
  }

  function buildBuildPlannerUI() {
    const $ = getJQuery();
    const settingsRaw = getSettingsRaw();
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
      updateSettingsFromState();
    });
    $("#script_planner-reset").on("click", function () {
      const stats = makePlannerStats();
      getState().plannerStats = stats;
      if (stats !== null) savePlannerStats(stats);
      $("#script_planner-stats-text").html("");
    });
  }

  function removeBuildPlannerUI() {
    getJQuery()("#script_planner-wrapper").remove();
  }

  return {
    updateActiveTargetsUI,
    buildActiveTargetsUI,
    removeActiveTargetsUI,
    buildBuildPlannerUI,
    removeBuildPlannerUI,
  };
}
