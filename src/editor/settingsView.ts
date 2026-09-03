import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { PawnProConfigManager } from '../core/config.js';
import { ACCENTS } from '../core/accent.js';
import { webviewThemeCss } from './webviewTheme.js';
import { brandAnimationCss, brandAnimationJs } from './brandAnimation.js';
import {
  backupNamingLists,
  ensureNamingFiles,
  hasInlineNamingLists,
  inlineNamingBytes,
  migrateNamingLists,
} from './configBridge.js';
import { msg, type Msg } from './nls.js';
import { createWebviewMsg } from './webviewNls.js';

let panel: vscode.WebviewPanel | undefined;

/** Abre (criando se preciso) o arquivo de lista de nomes pedido pela página. */
async function openNamingListFile(
  config: PawnProConfigManager,
  which: 'blocklist' | 'loopIndices',
): Promise<void> {
  ensureNamingFiles(config);
  const naming = config.getAll().analysis.naming;
  const filePath = which === 'blocklist' ? naming.blocklistFile : naming.loopIndicesFile;
  if (!filePath) {
    void vscode.window.showWarningMessage(msg.naming.noFilePath());
    return;
  }
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
  await vscode.window.showTextDocument(doc);
}

export function registerSettingsView(
  context: vscode.ExtensionContext,
  config: PawnProConfigManager,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('pawnpro.openSettings', () => {
      if (panel) {
        panel.reveal();
        return;
      }

      panel = vscode.window.createWebviewPanel(
        'pawnpro.settings',
        msg.settings.title(),
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          // Permite à webview carregar o logo de images/ e a folha de estilo de
          // media/ via asWebviewUri.
          localResourceRoots: [
            vscode.Uri.joinPath(context.extensionUri, 'images'),
            vscode.Uri.joinPath(context.extensionUri, 'out', 'assets'),
          ],
        },
      );
      // Ícone da aba (em vez do genérico de arquivo).
      panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.svg');

      const logoUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.svg'),
      );
      const cssUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'out', 'assets', 'css', 'settings.min.css'),
      );
      const jsUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'out', 'assets', 'js', 'settings.min.js'),
      );
      const brandJsUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'out', 'assets', 'js', 'brand-animation.min.js'),
      );
      // Capturado agora: `render` é chamado depois, e ali o painel pode já ter
      // sido descartado — o valor não muda enquanto ele vive.
      const cspSource = panel.webview.cspSource;
      const render = () =>
        getHtml(
          cspSource,
          logoUri.toString(),
          cssUri.toString(),
          jsUri.toString(),
          brandJsUri.toString(),
          webviewThemeCss(config),
        );
      panel.webview.html = render();
      sendState(panel, config, context);

      // Re-envia o estado (e re-traduz via ui.locale) sempre que a config muda —
      // inclusive quando o próprio idioma da interface é alterado.
      //
      // A cor de destaque é a exceção: ela vive no <style>, que só muda com um
      // HTML novo. Regerar a página inteira a cada tecla digitada em qualquer
      // campo seria desperdício, então só quando a cor de fato mudou.
      let lastAccent = config.getAll().ui?.accent ?? '';
      const unsub = config.onChange(() => {
        if (!panel) return;
        const accent = config.getAll().ui?.accent ?? '';
        if (accent !== lastAccent) {
          lastAccent = accent;
          panel.webview.html = render();
        }
        sendState(panel, config, context);
      });

      panel.webview.onDidReceiveMessage((message: unknown) => {
        if (!message || typeof message !== 'object') return;
        handleMessage(message as Record<string, unknown>, config, context);
      });

      panel.onDidDispose(() => {
        unsub.dispose();
        panel = undefined;
      });
    }),
  );
}

function handleMessage(
  m: Record<string, unknown>,
  config: PawnProConfigManager,
  context: vscode.ExtensionContext,
): void {
  switch (m['type']) {
    case 'set': {
      const key = m['key'];
      const value = m['value'];
      if (typeof key !== 'string') break;
      config.setKey(key, value, 'project');
      break;
    }
    case 'requestState':
      if (panel) sendState(panel, config, context);
      break;
    case 'openNamingFile': {
      const which = m['which'];
      if (which === 'blocklist' || which === 'loopIndices') {
        void openNamingListFile(config, which);
      }
      break;
    }
    case 'migrateNaming':
      void runNamingMigration(config, context);
      break;
  }
}

/**
 * Conduz a migração das listas inline para arquivos: confirma se o conteúdo
 * excede o limite, faz backup do config.json, migra e informa o dev (incluindo
 * onde ficou o backup, para conferir e limpar depois).
 */
async function runNamingMigration(
  config: PawnProConfigManager,
  context: vscode.ExtensionContext,
): Promise<void> {
  if (!hasInlineNamingLists(config)) return;

  const bytes = inlineNamingBytes(config);
  const limit = config.getAll().analysis.naming.maxListFileBytes;
  const sizeMb = (bytes / 1048576).toFixed(2);

  // Acima do limite, não migra sem aval explícito (evita estouro de leitura).
  if (bytes > limit) {
    const go = await vscode.window.showWarningMessage(
      msg.naming.migrateConfirm(sizeMb),
      { modal: true },
      msg.naming.migrateProceed(),
    );
    if (go !== msg.naming.migrateProceed()) return;
  }

  const backup = backupNamingLists(config);
  let result;
  try {
    result = migrateNamingLists(config);
  } catch {
    void vscode.window.showErrorMessage(msg.naming.migrateFailed());
    return;
  }

  // Descreve exatamente o que migrou (só as listas que tinham itens).
  const parts: string[] = [];
  if (result.blocklist > 0) parts.push(msg.naming.migratedBlocklist(result.blocklist));
  if (result.loopIndices > 0) parts.push(msg.naming.migratedLoopIndices(result.loopIndices));
  const summary = parts.join('; ');

  void vscode.window.showInformationMessage(
    backup ? msg.naming.migrateDoneBackup(summary, backup) : msg.naming.migrateDone(summary),
  );
  if (panel) sendState(panel, config, context);
}

