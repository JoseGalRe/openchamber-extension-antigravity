/**
 * The size of a ZIP, as OpenChamber measures it on install.
 */
export type ZipSize = {
  /**
   * How many files it holds.
   */
  readonly files: number;
  /**
   * The archive's size, in bytes.
   */
  readonly compressedBytes: number;
  /**
   * The size of every file once extracted, in bytes.
   */
  readonly uncompressedBytes: number;
};

/**
 * A built ZIP.
 */
export type BuiltZip = {
  /**
   * The archive.
   */
  readonly bytes: Uint8Array;
  /**
   * Its size.
   */
  readonly size: ZipSize;
};

/**
 * The parts of the published plugin's package.json the Bundled plugin's manifest names.
 */
export type PublishedPlugin = {
  /**
   * The package name, `@josegalre/opencode-plugin-antigravity-acp`.
   */
  readonly name: string;
  /**
   * The published version.
   */
  readonly version: string;
};

/**
 * The Bundled plugin's package.json: its `name` and `exports` lead OpenCode to the bundle.
 */
export type BundledPluginManifest = {
  /**
   * The published package's name.
   */
  readonly name: string;
  /**
   * The published package's version.
   */
  readonly version: string;
  /**
   * The published package's license.
   */
  readonly license: 'MIT';
  /**
   * The bundle is an ES module.
   */
  readonly type: 'module';
  /**
   * The bundle, for OpenCode's server plugin entry and the package root alike.
   */
  readonly exports: {
    /**
     * The package root.
     */
    readonly '.': './index.js';
    /**
     * OpenCode's server plugin entry.
     */
    readonly './server': './index.js';
  };
};
