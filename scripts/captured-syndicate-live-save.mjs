/**
 * The disposable True Path save both live Syndicate characterizations load.
 *
 * No retained save reaches the Syndicate, so the state these checks need is written into a copy of a
 * real save rather than invented wholesale. Only *state* is added: which regions the Syndicate
 * operates in, how much piracy each holds, and one armed hull. Not one line of the calculation lives
 * here, which is the whole point — every number a characterization reads is computed by the game at
 * runtime.
 *
 * `race.truepath` is `1` and not `true` because that is the value the pinned game itself writes:
 * `truepath.js` assigns `global.race['truepath'] = 1` when the path is chosen, and `syndicateActive()`
 * tests the field for truth and nothing else. Both characterizations assert the captured live root
 * carries `1`, so the production path is exercised over the representation a real save has rather than
 * over one this file chose.
 *
 * `tabLoad` is off in both: with it on, the game runs every `draw*` regardless of the selected tab,
 * which would bind a region's Syndicate readout without any discovery and make the first-use path
 * untestable.
 */

export const CIVIC_MAIN_TAB = 2;
export const CITY_SPACE_SUB_TAB = 0;
export const INNER_SYSTEM_SUB_TAB = 1;

export function truepathSave(base, tabs = {}) {
  const state = base.save ?? base;
  state.race = { ...state.race, truepath: 1, species: "human" };
  state.tech = {
    ...state.tech,
    syndicate: 1,
    eris: 1,
    titan: 3,
    enceladus: 2,
    triton: 2,
    makemake: 1,
    outer: 0,
    sensors: 2,
    syard_class: 6,
    syard_power: 4,
    syard_weapon: 5,
    syard_armor: 2,
    syard_engine: 5,
    syard_sensor: 3,
  };
  state.space = {
    ...state.space,
    syndicate: {
      spc_moon: 500,
      spc_red: 400,
      spc_belt: 350,
      spc_gas: 300,
      spc_gas_moon: 260,
      spc_titan: 200,
      spc_enceladus: 180,
      spc_triton: 160,
      spc_makemake: 140,
      spc_eris: 120,
    },
    operating_base: { on: 0 },
    sam: { on: 0 },
    fob: { on: 0 },
    shipyard: {
      blueprint: {
        name: "Nomad",
        class: "destroyer",
        armor: "steel",
        weapon: "railgun",
        engine: "ion",
        power: "diesel",
        sensor: "radar",
        special: "none",
      },
      // Modern upstream stores `ship.location` as a point object, which is what `shipDockedAt`
      // reads. A ship written as a bare region string is the shape the deleted replica assumed, and
      // is what the live characterization contrasts against.
      ships: [
        {
          name: "Nomad",
          class: "destroyer",
          armor: "steel",
          weapon: "gauss",
          engine: "ion",
          power: "diesel",
          sensor: "radar",
          special: "none",
          location: { id: "spc_moon" },
          damage: 0,
          fueled: true,
        },
      ],
      sort: false,
      expand: false,
    },
  };
  // `syndicate()` reads the rival government's hostility, so a save that has never discovered a
  // government has no `gov3` to read and the game's own function throws. Supplying the record is
  // state, not arithmetic: the value is only ever compared against the game's own thresholds.
  state.civic = {
    ...state.civic,
    foreign: {
      ...(state.civic?.foreign ?? {}),
      gov3: { hstl: 50 },
    },
  };
  state.settings = {
    ...state.settings,
    tabLoad: false,
    civTabs: tabs.civTabs ?? 1,
    spaceTabs: tabs.spaceTabs ?? INNER_SYSTEM_SUB_TAB,
    showSpace: true,
    showOuter: true,
    space: {
      moon: true,
      red: true,
      belt: true,
      gas: true,
      gas_moon: true,
      titan: true,
      enceladus: true,
      triton: true,
      makemake: true,
      eris: true,
      dwarf: true,
      home: true,
      hell: true,
    },
  };
  return base;
}
