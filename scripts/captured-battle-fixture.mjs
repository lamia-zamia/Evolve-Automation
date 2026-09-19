import { createCapturedBattle } from "../src/adapters/evolve/combat/battle.ts";

/**
 * The captured battle harness: a foreign-affairs game root, the `garrison`/`foreign`/`gFort`
 * controls the adapter resolves, and the assembled adapter. Shared so a test about one setting's
 * effect on combat does not restate the whole capture.
 */
export function makeRoot({
  occupied = false,
  policy = "Sabotage",
  autoHell = false,
  race = {},
  stats = {},
  tech = {},
  gameSettings = {},
  governments,
  garrison = {},
  portal = {},
} = {}) {
  const defaultGovernment = {
    mil: occupied ? 50 : 10,
    spy: 3,
    occ: occupied,
    anx: false,
    buy: false,
    hstl: 0,
    unrest: 0,
    eco: 1,
    trn: 0,
    act: "",
  };
  const foreign = Object.fromEntries(
    Object.entries(governments ?? { 0: {} }).map(([index, government]) => [
      `gov${index}`,
      { ...defaultGovernment, ...government },
    ]),
  );
  return {
    settings: {
      mKeys: false,
      keyMap: { x10: "Shift", x25: "Control", x100: "Alt" },
      showPortal: autoHell,
      ...gameSettings,
    },
    race: { ...race },
    city: { biome: "plains", ptrait: [] },
    tech: { ...tech },
    stats: { attacks: 0, ...stats },
    civic: {
      govern: { type: "democracy" },
      garrison: {
        display: true,
        workers: garrison.workers ?? 20,
        max: garrison.max ?? 20,
        crew: 0,
        wounded: 0,
        raid: 0,
        tactic: 0,
        progress: 0,
        rate: 1,
        cityGarrison: garrison.cityGarrison ?? 20,
        maxCityGarrison: garrison.maxCityGarrison ?? 20,
      },
      foreign,
    },
    portal: autoHell
      ? {
          fortress: { garrison: 15, patrols: 0, patrol_size: 5 },
          ...portal,
        }
      : portal,
    policy,
  };
}

export function makeControls(root, { hell = false } = {}) {
  const trace = [];
  const garrison = {
    elementId: "garrison",
    generation: 1,
    methods: [
      "campaign",
      "next",
      "last",
      "aNext",
      "aLast",
      "rating",
      "hell",
      "s_max",
    ],
  };
  const foreign = {
    elementId: "foreign",
    generation: 1,
    methods: ["vis", "gvis"],
  };
  const fortress = {
    elementId: "gFort",
    generation: 1,
    methods: ["aLast", "patDec", "patrolling"],
  };
  const controls = {
    resolve(id) {
      if (id === "garrison") return garrison;
      if (id === "foreign") return foreign;
      if (hell && id === "gFort") return fortress;
      return undefined;
    },
    invoke(handle, method, args = []) {
      trace.push([handle.elementId, method, ...args]);
      if (handle === foreign && method === "vis")
        return { ok: true, value: true };
      if (handle === foreign && method === "gvis") {
        return {
          ok: true,
          value: root.civic.foreign[`gov${args[0]}`] !== undefined,
        };
      }
      if (handle === garrison && method === "hell") {
        return { ok: true, value: root.civic.garrison.cityGarrison };
      }
      if (handle === garrison && method === "s_max") {
        return { ok: true, value: root.civic.garrison.maxCityGarrison };
      }
      if (handle === garrison && method === "rating") {
        return { ok: true, value: args[0] * 10 };
      }
      if (handle === garrison && method === "next") {
        root.civic.garrison.tactic += 1;
        return { ok: true, value: undefined };
      }
      if (handle === garrison && method === "last") {
        root.civic.garrison.tactic -= 1;
        return { ok: true, value: undefined };
      }
      if (handle === garrison && method === "aNext") {
        root.civic.garrison.raid = Math.min(
          root.civic.garrison.maxCityGarrison,
          root.civic.garrison.raid + 1,
        );
        return { ok: true, value: undefined };
      }
      if (handle === garrison && method === "aLast") {
        root.civic.garrison.raid = Math.max(0, root.civic.garrison.raid - 1);
        return { ok: true, value: undefined };
      }
      if (handle === garrison && method === "campaign") {
        const government = root.civic.foreign[`gov${args[0]}`];
        if (government.occ || government.anx || government.buy) {
          government.occ = false;
          government.anx = false;
          government.buy = false;
        } else if (root.civic.garrison.raid > 0) {
          root.stats.attacks += 1;
          if (root.policy === "Occupy") government.occ = true;
        }
        return { ok: true, value: undefined };
      }
      if (handle === fortress && method === "patrolling") {
        const state = root.portal.fortress;
        return {
          ok: true,
          value: state.garrison - state.patrols * state.patrol_size,
        };
      }
      if (handle === fortress && method === "patDec") {
        root.portal.fortress.patrols = Math.max(
          0,
          root.portal.fortress.patrols - 1,
        );
        return { ok: true, value: undefined };
      }
      if (handle === fortress && method === "aLast") {
        root.portal.fortress.garrison = Math.max(
          root.portal.fortress.patrols * root.portal.fortress.patrol_size,
          root.portal.fortress.garrison - 1,
        );
        return { ok: true, value: undefined };
      }
      return { ok: false, reason: "unknown-method" };
    },
    capturedElementIds() {
      return ["garrison", "foreign", ...(hell ? ["gFort"] : [])];
    },
  };
  return { controls, trace, handles: { garrison, foreign, fortress } };
}

export function makeAutomation(root, settings, options = {}) {
  const { controls, trace, handles } = makeControls(root, options);
  const sourceRoot = { current: root };
  const activity = [];
  const adapter = createCapturedBattle({
    rootState: {
      readRoot: () => sourceRoot.current,
      isReactivitySuppressed: () => false,
      subscribeRootReplaced: () => () => {},
    },
    controls,
    keyState: options.keyState,
    readSettings: () => settings,
    onActivity: (entry) => activity.push(entry),
  });
  return { adapter, controls, trace, handles, sourceRoot, activity };
}
