/**
 * The prestige vocabulary, shared by every surface that names a prestige.
 *
 * The ids are the script's own (`prestigeType` values), not the game's; the labels and hints are
 * the script's copy. This table used to live inside the override catalog's closure, where the
 * Evolution queue and the Prestige settings section could not reach it.
 */

/** One prestige the script can be configured to aim for, as a settings select renders it. */
export interface PrestigeType {
  readonly val: string;
  readonly label: string;
  readonly short_label?: string;
  readonly hint: string;
}

/**
 * Every prestige the script can aim for. One owner: the Prestige section's `prestigeType`
 * select, the Evolution queue's prestige label, and the override editor's `PrestigeType`
 * operand all read this table, so a prestige cannot be offered in one place and unknown in
 * another.
 */
export const PRESTIGE_TYPES = Object.freeze([
  { val: "none", label: "None", hint: "Endless game" },
  {
    val: "mad",
    short_label: "MAD",
    label: "Mutual Assured Destruction",
    hint: "MAD prestige once MAD has been researched and all soldiers are home",
  },
  {
    val: "bioseed",
    label: "Bioseed",
    hint: "Launches the bioseeder ship to perform prestige when required probes have been constructed",
  },
  {
    val: "cataclysm",
    label: "Cataclysm",
    hint: "Perform cataclysm reset by researching Dial It To 11 once available",
  },
  {
    val: "whitehole",
    label: "Whitehole",
    hint: "Infuses the blackhole with exotic materials to perform prestige",
  },
  {
    val: "vacuum",
    short_label: "Vacuum",
    label: "Vacuum Collapse",
    hint: "Build Mana Syphons until the end",
  },
  {
    val: "apocalypse",
    label: "AI Apocalypse",
    hint: "Perform AI Apocalypse reset by researching Protocol 66 once available",
  },
  {
    val: "ascension",
    label: "Ascension",
    hint: "Allows research of Incorporeal Existence and Ascension. Ascension Machine is managed by autoPower. Use Custom race handling in Prestige settings to reuse, pause for editing, or automatically import a race at the post-reset lab.",
  },
  {
    val: "demonic",
    short_label: "DI",
    label: "Demonic Infusion",
    hint: "Sacrifice your entire civilization to absorb the essence of a greater demon lord",
  },
  {
    val: "terraform",
    label: "Terraform",
    hint: "Create new planet by building and powering Terraformer. Atmosphere Terraformer is managed by autoPower. Disable autoPrestige if you want to change custom planet. Otherwise current one will be used , or default one if there's no current. ",
  },
  {
    val: "matrix",
    label: "Matrix",
    hint: "Build a computer simulation and trap your entire civilization in it",
  },
  {
    val: "retire",
    label: "Retirement",
    hint: "Retire and enjoy the easy life.",
  },
  { val: "eden", label: "Eden", hint: "Build Garden Of Eden." },
  { val: "apotheosis", label: "Apotheosis", hint: "Kill the God." },
] as const) satisfies readonly PrestigeType[];
