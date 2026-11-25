import { QUOTA_PROVIDER_ERROR_MESSAGE_MAX } from '@openchamber/sdk';

import type { UsageBucket, UsageGroup, UsageReading } from '../../agy/usage/usage.types.ts';
import type { UsageCardWindow } from './usage-card.types.ts';
import type { QuotaProviderUsageData, QuotaProviderWindow } from '@openchamber/sdk';

/**
 * The windows the card shows, in order.
 */
const WINDOWS: readonly UsageCardWindow[] = [
  {
    key: '5h',
    window: '5h',
    seconds: 5 * 3600,
  },
  {
    key: 'weekly',
    window: 'weekly',
    seconds: 7 * 24 * 3600,
  },
];

function toWindow(bucket: UsageBucket, seconds: number): QuotaProviderWindow {
  const used = Math.min(100, Math.max(0, (1 - bucket.remaining_fraction) * 100));
  const reset = Date.parse(bucket.reset_time);

  return {
    usedPercent: Math.round(used * 10) / 10,
    windowSeconds: seconds,
    resetAt: Number.isFinite(reset) && reset > 0 ? reset : null,
  };
}

function isGeminiGroup(group: UsageGroup): boolean {
  return group.buckets.some((bucket) => bucket.id.startsWith('gemini-'));
}

/**
 * The card OpenChamber shows when there is no reading: the reason, and its last sample kept.
 *
 * @param error Why there is no reading, written for the user.
 * @param configured `false` when `agy` is not installed, which OpenChamber shows as not configured.
 *
 * @returns The failed card.
 */
export function failedCard(error: string, configured = true): QuotaProviderUsageData {
  return { ok: false, configured, error: error.slice(0, QUOTA_PROVIDER_ERROR_MESSAGE_MAX), usage: null };
}

/**
 * The Usage card for a reading: the Gemini Model group's 5-hour and weekly windows. The plugin offers Gemini models
 * only, so the other groups stay off the card. A window not used yet has no reset.
 *
 * @param reading What the usage read found out.
 *
 * @returns The card, as a built-in usage provider answers it.
 */
export function usageCard(reading: UsageReading): QuotaProviderUsageData {
  if (!reading.ok) {
    return failedCard(reading.error, reading.installed);
  }

  const group = reading.groups.find(isGeminiGroup);

  if (!group) {
    return failedCard("agy's /usage has no Gemini group.");
  }

  const windows: Record<string, QuotaProviderWindow> = {};

  for (const { key, window, seconds } of WINDOWS) {
    const bucket = group.buckets.find((candidate) => candidate.window === window);

    if (bucket) {
      windows[key] = toWindow(bucket, seconds);
    }
  }

  if (Object.keys(windows).length === 0) {
    return failedCard("agy's /usage has no Gemini windows.");
  }

  return { ok: true, configured: true, planLabel: 'Gemini models', usage: { windows } };
}
