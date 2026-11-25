import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { parseManifestJson } from '@openchamber/sdk/schemas';
import { unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vite-plus/test';

import { assetName } from './release-lib.ts';
import { ZIP_LIMITS, limitViolations, readPackage } from './zip-lib.ts';

import type { PublishedPlugin } from './zip-lib.types.ts';

const LOCAL_FILE = 0x04034b50;
const CENTRAL_DIRECTORY = 0x02014b50;

const { name, version }: PublishedPlugin = readPackage(readFileSync('package.json', 'utf8')) ?? { name: '', version: '' };
const zipPath = join('dist', assetName(name, version));
const pluginRoot = dirname(dirname(createRequire(import.meta.url).resolve('@josegalre/opencode-plugin-antigravity-acp')));

let zip = new Uint8Array();
let files: Record<string, Uint8Array> = {};

beforeAll(() => {
  if (existsSync(zipPath)) {
    zip = new Uint8Array(readFileSync(zipPath));
    files = unzipSync(zip);
  }
});

/**
 * The flags, method and name of every local file header, walked the way OpenChamber's extractor walks them.
 */
function localEntries(archive: Uint8Array): { name: string; flags: number; method: number }[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const entries: { name: string; flags: number; method: number }[] = [];

  let offset = 0;

  while (view.getUint32(offset, true) === LOCAL_FILE) {
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;

    entries.push({
      name: new TextDecoder().decode(archive.subarray(nameStart, nameStart + nameLength)),
      flags: view.getUint16(offset + 6, true),
      method: view.getUint16(offset + 8, true),
    });
    offset = nameStart + nameLength + extraLength + compressedSize;
  }

  expect(view.getUint32(offset, true)).toBe(CENTRAL_DIRECTORY);

  return entries;
}

function text(file: string): string {
  expect(Object.keys(files)).toContain(file);

  return new TextDecoder().decode(files[file]);
}

describe.skipIf(!existsSync(zipPath))('the extension ZIP', () => {
  it('stays within OpenChamber’s install limits', () => {
    const uncompressedBytes = Object.values(files).reduce((sum, data) => sum + data.byteLength, 0);

    expect(limitViolations({ files: Object.keys(files).length, compressedBytes: zip.byteLength, uncompressedBytes })).toEqual(
      [],
    );
    expect(zip.byteLength).toBeLessThanOrEqual(ZIP_LIMITS.compressedBytes);
  });

  it('uses only entries OpenChamber’s extractor accepts', () => {
    for (const entry of localEntries(zip)) {
      expect({ name: entry.name, encrypted: entry.flags & 0x0001, descriptor: entry.flags & 0x0008 }).toEqual({
        name: entry.name,
        encrypted: 0,
        descriptor: 0,
      });
      expect([0, 8]).toContain(entry.method);
      expect(entry.name).not.toMatch(/^\/|^\.\/|\\|(^|\/)\.\.(\/|$)/);
    }
  });

  it('has the manifest, README and LICENSE at the root, and no sources', () => {
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['package.json', 'README.md', 'LICENSE']));
    expect(Object.keys(files).filter((file) => /\.ts$|^src\/|node_modules|\.zip$/.test(file))).toEqual([]);
  });

  it('carries a manifest the SDK parses, with its icon, service and plugin', () => {
    const parsed = parseManifestJson(text('package.json'));

    if (!parsed.ok) {
      throw new Error(parsed.message);
    }

    const { panel, service, quota, opencodePlugin } = parsed.manifest.contributes;

    expect(parsed.version).toBe(version);
    expect(`ext-${panel.id}`.length).toBeLessThanOrEqual(28);
    expect(text(panel.icon)).toContain('<svg');
    expect(service).toMatchObject({ entry: 'dist/service/index.js', provides: ['quota'] });
    expect(text('dist/service/index.js')).toContain('createServer');
    expect(quota?.providers).toEqual([]);
    expect(opencodePlugin).toBe('dist/plugin');
  });

  it('carries the published plugin byte for byte, with a manifest OpenCode resolves', () => {
    const published = readPackage(readFileSync(join(pluginRoot, 'package.json'), 'utf8'));

    expect(Buffer.from(files['dist/plugin/index.js'] ?? []).equals(readFileSync(join(pluginRoot, 'dist', 'index.js')))).toBe(
      true,
    );
    expect(JSON.parse(text('dist/plugin/package.json'))).toMatchObject({
      name: published?.name,
      version: published?.version,
      type: 'module',
      exports: { '.': './index.js', './server': './index.js' },
    });
    expect(text('dist/plugin/LICENSE')).toMatch(/MIT License/);
  });

  it('carries a service and a plugin that import only Node’s own modules', () => {
    for (const file of ['dist/service/index.js', 'dist/plugin/index.js']) {
      const specifiers = [...text(file).matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)].map(
        (match) => match[1] ?? match[2] ?? '',
      );

      expect({ file, imports: specifiers.filter((specifier) => !specifier.startsWith('node:')) }).toEqual({
        file,
        imports: [],
      });
    }
  });
});
