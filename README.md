# openchamber-extension-antigravity

An OpenChamber extension for Google Antigravity: it adds the Antigravity provider to OpenCode through
[`@josegalre/opencode-plugin-antigravity-acp`](https://www.npmjs.com/package/@josegalre/opencode-plugin-antigravity-acp),
and shows how much of your Gemini quota is left on OpenChamber's Usage page.

> This is an independent community project. It is not affiliated with, endorsed by or sponsored by Google.
> Antigravity and Gemini are trademarks of Google LLC.

## Install

1. Install the Antigravity CLI (`agy`) and sign in with it once in a terminal.
2. Get the ZIP, `openchamber-extension-antigravity-<version>.zip`, from a release on GitHub, or build it with
   `pnpm run zip`. It needs OpenChamber 2.7.0 or later. The same files are on npm as
   `@josegalre/openchamber-extension-antigravity`; OpenChamber installs that copy as a folder.
3. In OpenChamber, **Settings → Extensions**, install the ZIP, its release URL or the folder. Allow its local service and **Add a plugin to
   OpenCode**.

OpenChamber then lists the plugin in the OpenCode config it manages, and the `antigravity/…` Gemini models show in the
model picker. For an OpenCode that OpenChamber did not start, use OpenChamber's **Add to global config**, or install
the plugin from npm.

If `@josegalre/opencode-plugin-antigravity-acp` is already in your `opencode.json`, OpenCode keeps that one and reports
the extension's copy as a duplicate plugin id: remove one of the two. The extension's copy runs `agy` from OpenCode's
`PATH` with no plugin options; to set `command`, `args` or `autoCompact`, use the npm package with options instead.

## The Usage card

**Settings → Usage** shows an **Antigravity** card with the Gemini models' **5h** and **weekly** windows: how much of
each is used, and when it resets. Tick **Show in Work Status** and it joins the header's rate limits, Work Status, the
phone and the desktop tray.

The extension's service reads the quota by running `agy --print /usage --output-format json`, the same `/usage` you
can type in `agy`. A reading, or a failed read, is reused for a minute. The service looks for `agy` on the `PATH` OpenChamber runs with,
then in `~/.local/bin`.

## What it reads and sends

- **Only `agy`.** The service never reads `agy`'s or Antigravity's credential files, never calls a Google endpoint and
  never changes where `agy` connects. `/usage` spends no tokens and starts no conversation.
- **No accidental prompts.** `agy` sends a slash command it does not know to the model as a prompt. So the service runs
  `/usage` only on an `agy` whose `/help` lists it, and stops asking an `agy` that answered either command as a model
  turn.
- **The plugin as published.** The ZIP carries the npm package's `dist/index.js` byte for byte. What the plugin does,
  and its own boundaries, are in [its README](https://github.com/JoseGalRe/opencode-plugin-antigravity-acp).

## Development

See [AGENTS.md](AGENTS.md). `pnpm ready` checks, builds, zips and tests.

## License

[MIT](LICENSE), like the plugin it carries.
