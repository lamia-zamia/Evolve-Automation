/**
 * Editor-facing description of a condition operand's argument: which input control the settings and
 * trigger editors render, the default value a freshly added condition gets, and the options offered.
 *
 * This is deliberately separate from the operand readers in `override-catalog.ts`. A condition type
 * mixes two unrelated concerns — what the automation reads, and what the editor shows — and only the
 * first of them is on the path to a pure evaluation input.
 *
 * TRANSITIONAL: the option callbacks read live game bags when the editor builds a control. The
 * override work package decides whether they should share one immutable snapshot per render.
 */

/** One entry of a `list_cb` input, keyed by the value the condition stores. */
export interface OverrideOperandListOption {
  readonly name: string;
  readonly id: string;
}

/** One entry of a `select_cb` input. */
export interface OverrideOperandSelectOption {
  readonly val: string;
  readonly label: string;
  readonly hint?: string;
}

export type OverrideOperandInput =
  | {
      readonly arg: "list_cb";
      readonly def: string;
      readonly options: () => Record<string, OverrideOperandListOption>;
    }
  | {
      readonly arg: "select_cb";
      readonly def: string;
      readonly options: () => readonly OverrideOperandSelectOption[];
    };

export interface OverrideOperandNamed {
  readonly name: string;
}

/**
 * A game entry the editor offers by its Vue binding. `script-bootstrap.ts` keys the building and
 * research bags by that same binding, so it is both the option's key and the value a condition
 * stores.
 */
export interface OverrideOperandVueBound extends OverrideOperandNamed {
  readonly _vueBinding: string;
}

export interface OverrideOperandBuilding extends OverrideOperandVueBound {
  readonly cost: Record<string, unknown>;
}

export type OverrideOperandProject = OverrideOperandVueBound;

export interface OverrideOperandJob {
  readonly _originalId: string;
  readonly _originalName: string;
  readonly is: { readonly serve?: boolean };
}

export interface OverrideOperandResource extends OverrideOperandNamed {
  readonly _id: string;
}

export interface OverrideOperandRace extends OverrideOperandNamed {
  readonly id: string;
  readonly desc: string;
}

export interface OverrideOperandChallenge {
  readonly id: string;
  readonly trait: string;
}

export interface OverrideOperandGame {
  readonly traits: Record<string, OverrideOperandNamed>;
  /** `type` is the genus; it is absent on the protoplasm entry. */
  readonly races: Record<
    string,
    OverrideOperandNamed & { readonly type?: string }
  >;
  loc: (key: string) => string;
}

export interface OverrideOperandInputDependencies {
  readonly readGame: () => OverrideOperandGame;
  readonly readBuildingIds: () => Record<string, OverrideOperandBuilding>;
  readonly readResources: () => Record<string, OverrideOperandResource>;
  readonly readTechIds: () => Record<string, OverrideOperandVueBound>;
  readonly readArpaIds: () => Record<string, OverrideOperandProject>;
  readonly readJobIds: () => Record<string, OverrideOperandJob>;
  readonly readRaces: () => Record<string, OverrideOperandRace>;
  readonly readGovernmentManager: () => {
    readonly Types: Record<string, unknown>;
  };
  readonly readUniverses: () => readonly string[];
  readonly readGovernors: () => readonly string[];
  readonly readChallenges: () => readonly (
    OverrideOperandChallenge | readonly OverrideOperandChallenge[]
  )[];
  readonly readBiomeList: () => readonly string[];
  readonly readTraitList: () => readonly string[];
}

/** A `list_cb` view of a bag whose entries the condition stores by their Vue binding. */
function vueBoundOptions(
  entries: Record<string, OverrideOperandVueBound>,
): Record<string, OverrideOperandListOption> {
  const options: Record<string, OverrideOperandListOption> = {};
  for (const entry of Object.values(entries)) {
    options[entry._vueBinding] = { name: entry.name, id: entry._vueBinding };
  }
  return options;
}

/** Distinct genus ids in catalog order, excluding the ones the editor never offers. */
function listGenera(
  races: Record<string, { readonly type?: string }>,
  excluded: readonly string[],
): readonly string[] {
  const genera: string[] = [];
  for (const race of Object.values(races)) {
    const genus = race.type;
    if (!genus || excluded.includes(genus) || genera.includes(genus)) continue;
    genera.push(genus);
  }
  return genera;
}

