import { QUOTA_PROVIDER_PATH } from '@openchamber/sdk';
import { quotaProviderSchemasV1 } from '@openchamber/sdk/schemas';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import packageJson from '../../../package.json' with { type: 'json' };

import { createService } from './service.ts';

import type { QuotaProviderUsageData } from '@openchamber/sdk';
import type { Server } from 'node:http';

const TOKEN = 'fixture-service-token';

const USAGE_READ = JSON.stringify({
  v: 1,
  requestId: 'read-1',
  method: 'usage.read',
  provider: 'ext-antigravity',
  input: {
    credentials: {},
  },
});

const CARD: QuotaProviderUsageData = {
  ok: true,
  configured: true,
  planLabel: 'Gemini models',
  usage: {
    windows: {
      '5h': {
        usedPercent: 3.3,
        windowSeconds: 18_000,
        resetAt: null,
      },
    },
  },
};

const closers: Array<() => void> = [];

afterEach(() => {
  for (const close of closers.splice(0)) {
    close();
  }
});

function portOf(server: Server): number {
  const address = server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('The server is not listening on a port');
  }

  return address.port;
}

/**
 * Starts a Service on a free port whose card comes from `readCard`, and returns how to call it.
 */
async function start(readCard: () => Promise<QuotaProviderUsageData> = () => Promise.resolve(CARD)) {
  let reads = 0;

  const server = createService({
    token: TOKEN,
    readCard: () => {
      reads += 1;

      return readCard();
    },
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => server.close());

  const port = portOf(server);

  function call(path: string, init: RequestInit = {}, token = TOKEN): Promise<Response> {
    return fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers: { Authorization: `Bearer ${token}` } });
  }

  return { call, reads: () => reads };
}

async function readUsageCard(response: Response): Promise<unknown> {
  expect(response.status).toBe(200);

  const envelope = quotaProviderSchemasV1.envelope.parse(await response.json());

  if (!envelope.ok) {
    throw new Error(envelope.error.message);
  }

  return quotaProviderSchemasV1.data['usage.read'].parse(envelope.data);
}

describe('createService', () => {
  it('answers OpenChamber’s usage read with the card', async () => {
    const { call } = await start();

    await expect(readUsageCard(await call(QUOTA_PROVIDER_PATH, { method: 'POST', body: USAGE_READ }))).resolves.toEqual(CARD);
  });

  it('answers a read that failed inside as a failed card', async () => {
    const { call } = await start(() => Promise.reject(new Error('stat failed')));

    await expect(readUsageCard(await call(QUOTA_PROVIDER_PATH, { method: 'POST', body: USAGE_READ }))).resolves.toEqual({
      ok: false,
      configured: true,
      error: 'The usage read failed: Error: stat failed',
      usage: null,
    });
  });

  it('answers /health with its version', async () => {
    const { call } = await start();
    const response = await call('/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, version: packageJson.version });
  });

  it('refuses a caller without the token, and anything but a usage read', async () => {
    const { call, reads } = await start();

    expect((await call('/health', {}, 'wrong')).status).toBe(401);
    expect((await call(QUOTA_PROVIDER_PATH, { method: 'POST', body: '{}' })).status).toBe(400);
    expect(
      (await call(QUOTA_PROVIDER_PATH, { method: 'POST', body: 'x'.repeat(70 * 1024) }).catch(() => null))?.status ?? 400,
    ).toBe(400);
    expect((await call('/elsewhere')).status).toBe(404);
    expect(reads()).toBe(0);
  });

  it('refuses every request with an empty token', async () => {
    const server = createService({ token: '', readCard: () => Promise.resolve(CARD) });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    closers.push(() => server.close());

    const port = portOf(server);
    const response = await fetch(`http://127.0.0.1:${port}/health`, { headers: { Authorization: 'Bearer ' } });

    expect(response.status).toBe(401);
  });
});
