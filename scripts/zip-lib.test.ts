import { describe, expect, it } from 'vite-plus/test';

import { ZIP_LIMITS, bundledPluginManifest, limitViolations, readPackage } from './zip-lib.ts';

describe('limitViolations', () => {
  it('is empty for an archive inside every limit, at the limit included', () => {
    expect(limitViolations({ files: 10, compressedBytes: 1000, uncompressedBytes: 2000 })).toEqual([]);
    expect(limitViolations(ZIP_LIMITS)).toEqual([]);
  });

  it('names each limit the archive goes over', () => {
    expect(limitViolations({ ...ZIP_LIMITS, files: ZIP_LIMITS.files + 1 })).toEqual(['501 files, the limit is 500.']);
    expect(
      limitViolations({
        files: ZIP_LIMITS.files + 1,
        compressedBytes: ZIP_LIMITS.compressedBytes + 1,
        uncompressedBytes: ZIP_LIMITS.uncompressedBytes + 1,
      }),
    ).toHaveLength(3);
  });
});

describe('readPackage', () => {
  it('reads the name and version of a package.json', () => {
    expect(readPackage('{"name":"x","version":"1.0.0","private":true}')).toEqual({ name: 'x', version: '1.0.0' });
  });

  it('is null without a name or a version', () => {
    expect(readPackage('{"name":"x"}')).toBeNull();
    expect(readPackage('{"name":"x","version":1}')).toBeNull();
    expect(readPackage('null')).toBeNull();
  });
});

describe('bundledPluginManifest', () => {
  it('names the published package and leads OpenCode to its bundle', () => {
    expect(bundledPluginManifest({ name: '@josegalre/opencode-plugin-antigravity-acp', version: '0.5.0' })).toEqual({
      name: '@josegalre/opencode-plugin-antigravity-acp',
      version: '0.5.0',
      license: 'MIT',
      type: 'module',
      exports: {
        '.': './index.js',
        './server': './index.js',
      },
    });
  });
});
