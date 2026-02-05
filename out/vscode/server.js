import * as vscode from 'vscode';
import * as path from 'path';
import { LogTailer, SampRconClient, loadSampConfig, resolveServerConfig } from '../core/server.js';
import { ServerViewProvider } from './serverView.js';
import { getWorkspaceRoot } from './configBridge.js';
const IS_WINDOWS = process.platform === 'win32';
function norm(p) {
    const unq = p.trim().replace(/^["']|["']$/g, '');
    return path.normalize(unq);
}
/* ─── Output channel as OutputSink ──────────────────────────────── */
function createOutputSink(channel) {
    return {
        clear: () => channel.clear(),
        append: (s) => channel.append(s),
        appendLine: (s) => channel.appendLine(s),
        show: (preserveFocus) => channel.show(preserveFocus),
    };
}
/* ─── Server controller ─────────────────────────────────────────── */
class ServerController {
    config;
    term = null;
    state = 'stopped';
    tailer;
    rconCfg = null;
    restarting = false;
    constructor(config, outputChannel) {
        this.config = config;
        this.tailer = new LogTailer(createOutputSink(outputChannel));
    }
    getTailer() { return this.tailer; }
    setState(next) {
        this.state = next;
        const running = !!this.term && next === 'running';
        void vscode.commands.executeCommand('setContext', 'pawnpro.server.running', running);
    }
    async refreshRconFromServerCfg() {
        const cfg = this.config.getAll();
        const ws = getWorkspaceRoot();
        const resolved = resolveServerConfig(cfg.server, ws);
        this.rconCfg = await loadSampConfig(resolved.cwd);
    }
    async sendLine(line) {
        let txt = (line ?? '').trim();
        if (!txt)
            return;
        if (/^\/?rcon\s+/i.test(txt)) {
            txt = txt.replace(/^\/?rcon\s+/i, '');
            txt = txt.replace(/^login\s+\S+\s*/i, '');
            if (!txt) {
                vscode.window.showInformationMessage('PawnPro: envie apenas o comando, ex.: "gmx" ou "say oii".');
                return;
            }
        }
        if (!this.rconCfg)
            await this.refreshRconFromServerCfg();
        const cfg = this.rconCfg;
        const invalidPwd = !cfg.rconPassword || /^(changename)$/i.test(cfg.rconPassword);
        if (!invalidPwd) {
            try {
                const client = new SampRconClient(cfg.host, cfg.port, cfg.rconPassword);
                const out = await client.send(txt, 1500);
                this.tailer.appendLine(`> ${txt}`);
                if (out && out.trim())
                    this.tailer.appendLine(out.trim());
                this.tailer.markVisible();
                return;
            }
            catch (e) {
                vscode.window.showErrorMessage(`PawnPro: falha ao enviar RCON: ${e?.message || e}`);
                return;
            }
        }
        else {
            vscode.window.showWarningMessage('PawnPro: senha RCON vazia ou invalida ("changename"). Comando nao enviado.');
        }
        if (!this.term) {
            vscode.window.showWarningMessage('PawnPro: servidor nao esta em execucao.');
            return;
        }
        this.term.sendText(txt, true);
        this.tailer.markVisible();
    }
    start() {
        if (this.term) {
            if (!this.restarting)
                vscode.window.showInformationMessage('PawnPro: servidor ja esta em execucao.');
            return;
        }
        const cfg = this.config.getAll();
        const ws = getWorkspaceRoot();
        const resolved = resolveServerConfig(cfg.server, ws);
        if (!resolved.exe) {
            vscode.window.showErrorMessage('PawnPro: configure "server.path" em .pawnpro/config.json (executavel do servidor).');
            return;
        }
        if (resolved.clearOnStart)
            this.tailer.clear();
        this.tailer.setFollowMode(resolved.follow);
        this.setState('starting');
        try {
            const t = vscode.window.createTerminal({
                name: 'PawnPro Server',
                cwd: resolved.cwd,
                shellPath: norm(resolved.exe),
                shellArgs: resolved.args,
            });
            this.term = t;
            t.show(false);
            void this.refreshRconFromServerCfg();
            if (!IS_WINDOWS && resolved.logPath)
                this.tailer.start(resolved.logPath, resolved.logEncoding);
            const onClose = vscode.window.onDidCloseTerminal((closed) => {
                if (closed === this.term) {
                    this.tailer.stop();
                    this.term = null;
                    this.setState('stopped');
                    this.tailer.markHidden();
                    onClose.dispose();
                }
            });
            setTimeout(() => {
                if (this.term === t)
                    this.setState('running');
            }, 150);
        }
        catch (e) {
            this.term = null;
            this.setState('stopped');
            vscode.window.showErrorMessage(`PawnPro: falha ao iniciar servidor: ${e?.message || e}`);
        }
        finally {
            this.restarting = false;
        }
    }
    stop() {
        const termRef = this.term;
        if (!termRef) {
            this.setState('stopped');
            this.tailer.stop();
            this.tailer.markHidden();
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            const onClose = vscode.window.onDidCloseTerminal((closed) => {
                if (closed === termRef) {
                    onClose.dispose();
                    if (this.term === termRef || this.term === null) {
                        this.tailer.stop();
                        if (this.term === termRef)
                            this.term = null;
                        this.setState('stopped');
                        this.tailer.markHidden();
                    }
                    resolve();
                }
            });
            try {
                termRef.sendText('exit', true);
            }
            catch { }
            setTimeout(() => { try {
                termRef.dispose();
            }
            catch { } }, 600);
            setTimeout(() => {
                onClose.dispose();
                if (this.term === termRef || this.term === null) {
                    this.tailer.stop();
                    if (this.term === termRef)
                        this.term = null;
                    this.setState('stopped');
                    this.tailer.markHidden();
                }
                resolve();
            }, 3000);
        });
    }
    async restart() {
        this.restarting = true;
        await this.stop();
        this.start();
    }
    revealConsole() {
        if (!this.term) {
            vscode.window.showInformationMessage('PawnPro: servidor nao esta em execucao.');
            return;
        }
        this.term.show(false);
    }
    revealLog() {
        this.tailer.reveal(true);
        this.tailer.markVisible();
    }
}
/* ─── Registration ──────────────────────────────────────────────── */
export function registerServerControls(context, config, state) {
    const outputChannel = vscode.window.createOutputChannel('PawnPro Server');
    context.subscriptions.push(outputChannel);
    const srv = new ServerController(config, outputChannel);
    context.subscriptions.push(vscode.commands.registerCommand('pawnpro.server.start', () => srv.start()), vscode.commands.registerCommand('pawnpro.server.stop', () => { void srv.stop(); }), vscode.commands.registerCommand('pawnpro.server.restart', () => { void srv.restart(); }), vscode.commands.registerCommand('pawnpro.server.show', () => srv.revealConsole()), vscode.commands.registerCommand('pawnpro.server.showLog', () => srv.revealLog()));
    config.onChange((cfg) => {
        srv.getTailer().setFollowMode(cfg.server.output.follow);
    });
    const provider = new ServerViewProvider(state, (text) => { void srv.sendLine(text); });
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('pawnpro.serverView', provider), vscode.window.registerWebviewViewProvider('pawnpro.serverView.explorer', provider));
    void vscode.commands.executeCommand('setContext', 'pawnpro.server.running', false);
}
//# sourceMappingURL=server.js.map