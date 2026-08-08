import type { GameKeyboardHandlersPort } from "../ports/game-keyboard-handlers.ts";
import type { GamePageShellPort } from "../ports/game-page-shell.ts";

type AnyFunction = (...args: any[]) => any;
type AnyRecord = Record<string, any>;

type ScriptBootstrapDependencies = {
  getGame: () => AnyRecord | null;
  getTechIds: () => AnyRecord;
  getTechnology: () => any;
  getBuildings: () => AnyRecord;
  getBuildingIds: () => AnyRecord;
  getState: () => AnyRecord;
  getProjects: () => AnyRecord;
  getArpaIds: () => AnyRecord;
  getJobs: () => AnyRecord;
  getJobIds: () => AnyRecord;
  getCrafter: () => AnyRecord;
  getTriggerManager: () => AnyRecord;
  getCheckActions: () => boolean;
  getJQuery: () => AnyFunction & AnyRecord;
  getWindow: () => AnyRecord;
  getUserscriptEnvironment: () => AnyRecord;
  getWin: () => AnyRecord;
  getGameKeyboardHandlers: () => GameKeyboardHandlersPort;
  getPageShell: () => GamePageShellPort;
  getNeedSandboxBypass: () => boolean;
  getPoly: () => AnyRecord;
  getSettings: () => AnyRecord;
  getSafeMode: () => boolean;
  getActions: () => AnyRecord;
  setWin: (value: AnyRecord) => void;
  setGame: (value: AnyRecord | null) => void;
  setNeedSandboxBypass: (value: boolean) => void;
};

