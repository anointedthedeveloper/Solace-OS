import { ACCENTS, OS_CODENAME, OS_NAME, OS_TAGLINE, OS_VERSION } from '@/app/constants';
import type { AccentId, ThemeMode } from '@/types/settings';

/**
 * The Solace terminal is an explicitly *simulated* command environment. It parses a
 * fixed table of commands; it never executes shell strings, JavaScript, or server code.
 */
export interface TermApp {
  id: string;
  name: string;
  description: string;
}

export interface TermContext {
  apps: TermApp[];
  theme: ThemeMode;
  accent: AccentId;
  displayName: string;
  now: () => Date;
  startedAt: number;
  openApp: (appId: string) => boolean;
  openWindows: () => Array<{ id: string; title: string; appId: string; minimized: boolean }>;
  setTheme: (t: ThemeMode) => void;
  setAccent: (a: AccentId) => void;
  storageEstimate: () => Promise<{ usage?: number; quota?: number } | null>;
}

export interface CommandResult {
  lines: string[];
  clear?: boolean;
  error?: boolean;
}

interface Command {
  name: string;
  usage: string;
  summary: string;
  run: (args: string[], ctx: TermContext) => CommandResult | Promise<CommandResult>;
}

const ok = (...lines: string[]): CommandResult => ({ lines });
const fail = (...lines: string[]): CommandResult => ({ lines, error: true });

function findApp(ctx: TermContext, q: string): TermApp | undefined {
  const s = q.toLowerCase();
  return ctx.apps.find((a) => a.id === s || a.name.toLowerCase() === s) ?? ctx.apps.find((a) => a.name.toLowerCase().startsWith(s) || a.id.startsWith(s));
}

const fmtMB = (n?: number) => (n === undefined ? 'unknown' : `${(n / 1048576).toFixed(1)} MB`);

