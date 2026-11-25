import { findAgy, runAgy } from './agy/cli/cli.ts';
import { createUsageReader } from './agy/usage/usage.ts';
import { createService } from './openchamber/service/service.ts';
import { usageCard } from './openchamber/usage-card/usage-card.ts';

import type { AgyBinary, AgyRun } from './agy/cli/cli.types.ts';
import type { QuotaProviderUsageData } from '@openchamber/sdk';

const port = Number(process.env['OPENCHAMBER_SERVICE_PORT'] || 0);

function locate(): Promise<AgyBinary | null> {
  return findAgy(process.env);
}

function run(binary: AgyBinary, slash: string, timeoutMs: number): Promise<AgyRun> {
  return runAgy(binary, slash, timeoutMs, process.env);
}

const readUsage = createUsageReader({ locate, run });

async function readCard(): Promise<QuotaProviderUsageData> {
  return usageCard(await readUsage());
}

const server = createService({ token: process.env['OPENCHAMBER_SERVICE_TOKEN'] ?? '', readCard });

function onListening(): void {
  console.log(`[antigravity] listening on 127.0.0.1:${port}`);
}

function onError(error: Error): void {
  console.error(`[antigravity] ${error.message}`);
  process.exit(1);
}

function onSignal(): void {
  server.close();
  process.exit(0);
}

server.on('error', onError);
server.listen(port, '127.0.0.1', onListening);
process.once('SIGTERM', onSignal);
process.once('SIGINT', onSignal);
