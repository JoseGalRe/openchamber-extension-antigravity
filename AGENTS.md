# openchamber-extension-antigravity

An OpenChamber extension for Google Antigravity. It carries the published OpenCode plugin
`@josegalre/opencode-plugin-antigravity-acp` into the OpenCode that OpenChamber starts, and shows the Gemini quota on
OpenChamber's Usage page from a local service that runs the official `agy` CLI. It ships as a ZIP installed from
Settings → Extensions, and has no frame: no panel page, rail icon or status section.

The plugin lives in `../opencode-plugin-antigravity-acp`. Its boundaries, toolchain and code format apply here too;
this file repeats what this repository needs and adds what is its own.

## Boundaries that do not move

- **`agy` is the only source** (decided 2026-11-25). The service learns about Antigravity only by running one of
  `agy`'s own slash commands in print mode (`agy --print /usage --output-format json`), as the user would in a terminal.
  Never read `agy`'s or Antigravity's credentials, never call a Google endpoint, never pass a flag that changes where
  `agy` connects. OpenChamber's built-in Antigravity usage provider reads the credentials from disk and calls Google's
  quota endpoint with them; that is exactly what this extension does not do.
- **`/usage` only after `/help`** (decided 2026-11-25). `agy` 1.5.17 sends a slash command it does not know to the
  model as a prompt, which starts a conversation and spends quota. So the service runs `/help` once per `agy` build
  (path, size, modification time) and runs `/usage` only when `agy` answered `/help` as the `help` command and its list
  names `usage`. A build that answered either command as a model turn (no `command`, or another `command.name`), or
  whose `/help` timed out or failed (a real `/help` answers at once, offline), is never asked again while the service
  runs. Never run `agy --print` with anything but a slash command its `/help` lists, tests and manual checks included.
- **The plugin as published** (decided 2026-11-25). The ZIP carries the npm package's `dist/index.js` byte for byte,
  with its LICENSE, in `dist/plugin/`: no patching, no wrapper. OpenChamber lists that folder in the OpenCode config it
  manages (`contributes.opencodePlugin`) without options, so the plugin runs with its defaults (`agy` on OpenCode's
  `PATH`, no extra flags). A wrapper that passes saved options was rejected: our code between OpenCode and the
  published plugin, for options the defaults cover.
- **The Gemini group only.** The plugin offers Gemini models only, so the Usage card shows the Gemini group's `5h` and
  `weekly` windows (the group whose bucket ids start with `gemini-`) and nothing else.

## Layout

`src/` has one folder per domain (`agy`, `openchamber`) and, inside it, one folder per module that holds the module,
its `*.types.ts` and its `*.test.ts`. Nothing but `src/index.ts` sits directly in `src/` or in a domain folder.

- `src/index.ts`: the service, the build entry. It reads `OPENCHAMBER_SERVICE_PORT` and `OPENCHAMBER_SERVICE_TOKEN`
  and listens on loopback.
- `src/agy/cli/`: finds `agy` (the `PATH` OpenChamber hands the service, then `~/.local/bin`, where `agy` installs
  itself) and runs one slash command in print mode, killed at its time limit.
- `src/agy/usage/`: the usage read: the `/help` probe, the JSON schemas (`zod/mini`), the shared read in flight and the
  last reading, kept for a minute whether it succeeded or not.
- `src/openchamber/usage-card/`: the reading as OpenChamber's usage card (`QuotaProviderUsageData`).
- `src/openchamber/service/`: the HTTP server on OpenChamber's service contract: the bearer token, `GET /health` and
  `POST /quota`.
- `tests/fixtures/fake-agy.ts`: a stand-in for `agy` 1.5.17's print mode, run through a `#!/bin/sh` `agy` the tests
  write in a temporary folder. `FAKE_AGY` picks how it behaves (`ok`, `no-usage`, `turn`, `slow`, `error`);
  `FAKE_AGY_LOG` records its arguments. Tests never run the real `agy`.
- `scripts/zip.ts`: copies the plugin into `dist/plugin/` and the icon, then writes the ZIP; `zip-lib.ts` holds its
  pure parts and OpenChamber's install limits. `scripts/zip.test.ts` opens the ZIP `pnpm run zip` wrote and checks it as
  OpenChamber's installer does; it is skipped without one.
- `assets/icon.svg`: the extension's icon, which OpenChamber draws on the Usage card: Antigravity's mark, the same
  path OpenChamber's own icon sprite uses for Antigravity (`app-antigravity`).

## Toolchain

Vite+ (`vp`) owns formatting, linting, the type check, tests and hooks, configured in `vite.config.ts` as in the plugin.

- Node `>=26.13.1` and pnpm `>=12.16.1` for development (`engines`). The service itself is built for Node 22
  (`target: 'node22'`): OpenChamber runs it with its own runtime, Node under Electron or Bun on the web.
- `pnpm build`: `vp pack` bundles `src/index.ts` and every dependency (`@openchamber/sdk`, `zod`) into one minified ESM
  file, `dist/service/index.js`, which imports only Node built-ins. Its banner carries the licenses of what it bundles
  (`BUNDLED_LICENSES`).
- `pnpm run zip`: the build, then `scripts/zip.ts`: `dist/openchamber-extension-antigravity-<version>.zip`.
- `pnpm ready`: `vp check`, the ZIP, then `vp test`.
- Scripts: `build`, `zip`, `test`, `lint:check` / `lint:fix`, `format:check` / `format:fix`, `cspell:check`, `ready`,
  `release`. Name new ones `<tool>:<action>`.
