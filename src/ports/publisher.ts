export interface Publisher<TReadModel> {
  publish(readModel: TReadModel): void;
}
