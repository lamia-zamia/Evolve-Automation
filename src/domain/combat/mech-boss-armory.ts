/**
 * Boss weapon ratings for automatic Mech design.
 *
 * Mechanically extracted from the `monsters` table in
 * `D:/work/Evolve-DeadSpace/src/portal.js` (`export const monsters`, line
 * 5161, DeadSpace `fa62465f`) for the eight classic weapons only. Each row is
 * `[laser, kinetic, shotgun, missile, flame, plasma, sonic, tesla]`, matching
 * `CLASSIC_MECH_WEAPONS` order. Two rows were verified by eye against the
 * source (`fire_elm`, `water_elm`).
 *
 * Like the historical `updateBestWeapon`, the scorer reads the raw table and
 * ignores the seeded resist/weak adjustment in `checkBossResist`: the
 * adjustment needs the run seed, and history never used it.
 */

export const CLASSIC_MECH_WEAPONS = Object.freeze([
  "laser",
  "kinetic",
  "shotgun",
  "missile",
  "flame",
  "plasma",
  "sonic",
  "tesla",
]);

export const BOSS_WEAPON_RATINGS: Record<
  string,
  readonly [number, number, number, number, number, number, number, number]
> = Object.freeze({
  fire_elm: [1.05, 0.55, 0.75, 0.5, 0, 0.1, 1, 0.7],
  water_elm: [0.6, 0.25, 0.25, 0.5, 0.6, 1, 0.5, 0.8],
  rock_golem: [1, 0.65, 0.35, 0.95, 0.6, 1, 0.8, 0],
  bone_golem: [0.4, 1, 0.75, 1, 0.45, 0.35, 0.8, 0.2],
  mech_dino: [0.8, 0.5, 0.35, 0.5, 0.1, 0.35, 0.4, 1],
  plant: [0.35, 0.25, 0.25, 0.25, 1, 0.45, 0.8, 0.45],
  crazed: [0.45, 1, 0.95, 0.35, 0.9, 0.45, 0.2, 0.65],
  minotaur: [0.25, 0.45, 0.2, 1, 0.6, 0.7, 0.2, 0.45],
  ooze: [0.15, 0, 0, 0, 0.7, 1, 0.9, 0.2],
  zombie: [0.3, 0.1, 0.95, 0.8, 1, 0.25, 0.25, 0.1],
  raptor: [0.65, 1, 0.3, 0.4, 0.6, 0.75, 0.3, 0.7],
  frost_giant: [0.9, 0.3, 0.25, 0.05, 0.85, 1, 0.35, 0.55],
  swarm: [0.02, 0.02, 1, 0.05, 1, 0, 0.65, 0.55],
  dragon: [0.15, 0.4, 0.65, 1, 0, 0.02, 0.3, 0.2],
  mech_dragon: [0.8, 0.2, 0.25, 0.75, 0.15, 0.5, 0.3, 1],
  construct: [0.45, 0.35, 0.25, 0.9, 0.3, 0.4, 0.15, 1.15],
  beholder: [0.7, 0.5, 0.1, 0.05, 0.25, 1, 0.02, 0.4],
  worm: [0.5, 0.25, 0.02, 0.05, 0.45, 0.25, 1.15, 0.02],
  hydra: [0.8, 0.3, 0.55, 0.4, 0.8, 0.75, 0.5, 0.7],
  colossus: [1, 0.5, 0.25, 1, 0.1, 0.6, 0.45, 0.55],
  lich: [0.05, 0.5, 0.75, 0.75, 0.15, 0.02, 0.45, 0.55],
  ape: [1, 0.55, 0.35, 0.45, 0.95, 0.75, 0.1, 0.75],
  bandit: [0.6, 1, 0.7, 0.5, 0.6, 0.75, 0.25, 0.35],
  croc: [0.6, 0.55, 0.2, 0.45, 0.1, 0.4, 1, 0.8],
  djinni: [0, 0.2, 0.2, 0, 0.45, 1, 0.65, 0.5],
  snake: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
  centipede: [0.45, 0.65, 0.45, 0.6, 0.9, 0.9, 0, 0.02],
  spider: [0.6, 0.75, 0.9, 0.15, 1, 0.05, 0.45, 0.25],
  manticore: [0.02, 0.55, 0.3, 0.15, 0.35, 0.9, 0.5, 0.65],
  fiend: [0.7, 0.3, 0.5, 0.75, 0.35, 0.3, 0.3, 0.55],
  bat: [0.1, 0.3, 0.9, 0.02, 0.25, 0.02, 1, 0.65],
  medusa: [0.3, 0.95, 0.85, 1, 0.15, 0.1, 0.2, 0.35],
  ettin: [0.45, 0.55, 0.6, 0.25, 0.45, 0.7, 0.25, 0.15],
  faceless: [0.55, 0, 0.15, 0.05, 0.35, 0.4, 0.85, 1],
  enchanted: [1, 0.25, 0.6, 0.7, 0.05, 0.9, 0.1, 0.02],
  gargoyle: [0.1, 0.55, 1, 0.45, 0.5, 0.1, 0.9, 0.25],
  chimera: [0.3, 0.85, 0.6, 0.35, 0.65, 0.2, 0.5, 0.85],
  gorgon: [0.65, 0.65, 0.65, 0.66, 0.65, 0.64, 0.65, 0.65],
  kraken: [0.7, 0.4, 0.05, 0.5, 0.45, 0.6, 0.95, 0.9],
  homunculus: [0.02, 0.85, 0.75, 0.65, 1, 0.02, 0.5, 0.25],
  giant_chicken: [0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95],
  skeleton_pack: [0.45, 1, 1.2, 1.2, 0.15, 0.3, 0.5, 0.25],
});
