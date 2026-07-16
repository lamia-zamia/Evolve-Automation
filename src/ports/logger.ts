export interface Logger<TEvent> {
  record(event: TEvent): void;
}
