/** Immutable description of the Hell settings panel. */
export type HellSettingsControl =
  | Readonly<{ kind: "header"; label: string }>
  | Readonly<{
      kind: "number";
      settingName: string;
      label: string;
      hint: string;
    }>
  | Readonly<{
      kind: "toggle";
      settingName: string;
      label: string;
      hint: string;
    }>;

export interface HellSettingsReadModel {
  readonly sectionId: "hell";
  readonly sectionName: "Hell";
  readonly controls: readonly HellSettingsControl[];
}

export type HellSettingsIntent = Readonly<{
  type: "reset-hell-settings";
  secondaryPrefix: string;
}>;

const controls: readonly HellSettingsControl[] = Object.freeze([
  Object.freeze({ kind: "header", label: "Entering Hell" }),
  Object.freeze({
    kind: "number",
    settingName: "hellHomeGarrison",
    label: "Soldiers to stay out of hell",
    hint: "Home garrison maximum",
  }),
  Object.freeze({
    kind: "number",
    settingName: "hellMinSoldiers",
    label: "Minimum soldiers to be available for hell (pull out if below)",
    hint: "Don't enter hell if not enough soldiers, or get out if already in",
  }),
  Object.freeze({
    kind: "number",
    settingName: "hellMinSoldiersPercent",
    label: "Alive soldier percentage for entering hell",
    hint: "Don't enter hell if too many soldiers are dead, but don't get out",
  }),
  Object.freeze({ kind: "header", label: "Hell Garrison" }),
  Object.freeze({
    kind: "toggle",
    settingName: "hellAssaultReserve",
    label: "Always reserve hell troops to Secure the Pit",
    hint: "With this option enabled hell soldiers will be put to fortress once Secure the Pit is unlocked, to fulfil its costs. It makes saving resources and setting triggers for it easier, at cost of less efficient use of manpower.",
  }),
  Object.freeze({
    kind: "number",
    settingName: "hellTargetFortressDamage",
    label: "Target wall damage per siege (overestimates threat)",
    hint: "Actual damage will usually be lower due to patrols and drones",
  }),
  Object.freeze({
    kind: "number",
    settingName: "hellLowWallsMulti",
    label: "Garrison bolster factor for damaged walls",
    hint: "Multiplies target defense rating by this when close to 0 wall integrity, half as much increase at half integrity",
  }),
  Object.freeze({ kind: "header", label: "Patrol Size" }),
  Object.freeze({
    kind: "toggle",
    settingName: "hellHandlePatrolSize",
    label: "Automatically adjust patrol size",
    hint: "Sets patrol attack rating based on current threat, lowers it depending on buildings, increases it to the minimum rating, and finally increases it based on dead soldiers. Handling patrol count has to be turned on.",
  }),
  Object.freeze({
    kind: "number",
    settingName: "hellPatrolMinRating",
    label: "Minimum patrol attack rating",
    hint: "Will never go below this",
  }),
  Object.freeze({
    kind: "number",
    settingName: "hellPatrolThreatPercent",
    label: "Percent of current threat as base patrol rating",
    hint: "Demon encounters have a rating of 2 to 10 percent of current threat",
  }),
  Object.freeze({
    kind: "number",
    settingName: "hellPatrolDroneMod",
    label: "&emsp;Lower Rating for each active Predator Drone by",
    hint: "Predators reduce threat before patrols fight",
  }),
  Object.freeze({
    kind: "number",
    settingName: "hellPatrolDroidMod",
    label: "&emsp;Lower Rating for each active War Droid by",
    hint: "War Droids boost patrol attack rating by 1 or 2 soldiers depending on tech",
  }),
  Object.freeze({
    kind: "number",
    settingName: "hellPatrolBootcampMod",
    label: "&emsp;Lower Rating for each Bootcamp by",
    hint: "Bootcamps help regenerate soldiers faster",
  }),
  Object.freeze({
    kind: "number",
    settingName: "hellBolsterPatrolRating",
    label: "Increase patrol rating by up to this when soldiers die",
    hint: "Larger patrols are less effective, but also have fewer deaths",
  }),
  Object.freeze({
    kind: "number",
    settingName: "hellBolsterPatrolPercentTop",
    label:
      "&emsp;Start increasing patrol rating at this home garrison fill percent",
    hint: "This is the higher number",
  }),
  Object.freeze({
    kind: "number",
    settingName: "hellBolsterPatrolPercentBottom",
    label:
      "&emsp;Full patrol rating increase below this home garrison fill percent",
    hint: "This is the lower number",
  }),
  Object.freeze({ kind: "header", label: "Attractors" }),
  Object.freeze({
    kind: "number",
    settingName: "hellAttractorBottomThreat",
    label: "&emsp;All Attractors on below this threat",
    hint: "Turn more and more attractors off when getting nearer to the top threat. Auto Power needs to be on for this to work.",
  }),
  Object.freeze({
    kind: "number",
    settingName: "hellAttractorTopThreat",
    label: "&emsp;All Attractors off above this threat",
    hint: "Turn more and more attractors off when getting nearer to the top threat. Auto Power needs to be on for this to work.",
  }),
  Object.freeze({ kind: "header", label: "Warlord Specific Settings" }),
  Object.freeze({
    kind: "toggle",
    settingName: "warlordHandleFortress",
    label: "Automatically attack enemy fortresses during Warlord",
    hint: "Attacks an enemy fortress when minions are above the specified threshold",
  }),
  Object.freeze({
    kind: "number",
    settingName: "warlordMinimumMinions",
    label: "&emsp;Minimum minions required to attack an enemy fortress",
    hint: "Will not attack if there are fewer than this many minions",
  }),
]);

export function getHellSettingsReadModel(): HellSettingsReadModel {
  return Object.freeze({ sectionId: "hell", sectionName: "Hell", controls });
}