function buildI18n(m: Msg) {
  const s = m.settings;
  return {
    noteText:              s.noteText(),
    navCompiler:           s.navCompiler(),
    navIncludes:           s.navIncludes(),
    navBuild:              s.navBuild(),
    navAnalysis:           s.navAnalysis(),
    navFormat:             s.navFormat(),
    navSyntax:             s.navSyntax(),
    navInterface:          s.navInterface(),
    navServer:             s.navServer(),
    compilerPath:          s.compilerPath(),
    compilerPathDesc:      s.compilerPathDesc(),
    compilerAuto:          s.compilerAuto(),
    compilerAutoDesc:      s.compilerAutoDesc(),
    compilerArgs:          s.compilerArgs(),
    compilerArgsDesc:      s.compilerArgsDesc(),
    includePaths:          s.includePaths(),
    includePathsDesc:      s.includePathsDesc(),
    buildShowCommand:      s.buildShowCommand(),
    buildShowCommandDesc:  s.buildShowCommandDesc(),
    outputEncoding:        s.outputEncoding(),
    outputEncodingDesc:    s.outputEncodingDesc(),
    encodingUtf8:          s.encodingUtf8(),
    encodingWin1250:       s.encodingWin1250(),
    encodingWin1251:       s.encodingWin1251(),
    encodingWin1252:       s.encodingWin1252(),
    encodingWin1253:       s.encodingWin1253(),
    encodingWin1254:       s.encodingWin1254(),
    encodingWin1255:       s.encodingWin1255(),
    encodingWin1256:       s.encodingWin1256(),
    encodingWin1257:       s.encodingWin1257(),
    encodingLatin1:        s.encodingLatin1(),
    analysisWarnUnused:          s.analysisWarnUnused(),
    analysisWarnUnusedDesc:      s.analysisWarnUnusedDesc(),
    analysisSuppressInc:         s.analysisSuppressInc(),
    analysisSuppressIncDesc:     s.analysisSuppressIncDesc(),
    analysisSdkPlatform:         s.analysisSdkPlatform(),
    analysisSdkPlatformDesc:     s.analysisSdkPlatformDesc(),
    analysisSdkPath:             s.analysisSdkPath(),
    analysisSdkPathDesc:         s.analysisSdkPathDesc(),
    sdkNone:                     s.sdkNone(),
    formatPreset:                s.formatPreset(),
    formatPresetDesc:            s.formatPresetDesc(),
    formatPresetAllman:          s.formatPresetAllman(),
    formatPresetKnr:             s.formatPresetKnr(),
    formatPresetCompact:         s.formatPresetCompact(),
    formatPresetCustom:          s.formatPresetCustom(),
    formatBraceStyle:            s.formatBraceStyle(),
    formatBraceStyleDesc:        s.formatBraceStyleDesc(),
    formatBraceNextLine:         s.formatBraceNextLine(),
    formatBraceSameLine:         s.formatBraceSameLine(),
    formatSpaceOps:              s.formatSpaceOps(),
    formatSpaceOpsDesc:          s.formatSpaceOpsDesc(),
    formatEmptyBlock:            s.formatEmptyBlock(),
    formatEmptyBlockDesc:        s.formatEmptyBlockDesc(),
    formatPreserveArrayAlign:    s.formatPreserveArrayAlign(),
    formatPreserveArrayAlignDesc: s.formatPreserveArrayAlignDesc(),
    navNaming:                   s.navNaming(),
    namingEnabled:               s.namingEnabled(),
    namingEnabledDesc:           s.namingEnabledDesc(),
    namingMinLength:             s.namingMinLength(),
    namingMinLengthDesc:         s.namingMinLengthDesc(),
    namingMaxFile:               s.namingMaxFile(),
    namingMaxFileDesc:           s.namingMaxFileDesc(),
    namingBlocklist:             s.namingBlocklist(),
    namingBlocklistDesc:         s.namingBlocklistDesc(),
    namingAllowShort:            s.namingAllowShort(),
    namingAllowShortDesc:        s.namingAllowShortDesc(),
    namingOpenFile:              s.namingOpenFile(),
    namingMigrate:               s.namingMigrate(),
    namingMigrateNote:           s.namingMigrateNote(),
    namingStyleGroup:            s.namingStyleGroup(),
    namingStyleGroupDesc:        s.namingStyleGroupDesc(),
    'namingStyle.functions':     s.namingStyleFunctions(),
    'namingStyle.globals':       s.namingStyleGlobals(),
    'namingStyle.locals':        s.namingStyleLocals(),
    'namingStyle.constants':     s.namingStyleConstants(),
    'namingStyle.macros':        s.namingStyleMacros(),
    'namingStyle.parameters':    s.namingStyleParameters(),
    syntaxScheme:                s.syntaxScheme(),
    syntaxSchemeDesc:            s.syntaxSchemeDesc(),
    syntaxApplyOnStartup:        s.syntaxApplyOnStartup(),
    syntaxApplyOnStartupDesc:    s.syntaxApplyOnStartupDesc(),
    schemeAuto:                  s.schemeAuto(),
    schemeClassicLight:          s.schemeClassicLight(),
    schemeModernLight:           s.schemeModernLight(),
    schemeClassicDark:           s.schemeClassicDark(),
    schemeModernDark:            s.schemeModernDark(),
    schemeNone:                  s.schemeNone(),
    uiShowIncludePaths:          s.uiShowIncludePaths(),
    uiShowIncludePathsDesc:      s.uiShowIncludePathsDesc(),
    uiAnimateTitle:              s.uiAnimateTitle(),
    uiAnimateTitleDesc:          s.uiAnimateTitleDesc(),
    uiLocale:                    s.uiLocale(),
    uiLocaleDesc:                s.uiLocaleDesc(),
    uiInterfaceLocale:           s.uiInterfaceLocale(),
    uiInterfaceLocaleDesc:       s.uiInterfaceLocaleDesc(),
    localeAuto:                  s.localeAuto(),
    localePtBr:                  s.localePtBr(),
    localeEn:                    s.localeEn(),
    localeEs:                    s.localeEs(),
    localeRo:                    s.localeRo(),
    localeRu:                    s.localeRu(),
    serverType:                  s.serverType(),
    serverTypeDesc:              s.serverTypeDesc(),
    serverPath:                  s.serverPath(),
    serverPathDesc:              s.serverPathDesc(),
    serverCwd:                   s.serverCwd(),
    serverCwdDesc:               s.serverCwdDesc(),
    serverArgs:                  s.serverArgs(),
    serverArgsDesc:              s.serverArgsDesc(),
    serverClearOnStart:          s.serverClearOnStart(),
    serverClearOnStartDesc:      s.serverClearOnStartDesc(),
    namingRegex:                 s.namingRegex(),
    uiAccent:                    s.uiAccent(),
    uiAccentDesc:                s.uiAccentDesc(),
    uiAccentAuto:                s.uiAccentAuto(),
    namingRegexNeedsSlashes:     s.namingRegexNeedsSlashes(),
    namingRegexInvalid:          s.namingRegexInvalid(),
    namingRegexNoPreview:        s.namingRegexNoPreview(),
    namingSemRegra:              s.namingSemRegra(),
    namingAlsoAccepts:           s.namingAlsoAccepts(),
    fechar:                      s.fechar(),
    buscarExemplos:              s.buscarExemplos(),
    nenhumExemploBusca:          s.nenhumExemploBusca(),
    exemplosCortados:            s.exemplosCortados(MAX_EXAMPLES_UI),
    serverKeepHistory:           s.serverKeepHistory(),
    serverKeepHistoryDesc:       s.serverKeepHistoryDesc(),
    serverSensitiveCommands:     s.serverSensitiveCommands(),
    serverSensitiveCommandsDesc: s.serverSensitiveCommandsDesc(),
    serverFollowLog:             s.serverFollowLog(),
    serverFollowLogDesc:         s.serverFollowLogDesc(),
    serverLogPath:               s.serverLogPath(),
    serverLogPathDesc:           s.serverLogPathDesc(),
    serverLogEncoding:           s.serverLogEncoding(),
    serverLogEncodingDesc:       s.serverLogEncodingDesc(),
    followVisible:               s.followVisible(),
    followAlways:                s.followAlways(),
    followOff:                   s.followOff(),
    serverTypeAuto:              s.serverTypeAuto(),
    serverTypeSamp:              s.serverTypeSamp(),
    serverTypeOmp:               s.serverTypeOmp(),
    btnAdd:                      s.btnAdd(),
    btnRemove:                   s.btnRemove(),
  };
}

