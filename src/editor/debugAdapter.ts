import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import type { PawnProConfigManager } from '../core/config.js';
import { buildCompileArgs, runCompile } from '../core/compiler.js';
import { resolveServerConfig, checkDebugPlugin } from '../core/server.js';
import { resolveLocale } from './locale.js';
import { msg } from './nls.js';

/**
 * Integração do debugger Pawn (tipo `pawn`). A extensão NÃO hospeda o código Rust
 * do debugger — apenas localiza e lança o binário do adaptador DAP (`dap-adapter`),
 * que fala DAP com o editor via stdio. O adaptador, por sua vez, sobe o servidor
 * do jogo como processo FILHO e conversa com o plugin (dentro dele) via IPC local.
 *
 * Por o servidor ser filho do adaptador, encerrar ou REINICIAR a depuração (que
 * mata/relança o adaptador) derruba e recria o servidor automaticamente — sem a
 * extensão precisar rastrear processos. Ver o repositório `pawnpro-debugger`.
 */
export function registerDebugAdapter(
  context: vscode.ExtensionContext,
  config: PawnProConfigManager,
  workspaceRoot: () => string | undefined,
): void {
  const provider = new PawnConfigurationProvider(config, workspaceRoot);
  context.subscriptions.push(
    vscode.debug.registerDebugConfigurationProvider('pawn', provider),
    vscode.debug.registerDebugAdapterDescriptorFactory('pawn', new PawnAdapterFactory(context)),
    // Reiniciar recompila quando o fonte mudou.
    //
    // Quem detecta é o adaptador, no `on_restart`: é o ponto por onde todo
    // restart passa, venha do botão nativo do editor, da tecla ou da paleta —
    // por isso não é preciso comando próprio nem interceptar o do editor.
    // Compilar, porém, é atribuição daqui: o compilador e as flags são
    // configuração do projeto. Ele pede por evento, compilamos e devolvemos o
    // `restart`, que então segue o caminho normal.
    vscode.debug.onDidReceiveDebugSessionCustomEvent(async (e) => {
      if (e.session.type !== 'pawn' || e.event !== 'pawnproRebuild') return;
      const corpo = e.body as { program?: unknown } | undefined;
      const amx = typeof corpo?.program === 'string' ? corpo.program : '';
      if (amx && !(await provider.ensureDebugBuild(amx))) {
        // Compilação falhou: `ensureDebugBuild` já avisou. Não reenviar o
        // restart é o que impede o servidor de subir com o binário velho.
        return;
      }
      await e.session.customRequest('restart');
    }),
  );
}

