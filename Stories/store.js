// What the four Stories CLIs (arc.js, hook.js, ideas.js, scenes.js) share, kept once; each keeps only its own commands
// and checks. The dev servers read the repository through it too (../server/repo.js).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STORIES = dirname(fileURLToPath(import.meta.url));   // the folder the CLIs keep
/** A folder's id (a story's, a scene's, an idea's, an arc's section): lower-case words joined by hyphens. */
export const isId = (id) => /^[a-z0-9][a-z0-9-]*$/.test(id || '');

/** A CLI named `name`: `fail(why)` says `<name>: <why>` and exits with 1; `run(commands, usage, subject)` runs argv's
 *  command with the arguments after it, or fails with `usage`; with `subject`, the first argument must be an id first. */
export function cli(name) {
  const fail = (why) => { console.error(`${name}: ${why}`); process.exit(1); };
  const run = (commands, usage, subject) => {
    const [cmd, ...args] = process.argv.slice(2);
    if (subject && !isId(args[0])) fail(subject);
    return Object.hasOwn(commands, cmd) ? commands[cmd](...args) : fail(usage);
  };
  return { fail, run };
}

/** A JSON file (0 is stdin); with `otherwise`, that when it can't be read. */
export const readJSON = (file, otherwise) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { if (otherwise === undefined) throw e; return otherwise; } };
/** JSON as the CLIs keep it: one space of indent and a newline at the end, its folder made if need be. */
export const writeJSON = (file, value) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(value, null, 1) + '\n'); };

/** `key=value` arguments set on `into` in order: each key one of `keys` (else `refuse(key)`), each value a string or
 *  what `as[key]` makes of it (a value may hold `=`). */
export const assign = (into, args, keys, refuse, as = {}) => { for (const kv of args) { const [k, ...v] = kv.split('='), val = v.join('='); if (!keys.includes(k)) refuse(k); into[k] = as[k] ? as[k](val) : val; } return into; };

/** The `key: value` lines between a file's first two `---`, each value as it stands. */
export const front = (text) => { const m = text.match(/^---\n([\s\S]*?)\n---/), out = {}; for (const l of m ? m[1].split('\n') : []) { const k = l.match(/^(\w+):\s*(.*)$/); if (k) out[k[1]] = k[2]; } return out; };
