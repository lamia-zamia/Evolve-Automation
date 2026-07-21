type StateLogResource = {
  title: string;
  currentQuantity: number;
  rateOfChange: number;
  income: number;
  storageRatio: number;
  isUnlocked: () => boolean;
  isDemanded: () => boolean;
};

type StateLogTarget = {
  title: string;
  cost: Record<string, number>;
  isAffordable: () => boolean;
};

type StateLogBlocker =
  | 0
  | [
      string,
      string | null,
      "ready" | "storage" | "income" | "stalled" | "unavailable",
      number,
    ];

type StateLogSample = {
  d: number;
  t: number;
  g: unknown;
  mr: number;
  mm: number;
  k: number;
  kr: number;
  b: StateLogBlocker;
  tc: StateLogBlocker;
  ci?: string[];
  co?: string[];
  si?: string[];
  so?: string[];
};

type StateLog = {
  v: 2;
  reset: number;
  startDay: number;
  species: string;
  cap: string[];
  stall: string[];
  samples: Array<StateLogSample | Record<string, unknown>>;
};

type StateLogState = {
  stateLog?: StateLog | null;
  scriptTick: number;
  goal: unknown;
  moneyMedian: number;
  unlockedBuildings: StateLogTarget[];
  unlockedTechs: StateLogTarget[];
};

type StateLogDependencies = {
  getGame: () => {
    global: {
      stats: { days: number; reset: number };
      race: { species: string };
    };
  };
  getResources: () => Record<string, StateLogResource> & {
    Money: StateLogResource;
    Knowledge: StateLogResource;
  };
  getState: () => StateLogState;
  plannerLimitingResource: (target: StateLogTarget) =>
    | {
        resourceId: string;
        resourceTitle: string;
        time: number;
        blocker: "storage" | "income" | "stalled";
      }
    | {
        status: "unavailable";
        reason: string;
        resourceId?: string;
      }
    | null;
  stateLogStore: {
    load: () => unknown;
    save: (record: unknown) => void;
  };
};

// Safety ceiling for the sample array (drop oldest). A full run at the default
// interval stays well under this; it only bounds pathologically long sessions.
const STATE_LOG_CAP = 20000;

export function createStateLogLifecycle({
  getGame,
  getResources,
  getState,
  plannerLimitingResource,
  stateLogStore,
}: StateLogDependencies) {
  function makeStateLog(): StateLog {
    const game = getGame();
    return {
      v: 2,
      reset: game.global.stats.reset,
      startDay: game.global.stats.days,
      species: game.global.race.species,
      cap: [],
      stall: [],
      samples: [],
    };
  }

  function loadStateLog() {
    try {
      const saved = stateLogStore.load() as StateLog | null;
      if (
        saved &&
        saved.v === 2 &&
        saved.reset === getGame().global.stats.reset
      ) {
        return saved;
      }
    } catch {
      return makeStateLog();
    }
    return makeStateLog();
  }

  function saveStateLog() {
    const stateLog = getState().stateLog;
    if (stateLog) {
      stateLogStore.save(stateLog);
    }
  }

  // [added, removed] between a previous and current set (as arrays).
  function stateLogDiff(previous: string[], current: string[]) {
    const previousSet = new Set(previous);
    const currentSet = new Set(current);
    return [
      current.filter((item) => !previousSet.has(item)),
      previous.filter((item) => !currentSet.has(item)),
    ];
  }

  // Compact [name, res, blocker, eta] for the top target, or 0 when there's none.
  function stateLogBlocker(target?: StateLogTarget): StateLogBlocker {
    if (!target) {
      return 0;
    }
    const limit = plannerLimitingResource(target);
    if (!limit) {
      return [target.title, null, "ready", 0];
    }
    if ("status" in limit) {
      return [target.title, limit.resourceId ?? null, "unavailable", 0];
    }
    return [
      target.title,
      limit.resourceTitle,
      limit.blocker,
      Math.round(limit.time),
    ];
  }

  function recordStateSnapshot() {
    const state = getState();
    state.stateLog ??= loadStateLog();
    const log = state.stateLog;
    const resources = getResources();

    // "capped" uses a stable storage ratio rather than the one-tick isCapped()
    // projection, so resources hovering at the cap don't flicker every sample.
    const capped: string[] = [];
    const stalled: string[] = [];
    for (const resourceId in resources) {
      const resource = resources[resourceId];
      if (!resource.isUnlocked()) {
        continue;
      }
      if (resource.storageRatio > 0.98) {
        capped.push(resource.title);
      }
      if (resource.isDemanded() && resource.income <= 0) {
        stalled.push(resource.title);
      }
    }

    // Delta-encode the slow-changing sets against the running baseline.
    const [cappedIn, cappedOut] = stateLogDiff(log.cap, capped);
    const [stalledIn, stalledOut] = stateLogDiff(log.stall, stalled);
    log.cap = capped;
    log.stall = stalled;

    const game = getGame();
    const sample: StateLogSample = {
      d: game.global.stats.days,
      t: state.scriptTick,
      g: state.goal,
      mr: Math.round(resources.Money.rateOfChange),
      mm: Math.round(state.moneyMedian),
      k: Math.round(resources.Knowledge.currentQuantity),
      kr: Math.round(resources.Knowledge.rateOfChange),
      b: stateLogBlocker(state.unlockedBuildings[0]),
      tc: stateLogBlocker(state.unlockedTechs[0]),
    };
    if (cappedIn.length) sample.ci = cappedIn;
    if (cappedOut.length) sample.co = cappedOut;
    if (stalledIn.length) sample.si = stalledIn;
    if (stalledOut.length) sample.so = stalledOut;
    log.samples.push(sample);

    if (log.samples.length > STATE_LOG_CAP) {
      log.samples.shift();
    }
    if (log.samples.length % 25 === 0) {
      saveStateLog();
    }
  }

  return {
    makeStateLog,
    loadStateLog,
    saveStateLog,
    stateLogDiff,
    stateLogBlocker,
    recordStateSnapshot,
  };
}
