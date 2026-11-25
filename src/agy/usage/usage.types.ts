import type { AgyBinary, AgyRun } from '../cli/cli.types.ts';

/**
 * A Quota window as `/usage` reports it.
 */
export type UsageBucket = {
  /**
   * The bucket's id: `gemini-5h`, `gemini-weekly`, `3p-5h`, …
   */
  readonly id: string;
  /**
   * The window's length: `5h` or `weekly`.
   */
  readonly window: string;
  /**
   * The share of the window left, from 0 to 1.
   */
  readonly remaining_fraction: number;
  /**
   * When the window resets, as an ISO 8601 time. A window not used yet resets at `1970-01-01T00:00:00Z`.
   */
  readonly reset_time: string;
};

/**
 * A Model group as `/usage` reports it: models that share their Quota windows.
 */
export type UsageGroup = {
  /**
   * The group's name: `Gemini Models`, `Claude and GPT models`.
   */
  readonly name: string;
  /**
   * The group's Quota windows.
   */
  readonly buckets: readonly UsageBucket[];
};

/**
 * What one usage read found out.
 */
export type UsageReading = UsageReadingOk | UsageReadingFailed;

/**
 * A usage read that got `/usage`'s answer.
 */
export type UsageReadingOk = {
  /**
   * The discriminant.
   */
  readonly ok: true;
  /**
   * Every Model group `/usage` listed.
   */
  readonly groups: readonly UsageGroup[];
};

/**
 * A usage read that got no answer.
 */
export type UsageReadingFailed = {
  /**
   * The discriminant.
   */
  readonly ok: false;
  /**
   * Whether an `agy` was found at all: `false` means it is not installed where the Service looks.
   */
  readonly installed: boolean;
  /**
   * Why there is no answer, written for the user.
   */
  readonly error: string;
};

/**
 * What a usage reader needs from the outside.
 */
export type UsageReaderOptions = {
  /**
   * Finds `agy`.
   *
   * @returns The executable, or `null` when it is not installed where the Service looks.
   *
   * @example
   * ```ts
   * const locate = () => findAgy(process.env);
   * ```
   */
  readonly locate: () => Promise<AgyBinary | null>;
  /**
   * Runs one slash command on `agy` in print mode. It must not reject.
   *
   * @param binary The executable `locate` found.
   * @param slash The slash command: `/help` or `/usage`.
   * @param timeoutMs The run's time limit, in milliseconds.
   *
   * @returns How the run ended.
   *
   * @example
   * ```ts
   * const run = (binary, slash, timeoutMs) => runAgy(binary, slash, timeoutMs, process.env);
   * ```
   */
  readonly run: (binary: AgyBinary, slash: string, timeoutMs: number) => Promise<AgyRun>;
  /**
   * The clock, in milliseconds since the epoch. `Date.now` when omitted.
   *
   * @returns The current time.
   */
  readonly now?: () => number;
};

/**
 * Reads the quota. Reads that arrive while one runs share it, and a reading answers later reads for
 * `READING_TTL_MS`.
 *
 * @returns The reading. It never rejects.
 */
export type UsageReader = () => Promise<UsageReading>;

/**
 * What the Probe decided about one `agy` build.
 */
export type Probe = ProbeFit | ProbeUnfit;

/**
 * An `agy` build whose `/help` lists `/usage`.
 */
export type ProbeFit = {
  /**
   * The discriminant.
   */
  readonly fit: true;
};

/**
 * An `agy` build not asked for usage: never again when the Probe keeps it, or until the next read after a failure that
 * says nothing about the build.
 */
export type ProbeUnfit = {
  /**
   * The discriminant.
   */
  readonly fit: false;
  /**
   * Why, written for the user.
   */
  readonly error: string;
};

/**
 * One slash command's result, kept only when `agy` ran it as that command.
 */
export type CommandResult = CommandAnswered | CommandFailed;

/**
 * A slash command `agy` ran as that command.
 */
export type CommandAnswered = {
  /**
   * The discriminant.
   */
  readonly ok: true;
  /**
   * The command's `command.data`, not checked yet.
   */
  readonly data: unknown;
};

/**
 * A slash command that gave no result.
 */
export type CommandFailed = {
  /**
   * The discriminant.
   */
  readonly ok: false;
  /**
   * Why, written for the user.
   */
  readonly error: string;
  /**
   * Whether the failure shows `agy` may have run the command as a model turn, so the build is never asked again.
   */
  readonly unfit: boolean;
};

/**
 * The last reading and when it was taken.
 */
export type CachedReading = {
  /**
   * When the read finished, in milliseconds since the epoch.
   */
  readonly at: number;
  /**
   * What it found out.
   */
  readonly reading: UsageReading;
};
