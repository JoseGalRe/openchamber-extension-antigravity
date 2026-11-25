import { createServer } from 'node:http';

import { QUOTA_PROVIDER_PATH, readQuotaProviderRequest } from '@openchamber/sdk';

import packageJson from '../../../package.json' with { type: 'json' };
import { failedCard } from '../usage-card/usage-card.ts';

import type { ServiceOptions } from './service.types.ts';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

/**
 * A request body past this many characters is not a usage read.
 */
const BODY_MAX = 64 * 1024;

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>();

  let body = '';

  function onData(text: string): void {
    body += text;

    if (body.length > BODY_MAX) {
      reject(new Error('The body is too large'));
      request.destroy();
    }
  }

  request.setEncoding('utf8');
  request.on('data', onData);
  request.once('end', () => resolve(body));
  request.once('error', reject);

  return promise;
}

/**
 * The Service's HTTP server, on OpenChamber's service contract: every request carries the token as its bearer,
 * `GET /health` says it is ready, and `POST /quota` answers OpenChamber's usage read with the Usage card. Nothing else
 * calls it, since the extension has no frame.
 *
 * @param options The token and how to read the card.
 *
 * @returns The server, not listening yet.
 */
export function createService(options: ServiceOptions): Server {
  async function answerUsageRead(request: IncomingMessage, response: ServerResponse): Promise<void> {
    let body: string;

    try {
      body = await readBody(request);
    } catch {
      send(response, 400, { error: 'NOT_A_USAGE_READ' });

      return;
    }

    if (!readQuotaProviderRequest(body)) {
      send(response, 400, { error: 'NOT_A_USAGE_READ' });

      return;
    }

    try {
      send(response, 200, { ok: true, data: await options.readCard() });
    } catch (error: unknown) {
      send(response, 200, { ok: true, data: failedCard(`The usage read failed: ${String(error)}`) });
    }
  }

  function onRequest(request: IncomingMessage, response: ServerResponse): void {
    if (!options.token || request.headers.authorization !== `Bearer ${options.token}`) {
      send(response, 401, { error: 'UNAUTHORIZED' });

      return;
    }

    const route = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;

    if (request.method === 'GET' && route === '/health') {
      send(response, 200, { ok: true, version: packageJson.version });

      return;
    }

    if (request.method === 'POST' && route === QUOTA_PROVIDER_PATH) {
      void answerUsageRead(request, response);

      return;
    }

    send(response, 404, { error: 'NOT_FOUND' });
  }

  return createServer(onRequest);
}