function sendState(
  p: vscode.WebviewPanel,
  config: PawnProConfigManager,
  context: vscode.ExtensionContext,
): void {
  const cfg = config.getAll();
  const wmsg = createWebviewMsg(context, config);
  p.webview.postMessage({
    type: 'state',
    payload: cfg,
    i18n: buildI18n(wmsg),
    hasInlineNaming: hasInlineNamingLists(config),
  });
}

/**
 * Ícones da navegação lateral. Traço de 16×16 herdando `currentColor`, como os
 * do painel do servidor, para acompanharem o estado ativo/inativo do item.
 */
const NAV_ICONS: Record<string, string> = {
  // Engrenagem: o compilador e seus parâmetros.
  compilador: '<path d="M8 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0 1.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/><path d="M7.1 1a.8.8 0 0 0-.79.68l-.15 1a5.9 5.9 0 0 0-.98.57l-.94-.39a.8.8 0 0 0-.98.35l-.9 1.56a.8.8 0 0 0 .19 1.02l.8.63a5.9 5.9 0 0 0 0 1.13l-.8.63a.8.8 0 0 0-.19 1.02l.9 1.56a.8.8 0 0 0 .98.35l.94-.39c.3.23.63.42.98.57l.15 1a.8.8 0 0 0 .79.68h1.8a.8.8 0 0 0 .79-.68l.15-1c.35-.15.68-.34.98-.57l.94.39a.8.8 0 0 0 .98-.35l.9-1.56a.8.8 0 0 0-.19-1.02l-.8-.63a5.9 5.9 0 0 0 0-1.13l.8-.63a.8.8 0 0 0 .19-1.02l-.9-1.56a.8.8 0 0 0-.98-.35l-.94.39a5.9 5.9 0 0 0-.98-.57l-.15-1A.8.8 0 0 0 8.9 1H7.1Zm.35 1.5h1.1l.13.9a.75.75 0 0 0 .5.6c.4.14.78.36 1.1.64a.75.75 0 0 0 .78.12l.84-.35.55.95-.72.57a.75.75 0 0 0-.27.74 4.4 4.4 0 0 1 0 1.26.75.75 0 0 0 .27.74l.72.57-.55.95-.84-.35a.75.75 0 0 0-.78.12c-.32.28-.7.5-1.1.64a.75.75 0 0 0-.5.6l-.13.9h-1.1l-.13-.9a.75.75 0 0 0-.5-.6 4.4 4.4 0 0 1-1.1-.64.75.75 0 0 0-.78-.12l-.84.35-.55-.95.72-.57a.75.75 0 0 0 .27-.74 4.4 4.4 0 0 1 0-1.26.75.75 0 0 0-.27-.74l-.72-.57.55-.95.84.35a.75.75 0 0 0 .78-.12c.32-.28.7-.5 1.1-.64a.75.75 0 0 0 .5-.6l.13-.9Z"/>',
  // Pasta com seta: caminhos de include.
  includes: '<path d="M1.5 3A1.5 1.5 0 0 1 3 1.5h3.1a1.5 1.5 0 0 1 1.06.44l.9.9H13A1.5 1.5 0 0 1 14.5 4.34V12.5A1.5 1.5 0 0 1 13 14H3a1.5 1.5 0 0 1-1.5-1.5V3Zm1.5 0v9.5h10V4.34H7.75a.75.75 0 0 1-.53-.22l-1.12-1.12H3Z"/>',
  // Blocos empilhados: a saída do build.
  build: '<path d="M8 1.2a.75.75 0 0 0-.36.1L2.3 4.3a.75.75 0 0 0-.38.65v6.1c0 .27.14.52.38.65l5.34 3a.75.75 0 0 0 .72 0l5.34-3a.75.75 0 0 0 .38-.65v-6.1a.75.75 0 0 0-.38-.65l-5.34-3A.75.75 0 0 0 8 1.2Zm0 1.62 3.94 2.2L8 7.24 4.06 5.02 8 2.82ZM3.42 6.3l3.83 2.16v4.4L3.42 10.7V6.3Zm5.33 6.56v-4.4l3.83-2.16v4.4l-3.83 2.16Z"/>',
  // Lupa sobre linhas: a análise do código.
  analise: '<path d="M2 2.75A.75.75 0 0 1 2.75 2h7a.75.75 0 0 1 0 1.5h-7A.75.75 0 0 1 2 2.75Zm0 3A.75.75 0 0 1 2.75 5h4a.75.75 0 0 1 0 1.5h-4A.75.75 0 0 1 2 5.75Zm0 3A.75.75 0 0 1 2.75 8h2.6a.75.75 0 0 1 0 1.5h-2.6A.75.75 0 0 1 2 8.75Z"/><path d="M10.4 7.5a2.9 2.9 0 1 0 1.74 5.22l1.83 1.83a.75.75 0 0 0 1.06-1.06l-1.83-1.83A2.9 2.9 0 0 0 10.4 7.5Zm-1.4 2.9a1.4 1.4 0 1 1 2.8 0 1.4 1.4 0 0 1-2.8 0Z"/>',
  // Chaves de bloco: a formatação.
  formatacao: '<path d="M6.3 1.6a.75.75 0 0 1 0 1.5c-.6 0-.95.12-1.14.3-.2.19-.31.5-.31 1.05v1.4c0 .8-.3 1.5-.87 1.95.57.45.87 1.15.87 1.95v1.4c0 .55.11.86.31 1.05.19.18.54.3 1.14.3a.75.75 0 0 1 0 1.5c-.83 0-1.62-.16-2.18-.7-.56-.55-.77-1.3-.77-2.15v-1.4c0-.5-.15-.72-.32-.85a1.3 1.3 0 0 0-.55-.25.75.75 0 0 1 0-1.5c.16-.03.38-.11.55-.25.17-.13.32-.35.32-.85v-1.4c0-.85.21-1.6.77-2.15.56-.54 1.35-.7 2.18-.7Zm3.4 0c.83 0 1.62.16 2.18.7.56.55.77 1.3.77 2.15v1.4c0 .5.15.72.32.85.17.14.39.22.55.25a.75.75 0 0 1 0 1.5c-.16.03-.38.11-.55.25-.17.13-.32.35-.32.85v1.4c0 .85-.21 1.6-.77 2.15-.56.54-1.35.7-2.18.7a.75.75 0 0 1 0-1.5c.6 0 .95-.12 1.14-.3.2-.19.31-.5.31-1.05v-1.4c0-.8.3-1.5.87-1.95a2.42 2.42 0 0 1-.87-1.95v-1.4c0-.55-.11-.86-.31-1.05-.19-.18-.54-.3-1.14-.3a.75.75 0 0 1 0-1.5Z"/>',
  // Etiqueta: o nome dado a cada coisa.
  nomenclatura: '<path d="M8.6 1.5H13A1.5 1.5 0 0 1 14.5 3v4.4a1.5 1.5 0 0 1-.44 1.06l-5.1 5.1a1.5 1.5 0 0 1-2.12 0L1.94 8.66a1.5 1.5 0 0 1 0-2.12l5.1-5.1A1.5 1.5 0 0 1 8.6 1.5ZM13 3H8.6L3.5 8.1l4.9 4.9L13 7.9V3Zm-2.4 1.4a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/>',
  // Pincel: as cores da sintaxe.
  sintaxe: '<path d="M11.6 1.6a2.05 2.05 0 0 1 2.9 2.9l-.9.9-2.9-2.9.9-.9Zm-1.96 1.96 2.9 2.9-5.6 5.6a1.5 1.5 0 0 1-.7.4l-3.1.8a.75.75 0 0 1-.92-.92l.8-3.1a1.5 1.5 0 0 1 .4-.7l5.6-5.6Zm-4.54 6.66-.45 1.73 1.73-.45-1.28-1.28Z"/>',
  // Janela: a interface do editor.
  interface: '<path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9Zm1.5 0v1.6h9V3.5h-9Zm9 3.1h-9v5.9h9V6.6Z"/>',
  // Torre de servidor.
  servidor: '<path d="M2.5 2.5A1.5 1.5 0 0 1 4 1h8a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 12 7H4a1.5 1.5 0 0 1-1.5-1.5v-3Zm1.5 0v3h8v-3H4Zm-1.5 7A1.5 1.5 0 0 1 4 8h8a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 12 14H4a1.5 1.5 0 0 1-1.5-1.5v-3Zm1.5 0v3h8v-3H4Z"/><path d="M5.5 3.25a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Zm0 7a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z"/>',
};

