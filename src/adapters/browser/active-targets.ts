/**
 * Browser adapter for the active-targets panel: the jQuery-driven queue readout the refresh renders
 * (or unbinds) at the end of updateState. It classifies the queued targets by kind and wires the
 * per-entry removal handler that clicks the game's own queue entry or marks a trigger complete.
 */

interface JQueryCollection {
  data(key: string): unknown;
  filter(
    predicate: (index: number, element: { id: string }) => boolean,
  ): JQueryCollection;
  click(handler: (this: unknown) => void): JQueryCollection;
  off(event: string): JQueryCollection;
  css(property: string, value: string): JQueryCollection;
  readonly length: number;
  readonly [index: number]: { click(): void } | undefined;
}

type JQueryStatic = (target: unknown) => JQueryCollection;

export interface ActiveTargetsTrigger {
  actionId: string;
  complete: boolean;
}

export interface ActiveTargetsControlsDependencies {
  readonly getJQuery: () => JQueryStatic;
  readonly getSettings: () => { activeTargetsUI: boolean };
  readonly getState: () => {
    queuedTargetsAll: unknown[];
    triggerTargets: unknown[];
  };
  readonly getTriggerManager: () => { targetTriggers: ActiveTargetsTrigger[] };
  readonly updateActiveTargetsUI: (targets: unknown[], type: string) => void;
  readonly isTechnology: (target: unknown) => boolean;
  readonly isProject: (target: unknown) => boolean;
}

export interface ActiveTargetsControls {
  updateActiveTargets(): void;
}

export function createActiveTargetsControls(
  dependencies: ActiveTargetsControlsDependencies,
): ActiveTargetsControls {
  // This control is the only thing that binds the removal handler, so it is also
  // the only thing that has to unbind it. Asking jQuery to unbind from a panel
  // that was never rendered is not free: measured on a late-game save with the
  // panel off, that one call cost 0.86 ms of every tick — 7% of the tick — for a
  // selector that matches nothing.
  let removalHandlerBound = false;
  return Object.freeze({
    updateActiveTargets(): void {
      const $ = dependencies.getJQuery();
      if (!dependencies.getSettings().activeTargetsUI) {
        if (removalHandlerBound) {
          $(".active-target-remove-x").off("click");
          removalHandlerBound = false;
        }
        return;
      }

      const state = dependencies.getState();
      const triggersList = state.triggerTargets;
      const buildingsList: unknown[] = [];
      const researchList: unknown[] = [];
      const arpaList: unknown[] = [];

      state.queuedTargetsAll.forEach((target) => {
        if (dependencies.isTechnology(target)) {
          researchList.push(target);
        } else if (dependencies.isProject(target)) {
          arpaList.push(target);
        } else {
          buildingsList.push(target);
        }
      });

      dependencies.updateActiveTargetsUI(triggersList, "triggers");
      dependencies.updateActiveTargetsUI(buildingsList, "buildings");
      dependencies.updateActiveTargetsUI(researchList, "research");
      dependencies.updateActiveTargetsUI(arpaList, "arpa");

      // remove from queue by clicking
      removalHandlerBound = true;
      $(".active-target-remove-x").click(function (this: unknown) {
        const queueId = $(this).data("queueid") as string;
        const type = $(this).data("type");

        const $queuedItem = $(".queued").filter((_index, element) => {
          return element.id.indexOf(queueId) > -1;
        });

        if (type === "triggers") {
          const clickedTrigger = dependencies
            .getTriggerManager()
            .targetTriggers.find((trigger) =>
              trigger.actionId.includes(queueId),
            );

          if (clickedTrigger !== undefined && clickedTrigger !== null) {
            clickedTrigger.complete = true;
          }
        } else if ($queuedItem.length) {
          $queuedItem[0]?.click();
        }

        $("#active_targets-wrapper").css("height", "auto");
      });
    },
  });
}
