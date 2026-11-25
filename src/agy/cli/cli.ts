import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { delimiter, join } from 'node:path';

import type { AgyBinary, AgyRun } from './cli.types.ts';

/**
 * Output past this many characters is dropped: a slash command's JSON is a few kilobytes.
 */
const OUTPUT_MAX = 1024 * 1024;

async function isExecutableFile(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);

    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Finds the `agy` the PATH leads to, or else the one in `~/.local/bin`, where `agy` installs itself.
 *
 * @param env The environment whose `PATH` and `HOME` are searched.
 *
 * @returns The executable, or `null` when there is none.
 */
export async function findAgy(env: NodeJS.ProcessEnv): Promise<AgyBinary | null> {
  const directories = (env['PATH'] ?? '').split(delimiter).filter((directory) => directory.length > 0);

  if (env['HOME']) {
    directories.push(join(env['HOME'], '.local', 'bin'));
  }

  for (const directory of directories) {
    const path = join(directory, process.platform === 'win32' ? 'agy.exe' : 'agy');

    if (await isExecutableFile(path)) {
      const { size, mtimeMs } = await stat(path);

      return { path, identity: `${path}:${size}:${mtimeMs}` };
    }
  }

  return null;
}

/**
 * The arguments that run one slash command in print mode, answered as JSON.
 *
 * @param slash The slash command, such as `/usage`.
 * @param timeoutSeconds `agy`'s own time limit for the run.
 *
 * @returns The arguments after the executable.
 */
export function printArgs(slash: string, timeoutSeconds: number): string[] {
  return ['--print', slash, '--output-format', 'json', '--print-timeout', `${timeoutSeconds}s`];
}

/**
 * Runs `agy --print <slash>` and collects its output. Past `timeoutMs` the process is killed; `agy`'s own
 * `--print-timeout` is a second earlier.
 *
 * @param binary The executable to run.
 * @param slash The slash command, such as `/usage`.
 * @param timeoutMs The time limit of the run, in milliseconds.
 * @param env The process's whole environment.
 *
 * @returns How the run ended. It never rejects.
 */
export function runAgy(binary: AgyBinary, slash: string, timeoutMs: number, env: NodeJS.ProcessEnv): Promise<AgyRun> {
  const { promise, resolve } = Promise.withResolvers<AgyRun>();
  const args = printArgs(slash, Math.max(1, Math.floor(timeoutMs / 1000) - 1));

  let stdout = '';
  let stderr = '';
  let settled = false;

  function settle(run: AgyRun): void {
    if (!settled) {
      settled = true;
      clearTimeout(timer);
      resolve(run);
    }
  }

  function onStdout(text: string): void {
    if (stdout.length < OUTPUT_MAX) {
      stdout += text;
    }
  }

  function onStderr(text: string): void {
    if (stderr.length < OUTPUT_MAX) {
      stderr += text;
    }
  }

  const child = spawn(binary.path, args, { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

  const timer = setTimeout(() => {
    child.kill('SIGKILL');
    settle({ kind: 'timeout' });
  }, timeoutMs);

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', onStdout);
  child.stderr.on('data', onStderr);
  child.once('error', (error) => settle({ kind: 'failed', message: error.message }));
  child.once('close', (code) => settle({ kind: 'exited', code, stdout, stderr }));

  return promise;
}
