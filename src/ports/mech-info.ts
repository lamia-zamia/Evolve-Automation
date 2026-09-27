import type { MechInfoItem } from "../domain/combat/mech-info.ts";

export interface MechInfoReader {
  ensureLabActive(): boolean;
  readItems(count: number): readonly (MechInfoItem | undefined)[];
}

export interface MechInfoObserver {
  disconnect(): void;
  observe(
    target: unknown,
    options: Readonly<{ readonly childList: true }>,
    onMutation: () => void,
  ): void;
}
