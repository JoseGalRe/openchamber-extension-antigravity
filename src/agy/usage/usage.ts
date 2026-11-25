import * as z from 'zod/mini';

import type { AgyBinary } from '../cli/cli.types.ts';
import type { CachedReading, CommandResult, Probe, UsageReader, UsageReaderOptions, UsageReading } from './usage.types.ts';

/**
 * How long a reading, successful or not, answers later reads.
 */
export const READING_TTL_MS = 60_000;

/**
 * One run's time limit. A first read runs `/help` and `/usage`, and both fit in OpenChamber's 20 seconds.
 */
export const RUN_TIMEOUT_MS = 8000;

const printResultSchema = z.object({
  status: z.string(),
  response: z.optional(z.string()),
  command: z.optional(
    z.object({
      name: z.string(),
      data: z.optional(z.unknown()),
    }),
  ),
});

const agyErrorSchema = z.object({
  short_error: z.string(),
});

const helpDataSchema = z.object({
  commands: z.array(z.object({ name: z.string() })),
});

const usageDataSchema = z.object({
  groups: z.array(
    z.object({
      name: z.string(),
      buckets: z.array(
        z.object({
          id: z.string(),
          window: z.string(),
          remaining_fraction: z.number(),
          reset_time: z.string(),
        }),
      ),
    }),
  ),
});

/**
 * The first line of `agy`'s output that says something, with an `AGY_ERROR:` line reduced to its `short_error`.
 */
function firstLine(text: string): string {
  const line =
    text
      .split(/\r?\n/)
      .find((candidate) => candidate.trim().length > 0)
      ?.trim() ?? '';

  if (!line.startsWith('AGY_ERROR:')) {
    return line;
  }

  const raw = line.slice('AGY_ERROR:'.length).trim();

  try {
    const parsed = agyErrorSchema.safeParse(JSON.parse(raw));

    return parsed.success ? parsed.data.short_error : raw;
  } catch {
    return raw;
  }
}

async function runCommand(options: UsageReaderOptions, binary: AgyBinary, name: string): Promise<CommandResult> {
  // A real `/help` answers at once, offline: a slow or failed one was a model turn.
  const isProbe = name === 'help';
  const run = await options.run(binary, `/${name}`, RUN_TIMEOUT_MS);

  if (run.kind === 'timeout') {
    return { ok: false, unfit: isProbe, error: `agy did not answer /${name} in time.` };
  }

  if (run.kind === 'failed') {
    return { ok: false, unfit: false, error: `agy could not start: ${run.message}` };
  }

  let output: unknown;

  try {
    output = JSON.parse(run.stdout);
  } catch {
    const detail = firstLine(run.stderr) || firstLine(run.stdout) || `exit code ${run.code}`;

    return { ok: false, unfit: false, error: `agy failed on /${name}: ${detail}` };
  }

  const result = printResultSchema.safeParse(output);

  if (!result.success) {
    return { ok: false, unfit: false, error: `agy answered /${name} in a shape this extension does not know.` };
  }

  const { status, response, command } = result.data;

  if (status !== 'SUCCESS') {
    const detail = firstLine(run.stderr) || firstLine(response ?? '') || status;

    return { ok: false, unfit: isProbe, error: `agy failed on /${name}: ${detail}` };
  }

  if (command?.name !== name) {
    return {
      ok: false,
      unfit: true,
      error: `agy did not run /${name} as a command, so it is no longer asked for usage. Update agy, then restart OpenChamber.`,
    };
  }

  return { ok: true, data: command.data };
}

/**
 * Makes the usage reader. `/usage` runs only on an `agy` build whose `/help` lists it, and a build that answered either
 * command as a model turn is never asked again (ADR-0003).
 *
 * @param options How to find and run `agy`, and the clock.
 *
 * @returns The reader.
 */
export function createUsageReader(options: UsageReaderOptions): UsageReader {
  const now = options.now ?? Date.now;
  const probes = new Map<string, Probe>();

  let cached: CachedReading | null = null;
  let inFlight: Promise<UsageReading> | null = null;

  async function probe(binary: AgyBinary): Promise<Probe> {
    const known = probes.get(binary.identity);

    if (known) {
      return known;
    }

    const help = await runCommand(options, binary, 'help');

    if (!help.ok) {
      const failed: Probe = { fit: false, error: help.error };

      if (help.unfit) {
        probes.set(binary.identity, failed);
      }

      return failed;
    }

    const listed = helpDataSchema.safeParse(help.data);
    const fit = listed.success && listed.data.commands.some((command) => command.name === 'usage');
    const decided: Probe = fit
      ? { fit }
      : { fit, error: 'This agy has no /usage command. Update agy, then restart OpenChamber.' };

    probes.set(binary.identity, decided);

    return decided;
  }

  async function read(): Promise<UsageReading> {
    const binary = await options.locate();

    if (!binary) {
      return {
        ok: false,
        installed: false,
        error: 'agy is not installed, or neither on the PATH OpenChamber runs with nor in ~/.local/bin.',
      };
    }

    const probed = await probe(binary);

    if (!probed.fit) {
      return { ok: false, installed: true, error: probed.error };
    }

    const usage = await runCommand(options, binary, 'usage');

    if (!usage.ok) {
      if (usage.unfit) {
        probes.set(binary.identity, { fit: false, error: usage.error });
      }

      return { ok: false, installed: true, error: usage.error };
    }

    const data = usageDataSchema.safeParse(usage.data);

    return data.success
      ? { ok: true, groups: data.data.groups }
      : { ok: false, installed: true, error: 'agy answered /usage in a shape this extension does not know.' };
  }

  async function readOnce(): Promise<UsageReading> {
    try {
      const reading = await read();

      cached = { at: now(), reading };

      return reading;
    } finally {
      inFlight = null;
    }
  }

  return async function readUsage(): Promise<UsageReading> {
    if (cached && now() - cached.at < READING_TTL_MS) {
      return cached.reading;
    }

    inFlight ??= readOnce();

    return inFlight;
  };
}
