import type { GameSnapshot } from "../domain/snapshot.ts";

export interface GameReader<TSnapshot extends GameSnapshot = GameSnapshot> {
  readSnapshot(): TSnapshot;
}
