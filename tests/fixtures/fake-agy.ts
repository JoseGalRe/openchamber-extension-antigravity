import { appendFileSync } from 'node:fs';

const USAGE = {
  description: 'Within each group, models share a weekly limit and a 5-hour limit.',
  groups: [
    {
      name: 'Gemini Models',
      description: 'Models within this group: Gemini 4 Neon, Gemini 3.8 Flash',
      buckets: [
        {
          id: 'gemini-weekly',
          name: 'Weekly Limit Remaining',
          window: 'weekly',
          remaining_fraction: 0.9905038475990295,
          reset_time: '2026-12-02T02:20:23Z',
        },
        {
          id: 'gemini-5h',
          name: 'Five Hour Limit Remaining',
          window: '5h',
          remaining_fraction: 0.9668623805046082,
          reset_time: '2026-11-25T20:26:43Z',
        },
      ],
    },
  ],
};

const COMMANDS = ['credits', 'help', 'usage'];

const mode = process.env['FAKE_AGY'] ?? 'ok';
const args = process.argv.slice(2);
const slash = args[args.indexOf('--print') + 1] ?? '';
const name = slash.slice(1);

if (process.env['FAKE_AGY_LOG']) {
  appendFileSync(process.env['FAKE_AGY_LOG'], `${args.join(' ')}\n`);
}

function print(command?: { name: string; data: unknown }): void {
  process.stdout.write(
    JSON.stringify({
      conversation_id: command ? '' : 'fake-conversation',
      status: 'SUCCESS',
      response: command ? '' : `echo: ${slash}`,
      usage: { total_tokens: command ? 0 : 12 },
      ...(command ? { command } : {}),
    }),
  );
}

if (mode === 'slow') {
  setTimeout(() => print(), 10_000);
} else if (mode === 'error') {
  process.stderr.write('AGY_ERROR: {"short_error":"not signed in","status":"UNAUTHENTICATED"}\n');
  process.exitCode = 1;
} else if (mode === 'turn' || !COMMANDS.includes(name)) {
  print();
} else if (name === 'help') {
  const commands = mode === 'no-usage' ? COMMANDS.filter((command) => command !== 'usage') : COMMANDS;

  print({ name, data: { commands: commands.map((command) => ({ name: command })) } });
} else if (name === 'usage') {
  print({ name, data: USAGE });
} else {
  print({ name, data: { remaining_credits: 0 } });
}
