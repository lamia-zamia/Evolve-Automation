/** Immutable description of the Interface settings panel. */
export interface InterfaceSettingsToggle {
  readonly kind: "toggle";
  readonly settingName: string;
  readonly label: string;
  readonly hint: string;
}

export interface InterfaceSettingsHeader {
  readonly kind: "header";
  readonly label: string;
}

export type InterfaceSettingsControl =
  InterfaceSettingsToggle | InterfaceSettingsHeader;

export interface InterfaceSettingsReadModel {
  readonly sectionId: "interface";
  readonly sectionName: "Interface";
  readonly controls: readonly InterfaceSettingsControl[];
}

export interface InterfaceSettingsState {
  readonly activeTargetsUI: boolean;
  readonly buildPlannerUI: boolean;
}

export type InterfaceSettingsIntent = Readonly<{
  type: "reset-interface-settings";
}>;

const interfaceSettingsReadModel: InterfaceSettingsReadModel = Object.freeze({
  sectionId: "interface",
  sectionName: "Interface",
  controls: Object.freeze([
    Object.freeze({
      kind: "toggle",
      settingName: "activeTargetsUI",
      label: "Display detailed queue",
      hint: "Add UI in right column to display currently active queued buildings, technologies, and triggers and their resources.",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "buildPlannerUI",
      label: "Display script planner",
      hint: "Add UI below the message log showing the top buildings/projects autoBuild wants next, their weights, what's blocking them, and cumulative bottleneck statistics for the current run.",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "displayPrestigeTypeInTopBar",
      label: "Display prestige type in top bar",
      hint: "Show the currently selected prestige type in the top bar",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "displayTotalDaysTypeInTopBar",
      label: "Display total days in top bar",
      hint: "Show the total days next to this year's days",
    }),
    Object.freeze({
      kind: "header",
      label: "Experimental",
    }),
    Object.freeze({
      kind: "toggle",
      settingName: "performanceHackAvoidDrawTech",
      label: "Enable performance hack: drawTech avoidance",
      hint: "Enables experimental performance hacks designed to avoid excessive redraws of expensive game tabs. The ARPA path preserves game behaviour; the repeat-building path is narrowly guarded but may still be risky if game internals change.",
    }),
  ]),
});

export function getInterfaceSettingsReadModel(): InterfaceSettingsReadModel {
  return interfaceSettingsReadModel;
}
