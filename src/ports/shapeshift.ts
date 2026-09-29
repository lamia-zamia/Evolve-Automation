import type { ShapeshiftInput } from "../domain/traits/shapeshift.ts";

export interface ShapeshiftReader {
  read(): ShapeshiftInput;
}
