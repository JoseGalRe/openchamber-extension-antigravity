import type { QuotaProviderUsageData } from '@openchamber/sdk';

/**
 * What the Service needs from the outside.
 */
export type ServiceOptions = {
  /**
   * `OPENCHAMBER_SERVICE_TOKEN`: every request must carry it as its bearer. An empty token refuses every request.
   */
  readonly token: string;
  /**
   * The Usage card now. A rejection is answered as a failed card.
   *
   * @returns The card.
   *
   * @example
   * ```ts
   * const readCard = async () => usageCard(await readUsage());
   * ```
   */
  readonly readCard: () => Promise<QuotaProviderUsageData>;
};