export const COMMANDS: Command[] = [
  { name: 'help', usage: 'help [command]', summary: 'List commands, or describe one', run: (args) => {
      if (args[0]) {
        const c = COMMANDS.find((x) => x.name === args[0]);
        return c ? ok(`${c.usage}`, `  ${c.summary}`) : fail(`help: no such command: ${args[0]}`);
      }
      const w = Math.max(...COMMANDS.map((c) => c.usage.length));
      return ok('Solace Terminal — a simulated command environment. Available commands:', '', ...COMMANDS.map((c) => `  ${c.usage.padEnd(w + 2)}${c.summary}`), '', 'Tip: press Tab to complete, ↑/↓ for history.');
    } },
  { name: 'clear', usage: 'clear', summary: 'Clear the screen', run: () => ({ lines: [], clear: true }) },
  { name: 'date', usage: 'date', summary: 'Show the current date', run: (_a, ctx) => ok(ctx.now().toLocaleDateString(undefined, { dateStyle: 'full' })) },
  { name: 'time', usage: 'time', summary: 'Show the current time', run: (_a, ctx) => ok(ctx.now().toLocaleTimeString(undefined, { timeStyle: 'medium' })) },
  { name: 'about', usage: 'about', summary: 'About Solace OS', run: () => ok(`${OS_NAME} ${OS_VERSION} "${OS_CODENAME}"`, OS_TAGLINE, '', 'A browser-based desktop environment. Everything here runs in your', 'browser; this terminal only understands Solace\'s own commands.') },
  { name: 'version', usage: 'version', summary: 'Show the Solace OS version', run: () => ok(`${OS_NAME} ${OS_VERSION} (${OS_CODENAME})`) },
  { name: 'apps', usage: 'apps', summary: 'List installed applications', run: (_a, ctx) => {
      const w = Math.max(...ctx.apps.map((a) => a.id.length));
      return ok(...ctx.apps.map((a) => `  ${a.id.padEnd(w + 2)}${a.name} — ${a.description}`));
    } },
  { name: 'open', usage: 'open <app>', summary: 'Open an application', run: (args, ctx) => {
      if (!args.length) return fail('usage: open <app>   (see `apps` for a list)');
      const app = findApp(ctx, args.join(' '));
      if (!app) return fail(`open: unknown application: ${args.join(' ')}`);
      return ctx.openApp(app.id) ? ok(`Opening ${app.name}…`) : fail(`open: could not open ${app.name}`);
    } },
  { name: 'windows', usage: 'windows', summary: 'List open windows', run: (_a, ctx) => {
      const w = ctx.openWindows();
      return w.length ? ok(...w.map((x) => `  ${x.id.slice(-6)}  ${x.title}${x.minimized ? ' (minimized)' : ''}`)) : ok('No windows are open.');
    } },
  { name: 'theme', usage: 'theme [dark|light|system|toggle]', summary: 'Show or change the colour theme', run: (args, ctx) => {
      const a = args[0]?.toLowerCase();
      if (!a) return ok(`Current theme: ${ctx.theme}`);
      if (a === 'toggle') {
        const next: ThemeMode = ctx.theme === 'dark' ? 'light' : 'dark';
        ctx.setTheme(next);
        return ok(`Theme set to ${next}.`);
      }
      if (a === 'dark' || a === 'light' || a === 'system') {
        ctx.setTheme(a);
        return ok(`Theme set to ${a}.`);
      }
      return fail(`theme: unknown option "${args[0]}". Use dark, light, system or toggle.`);
    } },
  { name: 'accent', usage: 'accent [name]', summary: 'Show or change the accent colour', run: (args, ctx) => {
      const names = Object.keys(ACCENTS) as AccentId[];
      const a = args[0]?.toLowerCase();
      if (!a) return ok(`Current accent: ${ctx.accent}`, `Available: ${names.join(', ')}`);
      if ((names as string[]).includes(a)) {
        ctx.setAccent(a as AccentId);
        return ok(`Accent set to ${a}.`);
      }
      return fail(`accent: unknown colour "${args[0]}". Available: ${names.join(', ')}`);
    } },
  { name: 'whoami', usage: 'whoami', summary: 'Show your display name', run: (_a, ctx) => ok(ctx.displayName || '(no display name set — change it in Settings)') },
  { name: 'echo', usage: 'echo <text>', summary: 'Print text', run: (args) => ok(args.join(' ')) },
  { name: 'uptime', usage: 'uptime', summary: 'Time since this session started', run: (_a, ctx) => {
      const s = Math.floor((ctx.now().getTime() - ctx.startedAt) / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      return ok(`Session up ${h ? `${h}h ` : ''}${m}m ${s % 60}s`);
    } },
  { name: 'storage', usage: 'storage', summary: "Show this browser's storage usage for Solace", run: async (_a, ctx) => {
      const e = await ctx.storageEstimate();
      return e ? ok(`Used:  ${fmtMB(e.usage)}`, `Quota: ${fmtMB(e.quota)}`, '(Browser-reported estimate for this site.)') : fail('storage: this browser does not report storage usage.');
    } },
];

export function tokenize(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

export async function runCommand(line: string, ctx: TermContext): Promise<CommandResult> {
  const [name, ...args] = tokenize(line.trim());
  if (!name) return { lines: [] };
  const cmd = COMMANDS.find((c) => c.name === name.toLowerCase());
  if (!cmd) return fail(`${name}: command not found. This is a simulated Solace shell — type \`help\` for the commands it supports.`);
  try {
    return await cmd.run(args, ctx);
  } catch {
    return fail(`${cmd.name}: something went wrong.`);
  }
}

/** Tab completion for the command name or the first argument of `open`. */
export function complete(line: string, ctx: TermContext): string | null {
  const parts = line.split(/\s+/);
  if (parts.length === 1) {
    const hits = COMMANDS.filter((c) => c.name.startsWith(parts[0].toLowerCase()));
    return hits.length === 1 ? hits[0].name + ' ' : hits.length > 1 ? hits[0].name.slice(0, 0) + commonPrefix(hits.map((h) => h.name)) : null;
  }
  if (parts[0] === 'open' && parts.length === 2) {
    const hits = ctx.apps.filter((a) => a.id.startsWith(parts[1].toLowerCase()));
    return hits.length === 1 ? `open ${hits[0].id}` : null;
  }
  return null;
}

function commonPrefix(words: string[]): string {
  let p = words[0];
  for (const w of words) while (!w.startsWith(p)) p = p.slice(0, -1);
  return p;
}
