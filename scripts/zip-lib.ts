import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { zipSync } from 'fflate';

import type { BuiltZip, BundledPluginManifest, PublishedPlugin, ZipSize } from './zip-lib.types.ts';
import type { Zippable } from 'fflate';

/**
 * The limits OpenChamber 2.7 enforces when it installs a ZIP (`server/lib/guests/install.js` and `extract-zip.js`).
 */
export const ZIP_LIMITS: ZipSize = {
  files: 500,
  compressedBytes: 20 * 1024 * 1024,
  uncompressedBytes: 40 * 1024 * 1024,
};

/**
 * Files at the package root that ship next to `dist/`.
 */
const ROOT_FILES = ['package.json', 'README.md', 'LICENSE'];

/**
 * Every entry carries this date, so the same build gives the same bytes.
 */
const ENTRY_DATE = new Date('2026-01-01T00:00:00Z');

/**
 * The files that go into the ZIP: the root files and everything in `dist/` but older ZIPs.
 *
 * @param root The package root.
 *
 * @returns Package-relative paths, `/`-separated and sorted.
 */
export async function packageFiles(root: string): Promise<string[]> {
  const entries = await readdir(join(root, 'dist'), { withFileTypes: true, recursive: true });

  const dist = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .filter((file) => !file.endsWith('.zip'));

  return [...ROOT_FILES, ...dist].toSorted();
}

/**
 * Says which install limits an archive goes over.
 *
 * @param size The archive's size.
 *
 * @returns One sentence per limit it goes over; empty when it installs.
 */
export function limitViolations(size: ZipSize): string[] {
  const violations: string[] = [];

  if (size.files > ZIP_LIMITS.files) {
    violations.push(`${size.files} files, the limit is ${ZIP_LIMITS.files}.`);
  }

  if (size.compressedBytes > ZIP_LIMITS.compressedBytes) {
    violations.push(`${size.compressedBytes} bytes compressed, the limit is ${ZIP_LIMITS.compressedBytes}.`);
  }

  if (size.uncompressedBytes > ZIP_LIMITS.uncompressedBytes) {
    violations.push(`${size.uncompressedBytes} bytes uncompressed, the limit is ${ZIP_LIMITS.uncompressedBytes}.`);
  }

  return violations;
}

/**
 * Zips files with `package.json` at the archive root. fflate's sync writer stores sizes in the local headers and never
 * uses data descriptors, which OpenChamber's extractor refuses.
 *
 * @param root The package root.
 * @param files Package-relative paths, as `packageFiles` lists them.
 *
 * @returns The archive and its size.
 */
export async function buildZip(root: string, files: readonly string[]): Promise<BuiltZip> {
  const entries: Zippable = {};

  let uncompressedBytes = 0;

  for (const file of files) {
    const data = new Uint8Array(await readFile(join(root, file)));

    uncompressedBytes += data.byteLength;
    entries[file] = [data, { mtime: ENTRY_DATE }];
  }

  const bytes = zipSync(entries, { level: 9 });

  return { bytes, size: { files: files.length, compressedBytes: bytes.byteLength, uncompressedBytes } };
}

/**
 * Reads the name and version of a package.json.
 *
 * @param json The package.json's text.
 *
 * @returns The name and version, or `null` when either is missing or not a string.
 */
export function readPackage(json: string): PublishedPlugin | null {
  const manifest: unknown = JSON.parse(json);

  if (manifest === null || typeof manifest !== 'object' || !('name' in manifest) || !('version' in manifest)) {
    return null;
  }

  const { name, version } = manifest;

  return typeof name === 'string' && typeof version === 'string' ? { name, version } : null;
}

/**
 * The Bundled plugin's package.json for the published plugin.
 *
 * @param published The published package's name and version.
 *
 * @returns The manifest.
 */
export function bundledPluginManifest(published: PublishedPlugin): BundledPluginManifest {
  return {
    name: published.name,
    version: published.version,
    license: 'MIT',
    type: 'module',
    exports: {
      '.': './index.js',
      './server': './index.js',
    },
  };
}