/** Envolve o traço do ícone no `<svg>` da navegação. */
function navIcon(key: string): string {
  const path = NAV_ICONS[key];
  return path
    ? `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">${path}</svg>`
    : '';
}

/**
 * Linha de configuração de estilo para uma categoria de identificador. O `<code>`
 * de preview é preenchido em runtime pelo cliente conforme o estilo escolhido.
 */
function namingStyleRow(category: string): string {
  const styles = ['camelCase', 'snake_case', 'PascalCase', 'UPPER_CASE', 'Capitalized_Snake'];
  // Rótulo curto para caber no checkbox; o valor enviado à engine é o canônico.
  const labels: Record<string, string> = { Capitalized_Snake: 'Cap_Snake' };
  const checks = styles
    .map(
      st => /* html */`
        <label class="style-badge">
          <input type="checkbox" id="naming-style-${category}-${st}"
            onchange="toggleNamingStyle('${category}', '${st}', this.checked)">
          <span>${labels[st] ?? st}</span>
        </label>`,
    )
    .join('');
  // Uma linha por categoria: as etiquetas e o padrão próprio são a MESMA
  // configuração (a lista de critérios aceitos), então dividir em duas linhas
  // com borda entre elas fazia o padrão parecer pertencer à categoria seguinte.
  return /* html */`
  <div class="row naming-opt naming-style-row">
    <div class="row-info">
      <div class="row-label" data-i18n="namingStyle.${category}"></div>
      <div class="row-desc">
        <code class="naming-preview" id="naming-preview-${category}"></code>
        <button type="button" class="naming-more" id="naming-more-${category}" hidden></button>
        <p class="naming-vazio" id="naming-vazio-${category}" hidden>
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 1.2a5.3 5.3 0 0 1 3.2 1.08L3.78 11.2A5.3 5.3 0 0 1 8 2.7Zm0 10.6a5.3 5.3 0 0 1-3.2-1.08l7.42-7.42A5.3 5.3 0 0 1 8 13.3Z"/></svg>
          <span id="naming-vazio-texto-${category}"></span>
        </p>
        <p class="regex-erro" id="naming-regex-erro-${category}" role="alert" hidden></p>
      </div>
    </div>
    <div class="row-control style-checks">
      ${checks}
      <input type="text" class="regex-input" id="naming-regex-${category}"
        spellcheck="false" autocapitalize="off" autocomplete="off"
        placeholder="/^g_[a-z][a-zA-Z0-9]*$/"
        data-i18n-aria="namingRegex"
        oninput="onNamingRegexInput('${category}')"
        onchange="commitNamingRegex('${category}')" />
    </div>
  </div>`;
}

