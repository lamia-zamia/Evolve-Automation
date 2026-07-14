import { liveFunction, liveObject } from "./dependencies.ts";

type Loose = any;

interface TotalDaysTopBarDependencies {
  getDependency: (name: string) => Loose;
  getOverride: (name: string) => Loose;
}

export function createTotalDaysTopBar({
  getDependency,
  getOverride,
}: TotalDaysTopBarDependencies) {
  const $ = liveFunction(() => getDependency("$"));
  const document = liveObject(() => getDependency("document"));
  const game = liveObject(() => getDependency("game"));
  const settings = liveObject(() => getDependency("settings"));

  function updateTotalDaysInTopBarImpl() {
    if (settings.displayTotalDaysTypeInTopBar) {
      addTotalDaysToTopBar();
    } else {
      removeTotalDaysFromTopBar();
    }

    const totalDaysNode = document.getElementById("s-total-days-count");
    if (totalDaysNode == null) {
      return;
    } // Element has not yet been added, cannot update

    totalDaysNode.textContent = game.global.stats.days;
  }

  function addTotalDaysToTopBarImpl() {
    const nodeId = "s-total-days";
    if (document.getElementById(nodeId) !== null) {
      return;
    } // We've already added the info to the top bar

    const calendarNode = $("#topBar .calendar");
    if (calendarNode.length === 0) {
      return;
    } // The node that we want to add it to doesn't exist yet

    calendarNode
      .find(".day")
      .after(
        $(
          `<span id="s-total-days" class="has-text-warning" style="padding-left: 3px;">(<span id="s-total-days-count"></span>)</span>`,
        ),
      );
  }

  function removeTotalDaysFromTopBarImpl() {
    let totalDaysNode = document.getElementById("s-total-days");
    if (totalDaysNode == null) {
      return;
    } // Element has not yet been added, nothing to do

    totalDaysNode.remove();
  }

  function updateTotalDaysInTopBar(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("updateTotalDaysInTopBar") ?? updateTotalDaysInTopBarImpl;
    return implementation.apply(this, args);
  }

  function addTotalDaysToTopBar(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("addTotalDaysToTopBar") ?? addTotalDaysToTopBarImpl;
    return implementation.apply(this, args);
  }

  function removeTotalDaysFromTopBar(this: Loose, ...args: Loose[]) {
    const implementation =
      getOverride("removeTotalDaysFromTopBar") ?? removeTotalDaysFromTopBarImpl;
    return implementation.apply(this, args);
  }

  return {
    updateTotalDaysInTopBar,
    addTotalDaysToTopBar,
    removeTotalDaysFromTopBar,
  };
}
