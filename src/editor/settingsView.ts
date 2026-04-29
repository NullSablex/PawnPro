import * as vscode from 'vscode';
import { PawnProConfigManager } from '../core/config.js';
import { msg } from './nls.js';

let panel: vscode.WebviewPanel | undefined;

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
        { enableScripts: true, retainContextWhenHidden: true },
      );

      panel.webview.html = getHtml();
      sendState(panel, config);

      const unsub = config.onChange(() => sendState(panel!, config));

      panel.webview.onDidReceiveMessage((message: unknown) => {
        if (!message || typeof message !== 'object') return;
        handleMessage(message as Record<string, unknown>, config);
      });

      panel.onDidDispose(() => {
        unsub.dispose();
        panel = undefined;
      });
    }),
  );
}

function handleMessage(m: Record<string, unknown>, config: PawnProConfigManager): void {
  switch (m['type']) {
    case 'set': {
      const key = m['key'];
      const value = m['value'];
      if (typeof key !== 'string') break;
      config.setKey(key, value, 'project');
      break;
    }
    case 'requestState':
      if (panel) sendState(panel, config);
      break;
  }
}

function buildI18n() {
  const s = msg.settings;
  return {
    noteText:              s.noteText(),
    navCompiler:           s.navCompiler(),
    navIncludes:           s.navIncludes(),
    navBuild:              s.navBuild(),
    navAnalysis:           s.navAnalysis(),
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
    encodingWin1252:       s.encodingWin1252(),
    encodingUtf8:          s.encodingUtf8(),
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
    uiLocale:                    s.uiLocale(),
    uiLocaleDesc:                s.uiLocaleDesc(),
    localeAuto:                  s.localeAuto(),
    localePtBr:                  s.localePtBr(),
    localeEn:                    s.localeEn(),
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

function sendState(p: vscode.WebviewPanel, config: PawnProConfigManager): void {
  const cfg = config.getAll();
  p.webview.postMessage({ type: 'state', payload: cfg, i18n: buildI18n() });
}

function getHtml(): string {
  return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PawnPro</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

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
    font-size: 0.95em;
    font-weight: 700;
    color: var(--vscode-foreground);
    padding: 0 16px 16px;
    border-bottom: 1px solid var(--vscode-panel-border, #333);
    margin-bottom: 8px;
    letter-spacing: 0.02em;
  }

  nav a {
    display: block;
    padding: 7px 16px;
    font-size: 0.93em;
    color: var(--vscode-foreground);
    text-decoration: none;
    border-left: 2px solid transparent;
    opacity: 0.7;
    transition: opacity 0.1s, border-color 0.1s;
  }
  nav a:hover { opacity: 1; background: var(--vscode-list-hoverBackground, #ffffff10); }
  nav a.active { opacity: 1; border-left-color: var(--vscode-focusBorder, #007acc); font-weight: 600; }

  main {
    flex: 1;
    overflow-y: auto;
    padding: 28px 36px 56px;
    scroll-behavior: smooth;
  }

  .section { margin-bottom: 40px; }

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
    border-color: var(--vscode-focusBorder, #007acc);
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
    background: var(--vscode-button-background, #007acc);
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
  .btn-add {
    background: var(--vscode-button-background, #007acc);
    color: var(--vscode-button-foreground, #fff);
    border: none;
    border-radius: 3px;
    padding: 5px 12px;
    cursor: pointer;
    font-size: 0.9em;
    font-family: inherit;
    transition: background 0.1s;
  }
  .btn-add:hover { background: var(--vscode-button-hoverBackground, #0062a3); }

  .wide .row-control { min-width: 100%; margin-top: 8px; flex-direction: column; align-items: stretch; }
  .wide { flex-wrap: wrap; }

  .note {
    font-size: 0.875em;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 24px;
    padding: 8px 12px;
    border-left: 2px solid var(--vscode-focusBorder, #007acc);
    background: var(--vscode-textBlockQuote-background, #ffffff08);
    border-radius: 0 3px 3px 0;
  }
</style>
</head>
<body>

<nav>
  <div class="logo">PawnPro</div>
  <a href="#compilador" class="nav-link active" data-i18n="navCompiler"></a>
  <a href="#includes"   class="nav-link" data-i18n="navIncludes"></a>
  <a href="#build"      class="nav-link" data-i18n="navBuild"></a>
  <a href="#analise"    class="nav-link" data-i18n="navAnalysis"></a>
  <a href="#sintaxe"    class="nav-link" data-i18n="navSyntax"></a>
  <a href="#interface"  class="nav-link" data-i18n="navInterface"></a>
  <a href="#servidor"   class="nav-link" data-i18n="navServer"></a>
</nav>

<main>

<p class="note" id="note-text"></p>

<div class="section" id="compilador">
  <h2 data-i18n="navCompiler"></h2>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="compilerPath"></div>
      <div class="row-desc" data-i18n="compilerPathDesc"></div>
    </div>
    <div class="row-control" style="min-width:280px">
      <input type="text" id="compiler-path" placeholder="ex: C:/pawno/pawncc.exe"
        onchange="set('compiler.path', this.value.trim())">
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="compilerAuto"></div>
      <div class="row-desc" data-i18n="compilerAutoDesc"></div>
    </div>
    <div class="row-control">
      <label class="toggle">
        <input type="checkbox" id="compiler-autoDetect" onchange="set('compiler.autoDetect', this.checked)">
        <span class="toggle-track"></span>
        <span class="toggle-thumb"></span>
      </label>
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
    <div class="row-control" style="min-width:180px">
      <select id="output-encoding" onchange="set('output.encoding', this.value)">
        <option value="windows1252" data-i18n="encodingWin1252"></option>
        <option value="utf8"        data-i18n="encodingUtf8"></option>
        <option value="latin1"      data-i18n="encodingLatin1"></option>
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
    <div class="row-control" style="min-width:160px">
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
    <div class="row-control" style="min-width:280px">
      <input type="text" id="analysis-sdk-filePath" placeholder="\${workspaceFolder}/pawno/include/a_samp.inc"
        onchange="set('analysis.sdk.filePath', this.value.trim())">
    </div>
  </div>
</div>

<div class="section" id="sintaxe">
  <h2 data-i18n="navSyntax"></h2>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="syntaxScheme"></div>
      <div class="row-desc" data-i18n="syntaxSchemeDesc"></div>
    </div>
    <div class="row-control" style="min-width:220px">
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
      <div class="row-label" data-i18n="uiLocale"></div>
      <div class="row-desc" data-i18n="uiLocaleDesc"></div>
    </div>
    <div class="row-control" style="min-width:200px">
      <select id="locale" onchange="set('locale', this.value)">
        <option value=""      data-i18n="localeAuto"></option>
        <option value="pt-BR" data-i18n="localePtBr"></option>
        <option value="en"    data-i18n="localeEn"></option>
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
    <div class="row-control" style="min-width:180px">
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
    <div class="row-control" style="min-width:280px">
      <input type="text" id="server-path" placeholder="\${workspaceFolder}/samp-server.exe"
        onchange="set('server.path', this.value.trim())">
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="serverCwd"></div>
      <div class="row-desc" data-i18n="serverCwdDesc"></div>
    </div>
    <div class="row-control" style="min-width:280px">
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
      <div class="row-label" data-i18n="serverFollowLog"></div>
      <div class="row-desc" data-i18n="serverFollowLogDesc"></div>
    </div>
    <div class="row-control" style="min-width:180px">
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
    <div class="row-control" style="min-width:280px">
      <input type="text" id="server-logPath" placeholder="\${workspaceFolder}/server_log.txt"
        onchange="set('server.logPath', this.value.trim())">
    </div>
  </div>
  <div class="row">
    <div class="row-info">
      <div class="row-label" data-i18n="serverLogEncoding"></div>
      <div class="row-desc" data-i18n="serverLogEncodingDesc"></div>
    </div>
    <div class="row-control" style="min-width:180px">
      <select id="server-logEncoding" onchange="set('server.logEncoding', this.value)">
        <option value="windows1252" data-i18n="encodingWin1252"></option>
        <option value="utf8"        data-i18n="encodingUtf8"></option>
        <option value="latin1"      data-i18n="encodingLatin1"></option>
      </select>
    </div>
  </div>
</div>

</main>

<script>
const vscode = acquireVsCodeApi();
let _i18n = {};

function set(key, value) {
  vscode.postMessage({ type: 'set', key, value });
}

window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'state') {
    if (msg.i18n) applyI18n(msg.i18n);
    applyState(msg.payload);
  }
});

vscode.postMessage({ type: 'requestState' });

function applyI18n(i18n) {
  _i18n = i18n;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (i18n[key] !== undefined) el.textContent = i18n[key];
  });

  const note = document.getElementById('note-text');
  if (note) {
    note.innerHTML = i18n.noteText
      .replace('.pawnpro/config.json', '<code>.pawnpro/config.json</code>')
      .replace('~/.pawnpro/config.json', '<code>~/.pawnpro/config.json</code>');
  }
}

function applyState(cfg) {
  setInput('compiler-path',     cfg.compiler?.path ?? '');
  setCheck('compiler-autoDetect', cfg.compiler?.autoDetect ?? true);
  setArray('compiler-args-editor', 'compiler.args', cfg.compiler?.args ?? []);
  setArray('includePaths-editor',  'includePaths',   cfg.includePaths ?? []);
  setCheck('build-showCommand',  cfg.build?.showCommand ?? false);
  setSelect('output-encoding',   cfg.output?.encoding ?? 'windows1252');
  setCheck('analysis-warnUnusedInInc',          cfg.analysis?.warnUnusedInInc ?? false);
  setCheck('analysis-suppressDiagnosticsInInc', cfg.analysis?.suppressDiagnosticsInInc ?? false);
  setSelect('analysis-sdk-platform', cfg.analysis?.sdk?.platform ?? 'omp');
  setInput('analysis-sdk-filePath',  cfg.analysis?.sdk?.filePath ?? '');
  setSelect('syntax-scheme',        cfg.syntax?.scheme ?? 'none');
  setCheck('syntax-applyOnStartup', cfg.syntax?.applyOnStartup ?? false);
  setCheck('ui-showIncludePaths',   cfg.ui?.showIncludePaths ?? false);
  setSelect('locale',               cfg.locale ?? '');
  setSelect('server-type',          cfg.server?.type ?? 'auto');
  setInput('server-path',           cfg.server?.path ?? '');
  setInput('server-cwd',            cfg.server?.cwd ?? '\${workspaceFolder}');
  setArray('server-args-editor',    'server.args', cfg.server?.args ?? []);
  setCheck('server-clearOnStart',   cfg.server?.clearOnStart ?? true);
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

navLinks.forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const id = a.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (target) mainEl.scrollTo({ top: target.offsetTop - 16, behavior: 'smooth' });
  });
});

mainEl.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(s => {
    if (s.offsetTop - mainEl.scrollTop <= 60) current = s.id;
  });
  navLinks.forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === '#' + current);
  });
});
</script>
</body>
</html>`;
}
