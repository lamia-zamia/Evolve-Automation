/**
 * Pure equivalent of the legacy `autoPylon`. It distributes available mana across
 * unlocked ritual spells by weighting and returns the ordered decrease/increase
 * ritual adjustments. The composition root calls `decreaseRitual` /
 * `increaseRitual`; this function performs no reads or mutations.
 *
 * The legacy controller reduces Mana's rate-of-change by the ritual budget it
 * commits. That live write is returned as an explicit command for the adapter
 * to apply after validating the sampled rate.
 */

export interface PylonSpellView {
  readonly id: string;
  readonly weighting: number;
  readonly isFactory: boolean;
  readonly currentSpells: number;
}

export interface PylonInput {
  readonly initialised: boolean;
  readonly manaRateOfChange: number;
  readonly manaStorageRatio: number;
  readonly ritualManaUse: number;
  readonly ritualSafe: boolean;
  readonly witchHunter: boolean;
  readonly priestCount: number;
  readonly haveRoguemagic4: boolean;
  readonly cementWorkerCount: number;
  /** Unlocked spells in `Object.values(RitualManager.Productions)` order. */
  readonly spells: readonly PylonSpellView[];
}

export interface PylonRitualAdjustment {
  readonly id: string;
  readonly expectedCurrentSpells: number;
  readonly count: number;
}

export interface PylonManaRateAdjustment {
  readonly expected: number;
  readonly value: number;
}

export interface PylonDecision {
  readonly decrease: readonly PylonRitualAdjustment[];
  readonly increase: readonly PylonRitualAdjustment[];
  readonly manaRateAdjustment: PylonManaRateAdjustment | null;
}

const EMPTY: PylonDecision = Object.freeze({
  decrease: Object.freeze([]),
  increase: Object.freeze([]),
  manaRateAdjustment: null,
});

/** Legacy `manaCost(level)` from industry.js. */
function manaCost(level: number): number {
  return level * (1.0025 ** level - 1);
}

/** Legacy `RitualManager.costStep(level)` — pure math over the ritual level. */
function costStep(level: number): number {
  if (level === 0) {
    return 0.0025;
  }
  const cost = manaCost(level);
  return ((cost / level) * 1.0025 + 0.0025) * (level + 1) - cost;
}

export function planPylon(input: Readonly<PylonInput>): PylonDecision {
  if (!input.initialised) {
    return EMPTY;
  }

  const adjustments = new Map<string, number>();
  for (const spell of input.spells) {
    adjustments.set(spell.id, 0);
  }

  let manaToUse =
    input.manaRateOfChange *
    (input.manaStorageRatio > 0.99 ? 1 : input.ritualManaUse);
  const usableMana = manaToUse;
  let maxRituals =
    input.ritualSafe && input.witchHunter
      ? input.priestCount * (input.haveRoguemagic4 ? 4 : 1)
      : Number.MAX_SAFE_INTEGER;

  const spellSorter = (a: PylonSpellView, b: PylonSpellView) =>
    (adjustments.get(a.id) ?? 0) / a.weighting -
      (adjustments.get(b.id) ?? 0) / b.weighting || b.weighting - a.weighting;

  const remainingSpells = input.spells
    .filter(
      (spell) =>
        spell.weighting > 0 &&
        (!spell.isFactory || input.cementWorkerCount > 0),
    )
    .sort(spellSorter);

  spellsLoop: while (remainingSpells.length > 0 && maxRituals > 0) {
    const spell = remainingSpells.shift()!;
    const amount = adjustments.get(spell.id) ?? 0;
    const cost = costStep(amount);

    if (cost <= manaToUse) {
      adjustments.set(spell.id, amount + 1);
      manaToUse -= cost;
      maxRituals--;
      // Insert spell back into the array keeping it sorted.
      for (let i = remainingSpells.length - 1; i >= 0; i--) {
        if (spellSorter(spell, remainingSpells[i]!) > 0) {
          remainingSpells.splice(i + 1, 0, spell);
          continue spellsLoop;
        }
      }
      remainingSpells.unshift(spell);
    }
  }

  const decrease: PylonRitualAdjustment[] = [];
  const increase: PylonRitualAdjustment[] = [];
  for (const spell of input.spells) {
    const delta = (adjustments.get(spell.id) ?? 0) - spell.currentSpells;
    if (delta < 0) {
      decrease.push(
        Object.freeze({
          id: spell.id,
          expectedCurrentSpells: spell.currentSpells,
          count: delta * -1,
        }),
      );
    }
  }
  for (const spell of input.spells) {
    const delta = (adjustments.get(spell.id) ?? 0) - spell.currentSpells;
    if (delta > 0) {
      increase.push(
        Object.freeze({
          id: spell.id,
          expectedCurrentSpells: spell.currentSpells,
          count: delta,
        }),
      );
    }
  }

  const manaSpent = usableMana - manaToUse;
  return Object.freeze({
    decrease: Object.freeze(decrease),
    increase: Object.freeze(increase),
    manaRateAdjustment:
      manaSpent === 0
        ? null
        : Object.freeze({
            expected: input.manaRateOfChange,
            value: input.manaRateOfChange - manaSpent,
          }),
  });
}
