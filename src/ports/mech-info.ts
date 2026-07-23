import type { MechInfoItem } from "../domain/combat/mech-info.ts";

export interface MechInfoReader {
  ensureLabActive(): boolean;
  readItems(count: number): readonly MechInfoItem[];
}

export interface MechInfoObserver {
  disconnect(): void;
  observe(
    target: unknown,
    options: Readonly<{ readonly childList: true }>,
  ): void;
}