// Opções reutilizadas nos dois seletores de idioma (interface e diagnósticos) e
// nos dois de codificação (saída e log). Definidas uma vez para não divergirem —
// adicionar um idioma/codificação passa a ser uma única edição.
const LOCALE_OPTIONS = /* html */`
        <option value=""      data-i18n="localeAuto"></option>
        <option value="pt-BR" data-i18n="localePtBr"></option>
        <option value="en"    data-i18n="localeEn"></option>
        <option value="es"    data-i18n="localeEs"></option>
        <option value="ro"    data-i18n="localeRo"></option>
        <option value="ru"    data-i18n="localeRu"></option>`;

const ENCODING_OPTIONS = /* html */`
        <option value="utf8"        data-i18n="encodingUtf8"></option>
        <option value="windows1250" data-i18n="encodingWin1250"></option>
        <option value="windows1251" data-i18n="encodingWin1251"></option>
        <option value="windows1252" data-i18n="encodingWin1252"></option>
        <option value="windows1253" data-i18n="encodingWin1253"></option>
        <option value="windows1254" data-i18n="encodingWin1254"></option>
        <option value="windows1255" data-i18n="encodingWin1255"></option>
        <option value="windows1256" data-i18n="encodingWin1256"></option>
        <option value="windows1257" data-i18n="encodingWin1257"></option>
        <option value="latin1"      data-i18n="encodingLatin1"></option>`;

/**
 * Teto da lista de exemplos do modal de nomenclatura.
 *
 * A rolagem dá conta do volume, mas uma lista sem fim não ajuda ninguém a
 * entender o padrão. Declarado aqui, e não no script da WebView, para a
 * mensagem de corte citar o mesmo número sem duplicar a constante.
 */
const MAX_EXAMPLES_UI = 300;

function getHtml(
  cspSource: string,
  logoUri: string,
  cssUri: string,
  jsUri: string,
  brandJsUri: string,
  themeCss: string,
): string {
  // Nonce por render: com ele o CSP libera SÓ os scripts que a extensão gerou,
  // em vez do 'unsafe-inline', que permitiria qualquer injeção.
  const nonce = randomBytes(16).toString('base64');
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- Sem 'unsafe-inline' em script-src: com o nonce, só o que a extensão gerou
     executa. O estilo ainda precisa dele por causa do <style> com a cor de
     destaque, que depende da configuração. -->
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource}; script-src 'nonce-${nonce}';">
<title>PawnPro</title>
<!-- O estilo estático vive em assets-src/css/settings.css e é minificado para
     out/assets/ (ver assets.manifest.json). Em arquivo próprio o editor dá
     realce e validação, e a folha sai 40% menor. Só o que depende de dados
     fica aqui — a cor de destaque e a animação da marca. -->
<link rel="stylesheet" href="${cssUri}">
<style>
${brandAnimationCss()}
${themeCss}
</style>
</head>
<body data-max-examples="${MAX_EXAMPLES_UI}">

<nav>
  <div class="logo"><img src="${logoUri}" alt="" /><span class="brand" id="brand">PawnPro</span></div>
  <a data-target="compilador" class="nav-link active">${navIcon('compilador')}<span data-i18n="navCompiler"></span></a>
  <a data-target="includes" class="nav-link">${navIcon('includes')}<span data-i18n="navIncludes"></span></a>
  <a data-target="build" class="nav-link">${navIcon('build')}<span data-i18n="navBuild"></span></a>
  <a data-target="analise" class="nav-link">${navIcon('analise')}<span data-i18n="navAnalysis"></span></a>
  <a data-target="formatacao" class="nav-link">${navIcon('formatacao')}<span data-i18n="navFormat"></span></a>
  <a data-target="nomenclatura" class="nav-link">${navIcon('nomenclatura')}<span data-i18n="navNaming"></span></a>
  <a data-target="sintaxe" class="nav-link">${navIcon('sintaxe')}<span data-i18n="navSyntax"></span></a>
  <a data-target="interface" class="nav-link">${navIcon('interface')}<span data-i18n="navInterface"></span></a>
  <a data-target="servidor" class="nav-link">${navIcon('servidor')}<span data-i18n="navServer"></span></a>
</nav>

<main>

<p class="note" id="note-text"></p>

<div class="section" id="compilador">
  <h2 data-i18n="navCompiler"></h2>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="compilerAuto"></div>
      <div class="row-desc" data-i18n="compilerAutoDesc"></div>
    </div>
    <div class="row-control">
      <label class="toggle">
        <input type="checkbox" id="compiler-autoDetect" onchange="onAutoDetectChange(this.checked)">
        <span class="toggle-track"></span>
        <span class="toggle-thumb"></span>
      </label>
    </div>
  </div>
  <div class="row compiler-path-row">
    <div class="row-info">
      <div class="row-label" data-i18n="compilerPath"></div>
      <div class="row-desc" data-i18n="compilerPathDesc"></div>
    </div>
    <div class="row-control" style="min-width:clamp(168px, 40vw, 280px)">
      <input type="text" id="compiler-path" placeholder="ex: C:/pawno/pawncc.exe"
        onchange="set('compiler.path', this.value.trim())">
    </div>
  </div>
  <div class="row wide">
    <div class="row-info">
      <div class="row-label" data-i18n="compilerArgs"></div>
      <div class="row-desc" data-i18n="compilerArgsDesc"></div>
    </div>
    <div class="row-control" style="min-width:100%;margin-top:8px">
      <div class="array-editor" id="compiler-args-editor"></div>
    </div>
  </div>
</div>

<div class="section" id="includes">
  <h2 data-i18n="navIncludes"></h2>
  <div class="row wide">
    <div class="row-info">
      <div class="row-label" data-i18n="includePaths"></div>
      <div class="row-desc" data-i18n="includePathsDesc"></div>
    </div>
    <div class="row-control" style="min-width:100%;margin-top:8px">
      <div class="array-editor" id="includePaths-editor"></div>
    </div>
  </div>
