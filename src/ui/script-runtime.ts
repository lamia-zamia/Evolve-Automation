type AnyRecord = Record<string, any>;
type AnyFunction = (...args: any[]) => any;

interface ScriptRuntimeUIContext {
  $: AnyFunction & AnyRecord;
  document: AnyRecord;
  state: AnyRecord;
  game: AnyRecord;
  win: AnyRecord;
  createOptionsModal: AnyFunction;
  openOptionsModal: AnyFunction;
  scriptVersionExtra: string;
}

interface ScriptRuntimeUIDependencies {
  getContext: () => ScriptRuntimeUIContext;
  getScriptVersion: () => string | undefined;
}

export function createScriptRuntimeUI({
  getContext,
  getScriptVersion,
}: ScriptRuntimeUIDependencies) {
  const liveObject = (key: keyof ScriptRuntimeUIContext) =>
    new Proxy(
      {},
      {
        get(_target, property) {
          const current = getContext()[key] as AnyRecord;
          const value = current?.[property as keyof typeof current];
          return typeof value === "function" ? value.bind(current) : value;
        },
        set(_target, property, value) {
          (getContext()[key] as AnyRecord)[property as string] = value;
          return true;
        },
      },
    ) as AnyRecord;
  const $ = new Proxy(function () {}, {
    apply(_target, _thisArg, args) {
      return getContext().$(...args);
    },
  }) as AnyFunction & AnyRecord;
  const document = liveObject("document");
  const state = liveObject("state");
  const game = liveObject("game");
  const win = liveObject("win");
  const createOptionsModal: AnyFunction = (...args) =>
    getContext().createOptionsModal(...args);
  const openOptionsModal: AnyFunction = (...args) =>
    getContext().openOptionsModal(...args);
  function updateDebugData() {
    state.forcedUpdate = true;
    game.updateDebugData();
    state.forcedUpdate = false;
  }

  function addScriptStyle() {
    // background = @html-background, alt = @market-item-background, hover = (alt - 0x111111), border = @primary-border, primary = @primary-color
    let cssData = {
      dark: {
        background: "#282f2f",
        alt: "#0f1414",
        hover: "#010303",
        border: "#ccc",
        primary: "#fff",
        hasTextWarning: "#ffdd57",
      },
      light: {
        background: "#fff",
        alt: "#dddddd",
        hover: "#ccc",
        border: "#000",
        primary: "#000",
        hasTextWarning: "#7a6304",
      },
      night: {
        background: "#282f2f",
        alt: "#1b1b1b",
        hover: "#0a0a0a",
        border: "#ccc",
        primary: "#fff",
        hasTextWarning: "#ffdd57",
      },
      darkNight: {
        background: "#282f2f",
        alt: "#1b1b1b",
        hover: "#0a0a0a",
        border: "#ccc",
        primary: "#b8b8b8",
        hasTextWarning: "#ffcc00",
      },
      redgreen: {
        background: "#282f2f",
        alt: "#1b1b1b",
        hover: "#0a0a0a",
        border: "#ccc",
        primary: "#fff",
        hasTextWarning: "#ffdd57",
      },
      gruvboxLight: {
        background: "#fbf1c7",
        alt: "#f9f5d7",
        hover: "#e8e4c6",
        border: "#3c3836",
        primary: "#3c3836",
        hasTextWarning: "#b57614",
      },
      gruvboxDark: {
        background: "#282828",
        alt: "#1d2021",
        hover: "#0c0f10",
        border: "#3c3836",
        primary: "#ebdbb2",
        hasTextWarning: "#fabd2f",
      },
      orangeSoda: {
        background: "#131516",
        alt: "#292929",
        hover: "#181818",
        border: "#313638",
        primary: "#EBDBB2",
        hasTextWarning: "#F06543",
      },
      dracula: {
        background: "#282a36",
        alt: "#1d2021",
        hover: "#C0F10",
        border: "#44475a",
        primary: "#f8f8f2",
        hasTextWarning: "#f1fa8c",
      },
    };
    let styles = "";
    // Colors for different themes
    for (let [theme, color] of Object.entries(cssData)) {
      styles += `
                html.${theme} .script-modal-content {
                    background-color: ${color.background};
                }

                html.${theme} .script-modal-header {
                    border-color: ${color.border};
                }

                /*
                html.${theme} .script-modal-body .button {
                    background-color: ${color.alt};
                }*/

                html.${theme} .script-modal-body table td,
                html.${theme} .script-modal-body table th {
                    border-color: ${color.border};
                }

                html.${theme} .script-collapsible {
                    background-color: ${color.alt};
                }

                html.${theme} .script-collapsible:after {
                    color: ${color.primary};
                }

                html.${theme} .script-contentactive,
                html.${theme} .script-collapsible:hover {
                    background-color: ${color.hover};
                }

                html.${theme} .percentage-full-progress-bar-wrapper {
                    background-color: ${color.hasTextWarning}15;
                }
                html.${theme} .percentage-full-progress-bar {
                    background-color: ${color.hasTextWarning}75;
                }

                html.${theme} .percentage-full-progress-bar-wrapper.is-replicating {
                    background-image: linear-gradient(135deg,${color.hasTextWarning}30 25%,transparent 25%,transparent 50%,${color.hasTextWarning}30 50%,${color.hasTextWarning}30 75%,transparent 75%,transparent);
                }

                html.${theme} #active_targets .target-type-box {
                    background-color: ${color.alt}75;
                }`;
    }
    styles += `
            .script-lastcolumn:after { float: right; content: "\\21c5"; }
            .script-refresh:after { float: right; content: "\\21ba"; cursor: pointer; }
            .script-draggable { cursor: move; cursor: grab; }
            .script-draggable:active { cursor: grabbing !important; }
            .ui-sortable-helper { display: table; cursor: grabbing !important; }

            .script-collapsible {
                color: white;
                cursor: pointer;
                padding: 18px;
                width: 100%;
                border: none;
                text-align: left;
                outline: none;
                font-size: 15px;
            }

            .script-collapsible:after {
                content: '\\002B';
                color: white;
                font-weight: bold;
                float: right;
                margin-left: 5px;
            }

            .script-contentactive:after {
                content: "\\2212";
            }

            .script-content {
                padding: 0 18px;
                display: none;
                //max-height: 0;
                overflow: hidden;
                //transition: max-height 0.2s ease-out;
            }

            .script-searchsettings {
                width: 100%;
                margin-top: 20px;
                margin-bottom: 10px;
            }

            /* Open script options button */
            .s-options-button {
                padding-right: 2px;
                cursor: pointer;
            }

            /* The Modal (background) */
            .script-modal {
              display: none; /* Hidden by default */
              position: fixed; /* Stay in place */
              z-index: 100; /* Sit on top */
              left: 0;
              top: 0;
              width: 100%; /* Full width */
              height: 100%; /* Full height */
              background-color: rgb(0,0,0); /* Fallback color */
              background-color: rgba(10,10,10,.86); /* Blackish w/ opacity */
              overflow-y: auto; /* Allow scrollbar */
            }

            /* Modal Content/Box */
            .script-modal-content {
                position: relative;
                margin: auto;
                margin-top: 50px;
                margin-bottom: 50px;
                padding: 0px;
                width: 900px;
                border-radius: .5rem;
                text-align: center;
            }

            .script-modal-content.override-modal {
                width: 70%;
                min-width: 900px;
            }

            /* The Close Button */
            .script-modal-close {
              float: right;
              font-size: 28px;
              margin-top: 20px;
              margin-right: 20px;
            }

            .script-modal-close:hover,
            .script-modal-close:focus {
              cursor: pointer;
            }

            /* Modal Header */
            .script-modal-header {
              padding: 4px 16px;
              margin-bottom: .5rem;
              border-bottom: #ccc solid .0625rem;
              text-align: center;
            }

            /* Modal Body */
            .script-modal-body {
                padding: 2px 16px;
                text-align: center;
                overflow: auto;
            }

            /* Autocomplete styles */
            .ui-autocomplete {
                background-color: #000;
                position: absolute;
                top: 0;
                left: 0;
                cursor: default;
                z-index: 10000 !important;
            }

            .ui-helper-hidden-accessible {
                border: 0;
                clip: rect(0 0 0 0);
                height: 1px;
                margin: -1px;
                overflow: hidden;
                padding: 0;
                position: absolute;
                width: 1px;
            }

            .selectable span {
                -moz-user-select: text !important;
                -khtml-user-select: text !important;
                -webkit-user-select: text !important;
                -ms-user-select: text !important;
                user-select: text !important;
            }

            .ea-craft-toggle {
                max-width:75px;
                margin-top:4px;
                position:absolute;
                left:50%;
            }

            /* Reduce message log clutterness */
            .main #msgQueueFilters span:not(:last-child) {
                !important; margin-right: 0.25rem;
            }

            /* Fixes for game styles */
            .main .resources .resource :first-child { white-space: nowrap; }
            #popTimer { margin-bottom: 0.1rem }
            .barracks { white-space: nowrap; }
            .area { width: calc(100% / 6) !important; max-width: 8rem; }
            .offer-item { width: 15% !important; max-width: 7.5rem; }
            .tradeTotal { margin-left: 11.5rem !important; }

            /* Styles for queued targets UI */
            #active_targets-wrapper {
                padding: 1rem;
                max-height: 50vh;
            }

            #sideQueue #active_targets-wrapper {
                max-height: 50vh;
            }

            #active_targets {
                font-size: 0.9em;
                max-width: 500px;
            }

            #active_targets .target-type-box {
                background-color: #1d2021;
                margin: 10px 0;
                padding: 0.5rem 1rem;
            }

            #active_targets ul {
                list-style-type: none;
                padding-top: 5px;
            }

            .active_targets-list > li {
                margin-top: 10px;
                width: 100%;
            }

            .active-target-title {
                display: inline-block;
            }
            .active-target-title.name {
                width: 40%;
            }
            .active-target-title.time {
                width: 40%;
            }
            .active-target-segments {
                white-space: nowrap;
            }

            #active_targets .active_targets-sub-list {
                list-style-type: none;
            }

            #active_targets .active_targets-sub-list li {
                width: 100%;
                padding: 0;
            }

            #active_targets > ul > li:not(:first-child) {
              margin-top: 10px;
            }

            #active_targets .active_targets-resource-text {
                display: flex;
                width: 40%;
            }

            #active_targets .active_targets-resource-text span {
                margin-left: 10px;
            }

            #active_targets .active_targets-resource-row {
                display: flex;
            }

            #active_targets .active_targets-resource-row .percentage-full-progress-bar-wrapper {
                display: flex;
                margin: 5px 0 0 0;
                width: 35%;
                height: 9px;
                overflow: hidden;
            }

            /* Styles for script planner UI */
            #script_planner-wrapper {
                padding: 1rem;
                max-height: 40vh;
            }
            #script_planner-header {
                cursor: pointer;
            }
            #script_planner {
                font-size: 0.9em;
                max-width: 500px;
            }
            #script_planner ul {
                list-style-type: none;
            }
            #script_planner li {
                display: block;
                width: 100%;
                height: auto !important;
                max-height: none !important;
                line-height: normal;
                overflow: visible;
                margin-top: 6px;
            }
            #script_planner .planner-row,
            #script_planner .planner-note {
                height: auto !important;
                line-height: normal;
            }
            #script_planner .planner-row {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto auto;
                column-gap: 8px;
                align-items: baseline;
            }
            #script_planner .planner-row > span {
                position: static;
                float: none;
                width: auto;
                display: block;
            }
            #script_planner .planner-name {
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            #script_planner .planner-weight,
            #script_planner .planner-time {
                white-space: nowrap;
                text-align: right;
            }
            #script_planner .planner-note {
                font-size: 0.85em;
                opacity: 0.7;
            }
            #script_planner-stats {
                margin-top: 12px;
            }
            #script_planner-reset {
                font-size: 0.75em;
                margin-left: 8px;
            }

            .percentage-full-progress-bar-wrapper.is-replicating {
                background-image: linear-gradient(135deg,rgba(255,255,255,.95) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.95) 50%,rgba(255,255,255,.95) 75%,transparent 75%,transparent);
                background-size: 20px 20px;
                animation: progress-bar-stripes 2s linear reverse infinite;
            }

            @keyframes progress-bar-stripes {
              0% {
                background-position: 40px 0;
              }
              100% {
                background-position: 0 0;
              }
            }

            #active_targets .active_targets-time-left {
                width: auto;
                text-align: left;
                font-size: 0.8rem;
                margin-left: 10px;
            }

            .active-target-remove-x {
                margin-left: 10px;
                opacity: 0.5;
                cursor: pointer;
                float: right;
                transform: rotate(45deg);
                font-size: 1.1rem;
                line-height: 1rem;
            }

            .active-target-remove-x:hover {
                opacity: 1;
                font-size: 1.2rem;
            }
        `;

    // Create style document
    var css = document.createElement("style");
    css.type = "text/css";
    css.appendChild(document.createTextNode(styles));

    // Append style to html head
    document.getElementsByTagName("head")[0].appendChild(css);
  }

  // Known game errors, bugs, etc that we don't want to show to the user.
  // This should be game errors only.
  function checkIgnoredError(e) {
    if (typeof e !== "string") e = String(e);
    let ignoreRegexes = [
      // Currently no known game errors. Example regex:
      // /.*ReferenceError.*defineGovernor.*/,
    ];

    if (ignoreRegexes.find((regex) => regex.test(e))) {
      return true;
    }

    return false;
  }

  function displayScriptWarningNode(title, msg, stack) {
    // Add stack info if available. Format is browser-dependent, but better than nothing, I suppose.
    if (typeof stack === "string") {
      msg = `${msg}\n\nStack info:\n${stack}`;
    }

    const versionPart = getScriptVersion() ?? "unknown";

    msg = `${msg}\n\nScript version: ${versionPart} ${getContext().scriptVersionExtra}\n`;

    $("#script-script-warning").remove();

    let clickable = $(
      `<span id="script-script-warning" style="cursor: pointer; border-right: 1px solid; margin-right: 1rem; padding-right: 1rem">⚠️ ${title}</span>`,
    );
    clickable.on("click", (e) => {
      const builder = (currentNode) => {
        currentNode.append(
          $(
            `<textarea style="width: 100%; height: 100%; min-height: 400px; margin-bottom: 10px">`,
          ).val(msg),
        );
      };
      // It's possible we get stuck in an error loop before updateUI, better safe than sorry
      createOptionsModal();
      openOptionsModal(`Script Notice: ${title}`, builder);
      clickable.remove();
    });

    $("#versionLog").before(clickable);
  }

  // Generic JS & Vue2 error handler so that things don't break invisibly as often
  function addErrorHandler() {
    win.addEventListener("error", (e) => {
      if (!checkIgnoredError(e?.message)) {
        displayScriptWarningNode(
          "Script Error",
          `${e?.message} in ${e?.filename}:${e?.lineno}:${e?.colno}.`,
          e?.error?.stack,
        );
      }

      return false;
    });

    if (win?.Vue?.config && !win?.Vue?.config?.errorHandler) {
      win.Vue.config.errorHandler = (err, vm, info) => {
        if (!checkIgnoredError(err)) {
          displayScriptWarningNode(
            "Script Error",
            `Vue error: ${err}`,
            err?.stack,
          );
        }
      };
    }
  }

  return {
    updateDebugData,
    addScriptStyle,
    checkIgnoredError,
    displayScriptWarningNode,
    addErrorHandler,
  };
}
