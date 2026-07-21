/** Static secondary-option buttons owned by the options modal adapter. */
export type OptionsModalBuilderKey = "government" | "war" | "hell" | "fleet";

export interface OptionsModalButtonDefinition {
  readonly id: string;
  readonly selector: string;
  readonly title: string;
  readonly builder: OptionsModalBuilderKey;
}

export interface OptionsToggleState {
  readonly checked: boolean;
  readonly inactive: boolean;
}

const optionButtons: readonly OptionsModalButtonDefinition[] = Object.freeze([
  Object.freeze({
    id: "s-government-options",
    selector: "#government .tabs ul",
    title: "Government",
    builder: "government",
  }),
  Object.freeze({
    id: "s-foreign-options",
    selector: "#garrison div h2",
    title: "Foreign Affairs",
    builder: "war",
  }),
  Object.freeze({
    id: "s-foreign-options2",
    selector: "#c_garrison div h2",
    title: "Foreign Affairs",
    builder: "war",
  }),
  Object.freeze({
    id: "s-hell-options",
    selector: "#gFort div h3",
    title: "Hell",
    builder: "hell",
  }),
  Object.freeze({
    id: "s-hell-options2",
    selector: "#prtl_fortress div h3",
    title: "Hell",
    builder: "hell",
  }),
  Object.freeze({
    id: "s-fleet-options",
    selector: "#hfleet h3",
    title: "Fleet",
    builder: "fleet",
  }),
]);

export function getOptionsModalButtonDefinitions(): readonly OptionsModalButtonDefinition[] {
  return optionButtons;
}