- `pnpm-workspace.yaml` exempts the plugin and `@openchamber/sdk` from the one-day release age: both are released
  together with this extension.
- A new plugin version: bump the `@josegalre/opencode-plugin-antigravity-acp` pin, `pnpm install`, `pnpm ready`, and
  release the extension.
- To try the built service against the real `agy`, start `dist/service/index.js` with `OPENCHAMBER_SERVICE_PORT` and
  `OPENCHAMBER_SERVICE_TOKEN` under `env -i PATH=/usr/bin:/bin HOME=$HOME` (OpenChamber hands a service only PATH, HOME,
  temp and locale), `POST /quota` a `usage.read` with that bearer, and stop it by its PID.
- CI runs per tag, never per commit, as in the plugin: pushes to `main` run nothing. `.github/workflows/ci.yml` runs
  `pnpm ready` for a `v*` tag on the Gitea mirror (self-hosted runner labelled `linux`), and for pull requests and
  manual runs on both; on GitHub a tag runs `publish.yml`, which runs the same gate first. Gitea reads
  `.github/workflows` because the repository has no `.gitea/workflows`. Do not add one. `publish.yml` runs its jobs on
  GitHub only.

## Releases

1. Bump `version` in `package.json` and write its `## <version>` section in `CHANGELOG.md` (`### Minor Changes` or
   `### Patch Changes`, one bullet per change, written for the user). Commit.
2. Run `GITEA_TOKEN=… pnpm release` (`scripts/release.ts`). It refuses uncommitted tracked changes, a missing
   CHANGELOG section, or a tag `v<version>` that points elsewhere. It pushes the branch and the tag (created on HEAD
   when missing), builds the ZIP again (`pnpm run zip`), and creates or updates the release on Gitea
   (`http://127.0.0.1:7531`; `GITEA_URL` overrides) with that section as its notes and the ZIP attached.
   `pnpm release --dry-run` only checks and prints.
3. Push `main` and the tag to GitHub: `git push github main v<version>`. `.github/workflows/publish.yml` checks that
   the tag is package.json's version, runs `pnpm ready`, and runs `npm publish` with npm trusted publishing (OIDC,
   `id-token: write`, provenance), skipping a version npm already has. A second job, the only one with
   `contents: write`, creates or updates the GitHub release with the same notes (`scripts/release-notes.ts`) and the
   ZIP of that build. Actions are pinned to commit SHAs with the version in a comment; update both together.

**npm.** The package is `@josegalre/openchamber-extension-antigravity`: `dist/service/`, `dist/plugin/`,
`dist/icon.svg`, the README, the LICENSE and package.json with the manifest, the same files as the ZIP. OpenChamber
installs from a folder, a ZIP or Git, not from npm, so an npm copy installs as a folder. The first version is published
by hand; then the package's trusted publisher on npmjs.com names this repository and `publish.yml` and allows
`npm publish`. `repository.url` must stay the GitHub repository: npm checks it against the provenance. The ZIP leaves
the npm scope out of its name (`assetName`).

## Code format

The plugin's AGENTS.md (_Code format_) is the reference; in short:

- Every type lives in the module's `*.types.ts`, private ones too, with a JSDoc block on the type and on every
  property. A function-typed property documents its parameters, result and an `@example`.
- Value imports first, then `import type` (local before external); relative imports carry their `.ts` extension.
- Functions and closures only, no classes; a callback passed to a function is a named function declared before the
  call. `isolatedDeclarations` is on: every export carries an explicit type.
- Comments on declarations are `/** */` blocks on their own lines; an exported function's JSDoc has `@param` and
  `@returns`. `//` only inside a function body, for what the code cannot say. No file-header comments.
- Blank lines between blocks as the plugin's _Blank lines_ says.

## OpenChamber facts (2.7, SDK 2.7.3)

- The usage provider is `ext-<panel.id>` (`ext-antigravity`, at most 28 characters); `usage.read` has 20 seconds.
  `quota.providers: []` because no credential comes from OpenCode.
- A panel with no `entry` is valid when the service provides a role (`provides: ["quota"]`): no rail icon.
- `contributes.opencodePlugin` is a folder inside the package. OpenCode finds its entry by `exports` beside `name` and
  loads it with nothing installed. OpenChamber passes the plugin no options. With the npm package also in
  `opencode.json`, OpenCode keeps the first plugin of the id and reports the other as a duplicate.
- The service inherits only PATH, HOME, temp and locale from the host, and stops after 10 minutes without calls.
- A failed card (`ok: false`) keeps OpenChamber's last sample; `configured: false` shows the card as not configured.

## Verified facts about `agy` (1.5.17, 2026-11-25)

- `agy --print /<command> --output-format json` answers `{ conversation_id: "", status: "SUCCESS", usage, command:
  { name, data } }` for a slash command, with zero tokens, in about three seconds. Without `command`, it ran a model
  turn.
- `/usage`'s `data.groups[]` has `name`, `description` and `buckets[]` of `{ id, name, description?, window: "5h" |
  "weekly", remaining_fraction, reset_time }`; the Gemini group's bucket ids start with `gemini-`, the Claude and GPT
  group's with `3p-`. A window not used yet resets at `1970-01-01T00:00:00Z`.
- `/help` lists `commands[]` with `name`; `/credits` answers `{ remaining_credits, upgrade_uri }`; `/model` the default
  model.
- A failure prints `AGY_ERROR: {"short_error": …, "status": …}` on stderr.
- Run with only `PATH=/usr/bin:/bin` and `HOME`, `agy` from `~/.local/bin` still answers `/usage`: it needs no other
  variable from the session.