/** Localiza o binário do adaptador DAP, no mesmo padrão da engine. */
function findAdapterBinary(context: vscode.ExtensionContext): string | null {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const name = `dap-adapter${ext}`;
  const artifact = `pawnpro-dap-adapter-${process.platform}-${process.arch}${ext}`;

  const candidates = [
    path.join(context.extensionPath, 'engines', artifact),
    path.join(context.extensionPath, '..', 'pawnpro-debugger', 'target', 'debug', name),
    path.join(context.extensionPath, '..', 'pawnpro-debugger', 'target', 'release', name),
    // Build i686 (servidor SA-MP é 32-bit; o adaptador roda na arch do host, mas
    // em dev o target pode ser o i686 ao lado do plugin).
    path.join(context.extensionPath, '..', 'pawnpro-debugger', 'target', 'i686-unknown-linux-gnu', 'release', name),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Deriva o `.amx` a depurar a partir do contexto, SEM presumir que é um gamemode:
 * um projeto Pawn pode ter filterscripts, libs ou scripts em qualquer pasta.
 * Preferimos o arquivo `.pwn` aberto no editor (troca `.pwn`→`.amx`); só se não
 * houver um Pawn aberto caímos no palpite `gamemodes/main.amx`.
 */
function defaultProgram(root: string): string {
  const active = vscode.window.activeTextEditor?.document;
  if (active && /\.(pwn|inc|p|pawn)$/i.test(active.uri.fsPath)) {
    return active.uri.fsPath.replace(/\.(pwn|inc|p|pawn)$/i, '.amx');
  }
  return path.join(root, 'gamemodes', 'main.amx');
}

/**
 * Preenche/valida a configuração de debug antes de iniciar. Sem `launch.json`,
 * oferece uma configuração padrão a partir do arquivo Pawn aberto.
 */
class PawnConfigurationProvider implements vscode.DebugConfigurationProvider {
  constructor(
    private readonly config: PawnProConfigManager,
    private readonly workspaceRoot: () => string | undefined,
  ) {}

  /**
   * Oferece uma config padrão quando o usuário inicia o debug sem `launch.json`
   * (F5 numa pasta sem configuração). Sem isto, o editor não tem o que lançar e
   * o `resolveDebugConfiguration` pode nem ser chamado.
   */
  provideDebugConfigurations(
    folder: vscode.WorkspaceFolder | undefined,
  ): vscode.DebugConfiguration[] {
    const root = folder?.uri.fsPath ?? '';
    return [
      {
        type: 'pawn',
        request: 'launch',
        name: msg.debug.defaultName(),
        program: defaultProgram(root),
        cwd: root,
      },
    ];
  }

  /**
   * Primeira fase: só preenche uma config vazia (F5 sem `launch.json`). É
   * idempotente e PODE ser chamada várias vezes pelo editor (provider normal +
   * dinâmico) — por isso NÃO tem efeitos colaterais (não gera sessão nem sobe
   * servidor). O trabalho pesado fica em `...WithSubstitutedVariables`, que o
   * editor chama exatamente UMA vez, já com as variáveis expandidas.
   */
  resolveDebugConfiguration(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
  ): vscode.DebugConfiguration {
    if (!config.type && !config.request && !config.name) {
      config.type = 'pawn';
      config.request = 'launch';
      config.name = msg.debug.defaultName();
      const root = folder?.uri.fsPath ?? '';
      config.program = defaultProgram(root);
      config.cwd = root;
    }
    return config;
  }

  /**
   * Segunda fase (uma vez por sessão): gera o id de sessão, compila com `-d3` e
   * sobe o servidor. Roda DEPOIS de o editor expandir `${workspaceFolder}` etc.
   */
  async resolveDebugConfigurationWithSubstitutedVariables(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
  ): Promise<vscode.DebugConfiguration | undefined> {
    try {
      return await this.doResolve(folder, config);
    } catch (e) {
      // Qualquer falha aqui abortaria a sessão silenciosamente; tornamos visível.
      const detail = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
      console.error('[PawnPro][debug] resolve falhou:', detail);
      void vscode.window.showErrorMessage(`PawnPro Debug: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  }

  private async doResolve(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration,
  ): Promise<vscode.DebugConfiguration | undefined> {
    // As variáveis já vêm expandidas pelo editor nesta fase; ainda assim, como
    // fallback, expandimos `${workspaceFolder}`/`${file}` que possam ter sobrado.
    const root = folder?.uri.fsPath ?? this.workspaceRoot() ?? '';
    const expand = (v: unknown): unknown =>
      typeof v === 'string'
        ? v
            .replace(/\$\{workspaceFolder\}/g, root)
            .replace(/\$\{workspaceRoot\}/g, root)
            .replace(/\$\{file\}/g, vscode.window.activeTextEditor?.document.uri.fsPath ?? '')
        : v;
    config.program = expand(config.program);
    config.cwd = expand(config.cwd);

    if (!config.program) {
      void vscode.window.showErrorMessage(msg.debug.noProgram());
      return undefined; // aborta a sessão
    }

    // Compila o source com informação de depuração antes de iniciar. Reaproveita
    // o compilador da extensão; injeta `-d3` automaticamente apenas se o usuário
    // não já passar uma flag `-d` (sem mexer na configuração dele).
    console.log('[PawnPro][debug] compilando com -d3...');
    const ok = await this.ensureDebugBuild(String(config.program));
    console.log('[PawnPro][debug] compilação ok =', ok);
    if (!ok) {
      return undefined;
    }

    // Id de sessão do canal plugin↔adaptador. Gerado sempre que ainda não há um
    // nosso (no reiniciar, o adaptador é relançado e o servidor — que é filho
    // DELE — morre junto, então não há estado a reconciliar aqui).
    if (typeof config.session !== 'string' || !config.session.startsWith('pawnpro-')) {
      config.session = `pawnpro-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    }

    // Idioma das mensagens do debugger: mesma fonte do LSP (config `pawnpro.locale`
    // com prioridade sobre o idioma do editor). O adaptador o repassa ao plugin.
    config.locale = resolveLocale(this.config.getAll());

    // Resolve o comando do servidor e faz o preflight do plugin. NÃO subimos o
    // servidor aqui: quem o sobe (como processo FILHO) é o adaptador, para que
    // ele morra junto com o adaptador ao encerrar/reiniciar — sem o editor ter de
    // rastrear processos. Passamos o comando resolvido nos `arguments` do launch.
    const ok2 = await this.prepareServer(config);
    return ok2 ? config : undefined;
  }

  /**
   * Resolve o executável/args/cwd do servidor e valida o plugin (preflight),
   * gravando o comando em `config.serverCommand` para o adaptador executar. Sem
   * efeitos colaterais de processo. Retorna `false` para abortar a sessão.
   */
  private async prepareServer(config: vscode.DebugConfiguration): Promise<boolean> {
    const amxPath = String(config.program);
    const ws = this.workspaceRoot() ?? path.dirname(amxPath);
    const resolved = resolveServerConfig(this.config.getAll().server, ws);
    if (!resolved.exe) {
      void vscode.window.showErrorMessage(msg.debug.serverNotFound());
      return false;
    }
    const cwd = typeof config.cwd === 'string' && config.cwd ? config.cwd : resolved.cwd;

    // Preflight: o plugin precisa estar instalado e registrado no servidor.
    const pre = checkDebugPlugin(cwd);
    if (!pre.ok) {
      const missing: string[] = [];
      if (pre.archMismatch) {
        // O servidor recusa o plugin no boot, mas o erro se perde entre as
        // linhas de carga — sem isto, a depuração falha sem nada no editor.
        missing.push(
          msg.debug.pluginArchMismatch(pre.archMismatch.plugin, pre.archMismatch.servidor),
        );
      } else if (pre.pluginNameClash) {
        missing.push(msg.debug.pluginNameClash(pre.recommendedPath));
      } else if (!pre.pluginFilePresent) {
        missing.push(msg.debug.missingPluginFile(pre.recommendedPath));
      }
      if (!pre.pluginRegistered) missing.push(msg.debug.missingPluginReg(pre.installKind));
      const choice = await vscode.window.showWarningMessage(
        msg.debug.preflightFailed(missing.join(' ')),
        msg.debug.btnStartAnyway(),
        msg.debug.btnCancel(),
      );
      if (choice !== msg.debug.btnStartAnyway()) {
        return false;
      }
    }

    // O adaptador sobe isto como processo filho (kill-on-drop).
    config.serverCommand = {
      exe: resolved.exe,
      args: resolved.args,
      cwd,
    };
    return true;
  }

  /**
   * Garante que o `.amx` exista com debug info: localiza o `.pwn` de mesmo nome
   * e o compila com `-d3` (injetado só se ausente). Se não houver source, segue
   * com o `.amx` existente (assume já compilado com `-d3`).
   */
  async ensureDebugBuild(amxPath: string, soSeMudou = false): Promise<boolean> {
    const source = amxPath.replace(/\.amx$/i, '.pwn');
    // `soSeMudou`: no restart, recompilar um binário que já está em dia só
    // custaria tempo. O fonte ser mais novo que o `.amx` é o que distingue
    // "mudei o código" de "só quero subir o servidor de novo".
    if (soSeMudou && fs.existsSync(source) && fs.existsSync(amxPath)) {
      try {
        if (fs.statSync(source).mtimeMs <= fs.statSync(amxPath).mtimeMs) return true;
      } catch {
        /* sem stat, compila — é o lado seguro */
      }
    }
    if (!fs.existsSync(source)) {
      // Sem source ao lado — não há o que compilar; usa o `.amx` como está.
      if (fs.existsSync(amxPath)) return true;
      // Nem source nem binário: abortar aqui calado deixava o F5 sem reação
      // nenhuma, e o motivo mais comum é o `program` do launch.json apontar
      // para o palpite do template (`gamemodes/main.amx`), que nunca existiu.
      void vscode.window.showErrorMessage(msg.debug.programNotFound(amxPath));
      return false;
    }
    const ws = this.workspaceRoot() ?? path.dirname(source);
    const args = buildCompileArgs({
      config: this.config.getAll(),
      filePath: source,
      workspaceRoot: ws,
      forceDebug: true,
    });
    const result = await runCompile(
      args.exe,
      args.args,
      args.cwd,
      this.config.getAll().output.encoding,
    );
    if (result.exitCode !== 0) {
      void vscode.window.showErrorMessage(msg.debug.compileFailed());
      return false;
    }
    return true;
  }
}

/** Cria o descriptor que lança o binário do adaptador. */
class PawnAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
  constructor(private readonly context: vscode.ExtensionContext) {}

  createDebugAdapterDescriptor(
    session: vscode.DebugSession,
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    const bin = findAdapterBinary(this.context);
    if (!bin) {
      void vscode.window.showErrorMessage(msg.debug.adapterNotFound());
      return undefined;
    }
    try {
      fs.chmodSync(bin, 0o755);
    } catch {
      /* já executável ou Windows */
    }
    // O adaptador recebe a config da sessão via DAP (launch); a porta do plugin
    // vai nos `arguments` do request `launch`, não como env aqui.
    void session;
    return new vscode.DebugAdapterExecutable(bin, []);
  }
}
