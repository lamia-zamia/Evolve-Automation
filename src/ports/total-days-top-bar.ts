/** Reads the validated state needed by the total-days top-bar browser adapter. */
export interface TotalDaysTopBarReader {
  readDisplayEnabled(): boolean;
  readTotalDays(): number;
}