export function createScriptBootstrap({
  getGame,
  getTechIds,
  getTechnology,
  getBuildings,
  getBuildingIds,
  getState,
  getProjects,
  getArpaIds,
  getJobs,
  getJobIds,
  getCrafter,
  getTriggerManager,
  getCheckActions,
  getJQuery,
  getWindow,
  getUserscriptEnvironment,
  getWin,
  getGameKeyboardHandlers,
  getPageShell,
  getNeedSandboxBypass,
  getPoly,
  getSettings,
  getSafeMode,
  getActions,
  setWin,
  setGame,
  setNeedSandboxBypass,
}: ScriptBootstrapDependencies) {
  let game: AnyRecord | null;
  let techIds: AnyRecord;
  let Technology: any;
  let buildings: AnyRecord;
  let buildingIds: AnyRecord;
  let state: AnyRecord;
  let projects: AnyRecord;
  let arpaIds: AnyRecord;
  let jobs: AnyRecord;
  let jobIds: AnyRecord;
  let crafter: AnyRecord;
  let TriggerManager: AnyRecord;
  let checkActions: boolean;
  let $: AnyFunction & AnyRecord;
  let window: AnyRecord;
  let userscriptEnvironment: AnyRecord;
  let win: AnyRecord;
  let needSandboxBypass: boolean;
  let poly: AnyRecord;
  let settings: AnyRecord;
  let safeMode: boolean;

  const getScriptBootstrapActions = getActions;

  function refreshContext() {
    game = getGame();
    techIds = getTechIds();
    Technology = getTechnology();
    buildings = getBuildings();
    buildingIds = getBuildingIds();
    state = getState();
    projects = getProjects();
    arpaIds = getArpaIds();
    jobs = getJobs();
    jobIds = getJobIds();
    crafter = getCrafter();
    TriggerManager = getTriggerManager();
    checkActions = getCheckActions();
    $ = getJQuery();
    window = getWindow();
    userscriptEnvironment = getUserscriptEnvironment();
    win = getWin();
    needSandboxBypass = getNeedSandboxBypass();
    poly = getPoly();
    settings = getSettings();
    safeMode = getSafeMode();
  }

  function commitContext() {
    setWin(win);
    setGame(game);
    setNeedSandboxBypass(needSandboxBypass);
  }

  let contextDepth = 0;
  function withContext(fn: AnyFunction, name: string): AnyFunction {
    const wrapped = function (this: unknown, ...args: any[]) {
      const outermost = contextDepth === 0;
      if (outermost) {
        refreshContext();
      }
      contextDepth++;
      try {
        return fn.apply(this, args);
      } finally {
        contextDepth--;
        if (outermost) {
          commitContext();
        }
      }
    };
    Object.defineProperty(wrapped, "name", { value: name });
    return wrapped;
  }

  function initialiseScriptImpl() {
    const actions = getScriptBootstrapActions();
    // Init objects and lookup tables
    for (let [key, action] of Object.entries(game!.actions.tech) as [
      string,
      AnyRecord,
    ][]) {
      techIds[action.id] = new Technology(key);
    }
    for (let building of Object.values(buildings)) {
      buildingIds[building._vueBinding] = building;
      // Don't force building Jump Ship and Pit Assault, they're prety expensive at the moment when unlocked.
      if (
        building.isMission() &&
        building !== buildings.BlackholeJumpShip &&
        building !== buildings.PitAssaultForge
      ) {
        state.missionBuildingList.push(building);
      }
    }
    for (let project of Object.values(projects)) {
      arpaIds[project._vueBinding] = project;
    }
    for (let job of Object.values(jobs)) {
      jobIds[job._originalId] = job;
    }
    for (let job of Object.values(crafter)) {
      jobIds[job._originalId] = job;
    }

    actions.updateStandAloneSettings();
    actions.updateStateFromSettings();
    actions.updateSettingsFromState();

    TriggerManager.priorityList.forEach((trigger: any) => {
      trigger.complete = false;
    });

    // If debug logging is enabled then verify the game actions code is both correct and in sync with our script code
    if (checkActions) {
      actions.verifyGameActions();
    }

    // Log filtering regex
    actions.buildFilterRegExp();

    // Normal popups, modals, and log filtering. The page shell owns the
    // observer mounts: on main content (tooltips), on the body (modals
    // puncturing through the modal port, or tooltips on any other modal), and
    // on the message queue (log filtering).
    getPageShell().mountObservers();
  }

  function mainAutoEvolveScriptImpl() {
    const actions = getScriptBootstrapActions();
    // This is a hack to check that the entire page has actually loaded. The
    // queueColumn is one of the last bits of the DOM, so the page shell treats
    // its arrival as the readiness marker. Otherwise, wait a little longer.
    if (!getPageShell().isPageReady()) {
      actions.schedule(mainAutoEvolveScript, 100);
      return;
    }

    // We'll need real window to access vue objects
    if (userscriptEnvironment.capabilities.hasPageWindow) {
      win = userscriptEnvironment.pageWindow;
    } else {
      win = window;
      // Commit the resolved window so the keyboard-handler port reads the page's
      // jQuery rather than the sandbox's original copy.
      commitContext();
      if (!getGameKeyboardHandlers().hasKeydownBinding()) {
        $.noConflict();
      }
    }
    game = win.evolve;
    commitContext();

    // Check if game exposing anything
    if (!game) {
      if (state.warnDebug) {
        state.warnDebug = false;
        actions.alert(
          "You need to enable Debug Mode in settings for script to work",
        );
      }
      actions.schedule(mainAutoEvolveScript, 100);
      return;
    }

    // Wait until exposed data fully initialized ('p' in fastLoop, 'c' in midLoop)
    if (!game.global?.race || !game.breakdown.p.consume) {
      actions.schedule(mainAutoEvolveScript, 100);
      return;
    }

    // Now we can check setting. Ensure game tabs are preloaded
    if (!game.global.settings.tabLoad) {
      if (state.warnPreload) {
        state.warnPreload = false;
        actions.alert(
          "You need to enable Preload Tab Content in settings for script to work",
        );
      }
      actions.schedule(mainAutoEvolveScript, 100);
      return;
    }

    // Make sure we have jQuery UI even if script was injected without *monkey
    if (getPageShell().needsJQueryUi()) {
      getPageShell().loadJQueryUi({
        onLoaded: mainAutoEvolveScript,
        onFailed: () =>
          actions.alert(
            "Can't load jQuery UI. Check browser console for details.",
          ),
      });
      return;
    }

    // Dealing with userscript sandbox
    // With our @grant none we usually try to run in the page context. This is normally bad for userscripts (can be detected by the page etc)
    // but this is perfect since the game has debug mode built in on purpose just for us. We get the best possible performance too and there
    // is no security risk because we don't use any special browser/userscript/GM_ APIs.
    //
    // But depending on the userscript manager and browser it is possible we end up in the sandbox anyway.
    // They are not all alike in how they load scripts.
    // The default functions in poly. call cloneInto() on a whole bunch of stuff to make the script work when sandboxed in Firefox.
    // Chrome's sandbox is probably just broken in general, but luckily the most common ones will not sandbox us.
    //
    // But, even when we are not sandboxed, some userscript managers set unsafeWindow and cloneInto anyway, for compatibility.
    // This will work fine in the rest of the script's detections, since there it is not performance relevant, but these functions are much slower
    // than the game's original functions. So, include a check to make sure that it is worth using cloneInto.
    // The rest of the checks don't need adjusting as unsafeWindow === window in this case and they all use the same code anyway,
    // so there is no performance loss there.
    // If we don't need the sandboxed functions, we can discard our poly. wrappers and directly call the game's ones.
    needSandboxBypass = userscriptEnvironment.capabilities.needsSandboxBridge;
    commitContext();
    if (!needSandboxBypass) {
      poly.adjustCosts = game.adjustCosts;
      poly.loc = game.loc;
      poly.messageQueue = game.messageQueue;
      poly.shipCosts = game.shipCosts;
    }

    actions.addErrorHandler();
    actions.addScriptStyle();
    actions.keyManagerInit();
    actions.initialiseState();
    actions.initialiseRaces();
    initialiseScript();
    actions.updateOverrides();

    // Hook to game loop, to allow script run at full speed in unfocused tab
    const setCallback = (fn: any) =>
      !needSandboxBypass ? fn : userscriptEnvironment.exportToPage(fn);
    // This should be the last var set in game's debug.js:updateDebugData(), otherwise we may be working with partially outdated data
    let breakdown = game.breakdown;
    Object.defineProperty(game, "breakdown", {
      get: setCallback(() => breakdown),
      set: setCallback((v: any) => {
        breakdown = v;
        state.gameTicked = true;
        if (settings.tickSchedule) {
          actions.schedule(actions.automate);
        } else {
          actions.automate();
        }
      }),
    });
    // Game disables workers in lab ui, we need to check that outside of debug hook
    actions.repeat(actions.automateLab, 2500);

    // Expose saving/loading functions so that they can be called by other scripts
    win.importAutomationSettings = actions.importSettings;
    win.exportAutomationSettings = actions.exportSettings;
    win.eaExportStateLog = () =>
      actions.triggerFileDownload(
        JSON.stringify(state.stateLog ?? actions.loadStateLog()),
        `evolve-statelog-manual-d${game!.global.stats.days}.json`,
      );

    // Safe mode warning, if active. Hope users can't miss it
    if (safeMode) {
      const msg = [
        `Script safe mode is active to let you solve problems in your configuration.`,
        `The masterScriptToggle is always disabled in this mode, and your overrides don't get evaluated.`,
        `Fix the problems that required you to use this mode, then remove ?safemode from the URL to deactivate.`,
      ].join("\n");
      actions.displayScriptWarningNode("Safe mode active", msg, null);
      poly.messageQueue(msg, "warning", true, ["events", "major_events"]);
    }
  }

  const initialiseScript = withContext(
    initialiseScriptImpl,
    "initialiseScript",
  );
  let mainAutoEvolveScript: AnyFunction;
  mainAutoEvolveScript = withContext(
    mainAutoEvolveScriptImpl,
    "mainAutoEvolveScript",
  );

  return { initialiseScript, mainAutoEvolveScript };
}
