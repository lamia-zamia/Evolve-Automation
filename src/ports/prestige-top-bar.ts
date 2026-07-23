import type { PrestigeTopBarTypeOption } from "../domain/progression/prestige/prestige-top-bar.ts";

export interface PrestigeTopBarReader {
  readDisplayEnabled(): boolean;
  readSelectedValue(): string;
  readTypeOptions(): readonly PrestigeTopBarTypeOption[];
}

export type PrestigeSettingsBuilder = (node: unknown, prefix: string) => void;

export interface PrestigeTopBarOptionsPort {
  addOptionUI(
    optionsId: string,
    querySelectorText: string,
    modalTitle: string,
    buildOptionsFunction: PrestigeSettingsBuilder,
  ): void;
}
