import { spawnSync } from 'child_process';

export type Supported = { single: Set<string>; multi: Set<string>; rawHelp: string };

const cache = new Map<string, Supported>();

export function detectSupportedFlags(exe: string): Supported {
  const cached = cache.get(exe);
  if (cached) return cached;

  const result = spawnSync(exe, ['-?'], { encoding: 'utf8' });
  const output = (result.stdout || '') + (result.stderr || '');

  const single = new Set<string>();
  const multi = new Set<string>();

  // 'XD' must come before single-char alternatives in the alternation
  const rx = /^[ \t]*[\/-](XD|[A-Za-z]|[\^\\;\(]).*/gm;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(output))) {
    const tok = m[1];
    if (tok.length === 1) single.add(tok); else multi.add(tok);
  }

  const supported: Supported = { single, multi, rawHelp: output };
  cache.set(exe, supported);
  return supported;
}

// Safe preset that works across most pawncc versions old and new.
// -i and -o are injected separately in compiler.ts, never here.
export function computeMinimalArgs(supported: Supported): string[] {
  const args: string[] = [];
  if (supported.single.has('d')) args.push('-d1');
  if (supported.single.has('O')) args.push('-O1');
  if (supported.single.has('(')) args.push('-(+');
  if (supported.single.has(';')) args.push('-;+');
  if (supported.single.has('w')) args.push('-w239');
  return args;
}