</div>

<div class="section" id="build">
  <h2 data-i18n="navBuild"></h2>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="buildShowCommand"></div>
      <div class="row-desc" data-i18n="buildShowCommandDesc"></div>
    </div>
    <div class="row-control">
      <label class="toggle">
        <input type="checkbox" id="build-showCommand" onchange="set('build.showCommand', this.checked)">
        <span class="toggle-track"></span>
        <span class="toggle-thumb"></span>
      </label>
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="outputEncoding"></div>
      <div class="row-desc" data-i18n="outputEncodingDesc"></div>
    </div>
    <div class="row-control" style="min-width:clamp(108px, 26vw, 180px)">
      <select id="output-encoding" onchange="set('output.encoding', this.value)">
${ENCODING_OPTIONS}
      </select>
    </div>
  </div>
</div>

<div class="section" id="analise">
  <h2 data-i18n="navAnalysis"></h2>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="analysisWarnUnused"></div>
      <div class="row-desc" data-i18n="analysisWarnUnusedDesc"></div>
    </div>
    <div class="row-control">
      <label class="toggle">
        <input type="checkbox" id="analysis-warnUnusedInInc" onchange="set('analysis.warnUnusedInInc', this.checked)">
        <span class="toggle-track"></span>
        <span class="toggle-thumb"></span>
      </label>
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="analysisSuppressInc"></div>
      <div class="row-desc" data-i18n="analysisSuppressIncDesc"></div>
    </div>
    <div class="row-control">
      <label class="toggle">
        <input type="checkbox" id="analysis-suppressDiagnosticsInInc" onchange="set('analysis.suppressDiagnosticsInInc', this.checked)">
        <span class="toggle-track"></span>
        <span class="toggle-thumb"></span>
      </label>
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="analysisSdkPlatform"></div>
      <div class="row-desc" data-i18n="analysisSdkPlatformDesc"></div>
    </div>
    <div class="row-control" style="min-width:clamp(96px, 23vw, 160px)">
      <select id="analysis-sdk-platform" onchange="set('analysis.sdk.platform', this.value)">
        <option value="omp">open.mp</option>
        <option value="samp">SA-MP</option>
        <option value="none" data-i18n="sdkNone"></option>
      </select>
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="analysisSdkPath"></div>
      <div class="row-desc" data-i18n="analysisSdkPathDesc"></div>
    </div>
    <div class="row-control" style="min-width:clamp(168px, 40vw, 280px)">
      <input type="text" id="analysis-sdk-filePath" placeholder="\${workspaceFolder}/pawno/include/a_samp.inc"
        onchange="set('analysis.sdk.filePath', this.value.trim())">
    </div>
  </div>
</div>

<div class="section" id="formatacao">
  <h2 data-i18n="navFormat"></h2>
  <div class="preset-header">
    <div class="row-label" data-i18n="formatPreset"></div>
    <div class="row-desc" data-i18n="formatPresetDesc"></div>
  </div>
  <div class="preset-grid" id="format-preset-grid">
    <button type="button" class="preset-card" data-preset="allman"
      onclick="selectPreset('allman')">
      <pre class="preset-preview">if (x)
{
    foo();
}</pre>
      <span class="preset-name" data-i18n="formatPresetAllman"></span>
    </button>
    <button type="button" class="preset-card" data-preset="knr"
      onclick="selectPreset('knr')">
      <pre class="preset-preview">if (x) {
    foo();
}</pre>
      <span class="preset-name" data-i18n="formatPresetKnr"></span>
    </button>
    <button type="button" class="preset-card" data-preset="compact"
      onclick="selectPreset('compact')">
      <pre class="preset-preview">if (x) foo();
for (i) bar();
baz();</pre>
      <span class="preset-name" data-i18n="formatPresetCompact"></span>
    </button>
    <button type="button" class="preset-card" data-preset="custom"
      onclick="selectPreset('custom')">
      <pre class="preset-preview">/* ajuste
   manual
   abaixo */</pre>
      <span class="preset-name" data-i18n="formatPresetCustom"></span>
    </button>
  </div>
  <div class="row format-custom">
    <div class="row-info">
      <div class="row-label" data-i18n="formatBraceStyle"></div>
      <div class="row-desc" data-i18n="formatBraceStyleDesc"></div>
    </div>
    <div class="row-control" style="min-width:clamp(108px, 26vw, 180px)">
      <select id="format-braceStyle" onchange="set('format.braceStyle', this.value)">
        <option value="nextLine" data-i18n="formatBraceNextLine"></option>
        <option value="sameLine" data-i18n="formatBraceSameLine"></option>
      </select>
    </div>
  </div>
  <div class="row format-custom">
    <div class="row-info">
      <div class="row-label" data-i18n="formatSpaceOps"></div>
      <div class="row-desc" data-i18n="formatSpaceOpsDesc"></div>
    </div>
    <div class="row-control">
      <label class="toggle">
        <input type="checkbox" id="format-spaceAroundOperators" onchange="set('format.spaceAroundOperators', this.checked)">
        <span class="toggle-track"></span>
        <span class="toggle-thumb"></span>
      </label>
    </div>
  </div>
  <div class="row format-custom">
    <div class="row-info">
      <div class="row-label" data-i18n="formatEmptyBlock"></div>
      <div class="row-desc" data-i18n="formatEmptyBlockDesc"></div>
    </div>
    <div class="row-control">
      <label class="toggle">
        <input type="checkbox" id="format-emptyBlockSameLine" onchange="set('format.emptyBlockSameLine', this.checked)">
        <span class="toggle-track"></span>
        <span class="toggle-thumb"></span>
      </label>
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="formatPreserveArrayAlign"></div>
      <div class="row-desc" data-i18n="formatPreserveArrayAlignDesc"></div>
    </div>
    <div class="row-control">
      <label class="toggle">
        <input type="checkbox" id="format-preserveArrayAlignment" onchange="set('format.preserveArrayAlignment', this.checked)">
        <span class="toggle-track"></span>
        <span class="toggle-thumb"></span>
      </label>
    </div>
  </div>
</div>

