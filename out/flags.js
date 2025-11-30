import { spawnSync } from 'child_process';
const mem = new Map();
export function detectSupportedFlags(exe) {
    const hit = mem.get(exe);
    if (hit)
        return hit;
    const r = spawnSync(exe, ['-?'], { encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    const single = new Set();
    const multi = new Set();
    const rx = /^[ \t]*[\/-](XD|[A-Za-z]|[\^\\;\(]).*/gm; // 'XD' antes de letras simples
    let m;
    while ((m = rx.exec(out))) {
        const tok = m[1];
        if (tok.length === 1)
            single.add(tok);
        else
            multi.add(tok);
    }
    const sup = { single, multi, rawHelp: out };
    mem.set(exe, sup);
    return sup;
}
// Preset “safe”: funciona na maioria dos pawncc antigos/novos
export function computeMinimalArgs(s) {
    const A = [];
    if (s.single.has('d'))
        A.push('-d1');
    if (s.single.has('O'))
        A.push('-O1');
    if (s.single.has('('))
        A.push('-(+');
    if (s.single.has(';'))
        A.push('-;+');
    if (s.single.has('w'))
        A.push('-w239');
    // sem -i/-o aqui; a gente injeta no compiler.ts
    return A;
}
//# sourceMappingURL=flags.js.map