export function createOverrideOperandInputs({
  readGame,
  readBuildingIds,
  readResources,
  readTechIds,
  readArpaIds,
  readJobIds,
  readRaces,
  readGovernmentManager,
  readUniverses,
  readGovernors,
  readChallenges,
  readBiomeList,
  readTraitList,
}: OverrideOperandInputDependencies) {
  return {
    building_cost: {
      def: "city-farm.Money",
      arg: "list_cb",
      options: () => {
        const resources = readResources();
        const options: Record<string, OverrideOperandListOption> = {};
        for (const [buildingId, building] of Object.entries(
          readBuildingIds(),
        )) {
          for (const resourceId of Object.keys(building.cost)) {
            const id = `${buildingId}.${resourceId}`;
            // A cost naming a resource the script has no wrapper for lists its raw id, which is
            // also what the BuildingCost reader accepts, rather than emptying the whole list.
            const name = resources[resourceId]?.name ?? resourceId;
            options[id] = { name: `${building.name} (${name})`, id };
          }
        }
        return options;
      },
    },
    building: {
      def: "city-farm",
      arg: "list_cb",
      options: () => vueBoundOptions(readBuildingIds()),
    },
    research: {
      def: "tech-mad",
      arg: "list_cb",
      options: () => vueBoundOptions(readTechIds()),
    },

    trait: {
      def: "kindling_kindred",
      arg: "list_cb",
      options: () =>
        Object.fromEntries(
          Object.entries(readGame().traits).map(
            ([id, trait]): [string, OverrideOperandListOption] => [
              id,
              { name: trait.name, id },
            ],
          ),
        ),
    },

    genus: {
      def: "humanoid",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] => [
        { val: "organism", label: readGame().loc(`race_protoplasm`) },
        ...listGenera(readGame().races, ["organism"]).map((genus) => ({
          val: genus,
          label: readGame().loc(`genelab_genus_${genus}`),
        })),
      ],
    },
    genus_ss: {
      def: "humanoid",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] => [
        { val: "none", label: readGame().loc(`genelab_genus_none`) },
        ...listGenera(readGame().races, ["organism", "synthetic"]).map(
          (genus) => ({
            val: genus,
            label: readGame().loc(`genelab_genus_${genus}`),
          }),
        ),
      ],
    },
    project: {
      def: "arpalaunch_facility",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] =>
        Object.values(readArpaIds()).map((p) => ({
          val: p._vueBinding,
          label: p.name,
        })),
    },
    job: {
      def: "unemployed",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] =>
        Object.values(readJobIds()).map((j) => ({
          val: j._originalId,
          label: j._originalName,
        })),
    },
    job_servant: {
      def: "farmer",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] =>
        Object.values(readJobIds())
          .filter((j) => j.is.serve)
          .map((j) => ({ val: j._originalId, label: j._originalName })),
    },
    resource: {
      def: "Food",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] =>
        Object.values(readResources()).map((r) => ({
          val: r._id,
          label: r.name,
        })),
    },
    race: {
      def: "species",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] => [
        { val: "species", label: "Current Race", hint: "Current race" },
        { val: "gods", label: "Fanaticism Race", hint: "Gods race" },
        { val: "old_gods", label: "Deify Race", hint: "Old gods race" },
        { val: "srace", label: "Imitation Race", hint: "Imitation trait race" },
        {
          val: "protoplasm",
          label: "Protoplasm",
          hint: "Race is not chosen yet",
        },
        ...Object.values(readRaces()).map((race) => ({
          val: race.id,
          label: race.name,
          hint: race.desc,
        })),
      ],
    },
    challenge: {
      def: "junker",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] =>
        readChallenges()
          .flat()
          .map((c) => ({
            val: c.trait,
            label: readGame().loc(`evo_challenge_${c.id}`),
            hint: readGame().loc(`evo_challenge_${c.id}_effect`),
          })),
    },
    universe: {
      def: "standard",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] => [
        {
          val: "bigbang",
          label: "Big Bang",
          hint: "Universe is not chosen yet",
        },
        ...readUniverses().map((u) => ({
          val: u,
          label: readGame().loc(`universe_${u}`),
          hint: readGame().loc(`universe_${u}_desc`),
        })),
      ],
    },
    government: {
      def: "anarchy",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] =>
        Object.keys(readGovernmentManager().Types).map((g) => ({
          val: g,
          label: readGame().loc(`govern_${g}`),
          hint: readGame().loc(`govern_${g}_desc`),
        })),
    },
    governor: {
      def: "none",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] => [
        { val: "none", label: "None", hint: "No governor selected" },
        ...readGovernors().map((id) => ({
          val: id,
          label: readGame().loc(`governor_${id}`),
          hint: readGame().loc(`governor_${id}_desc`),
        })),
      ],
    },
    queue: {
      def: "queue",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] => [
        {
          val: "queue",
          label: "Building",
          hint: "Buildings and projects queue",
        },
        { val: "r_queue", label: "Research", hint: "Research queue" },
        { val: "evo", label: "Evolution", hint: "Evolution queue" },
      ],
    },
    date: {
      def: "day",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] => [
        { val: "day", label: "Day (Year)", hint: "Day of year" },
        {
          val: "moon",
          label: "Day (Month)",
          hint: "Day of month (0-27 range)",
        },
        { val: "total", label: "Day (Total)", hint: "Day of run" },
        { val: "year", label: "Year", hint: "Year of run" },
        { val: "orbit", label: "Orbit", hint: "Planet orbit in days" },
        {
          val: "season",
          label: "Season",
          hint: "Current season (0 - Spring, 1 - Summer, 2 - Fall, 3 - Winter)",
        },
        {
          val: "temp",
          label: "Temperature",
          hint: "Current temperature (0 - Cold, 1 - Normal, 2 - Hot)",
        },
        {
          val: "impact",
          label: "Impact",
          hint: "Days remaining before Moon Impact, for Orbit Decay scenario",
        },
      ],
    },
    soldiers: {
      def: "workers",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] => [
        { val: "workers", label: "Total Soldiers" },
        { val: "max", label: "Total Soldiers Max" },
        { val: "currentCityGarrison", label: "City Soldiers" },
        { val: "maxCityGarrison", label: "City Soldiers Max" },
        { val: "hellSoldiers", label: "Hell Soldiers" },
        { val: "hellGarrison", label: "Hell Garrison" },
        { val: "hellPatrols", label: "Hell Patrols" },
        { val: "hellPatrolSize", label: "Hell Patrol Size" },
        { val: "wounded", label: "Wounded Soldiers" },
        { val: "deadSoldiers", label: "Dead Soldiers" },
        { val: "crew", label: "Ship Crew" },
        { val: "mercenaryCost", label: "Mercenary Cost" },
      ],
    },
    tab: {
      def: "civTabs1",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] => [
        { val: "civTabs0", label: readGame().loc("tab_evolve") },
        { val: "civTabs1", label: readGame().loc("tab_civil") },
        { val: "civTabs2", label: readGame().loc("tab_civics") },
        { val: "civTabs3", label: readGame().loc("tab_research") },
        { val: "civTabs4", label: readGame().loc("tab_resources") },
        { val: "civTabs5", label: readGame().loc("tech_arpa") },
        { val: "civTabs6", label: readGame().loc("mTabStats") },
        { val: "civTabs7", label: readGame().loc("tab_settings") },
      ],
    },
    biome: {
      def: "grassland",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] =>
        readBiomeList().map((b) => ({
          val: b,
          label: readGame().loc(`biome_${b}_name`),
        })),
    },
    ptrait: {
      def: "",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] => [
        { val: "", label: "None", hint: "Planet have no trait" },
        ...readTraitList()
          .slice(1)
          .map((t) => ({ val: t, label: readGame().loc(`planet_${t}`) })),
      ],
    },
    industry: {
      def: "smelters",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] => [
        { val: "smelters", label: "Total Smelter Slot Count" },
        { val: "factories", label: "Total Factory Slot Count" },
      ],
    },
    other: {
      def: "rname",
      arg: "select_cb",
      options: (): readonly OverrideOperandSelectOption[] => [
        {
          val: "rname",
          label: "Race Name",
          hint: "Ingame name of current race as string.",
        },
        {
          val: "tpfleet",
          label: "Fleet Size",
          hint: "Amount of ships in True Path fleet as number.",
        },
        {
          val: "mrelay",
          label: "Mass Relay charge",
          hint: "Charge percentage of the Mass Relay (0 = 0%, 0.5 = 50%, 1 = 100%",
        },
        {
          val: "satcost",
          label: "Satellite Cost",
          hint: "Money cost of next Swarm Satellite",
        },
        {
          val: "bcar",
          label: "Broken Cars",
          hint: "Amount of broken Surveyour Carports",
        },
        {
          val: "alevel",
          label: "Active challenges",
          hint: "Amount of active challenges",
        },
        {
          val: "tknow",
          label: "Tech Knowledge",
          hint: "Knowledge needed for most expensive unlocked research",
        },
      ],
    },
  } satisfies Record<string, OverrideOperandInput>;
}

export type OverrideOperandInputs = ReturnType<
  typeof createOverrideOperandInputs
>;
