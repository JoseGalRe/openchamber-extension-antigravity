/**
 * A Quota window the Usage card shows.
 */
export type UsageCardWindow = {
  /**
   * The window's key on the card, which OpenChamber shows as its label: `5h` or `weekly`.
   */
  readonly key: string;
  /**
   * The `window` of the `/usage` bucket it shows.
   */
  readonly window: string;
  /**
   * The window's length, in seconds.
   */
  readonly seconds: number;
};
