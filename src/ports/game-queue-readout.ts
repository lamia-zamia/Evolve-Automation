export interface GameQueueEntryReadout {
  readonly id: string;
  readonly label: string;
}

export interface GameQueueReadoutSample {
  readonly build: readonly Readonly<GameQueueEntryReadout>[];
  readonly research: readonly Readonly<GameQueueEntryReadout>[];
}

export interface GameQueueReadout {
  read(): Readonly<GameQueueReadoutSample>;
}
