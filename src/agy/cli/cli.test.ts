import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vite-plus/test';

import { findAgy, printArgs, runAgy } from './cli.ts';

const FAKE_AGY = fileURLToPath(new URL('../../../tests/fixtures/fake-agy.ts', import.meta.url));

const folders: string[] = [];

afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

/**
 * An executable `agy` in `<folder>/<directory>` that runs the fake.
 */
async function installAgy(folder: string, directory: string): Promise<string> {
  const bin = join(folder, directory);
  const path = join(bin, 'agy');

  await mkdir(bin, { recursive: true });
  await writeFile(path, `#!/bin/sh\nexec "${process.execPath}" "${FAKE_AGY}" "$@"\n`);
  await chmod(path, 0o755);

  return path;
}

async function scratch(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'antigravity-cli-'));

  folders.push(folder);

  return folder;
}

describe.skipIf(process.platform === 'win32')('findAgy', () => {
  it('finds agy on PATH first, then in ~/.local/bin', async () => {
    const folder = await scratch();
    const onPath = await installAgy(folder, 'bin');
    const local = await installAgy(folder, 'home/.local/bin');

    await expect(findAgy({ PATH: `/nowhere:${join(folder, 'bin')}`, HOME: join(folder, 'home') })).resolves.toMatchObject({
      path: onPath,
    });
    await expect(findAgy({ PATH: '/nowhere', HOME: join(folder, 'home') })).resolves.toMatchObject({ path: local });
  });

  it('finds nothing where there is no executable agy', async () => {
    const folder = await scratch();

    await writeFile(join(folder, 'agy'), '');

    await expect(findAgy({ PATH: folder })).resolves.toBeNull();
    await expect(findAgy({})).resolves.toBeNull();
  });
});

describe.skipIf(process.platform === 'win32')('runAgy', () => {
  it('runs one slash command in print mode and collects its JSON', async () => {
    const folder = await scratch();
    const path = await installAgy(folder, 'bin');
    const log = join(folder, 'args.log');

    const run = await runAgy({ path, identity: path }, '/usage', 8000, { FAKE_AGY_LOG: log });

    expect(run).toMatchObject({ kind: 'exited', code: 0, stderr: '' });
    expect(run.kind === 'exited' && JSON.parse(run.stdout)).toMatchObject({ command: { name: 'usage' } });

    await expect(readFile(log, 'utf8')).resolves.toBe(`${printArgs('/usage', 7).join(' ')}\n`);
  });

  it('kills a run past its time limit', async () => {
    const folder = await scratch();
    const path = await installAgy(folder, 'bin');
    const started = Date.now();

    await expect(runAgy({ path, identity: path }, '/usage', 500, { FAKE_AGY: 'slow' })).resolves.toEqual({ kind: 'timeout' });
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('reports a binary that cannot start', async () => {
    await expect(runAgy({ path: '/nowhere/agy', identity: 'x' }, '/usage', 1000, {})).resolves.toMatchObject({
      kind: 'failed',
      message: expect.stringMatching(/ENOENT/),
    });
  });
});

describe('printArgs', () => {
  it('asks for JSON with agy’s own time limit', () => {
    expect(printArgs('/usage', 7)).toEqual(['--print', '/usage', '--output-format', 'json', '--print-timeout', '7s']);
  });
});