<div class="section" id="nomenclatura">
  <h2 data-i18n="navNaming"></h2>
  <div class="migrate-banner" id="naming-migrate-banner" style="display:none">
    <span data-i18n="namingMigrateNote"></span>
    <button type="button" class="btn-file" onclick="migrateNaming()" data-i18n="namingMigrate"></button>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="namingEnabled"></div>
      <div class="row-desc" data-i18n="namingEnabledDesc"></div>
    </div>
    <div class="row-control">
      <label class="toggle">
        <input type="checkbox" id="naming-enabled" onchange="set('analysis.naming.enabled', this.checked)">
        <span class="toggle-track"></span>
        <span class="toggle-thumb"></span>
      </label>
    </div>
  </div>
  <div class="row naming-opt">
    <div class="row-info">
      <div class="row-label" data-i18n="namingMinLength"></div>
      <div class="row-desc" data-i18n="namingMinLengthDesc"></div>
    </div>
    <div class="row-control" style="min-width:90px">
      <input type="number" id="naming-minLength" min="1" max="64"
        onchange="set('analysis.naming.minLength', Math.max(1, parseInt(this.value, 10) || 1))">
    </div>
  </div>
  <div class="row naming-opt">
    <div class="row-info">
      <div class="row-label" data-i18n="namingMaxFile"></div>
      <div class="row-desc" data-i18n="namingMaxFileDesc"></div>
    </div>
    <div class="row-control" style="min-width:90px">
      <input type="number" id="naming-maxListMb" min="1" max="256"
        onchange="set('analysis.naming.maxListFileBytes', Math.max(1, parseInt(this.value, 10) || 1) * 1048576)">
    </div>
  </div>
  <div class="row naming-opt">
    <div class="row-info">
      <div class="row-label" data-i18n="namingBlocklist"></div>
      <div class="row-desc" data-i18n="namingBlocklistDesc"></div>
    </div>
    <div class="row-control">
      <button type="button" class="btn-file" onclick="openNamingFile('blocklist')" data-i18n="namingOpenFile"></button>
    </div>
  </div>
  <div class="row naming-opt">
    <div class="row-info">
      <div class="row-label" data-i18n="namingAllowShort"></div>
      <div class="row-desc" data-i18n="namingAllowShortDesc"></div>
    </div>
    <div class="row-control">
      <button type="button" class="btn-file" onclick="openNamingFile('loopIndices')" data-i18n="namingOpenFile"></button>
    </div>
  </div>
  <details class="naming-styles naming-opt">
    <summary>
      <svg class="disclosure" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M5.2 2.5 12.4 7.4a.7.7 0 0 1 0 1.2L5.2 13.5A.7.7 0 0 1 4.1 12.9V3.1a.7.7 0 0 1 1.1-.6Z"/>
      </svg>
      <span class="naming-styles-title" data-i18n="namingStyleGroup"></span>
      <span class="naming-styles-desc" data-i18n="namingStyleGroupDesc"></span>
    </summary>
    ${['functions', 'globals', 'locals', 'constants', 'macros', 'parameters']
      .map(cat => namingStyleRow(cat))
      .join('\n')}
  </details>
</div>

<div class="section" id="sintaxe">
  <h2 data-i18n="navSyntax"></h2>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="syntaxScheme"></div>
      <div class="row-desc" data-i18n="syntaxSchemeDesc"></div>
    </div>
    <div class="row-control" style="min-width:clamp(132px, 31vw, 220px)">
      <select id="syntax-scheme" onchange="set('syntax.scheme', this.value)">
        <option value="auto"          data-i18n="schemeAuto"></option>
        <option value="classic_white" data-i18n="schemeClassicLight"></option>
        <option value="modern_white"  data-i18n="schemeModernLight"></option>
        <option value="classic_dark"  data-i18n="schemeClassicDark"></option>
        <option value="modern_dark"   data-i18n="schemeModernDark"></option>
        <option value="none"          data-i18n="schemeNone"></option>
      </select>
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="syntaxApplyOnStartup"></div>
      <div class="row-desc" data-i18n="syntaxApplyOnStartupDesc"></div>
    </div>
    <div class="row-control">
      <label class="toggle">
        <input type="checkbox" id="syntax-applyOnStartup" onchange="set('syntax.applyOnStartup', this.checked)">
        <span class="toggle-track"></span>
        <span class="toggle-thumb"></span>
      </label>
    </div>
  </div>
</div>

<div class="section" id="interface">
  <h2 data-i18n="navInterface"></h2>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="uiAccent"></div>
      <div class="row-desc" data-i18n="uiAccentDesc"></div>
    </div>
    <div class="row-control accent-picker">
      <label class="accent-swatch auto" title="">
        <input type="radio" name="accent" value="" onchange="set('ui.accent', '')">
        <span data-i18n="uiAccentAuto"></span>
      </label>
        <label class="accent-swatch" title="blue">
          <input type="radio" name="accent" value="blue" onchange="set('ui.accent', 'blue')">
          <span style="--sw: ${ACCENTS.blue.base}"></span>
        </label>
        <label class="accent-swatch" title="purple">
          <input type="radio" name="accent" value="purple" onchange="set('ui.accent', 'purple')">
          <span style="--sw: ${ACCENTS.purple.base}"></span>
        </label>
        <label class="accent-swatch" title="green">
          <input type="radio" name="accent" value="green" onchange="set('ui.accent', 'green')">
          <span style="--sw: ${ACCENTS.green.base}"></span>
        </label>
        <label class="accent-swatch" title="amber">
          <input type="radio" name="accent" value="amber" onchange="set('ui.accent', 'amber')">
          <span style="--sw: ${ACCENTS.amber.base}"></span>
        </label>
        <label class="accent-swatch" title="pink">
          <input type="radio" name="accent" value="pink" onchange="set('ui.accent', 'pink')">
          <span style="--sw: ${ACCENTS.pink.base}"></span>
        </label>
        <label class="accent-swatch" title="teal">
          <input type="radio" name="accent" value="teal" onchange="set('ui.accent', 'teal')">
          <span style="--sw: ${ACCENTS.teal.base}"></span>
        </label>
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="uiShowIncludePaths"></div>
      <div class="row-desc" data-i18n="uiShowIncludePathsDesc"></div>
    </div>
    <div class="row-control">
      <label class="toggle">
        <input type="checkbox" id="ui-showIncludePaths" onchange="set('ui.showIncludePaths', this.checked)">
        <span class="toggle-track"></span>
        <span class="toggle-thumb"></span>
      </label>
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="uiAnimateTitle"></div>
      <div class="row-desc" data-i18n="uiAnimateTitleDesc"></div>
    </div>
    <div class="row-control">
      <label class="toggle">
        <input type="checkbox" id="ui-animateTitle" onchange="set('ui.animateTitle', this.checked)">
        <span class="toggle-track"></span>
        <span class="toggle-thumb"></span>
      </label>
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="uiInterfaceLocale"></div>
      <div class="row-desc" data-i18n="uiInterfaceLocaleDesc"></div>
    </div>
    <div class="row-control" style="min-width:clamp(120px, 29vw, 200px)">
      <select id="ui-locale" onchange="set('ui.locale', this.value)">
