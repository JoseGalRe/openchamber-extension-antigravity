import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assetName } from './release-lib.ts';
import { buildZip, bundledPluginManifest, limitViolations, packageFiles, readPackage } from './zip-lib.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const PLUGIN_PACKAGE = '@josegalre/opencode-plugin-antigravity-acp';

function fail(message: string): never {
  console.error(`zip: ${message}`);
  process.exit(1);
}

const pluginRoot = dirname(dirname(createRequire(import.meta.url).resolve(PLUGIN_PACKAGE)));

const published =
  readPackage(await readFile(join(pluginRoot, 'package.json'), 'utf8')) ?? fail(`${PLUGIN_PACKAGE} has no name or version.`);

const { name, version } =
  readPackage(await readFile(join(ROOT, 'package.json'), 'utf8')) ?? fail('package.json has no name or version.');

const plugin = join(ROOT, 'dist', 'plugin');

await rm(plugin, { recursive: true, force: true });
await mkdir(plugin, { recursive: true });

await copyFile(join(pluginRoot, 'dist', 'index.js'), join(plugin, 'index.js'));
await copyFile(join(pluginRoot, 'LICENSE'), join(plugin, 'LICENSE'));
await writeFile(join(plugin, 'package.json'), `${JSON.stringify(bundledPluginManifest(published), null, 2)}\n`);
await copyFile(join(ROOT, 'assets', 'icon.svg'), join(ROOT, 'dist', 'icon.svg'));

const { bytes, size } = await buildZip(ROOT, await packageFiles(ROOT));

const violations = limitViolations(size);

if (violations.length > 0) {
  fail(`the ZIP would not install on OpenChamber:\n${violations.join('\n')}`);
}

const output = join(ROOT, 'dist', assetName(name, version));

await writeFile(output, bytes);

console.log(`zip: ${output}, ${size.files} files, ${(size.compressedBytes / 1024).toFixed(1)} KB`);
