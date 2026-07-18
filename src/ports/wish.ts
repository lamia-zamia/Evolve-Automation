import type { WishInput, WishTier } from "../domain/wish.ts";

export interface WishReader {
  read(): WishInput;
}

export interface WishControls {
  select(tier: WishTier, wishId: string): boolean;
}
