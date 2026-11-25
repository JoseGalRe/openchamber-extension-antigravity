import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vite-plus/test';

import { findAgy, runAgy } from '../cli/cli.ts';

import { READING_TTL_MS, RUN_TIMEOUT_MS, createUsageReader } from './usage.ts';

import type { AgyBinary, AgyRun } from '../cli/cli.types.ts';

const FAKE_AGY = fileURLToPath(new URL('../../../tests/fixtures/fake-agy.ts', import.meta.url));

const BINARY: AgyBinary = {
  path: '/fake/agy',
  identity: '/fake/agy:1:1',
};

const GROUPS = [
  {
    name: 'Gemini Models',
    buckets: [
      {
        id: 'gemini-5h',
        window: '5h',
        remaining_fraction: 0.5,
        reset_time: '2026-11-25T20:26:43Z',
      },
    ],
  },
];

function answered(name: string, data: unknown): AgyRun {
  return { kind: 'exited', code: 0, stderr: '', stdout: JSON.stringify({ status: 'SUCCESS', command: { name, data } }) };
}

const HELP = answered('help', { commands: [{ name: 'help' }, { name: 'usage' }] });
const USAGE = answered('usage', { groups: GROUPS });

const TURN: AgyRun = {
  kind: 'exited',
  code: 0,
  stderr: '',
  stdout: JSON.stringify({ status: 'SUCCESS', response: 'Hello' }),
};

/**
 * A reader over scripted runs, with the slash commands it ran in `asked` and a clock the test moves.
 */
function scripted(answers: Record<string, AgyRun[]>) {
  const asked: string[] = [];
  const clock = { now: 0 };

  async function run(_binary: AgyBinary, slash: string, timeoutMs: number): Promise<AgyRun> {
    expect(timeoutMs).toBe(RUN_TIMEOUT_MS);
    asked.push(slash);

    const next = answers[slash]?.shift();

    if (!next) {
      throw new Error(`unexpected ${slash}`);
    }

    return next;
  }

  const read = createUsageReader({ locate: async () => BINARY, run, now: () => clock.now });

  return { read, asked, clock };
}

describe('createUsageReader', () => {
  it('runs /usage only after /help lists it, and /help once per agy build', async () => {
    const { read, asked, clock } = scripted({ '/help': [HELP], '/usage': [USAGE, USAGE] });

    await expect(read()).resolves.toEqual({ ok: true, groups: GROUPS });

    clock.now += READING_TTL_MS;

    await expect(read()).resolves.toEqual({ ok: true, groups: GROUPS });
    expect(asked).toEqual(['/help', '/usage', '/usage']);
  });

  it('answers from the last reading, failed or not, for a minute, and shares a read in flight', async () => {
    const { read, asked, clock } = scripted({ '/help': [{ kind: 'failed', message: 'EACCES' }, HELP], '/usage': [USAGE] });

    const [first, second] = await Promise.all([read(), read()]);

    expect(second).toBe(first);
    expect(first).toEqual({ ok: false, installed: true, error: 'agy could not start: EACCES' });

    clock.now += READING_TTL_MS - 1;

    await expect(read()).resolves.toBe(first);

    clock.now += 1;

    await expect(read()).resolves.toMatchObject({ ok: true });
    expect(asked).toEqual(['/help', '/help', '/usage']);
  });

  it('never runs /usage on an agy whose /help does not list it', async () => {
    const { read, asked, clock } = scripted({ '/help': [answered('help', { commands: [{ name: 'help' }] })] });

    await expect(read()).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/no \/usage command/) });

    clock.now += READING_TTL_MS;

    await expect(read()).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/no \/usage command/) });
    expect(asked).toEqual(['/help']);
  });

  it('never asks again an agy that answered a command as a model turn, or a slow or failed /help', async () => {
    const failedHelp: AgyRun = { kind: 'exited', code: 1, stderr: '', stdout: JSON.stringify({ status: 'ERROR' }) };

    for (const answers of [
      { '/help': [TURN] },
      { '/help': [HELP], '/usage': [TURN] },
      { '/help': [{ kind: 'timeout' } as const] },
      { '/help': [failedHelp] },
    ]) {
      const { read, asked, clock } = scripted(answers);

      await expect(read()).resolves.toMatchObject({ ok: false, installed: true });

      const ran = asked.length;

      clock.now += READING_TTL_MS;

      await expect(read()).resolves.toMatchObject({ ok: false });
      expect(asked).toHaveLength(ran);
    }
  });

  it('tries /usage again after a failure that says nothing about the command', async () => {
    const { read, asked, clock } = scripted({
      '/help': [HELP],
      '/usage': [
        { kind: 'exited', code: 1, stdout: '', stderr: 'AGY_ERROR: {"short_error":"not signed in"}\n' },
        { kind: 'timeout' },
        { kind: 'exited', code: 1, stdout: 'Segmentation fault', stderr: '' },
        USAGE,
      ],
    });

    await expect(read()).resolves.toEqual({ ok: false, installed: true, error: 'agy failed on /usage: not signed in' });

    clock.now += READING_TTL_MS;

    await expect(read()).resolves.toMatchObject({ error: 'agy did not answer /usage in time.' });

    clock.now += READING_TTL_MS;

    await expect(read()).resolves.toMatchObject({ error: 'agy failed on /usage: Segmentation fault' });

    clock.now += READING_TTL_MS;

    await expect(read()).resolves.toMatchObject({ ok: true });
    expect(asked).toEqual(['/help', '/usage', '/usage', '/usage', '/usage']);
  });

  it('says when agy is missing, or answers in a shape it does not know', async () => {
    const missing = createUsageReader({ locate: async () => null, run: () => Promise.reject(new Error('not run')) });

    await expect(missing()).resolves.toMatchObject({
      ok: false,
      installed: false,
      error: expect.stringMatching(/not installed/),
    });

    for (const usage of [answered('usage', { groups: 1 }), { kind: 'exited', code: 0, stderr: '', stdout: '[1]' } as const]) {
      const { read } = scripted({ '/help': [HELP], '/usage': [usage] });

      await expect(read()).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/shape/) });
    }
  });

  it.skipIf(process.platform === 'win32')('reads through an agy process', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'antigravity-usage-'));
    const bin = join(folder, 'bin');

    await mkdir(bin);
    await writeFile(join(bin, 'agy'), `#!/bin/sh\nexec "${process.execPath}" "${FAKE_AGY}" "$@"\n`);
    await chmod(join(bin, 'agy'), 0o755);

    const env = { PATH: bin };

    const read = createUsageReader({
      locate: () => findAgy(env),
      run: (binary, slash, timeoutMs) => runAgy(binary, slash, timeoutMs, env),
    });

    await expect(read()).resolves.toMatchObject({ ok: true, groups: [{ name: 'Gemini Models' }] });

    await rm(folder, { recursive: true, force: true });
  });
});
