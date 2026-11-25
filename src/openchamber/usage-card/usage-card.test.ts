import { quotaProviderSchemasV1 } from '@openchamber/sdk/schemas';
import { describe, expect, it } from 'vite-plus/test';

import { failedCard, usageCard } from './usage-card.ts';

import type { UsageGroup } from '../../agy/usage/usage.types.ts';

const GROUPS: UsageGroup[] = [
  {
    name: 'Gemini Models',
    buckets: [
      {
        id: 'gemini-weekly',
        window: 'weekly',
        remaining_fraction: 0.9905038475990295,
        reset_time: '2026-12-02T02:20:23Z',
      },
      {
        id: 'gemini-5h',
        window: '5h',
        remaining_fraction: 0.9668623805046082,
        reset_time: '2026-11-25T20:26:43Z',
      },
    ],
  },
  {
    name: 'Claude and GPT models',
    buckets: [
      {
        id: '3p-5h',
        window: '5h',
        remaining_fraction: 0.1,
        reset_time: '2026-11-25T20:00:00Z',
      },
    ],
  },
];

/**
 * Checks a card with the strict schema OpenChamber parses it with: one bad window fails the whole answer.
 */
function expectParses(card: unknown): void {
  const parsed = quotaProviderSchemasV1.usage.safeParse(card);

  expect(parsed.success ? 'ok' : JSON.stringify(parsed.error.issues)).toBe('ok');
}

describe('usageCard', () => {
  it('shows the Gemini group’s 5-hour and weekly windows only', () => {
    const card = usageCard({ ok: true, groups: GROUPS });

    expectParses(card);
    expect(card).toEqual({
      ok: true,
      configured: true,
      planLabel: 'Gemini models',
      usage: {
        windows: {
          '5h': {
            usedPercent: 3.3,
            windowSeconds: 18_000,
            resetAt: Date.parse('2026-11-25T20:26:43Z'),
          },
          'weekly': {
            usedPercent: 0.9,
            windowSeconds: 604_800,
            resetAt: Date.parse('2026-12-02T02:20:23Z'),
          },
        },
      },
    });
  });

  it('gives a window not used yet no reset, and keeps percentages between 0 and 100', () => {
    const card = usageCard({
      ok: true,
      groups: [
        {
          name: 'Gemini Models',
          buckets: [
            { id: 'gemini-5h', window: '5h', remaining_fraction: 1, reset_time: '1970-01-01T00:00:00Z' },
            { id: 'gemini-weekly', window: 'weekly', remaining_fraction: -0.2, reset_time: 'soon' },
          ],
        },
      ],
    });

    expectParses(card);
    expect(card.usage?.windows['5h']).toMatchObject({ usedPercent: 0, resetAt: null });
    expect(card.usage?.windows['weekly']).toMatchObject({ usedPercent: 100, resetAt: null });
  });

  it('fails as a configured card with the reason, or not configured without agy', () => {
    const cards = [
      usageCard({ ok: false, installed: true, error: 'x'.repeat(5000) }),
      usageCard({ ok: true, groups: [] }),
      usageCard({
        ok: true,
        groups: [
          { name: 'Gemini Models', buckets: [{ id: 'gemini-1d', window: '1d', remaining_fraction: 1, reset_time: '' }] },
        ],
      }),
    ];

    for (const card of cards) {
      expectParses(card);
      expect(card).toMatchObject({ ok: false, configured: true, usage: null });
    }

    expect(usageCard({ ok: false, installed: false, error: 'agy is not installed' })).toMatchObject({ configured: false });
    expect(failedCard('boom')).toEqual({ ok: false, configured: true, error: 'boom', usage: null });
  });
});