${LOCALE_OPTIONS}
      </select>
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="uiLocale"></div>
      <div class="row-desc" data-i18n="uiLocaleDesc"></div>
    </div>
    <div class="row-control" style="min-width:clamp(120px, 29vw, 200px)">
      <select id="locale" onchange="set('locale', this.value)">
${LOCALE_OPTIONS}
      </select>
    </div>
  </div>
</div>

<div class="section" id="servidor">
  <h2 data-i18n="navServer"></h2>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="serverType"></div>
      <div class="row-desc" data-i18n="serverTypeDesc"></div>
    </div>
    <div class="row-control" style="min-width:clamp(108px, 26vw, 180px)">
      <select id="server-type" onchange="set('server.type', this.value)">
        <option value="auto" data-i18n="serverTypeAuto"></option>
        <option value="samp" data-i18n="serverTypeSamp"></option>
        <option value="omp"  data-i18n="serverTypeOmp"></option>
      </select>
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="serverPath"></div>
      <div class="row-desc" data-i18n="serverPathDesc"></div>
    </div>
    <div class="row-control" style="min-width:clamp(168px, 40vw, 280px)">
      <input type="text" id="server-path" placeholder="\${workspaceFolder}/samp-server.exe"
        onchange="set('server.path', this.value.trim())">
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="serverCwd"></div>
      <div class="row-desc" data-i18n="serverCwdDesc"></div>
    </div>
    <div class="row-control" style="min-width:clamp(168px, 40vw, 280px)">
      <input type="text" id="server-cwd" placeholder="\${workspaceFolder}"
        onchange="set('server.cwd', this.value.trim())">
    </div>
  </div>
  <div class="row wide">
    <div class="row-info">
      <div class="row-label" data-i18n="serverArgs"></div>
      <div class="row-desc" data-i18n="serverArgsDesc"></div>
    </div>
    <div class="row-control" style="min-width:100%;margin-top:8px">
      <div class="array-editor" id="server-args-editor"></div>
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="serverClearOnStart"></div>
      <div class="row-desc" data-i18n="serverClearOnStartDesc"></div>
    </div>
    <div class="row-control">
      <label class="toggle">
        <input type="checkbox" id="server-clearOnStart" onchange="set('server.clearOnStart', this.checked)">
        <span class="toggle-track"></span>
        <span class="toggle-thumb"></span>
      </label>
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="serverKeepHistory"></div>
      <div class="row-desc" data-i18n="serverKeepHistoryDesc"></div>
    </div>
    <div class="row-control">
      <label class="toggle">
        <input type="checkbox" id="server-history-enabled" onchange="set('server.history.enabled', this.checked)">
        <span class="toggle-track"></span>
        <span class="toggle-thumb"></span>
      </label>
    </div>
  </div>
  <div class="row wide">
    <div class="row-info">
      <div class="row-label" data-i18n="serverSensitiveCommands"></div>
      <div class="row-desc" data-i18n="serverSensitiveCommandsDesc"></div>
    </div>
    <div class="row-control" style="min-width:100%;margin-top:8px">
      <div class="array-editor" id="server-sensitive-editor"></div>
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="serverFollowLog"></div>
      <div class="row-desc" data-i18n="serverFollowLogDesc"></div>
    </div>
    <div class="row-control" style="min-width:clamp(108px, 26vw, 180px)">
      <select id="server-output-follow" onchange="set('server.output.follow', this.value)">
        <option value="visible" data-i18n="followVisible"></option>
        <option value="always"  data-i18n="followAlways"></option>
        <option value="off"     data-i18n="followOff"></option>
      </select>
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="serverLogPath"></div>
      <div class="row-desc" data-i18n="serverLogPathDesc"></div>
    </div>
    <div class="row-control" style="min-width:clamp(168px, 40vw, 280px)">
      <input type="text" id="server-logPath" placeholder="\${workspaceFolder}/server_log.txt"
        onchange="set('server.logPath', this.value.trim())">
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="serverLogEncoding"></div>
      <div class="row-desc" data-i18n="serverLogEncodingDesc"></div>
    </div>
    <div class="row-control" style="min-width:clamp(108px, 26vw, 180px)">
      <select id="server-logEncoding" onchange="set('server.logEncoding', this.value)">
${ENCODING_OPTIONS}
      </select>
    </div>
  </div>
</div>
<div id="scroll-spacer" aria-hidden="true"></div>

</main>

<dialog class="exemplos-modal" id="exemplos-modal">
  <div class="exemplos-modal-corpo">
    <div class="exemplos-modal-topo">
      <code id="exemplos-modal-titulo"></code>
    </div>
    <div class="search-box">
      <input id="exemplos-modal-busca" class="search" type="text"
        data-i18n-ph="buscarExemplos" data-i18n-aria="buscarExemplos" />
      <span class="exemplos-modal-conta" id="exemplos-modal-conta"></span>
    </div>
    <ul id="exemplos-modal-lista"></ul>
    <p class="exemplos-modal-vazio" id="exemplos-modal-vazio" hidden
       data-i18n="nenhumExemploBusca"></p>
    <p class="exemplos-modal-corte" id="exemplos-modal-corte" hidden
       data-i18n="exemplosCortados"></p>
    <div class="exemplos-modal-rodape">
      <button type="button" id="exemplos-modal-fechar" data-i18n="fechar"></button>
    </div>
  </div>
</dialog>

<!-- A lógica vive em assets-src/js/settings.js e é minificada para
     out/assets/ (ver assets.manifest.json). A animação da marca é módulo
     próprio; o teto de exemplos chega por data-attribute no <body>. -->
<script nonce="${nonce}" src="${brandJsUri}"></script>
<script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
}
