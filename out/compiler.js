import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { spawn } from 'child_process';
import * as path from 'path';
import * as iconv from 'iconv-lite';
import { isPawnFile } from './utils.js';
import { detectPawncc } from './detect.js';
import { detectSupportedFlags, computeMinimalArgs } from './flags.js';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const localize = nls.loadMessageBundle(__filename);
// ── Canal único e reutilizável para "Pawn Build" ───────────────────────────────
let buildChannel;
function getBuildChannel(context) {
    if (!buildChannel) {
        buildChannel = vscode.window.createOutputChannel('Pawn Build');
        context.subscriptions.push(buildChannel);
    }
    return buildChannel;
}
function captureFlagKey(a) {
    // Mapeia uma string de arg para a “chave” da flag (-w239 -> 'w', -XD1024 -> 'XD', -(+ -> '(', -;+ -> ';', -\ -> '\', -^ -> '^')
    if (/^-\(/.test(a))
        return '(';
    if (/^-;/.test(a))
        return ';';
    if (/^-\\/.test(a))
        return '\\';
    if (/^-\^/.test(a))
        return '^';
    if (/^-XD\b/i.test(a))
        return 'XD';
    const m = a.match(/^-(\w)/);
    return m ? m[1] : null;
}
function sanitizeUserArgs(baseArgs, s, channel) {
    let args = baseArgs.map(a => (a.startsWith('/') ? '-' + a.slice(1) : a)); //1) normalizar barras: aceitamos '-' universalmente
    args = args.filter(a => !(a.startsWith('-i') || a.startsWith('-o'))); // 2) remover -i / -o fornecidos pelo usuário (a extensão injeta os corretos)
    // 3) normalizações de -( e -; para forma explícita com '+'
    args = args.map(a => (a === '-(' ? '-(+' : a)).map?.(x => x) ?? args; // TS satisfier
    args = args.map(a => (a === '-;' ? '-;+' : a));
    // 4) filtrar por flags suportadas (single/multi)
    const kept = [];
    for (const a of args) {
        const key = captureFlagKey(a);
        if (!key) {
            kept.push(a);
            continue;
        } // não parece opção (-w etc.), mantém
        const ok = (key.length === 1 ? s.single.has(key) : s.multi.has(key));
        if (ok)
            kept.push(a);
        else
            channel.appendLine(`[PawnPro] Removendo flag não suportada para este pawncc: ${a}`);
    }
    return kept;
}
export function registerCompileCommand(context) {
    // Comando: detectar compilador e salvar o caminho
    context.subscriptions.push(vscode.commands.registerCommand('pawnpro.detectCompiler', async () => {
        try {
            const cfg = vscode.workspace.getConfiguration();
            const exe = detectPawncc(cfg.get('pawnpro.compiler.path') || '', cfg.get('pawnpro.compiler.autoDetect') ?? true);
            await cfg.update('pawnpro.compiler.path', exe, vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage(localize(0, null, exe));
        }
        catch (e) {
            vscode.window.showErrorMessage(localize(1, null, e?.message || String(e)));
        }
    }));
    // Comando: compilar arquivo atual
    const cmd = vscode.commands.registerCommand('pawnpro.compileCurrent', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !isPawnFile(editor.document.fileName)) {
            vscode.window.showWarningMessage(localize(2, null));
            return;
        }
        await editor.document.save();
        const cfg = vscode.workspace.getConfiguration();
        const channel = getBuildChannel(context);
        channel.clear();
        channel.show(true);
        // 0) localizar pawncc
        let exe;
        try {
            exe = detectPawncc(cfg.get('pawnpro.compiler.path') || '', cfg.get('pawnpro.compiler.autoDetect') ?? true);
        }
        catch (e) {
            vscode.window.showErrorMessage(localize(3, null, e?.message || String(e)));
            return;
        }
        const supported = detectSupportedFlags(exe); // 1) detectar flags suportadas do executável
        // 2) obter args do usuário; se vazio → preset mínimo seguro de acordo com suporte
        let rawArgs = (cfg.get('pawnpro.compiler.args') || []).slice();
        if (rawArgs.length === 0) {
            const preset = computeMinimalArgs(supported);
            await cfg.update('pawnpro.compiler.args', preset, vscode.ConfigurationTarget.Workspace);
            rawArgs = preset.slice();
            channel.appendLine(`[PawnPro] Nenhum argumento configurado. Aplicando preset mínimo: ${preset.join(' ')}`);
        }
        let args = sanitizeUserArgs(rawArgs, supported, channel); // 3) sanitizar e filtrar por suporte (-i/-o serão injetados depois)
        // 4) incluir -i para includes de config
        const includePaths = (cfg.get('pawnpro.includePaths') || [])
            .map(p => p.replace('${workspaceFolder}', vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ''))
            .map(p => process.platform === 'win32' ? path.normalize(p) : p);
        includePaths.forEach(p => args.push(`-i${p}`));
        // 5) calcular output (-o) e arquivo fonte
        const file = editor.document.fileName;
        const fileDir = path.dirname(file);
        const out = path.join(fileDir, path.parse(file).name + '.amx');
        args.push(`-o${process.platform === 'win32' ? path.normalize(out) : out}`);
        args.push(file);
        // 6) log
        if (cfg.get('pawnpro.build.showCommand')) {
            const show = (s) => (/\s/.test(s) ? `"${s}"` : s);
            channel.appendLine(`[PawnPro] cwd=${fileDir}`);
            channel.appendLine(`[PawnPro] ${show(exe)} ${args.map(show).join(' ')}`);
        }
        // 7) spawn
        const encoding = cfg.get('pawnpro.output.encoding') || 'windows1252';
        const proc = spawn(exe, args, { cwd: fileDir, shell: false });
        proc.stdout.on('data', (d) => channel.append(iconv.decode(d, encoding)));
        proc.stderr.on('data', (d) => channel.append(iconv.decode(d, encoding)));
        proc.on('error', (err) => vscode.window.showErrorMessage(localize(4, null, err.message)));
        proc.on('close', (code, signal) => {
            if (code === 0) {
                vscode.window.showInformationMessage(localize(5, null));
            }
            else {
                vscode.window.showErrorMessage(localize(6, null, code ?? 'null', signal ?? 'none'));
            }
        });
    });
    context.subscriptions.push(cmd);
}
//# sourceMappingURL=compiler.js.map