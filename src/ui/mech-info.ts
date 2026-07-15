type AnyRecord = Record<string, any>;

export interface MechInfoDependencies {
  getDocument: () => any;
  getJQuery: () => any;
  getGame: () => AnyRecord;
  getMechManager: () => AnyRecord;
  getVueById: (id: string) => AnyRecord;
  getNiceNumber: (value: number) => string;
}

export function createMechInfoUI({
  getDocument,
  getJQuery,
  getGame,
  getMechManager,
  getVueById,
  getNiceNumber,
}: MechInfoDependencies) {
  const dependencies = {
    getDocument,
    getJQuery,
    getGame,
    getMechManager,
    getVueById,
    getNiceNumber,
  };
  function createMechInfo() {
    const $ = dependencies.getJQuery();
    const MechManager = dependencies.getMechManager();
    if ($(`#mechList .mechRow[draggable=true]`).length > 0) {
      return;
    }
    if (MechManager.isActive || MechManager.initLab()) {
      MechManager.mechObserver.disconnect();
      const list = dependencies.getVueById("mechList");
      const game = dependencies.getGame();
      for (let i = 0; i < list._vnode.children.length; i++) {
        const mech = game.global.portal.mechbay.mechs[i];
        const stats = MechManager.getMechStats(mech);
        const rating = stats.power / MechManager.bestMech[mech.size].power;
        const info =
          (mech.size === "collector"
            ? `${Math.round(rating * 100)}%, ${dependencies.getNiceNumber(
                stats.power * MechManager.collectorValue,
              )} /s`
            : `${Math.round(rating * 100)}%, ${dependencies.getNiceNumber(
                stats.power * 100,
              )}, ${dependencies.getNiceNumber(stats.efficiency * 100)}`) +
          " | ";

        const mechNode = list._vnode.children[i].elm;
        const firstNode = $(mechNode.childNodes[0]);
        if (firstNode.hasClass("ea-mech-info")) {
          firstNode.text(info);
        } else {
          const note = dependencies.getDocument().createElement("span");
          note.className = "ea-mech-info";
          note.innerHTML = info;
          mechNode.insertBefore(note, mechNode.firstChild);
        }
      }
      MechManager.mechObserver.observe(
        dependencies.getDocument().getElementById("mechList"),
        { childList: true },
      );
    }
  }

  function removeMechInfo() {
    dependencies.getMechManager().mechObserver.disconnect();
    dependencies.getJQuery()("#mechList .ea-mech-info").remove();
  }

  return { createMechInfo, removeMechInfo };
}
