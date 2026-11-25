/**
 * An `agy` executable found on disk.
 */
export type AgyBinary = {
  /**
   * The absolute path that is run.
   */
  readonly path: string;
  /**
   * The path, size and modification time together: it changes when the file is replaced, as an `agy` update does.
   */
  readonly identity: string;
};

/**
 * How one print-mode run of `agy` ended.
 */
export type AgyRun = AgyRunExited | AgyRunTimedOut | AgyRunFailed;

/**
 * A run whose process ended on its own.
 */
export type AgyRunExited = {
  /**
   * The discriminant.
   */
  readonly kind: 'exited';
  /**
   * The exit code, or `null` when a signal ended the process.
   */
  readonly code: number | null;
  /**
   * Everything the process wrote on stdout, cut at `OUTPUT_MAX` characters.
   */
  readonly stdout: string;
  /**
   * Everything the process wrote on stderr, cut at `OUTPUT_MAX` characters.
   */
  readonly stderr: string;
};

/**
 * A run killed at its time limit.
 */
export type AgyRunTimedOut = {
  /**
   * The discriminant.
   */
  readonly kind: 'timeout';
};

/**
 * A run whose process could not start, such as an `ENOENT` for a binary removed meanwhile.
 */
export type AgyRunFailed = {
  /**
   * The discriminant.
   */
  readonly kind: 'failed';
  /**
   * Node's error message.
   */
  readonly message: string;
};
