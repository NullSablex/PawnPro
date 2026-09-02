import * as vscode from 'vscode';
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
          // Permite à webview carregar o logo de images/ via asWebviewUri.
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'images')],
        },
      );
      // Ícone da aba (em vez do genérico de arquivo).
      panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.svg');

      const logoUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.svg'),
      );
      panel.webview.html = getHtml(logoUri.toString(), webviewThemeCss(config));
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
          panel.webview.html = getHtml(logoUri.toString(), webviewThemeCss(config));
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
    namingAlsoAccepts:           s.namingAlsoAccepts(),
    fechar:                      s.fechar(),
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

function getHtml(logoUri: string, themeCss: string): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PawnPro</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* O display do user-agent para [hidden] tem especificidade mínima e perde de
     qualquer classe que declare display — .naming-preview é display:block, e o
     elemento seguia visível com o atributo posto. */
  [hidden] { display: none !important; }

  /* Padding horizontal fluido: encolhe em painéis estreitos sem breakpoints. */
  :root { --pad-x: clamp(14px, 5vw, 36px); }

  body {
    font-family: var(--vscode-font-family);
    font-size: 14px;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  nav {
    width: 180px;
    flex-shrink: 0;
    border-right: 1px solid var(--vscode-panel-border, #333);
    padding: 20px 0;
    overflow-y: auto;
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
  }

  nav .logo {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.95em;
    font-weight: 700;
    color: var(--vscode-foreground);
    padding: 0 16px 16px;
    border-bottom: 1px solid var(--vscode-panel-border, #333);
    margin-bottom: 8px;
    letter-spacing: 0.02em;
  }
  nav .logo img {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
  }

  nav a {
    display: flex;
    align-items: center;
    gap: 8px;
    /* O recuo perde os 2px que a borda esquerda ocupa, para o ícone do item
       ativo não deslizar para a direita ao ganhar a borda. */
    padding: 7px 16px 7px 14px;
    font-size: 0.98em;
    color: var(--vscode-foreground);
    text-decoration: none;
    cursor: pointer;
    border-left: 2px solid transparent;
    opacity: 0.7;
    transition: opacity 0.1s, border-color 0.1s;
  }
  /* O ícone herda a cor e a opacidade do item: acompanha ativo e hover sem
     precisar de regra própria para cada estado. */
  nav a svg {
    width: 16px;
    height: 16px;
    flex: 0 0 auto;
    fill: currentColor;
  }
  /* O rótulo cede primeiro quando a navegação aperta; o ícone permanece. */
  nav a span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  nav a:hover { opacity: 1; background: var(--vscode-list-hoverBackground, #ffffff10); }
  nav a.active { opacity: 1; border-left-color: var(--pp-accent); font-weight: 600; }

  main {
    flex: 1;
    overflow-y: auto;
    padding: 28px var(--pad-x) 24px;
    scroll-behavior: smooth;
  }

  .section { margin-bottom: 40px; scroll-margin-top: 28px; }
  /* Última seção: sem a margem inferior extra, evitando vão exagerado no fim. */
  .section:last-of-type { margin-bottom: 0; }

  h2 {
    font-size: 1.1em;
    font-weight: 700;
    color: var(--vscode-foreground);
    margin-bottom: 4px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--vscode-panel-border, #333);
  }

  .row {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    padding: 10px 0;
    border-bottom: 1px solid var(--vscode-panel-border, #1e1e1e);
  }
  .row:last-child { border-bottom: none; }

  .row-info { flex: 1; min-width: 0; }

  .row-label {
    font-weight: 500;
    font-size: 1em;
    margin-bottom: 3px;
  }

  .row-desc {
    font-size: 0.875em;
    color: var(--vscode-descriptionForeground);
    line-height: 1.5;
    margin-top: 2px;
  }

  .row-control {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    min-width: 200px;
    justify-content: flex-end;
  }

  /* Seleção de preset de formatação como cartões com preview visual. */
  .preset-header { padding: 14px 0 4px; }
  .preset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr));
    gap: 12px;
    padding: 10px 0 24px;
  }
  .preset-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    font: inherit;
    color: var(--vscode-foreground);
    transition: border-color 0.12s, background 0.12s;
  }
  .preset-card:hover { background: var(--vscode-list-hoverBackground, #ffffff10); }
  .preset-card.selected {
    border-color: var(--pp-accent);
    box-shadow: 0 0 0 1px var(--pp-accent);
  }
  .preset-preview {
    margin: 0;
    padding: 8px 10px;
    min-height: 72px;
    background: var(--vscode-editor-background);
    border-radius: 4px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.8em;
    line-height: 1.4;
    color: var(--vscode-editor-foreground, var(--vscode-foreground));
    white-space: pre;
    overflow: hidden;
    pointer-events: none;
  }
  /* Cada exemplo em sua linha, mas o fundo do <code> acompanha o texto: como
     bloco de largura total ele ia até a borda da coluna, e o exemplo do padrão
     logo abaixo — mais curto — desenhava uma caixa visivelmente diferente. */
  .naming-preview {
    display: block;
    width: fit-content;
    max-width: 100%;
    white-space: pre;
    font-family: var(--vscode-editor-font-family, monospace);
    color: var(--vscode-textPreformat-foreground, var(--vscode-foreground));
    opacity: 0.85;
  }
  /* Fica FORA do <code>: ali dentro é código Pawn real, e um contador entre as
     linhas deixaria de ser código válido. */
  .naming-more {
    display: block;
    margin-top: 2px;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: 0.9em;
    color: var(--vscode-textLink-foreground, inherit);
    cursor: pointer;
    text-align: left;
  }
  .naming-more:hover { text-decoration: underline; }
  .exemplos-modal {
    border: 1px solid var(--vscode-widget-border, transparent);
    border-radius: 4px;
    padding: 12px 14px;
    max-width: min(90vw, 420px);
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    color: var(--vscode-foreground);
  }
  .exemplos-modal::backdrop { background: rgba(0, 0, 0, 0.45); }
  .exemplos-modal h3 { margin: 0 0 8px; font-size: 1em; }
  /* Rola quando são muitos, em vez de esticar a página. */
  .exemplos-modal ul {
    margin: 0;
    padding: 0;
    max-height: 45vh;
    overflow-y: auto;
    list-style: none;
  }
  .exemplos-modal li {
    padding: 2px 0;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .style-checks {
    display: grid;
    grid-template-columns: repeat(2, minmax(min(110px, 100%), 1fr));
    grid-auto-flow: column;
    grid-template-rows: repeat(3, auto);
    gap: 6px 8px;
    min-width: min(240px, 100%);
  }
  .style-badge { cursor: pointer; }
  .style-badge input { position: absolute; opacity: 0; width: 0; height: 0; }
  .style-badge span {
    display: block;
    text-align: center;
    font-size: 0.85em;
    padding: 4px 8px;
    border-radius: 12px;
    border: 1px solid var(--vscode-input-border, #555);
    opacity: 0.65;
    user-select: none;
    transition: background 0.12s, opacity 0.12s, border-color 0.12s;
  }
  .style-badge:hover span { opacity: 0.9; }
  .style-badge input:checked + span {
    opacity: 1;
    border-color: var(--pp-accent);
    background: var(--pp-accent);
    color: var(--pp-accent-fg);
  }
  .style-badge input:focus-visible + span {
    box-shadow: 0 0 0 2px var(--pp-accent);
  }
  /* O campo de padrão próprio fica sob as etiquetas da mesma categoria: é uma
     alternativa a elas, não um ajuste de outra seção. */
  /* O campo fecha a grade de etiquetas ocupando as duas colunas: é o mesmo
     grupo de critérios, e a linha da categoria não se divide. */
  .style-checks .regex-input {
    /* A grade preenche por coluna (3 linhas fixas), então o campo é colocado
       explicitamente numa quarta linha própria, cruzando as duas colunas — sem
       isso ele entraria como sexta etiqueta, ao lado das outras. */
    grid-row: 4;
    grid-column: 1 / -1;
    width: 100%;
    margin-top: 2px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.85em;
  }
  /* Só colore quando há o que dizer: vazio é o estado normal, não um erro. */
  .regex-input.invalid { border-color: var(--vscode-inputValidation-errorBorder, #be1100); }
  /* O exemplo do padrão é o mesmo trecho de código Pawn dos estilos embutidos
     (.naming-preview, de onde herda a aparência): as duas respondem à mesma
     pergunta e ficam na mesma coluna, uma sob a outra. */
  /* Sem overflow próprio: overflow != visible cria um contexto que encolhe a
     caixa até o conteúdo, e o fundo do <code> ficava mais curto que o do
     exemplo dos estilos logo acima. Os dois são o mesmo tipo de informação e
     têm de ter a mesma caixa; nomes de identificador cabem na coluna. */

  /* Seletor de cor: as amostras mostram a própria cor, e o "Automático" é
     texto porque não tem cor própria — ele segue o tema do editor. */
  .accent-picker { flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
  .accent-swatch { cursor: pointer; }
  .accent-swatch input { position: absolute; opacity: 0; width: 0; height: 0; }
  .accent-swatch > span {
    display: block;
    width: 22px; height: 22px;
    border-radius: 50%;
    background: var(--sw);
    border: 2px solid transparent;
    box-shadow: 0 0 0 1px var(--vscode-input-border, #555);
    transition: box-shadow 0.12s;
  }
  .accent-swatch.auto > span {
    width: auto; height: auto;
    border-radius: 11px;
    background: transparent;
    padding: 3px 10px;
    font-size: 0.85em;
    white-space: nowrap;
  }
  .accent-swatch:hover > span { box-shadow: 0 0 0 2px var(--vscode-descriptionForeground); }
  /* A marca de escolhido é um anel, não um preenchimento: a cor da amostra
     precisa continuar visível. */
  .accent-swatch input:checked + span,
  .accent-swatch input:focus-visible + span {
    box-shadow: 0 0 0 2px var(--vscode-foreground);
  }

  .naming-styles { padding: 10px 0; }
  .naming-styles > summary {
    cursor: pointer;
    list-style: none;
    padding: 2px 0;
    /* Grade de duas colunas: o chevron ocupa a primeira nas duas linhas, e a
       descrição alinha com o título sem depender de um recuo fixo. */
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 6px;
    align-items: center;
  }
  .naming-styles > summary::-webkit-details-marker { display: none; }
  /* Antes era o caractere '▸': o desenho vinha da fonte do sistema e destoava
     dos ícones da página, que são traços SVG de peso uniforme. */
  .naming-styles .disclosure {
    grid-row: 1 / 3;
    width: 16px;
    height: 16px;
    fill: currentColor;
    opacity: 1;
    transition: transform 0.15s;
  }
  .naming-styles[open] .disclosure { transform: rotate(90deg); }
  .naming-styles-title { font-weight: 600; }
  .naming-styles-desc { opacity: 0.7; font-size: 0.85em; }
  .naming-styles[open] > .naming-style-row:last-child { border-bottom: none; }
  .preset-name {
    font-size: 0.9em;
    font-weight: 600;
    text-align: center;
  }

  input[type="text"], input[type="number"], select {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px;
    padding: 5px 8px;
    font-family: inherit;
    font-size: inherit;
    width: 100%;
    outline: none;
    transition: border-color 0.1s;
  }
  input[type="text"]:focus, input[type="number"]:focus, select:focus {
    border-color: var(--pp-accent);
  }

  code {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.9em;
    background: var(--vscode-textCodeBlock-background, #ffffff18);
    border-radius: 3px;
    padding: 1px 4px;
  }

  .toggle {
    position: relative;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    user-select: none;
  }
  .toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
  .toggle-track {
    width: 36px; height: 20px;
    background: var(--vscode-input-border, #555);
    border-radius: 10px;
    transition: background 0.15s;
    flex-shrink: 0;
  }
  .toggle input:checked + .toggle-track {
    background: var(--pp-accent);
  }
  .toggle-thumb {
    position: absolute;
    top: 3px; left: 3px;
    width: 14px; height: 14px;
    background: #fff;
    border-radius: 50%;
    transition: left 0.15s;
    pointer-events: none;
  }
  .toggle input:checked ~ .toggle-thumb { left: 19px; }

  .array-editor { width: 100%; }
  .array-items { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }
  .array-item { display: flex; gap: 4px; align-items: center; }
  .array-item input { flex: 1; }
  .btn-remove {
    background: transparent;
    color: var(--vscode-descriptionForeground);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 3px;
    width: 26px; height: 26px;
    cursor: pointer;
    font-size: 0.9em;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    line-height: 1;
    transition: background 0.1s, color 0.1s;
  }
  .btn-remove:hover {
    background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
    color: var(--vscode-foreground);
    border-color: transparent;
  }
  .migrate-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    margin-bottom: 10px;
    border-radius: 4px;
    background: var(--vscode-inputValidation-warningBackground, rgba(255,200,0,0.1));
    border: 1px solid var(--vscode-inputValidation-warningBorder, #cc9900);
    font-size: 0.9em;
  }
  .migrate-banner span { flex: 1; }
  .btn-add, .btn-file {
    background: var(--pp-accent);
    color: var(--pp-accent-fg);
    border: none;
    border-radius: 3px;
    padding: 5px 12px;
    cursor: pointer;
    font-size: 0.9em;
    font-family: inherit;
    transition: background 0.1s;
  }
  .btn-add:hover { background: var(--pp-accent-hover); }

  .wide .row-control { min-width: 100%; margin-top: 8px; flex-direction: column; align-items: stretch; }
  .wide { flex-wrap: wrap; }

  .note {
    font-size: 0.875em;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 24px;
    padding: 8px 12px;
    border-left: 2px solid var(--pp-accent);
    background: var(--vscode-textBlockQuote-background, #ffffff08);
    border-radius: 0 3px 3px 0;
  }

${brandAnimationCss()}
${themeCss}
</style>
</head>
<body>

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
  <h3 id="exemplos-modal-titulo"></h3>
  <ul id="exemplos-modal-lista"></ul>
  <button type="button" id="exemplos-modal-fechar" data-i18n="fechar"></button>
</dialog>

<script>
const vscode = acquireVsCodeApi();
let _i18n = {};
const STYLE_OPTIONS = ['camelCase', 'snake_case', 'PascalCase', 'UPPER_CASE', 'Capitalized_Snake'];

function set(key, value) {
  vscode.postMessage({ type: 'set', key, value });
}

// Detecção automática ligada: o caminho manual é irrelevante (válido é usado,
// inválido/vazio cai na detecção), então o campo é ocultado.
function onAutoDetectChange(on) {
  set('compiler.autoDetect', on);
  toggleCompilerPath(on);
}
function toggleCompilerPath(autoOn) {
  const row = document.querySelector('.compiler-path-row');
  if (row) row.style.display = autoOn ? 'none' : '';
}

${brandAnimationJs()}

window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'state') {
    if (msg.i18n) applyI18n(msg.i18n);
    applyState(msg.payload);
    const banner = document.getElementById('naming-migrate-banner');
    if (banner) banner.style.display = msg.hasInlineNaming ? '' : 'none';
    // Recalcula o espaçador após o conteúdo assentar.
    requestAnimationFrame(sizeScrollSpacer);
  }
});

function migrateNaming() {
  vscode.postMessage({ type: 'migrateNaming' });
}

vscode.postMessage({ type: 'requestState' });

function applyI18n(i18n) {
  _i18n = i18n;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (i18n[key] !== undefined) el.textContent = i18n[key];
  });
  // Campos sem rótulo visível levam o nome em aria-label, que textContent não
  // alcança.
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria');
    if (i18n[key] !== undefined) el.setAttribute('aria-label', i18n[key]);
  });

  const note = document.getElementById('note-text');
  if (note) {
    note.innerHTML = i18n.noteText
      .replace('.pawnpro/config.json', '<code>.pawnpro/config.json</code>')
      .replace('~/.pawnpro/config.json', '<code>~/.pawnpro/config.json</code>');
  }
}

function applyState(cfg) {
  applyBrandAnimation(cfg.ui?.animateTitle ?? false);
  setCheck('ui-animateTitle', cfg.ui?.animateTitle ?? false);
  setInput('compiler-path',     cfg.compiler?.path ?? '');
  const autoDetect = cfg.compiler?.autoDetect ?? true;
  setCheck('compiler-autoDetect', autoDetect);
  toggleCompilerPath(autoDetect);
  setArray('compiler-args-editor', 'compiler.args', cfg.compiler?.args ?? []);
  setArray('includePaths-editor',  'includePaths',   cfg.includePaths ?? []);
  setCheck('build-showCommand',  cfg.build?.showCommand ?? false);
  setSelect('output-encoding',   cfg.output?.encoding ?? 'windows1252');
  setCheck('analysis-warnUnusedInInc',          cfg.analysis?.warnUnusedInInc ?? false);
  setCheck('analysis-suppressDiagnosticsInInc', cfg.analysis?.suppressDiagnosticsInInc ?? false);
  setSelect('analysis-sdk-platform', cfg.analysis?.sdk?.platform ?? 'omp');
  setInput('analysis-sdk-filePath',  cfg.analysis?.sdk?.filePath ?? '');
  const fmtPreset = cfg.format?.preset ?? 'allman';
  markPresetCard(fmtPreset);
  setSelect('format-braceStyle',            cfg.format?.braceStyle ?? 'nextLine');
  setCheck('format-spaceAroundOperators',   cfg.format?.spaceAroundOperators ?? true);
  setCheck('format-emptyBlockSameLine',     cfg.format?.emptyBlockSameLine ?? true);
  setCheck('format-preserveArrayAlignment', cfg.format?.preserveArrayAlignment ?? false);
  toggleFormatCustom(fmtPreset);
  const naming = cfg.analysis?.naming ?? {};
  setCheck('naming-enabled', naming.enabled ?? false);
  setInput('naming-minLength', naming.minLength ?? 2);
  setInput('naming-maxListMb', Math.round((naming.maxListFileBytes ?? 33554432) / 1048576));
  for (const cat of ['functions', 'globals', 'locals', 'constants', 'macros', 'parameters']) {
    const accepted = Array.isArray(naming.style?.[cat]) ? naming.style[cat] : [];
    for (const st of STYLE_OPTIONS) {
      setCheck('naming-style-' + cat + '-' + st, accepted.includes(st));
    }
    // O padrão próprio é o item entre barras; os demais são os embutidos.
    setInput('naming-regex-' + cat, accepted.find(isRegexRule) ?? '');
    updateRegexStatus(cat, true);
    updateNamingPreview(cat, accepted);
  }
  setSelect('syntax-scheme',        cfg.syntax?.scheme ?? 'none');
  setCheck('syntax-applyOnStartup', cfg.syntax?.applyOnStartup ?? false);
  const accent = cfg.ui?.accent ?? '';
  const accentRadio = document.querySelector('input[name="accent"][value="' + accent + '"]');
  if (accentRadio) accentRadio.checked = true;
  setCheck('ui-showIncludePaths',   cfg.ui?.showIncludePaths ?? false);
  setSelect('ui-locale',            cfg.ui?.locale ?? '');
  setSelect('locale',               cfg.locale ?? '');
  setSelect('server-type',          cfg.server?.type ?? 'auto');
  setInput('server-path',           cfg.server?.path ?? '');
  setInput('server-cwd',            cfg.server?.cwd ?? '\${workspaceFolder}');
  setArray('server-args-editor',    'server.args', cfg.server?.args ?? []);
  setArray('server-sensitive-editor', 'server.history.sensitiveCommands', cfg.server?.history?.sensitiveCommands ?? []);

  setCheck('server-clearOnStart',   cfg.server?.clearOnStart ?? true);
  setCheck('server-history-enabled', cfg.server?.history?.enabled ?? true);
  setSelect('server-output-follow', cfg.server?.output?.follow ?? 'visible');
  setInput('server-logPath',        cfg.server?.logPath ?? '');
  setSelect('server-logEncoding',   cfg.server?.logEncoding ?? 'windows1252');
}

function setInput(id, value) {
  const el = document.getElementById(id);
  if (el && document.activeElement !== el) el.value = value;
}
function setCheck(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = !!value;
}
function setSelect(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  for (const opt of el.options) opt.selected = opt.value === value;
}
// Seleção de preset via cartão: persiste, marca o cartão e mostra/oculta os
// ajustes finos (que só valem no 'custom').
function selectPreset(preset) {
  set('format.preset', preset);
  markPresetCard(preset);
  toggleFormatCustom(preset);
}

// Realça o cartão do preset ativo.
function markPresetCard(preset) {
  for (const card of document.querySelectorAll('.preset-card')) {
    card.classList.toggle('selected', card.getAttribute('data-preset') === preset);
  }
}

// Ajustes finos de formatação só fazem sentido no preset 'custom'; nos presets
// prontos eles são definidos pela engine, então ficam ocultos.
function toggleFormatCustom(preset) {
  const show = preset === 'custom';
  for (const el of document.querySelectorAll('.format-custom')) {
    el.style.display = show ? '' : 'none';
  }
}

// Palavras-base por categoria — identificadores temáticos do mundo SA-MP/RP em
// vez de um genérico "player_score" repetido em toda categoria. Cada item é uma
// lista de palavras minúsculas que styleSample combina conforme a convenção.
const NAMING_WORDS = {
  functions:  ['carregar', 'lixeiras'],
  globals:    ['total', 'jogadores'],
  locals:     ['caixa', 'eletronico'],
  constants:  ['vida', 'maxima'],
  macros:     ['nome', 'servidor'],
  parameters: ['prot', 'z'],
};

// Combina as palavras-base de uma categoria na convenção de caixa escolhida,
// para ilustrar concretamente cada estilo no preview.
function styleSample(category, style) {
  const words = NAMING_WORDS[category] ?? ['player', 'score'];
  const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
  switch (style) {
    case 'camelCase':  return words.map((w, i) => i === 0 ? w : cap(w)).join('');
    case 'snake_case': return words.join('_');
    case 'PascalCase': return words.map(cap).join('');
    case 'UPPER_CASE': return words.join('_').toUpperCase();
    case 'Capitalized_Snake': return words.map(cap).join('_');
    default:           return null; // estilo desconhecido — ignorado no preview
  }
}

// Cada categoria mostra um trecho de código Pawn REAL daquela categoria, com o
// identificador no estilo escolhido — assim fica claro o que a regra pega.
// O marcador chaveado é substituído pelo identificador de exemplo.
const NAMING_TEMPLATE = {
  functions:  'stock {}() { }',
  globals:    'new {};',
  locals:     'new {} = 0;',
  constants:  'const {} = 100;',
  macros:     '#define {} ...',
  parameters: 'foo({})',
};

// Lê os critérios de uma categoria: as etiquetas marcadas mais o padrão
// próprio, quando houver um válido. A engine aceita o nome que casar com
// QUALQUER item da lista, então os dois convivem.
function readAcceptedStyles(category) {
  const styles = STYLE_OPTIONS.filter(st => {
    const el = document.getElementById('naming-style-' + category + '-' + st);
    return el && el.checked;
  });
  const input = document.getElementById('naming-regex-' + category);
  const raw = input ? input.value.trim() : '';
  if (raw && isRegexRule(raw) && compileRule(raw)) styles.push(raw);
  return styles;
}

// Marca/desmarca um estilo aceito e persiste a lista resultante da categoria.
function toggleNamingStyle(category, style, checked) {
  const accepted = readAcceptedStyles(category);
  set('analysis.naming.style.' + category, accepted);
  updateNamingPreview(category, accepted);
}

// Um critério é regex quando vem entre barras — mesma convenção da engine.
function isRegexRule(v) {
  return typeof v === 'string' && v.length >= 2 && v.startsWith('/') && v.endsWith('/');
}

// Compila o padrão como a engine faz: âncora ^(?:...)$ para descrever o nome
// inteiro, e o agrupamento impede que uma alternância ancore só os extremos.
// Devolve null se o padrão for inválido.
//
// Limite de tamanho: o motor de regex do JS faz backtracking, então um padrão
// como (a+)+ leva tempo exponencial no comprimento da entrada. A engine (crate
// regex do Rust) tem tempo linear garantido e não se importa; quem precisa se
// defender é esta pré-visualização. Um padrão de nome de identificador não
// precisa ser longo.
const MAX_PATTERN_LEN = 200;

function compileRule(raw) {
  const body = raw.slice(1, -1);
  if (!body || body.length > MAX_PATTERN_LEN) return null;
  try {
    return new RegExp('^(?:' + body + ')$');
  } catch {
    return null;
  }
}

// Comprimento máximo do nome testado. É o limite que de fato protege: uma vez
// iniciado, re.test roda até o fim — não há como interromper JS de fora —, e
// o custo do backtracking cresce com o tamanho da ENTRADA. Cortá-la é o que
// impede o congelamento; o orçamento abaixo só evita somar muitos testes caros.
// Nome de identificador não passa disto.
const MAX_PROBE_LEN = 40;

// Testa um nome contra o padrão. Só a pré-visualização passa por aqui: um
// padrão patológico deixa de responder em vez de travar a página. O resultado
// que vale é sempre o da engine, cujo motor tem tempo linear garantido.
function testWithBudget(re, name, budget) {
  if (budget.left <= 0 || name.length > MAX_PROBE_LEN) return null;
  const t0 = Date.now();
  let hit;
  try {
    hit = re.test(name);
  } catch {
    return null;
  }
  budget.left -= Date.now() - t0;
  return hit;
}

// Nomes testados contra o padrão do usuário: os cinco estilos embutidos daquela
// categoria, mais variantes com prefixo, que é o caso real mais comum.
function regexProbes(category, raw) {
  const out = [];
  for (const st of STYLE_OPTIONS) {
    const sample = styleSample(category, st);
    if (sample) out.push(sample);
  }
  const base = out[0];
  if (!base) return out;
  // Variantes do nome-base. Um padrão pode exigir maiúscula logo após o
  // prefixo (/^g_[A-Z].../) ou só minúsculas (/^m_[a-z]+$/): com uma única
  // base em camelCase, nenhum dos dois casava e o campo ficava sem exemplo.
  const bases = [base, base.charAt(0).toUpperCase() + base.slice(1), base.toLowerCase()];
  // O prefixo sai do próprio padrão quando ele começa por um literal (o caso
  // comum: /^g_[a-z].../). Sem isso o exemplo prefixado usaria uma letra fixa
  // e não casaria com o padrão que o usuário acabou de escrever.
  // Teto no prefixo: é por ele que o padrão do usuário alonga o nome testado,
  // e entrada longa é o que torna caro um padrão com backtracking.
  for (const prefix of literalPrefixes(raw)) {
    for (const b of bases) {
      const cand = prefix + b;
      if (!out.includes(cand)) out.push(cand);
    }
  }
  for (const b of bases) {
    if (!out.includes('_' + b)) out.push('_' + b);
  }
  return out;
}

// Prefixos literais possíveis no início do padrão, antes de qualquer
// metacaractere. Lista vazia quando não há nenhum — aí não há prefixo a
// exemplificar.
//
// Com alternância no início (/^(g|s)_.../), cada ramo é um prefixo: antes só se
// lia literal contíguo, a alternância devolvia '' e nenhuma sonda ganhava
// prefixo, deixando o campo sem exemplo.
function literalPrefixes(raw) {
  if (!isRegexRule(raw)) return [];
  let body = raw.slice(1, -1);
  if (body.startsWith('^')) body = body.slice(1);

  const grupo = /^\(([^()|]+(?:\|[^()|]+)+)\)/.exec(body);
  if (grupo) {
    // O que vem depois do grupo pode ser literal também: em (g|s)_ o
    // sublinhado pertence aos dois ramos.
    const resto = literalInicial(body.slice(grupo[0].length));
    const vistos = [];
    for (const ramo of grupo[1].split('|')) {
      const p = (ramo + resto).slice(0, 12);
      if (p && !vistos.includes(p)) vistos.push(p);
    }
    return vistos;
  }

  const lit = literalInicial(body).slice(0, 12);
  return lit ? [lit] : [];
}

// Literal contíguo no início de um trecho de padrão, sem metacaracteres.
function literalInicial(body) {
  const m = /^[A-Za-z0-9_]+/.exec(body);
  if (!m) return '';
  // Um literal seguido de quantificador pertence ao quantificador, não ao
  // prefixo: em ab* o b é opcional.
  const lit = m[0];
  const next = body.charAt(lit.length);
  return '*?+{'.includes(next) ? lit.slice(0, -1) : lit;
}

// Mostra se o padrão é válido e quais exemplos ele aceita — o usuário vê o
// efeito da regra antes de salvá-la.
//
// O parâmetro settled distingue quem está digitando de quem terminou: na
// digitação o texto passa por estados incompletos (a barra final é o último
// caractere), e acusá-los como erro a cada tecla seria ruído. O que não
// pode acontecer em nenhum dos dois casos é o preview mostrar exemplos de um
// padrão diferente do que está no campo.
function updateRegexStatus(category, settled) {
  const input = document.getElementById('naming-regex-' + category);
  if (!input) return;
  const raw = input.value.trim();

  // A validação marca o CAMPO; o exemplo do padrão sai junto dos demais, no
  // preview da categoria. Enquanto se digita não há erro a apontar: o texto
  // passa por estados incompletos até a barra final.
  // Só erro de FORMA: falta de barras e regex que não compila. Não casar com os
  // exemplos não é erro — as sondas são nomes que a página inventa para ilustrar
  // o padrão, não uma definição do que é válido. Um padrão correto que não bata
  // com nenhuma delas era marcado em vermelho, acusando o usuário de um
  // problema que é da lista de sondas.
  let erro = '';
  if (raw && settled) {
    if (!isRegexRule(raw)) erro = _i18n.namingRegexNeedsSlashes;
    else if (!compileRule(raw)) erro = _i18n.namingRegexInvalid;
  }
  input.classList.toggle('invalid', erro !== '');
  input.title = erro;
}

// Enquanto digita: mostra o efeito do que já é um padrão completo, sem gravar
// a cada tecla e sem acusar como erro o que ainda está pela metade.
function onNamingRegexInput(category) {
  updateRegexStatus(category, false);
  // O exemplo acompanha a digitação: readAcceptedStyles só inclui o padrão
  // quando ele já é válido, então enquanto está pela metade a linha some.
  updateNamingPreview(category, readAcceptedStyles(category));
}

// Ao confirmar: grava junto dos estilos marcados. Um padrão inválido não é
// persistido — gravá-lo faria a engine descartá-lo em silêncio, e o usuário
// ficaria com uma regra que não existe.
function commitNamingRegex(category) {
  const input = document.getElementById('naming-regex-' + category);
  if (!input) return;
  const raw = input.value.trim();
  // Agora sim vale apontar o que está errado: o usuário terminou de escrever.
  updateRegexStatus(category, true);
  if (raw && (!isRegexRule(raw) || !compileRule(raw))) return;
  const accepted = readAcceptedStyles(category);
  set('analysis.naming.style.' + category, accepted);
  updateNamingPreview(category, accepted);
}

// Pede ao host para abrir o arquivo de lista (.ban / .allow), criando-o se
// ainda não existir.
function openNamingFile(which) {
  vscode.postMessage({ type: 'openNamingFile', which });
}

// Mostra um exemplo de código por estilo aceito (um por linha). Vazio = oculta.
function updateNamingPreview(category, accepted) {
  const el = document.getElementById('naming-preview-' + category);
  if (!el) return;
  const tpl = NAMING_TEMPLATE[category] ?? '{}';
  // Uma linha por critério aceito, embutido ou padrão próprio: são a mesma
  // configuração e saem na mesma caixa. Para o regex o nome não se deriva do
  // estilo — vem do primeiro exemplo que o padrão aceita.
  const lines = (accepted ?? [])
    .map(st => (isRegexRule(st) ? regexSample(category, st) : styleSample(category, st)))
    .filter(Boolean)
    .map(ident => tpl.replace('{}', ident));
  el.hidden = lines.length === 0;
  el.textContent = lines.join('\\n');

  // A caixa mostra um exemplo por critério. Um padrão costuma aceitar mais de
  // um nome, e o botão dá acesso à lista inteira — sem ele nada revelaria que
  // /^(g|s)_.../ também aceita nomes com s_.
  const more = document.getElementById('naming-more-' + category);
  if (!more) return;
  const padrao = (accepted ?? []).find(st => isRegexRule(st));
  const total = padrao ? regexSamples(category, padrao).length : 0;
  more.hidden = total < 2;
  if (total < 2) return;
  more.textContent = _i18n.namingAlsoAccepts + ' (' + total + ')';
  more.onclick = () => mostrarExemplosDoPadrao(category, padrao);
}

// Primeiro nome de exemplo que o padrão aceita, ou null se nenhum passa (ou se
// o padrão é caro demais para testar aqui — a análise real é da engine).
function regexSample(category, raw) {
  return regexSamples(category, raw)[0] ?? null;
}

// Todos os nomes-sonda que o padrão aceita, na ordem em que foram gerados.
//
// O preview usa o primeiro como exemplo; os demais alimentam a lista completa,
// que é o que mostra o alcance real de um padrão — /^(g|s)_.../ aceita nomes
// com s_ e o exemplo sozinho nunca deixaria isso claro.
function regexSamples(category, raw) {
  const re = compileRule(raw);
  if (!re) return [];
  const budget = { left: 50 };
  const hits = [];
  for (const probe of regexProbes(category, raw)) {
    const hit = testWithBudget(re, probe, budget);
    // Orçamento estourado: devolve o que já se sabe em vez de descartar tudo.
    if (hit === null) break;
    if (hit) hits.push(probe);
  }
  return hits;
}

// Abre a lista de exemplos de UM padrão. Recebe o padrão e a categoria; a
// lista sai daí, não de quem chama.
function mostrarExemplosDoPadrao(category, raw) {
  const dlg = document.getElementById('exemplos-modal');
  const h = document.getElementById('exemplos-modal-titulo');
  const ul = document.getElementById('exemplos-modal-lista');
  const fechar = document.getElementById('exemplos-modal-fechar');
  if (!dlg || !h || !ul) return;
  h.textContent = raw;
  ul.textContent = '';
  for (const nome of regexSamples(category, raw)) {
    const li = document.createElement('li');
    li.textContent = nome;
    ul.appendChild(li);
  }
  if (fechar) fechar.onclick = () => dlg.close();
  dlg.showModal();
}

const arrayState = {};

function setArray(containerId, key, items) {
  arrayState[key] = [...items];
  renderArray(containerId, key);
}

function renderArray(containerId, key) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const items = arrayState[key] ?? [];
  container.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'array-items';

  items.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'array-item';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = item;
    input.addEventListener('change', () => {
      arrayState[key][idx] = input.value;
      set(key, [...arrayState[key]]);
    });

    const del = document.createElement('button');
    del.className = 'btn-remove';
    del.title = _i18n.btnRemove || 'Remove';
    del.textContent = 'x';
    del.addEventListener('click', () => {
      arrayState[key].splice(idx, 1);
      set(key, [...arrayState[key]]);
      renderArray(containerId, key);
    });

    row.appendChild(input);
    row.appendChild(del);
    list.appendChild(row);
  });

  const add = document.createElement('button');
  add.className = 'btn-add';
  add.textContent = _i18n.btnAdd || '+ Add';
  add.addEventListener('click', () => {
    arrayState[key].push('');
    renderArray(containerId, key);
    const inputs = container.querySelectorAll('input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  container.appendChild(list);
  container.appendChild(add);
}

const sections = document.querySelectorAll('.section');
const navLinks = document.querySelectorAll('.nav-link');
const mainEl = document.querySelector('main');

// Espaçador final dimensionado para a última seção poder subir ao topo (e ser
// destacada na nav) sem deixar um vão exagerado. = altura visível − altura da
// última seção − folga; nunca negativo.
function sizeScrollSpacer() {
  const spacer = document.getElementById('scroll-spacer');
  const last = sections[sections.length - 1];
  if (!spacer || !last) return;
  const need = mainEl.clientHeight - last.offsetHeight - 28;
  spacer.style.height = Math.max(0, need) + 'px';
}
window.addEventListener('resize', sizeScrollSpacer);

navLinks.forEach(a => {
  a.addEventListener('click', () => {
    const id = a.getAttribute('data-target');
    const target = document.getElementById(id);
    if (target) mainEl.scrollTo({ top: target.offsetTop - 28, behavior: 'smooth' });
  });
});

mainEl.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(s => {
    if (s.offsetTop - mainEl.scrollTop <= 60) current = s.id;
  });
  navLinks.forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-target') === current);
  });
});
</script>
</body>
</html>`;
}
