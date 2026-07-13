import type { AutomationDependencies } from "../dependencies.ts";

type Dependencies = AutomationDependencies<
  | "KeyManager"
  | "getGame"
  | "getSettings"
  | "getResources"
  | "getVueById"
  | "ticksPerSecond"
>;
export function createAutoGenetics({
  KeyManager,
  getGame,
  getSettings,
  getResources,
  getVueById,
  ticksPerSecond,
}: Dependencies) {
  return function autoGenetics() {
    const game = getGame();
    const settings = getSettings();
    const resources = getResources();
    let genetics = game.global.tech.genetics;
    let mutations = game.global.race.mutation;
    if (!genetics) {
      return; // Genetics not researched yet
    }

    let geneticsVue = getVueById("arpaSequence");
    let seq = game.global.arpa.sequence;
    if (!geneticsVue || !seq) {
      return; // Just in case
    }

    if (
      (settings.geneticsSequence === "enabled" && !seq.on) ||
      (settings.geneticsSequence === "disabled" && seq.on) ||
      (settings.geneticsSequence === "decode" &&
        ((seq.on && mutations >= 1) || (!seq.on && mutations < 1)))
    ) {
      geneticsVue.toggle();
    }

    if (genetics < 5) {
      return; // Boost not researched yet
    }

    if (
      (settings.geneticsBoost === "enabled" && !seq.boost) ||
      (settings.geneticsBoost === "disabled" && seq.boost)
    ) {
      geneticsVue.booster();
    }

    if (genetics < 6) {
      return; // Assembling not researched yet
    }

    if (
      (settings.geneticsAssemble === "enabled" && !seq.auto) ||
      (settings.geneticsAssemble === "disabled" && seq.auto)
    ) {
      geneticsVue.auto_seq();
    }

    if (
      settings.geneticsAssemble !== "auto" ||
      resources.Knowledge.currentQuantity < 200000 ||
      resources.Knowledge.isDemanded()
    ) {
      return; // Auto assembling disabled, knowledge is too low, or demanded
    }

    let nextTickKnowledge =
      resources.Knowledge.currentQuantity +
      resources.Knowledge.rateOfChange / ticksPerSecond();
    let overflowKnowledge = nextTickKnowledge - resources.Knowledge.maxQuantity;
    if (overflowKnowledge <= 0) {
      return; // No overflow yet, we can wait untill next script tick
    }

    let genesToAssemble = Math.ceil(overflowKnowledge / 200000);
    resources.Knowledge.currentQuantity -= 200000 * genesToAssemble;
    resources.Genes.currentQuantity += 1 * genesToAssemble;

    for (let m of KeyManager.click(genesToAssemble)) {
      geneticsVue.novo();
    }
  };
}
