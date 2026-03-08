import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
const VERSION_KEY = 'pawnpro.lastSeenVersion';
function getVersion(context) {
    return context.extension.packageJSON.version;
}
export function registerWhatsNew(context) {
    context.subscriptions.push(vscode.commands.registerCommand('pawnpro.whatsNew', () => showPanel(context)));
    const version = getVersion(context);
    const lastSeen = context.globalState.get(VERSION_KEY);
    if (lastSeen !== version) {
        void context.globalState.update(VERSION_KEY, version);
        showPanel(context);
    }
}
function showPanel(context) {
    const version = getVersion(context);
    const panel = vscode.window.createWebviewPanel('pawnpro.whatsNew', `PawnPro — O que há de novo`, vscode.ViewColumn.One, {
        enableScripts: false,
        retainContextWhenHidden: false,
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'images'))],
    });
    panel.webview.html = buildHtml(context, panel.webview, version);
}
/* ─── Read and parse CHANGELOG.md ──────────────────────────────── */
/**
 * Extracts the section for `version` from the changelog.
 * Matches lines starting with `## [version]` (Keep a Changelog format).
 */
function extractSection(changelogPath, version) {
    let raw;
    try {
        raw = fs.readFileSync(changelogPath, 'utf8');
    }
    catch {
        return '';
    }
    const lines = raw.split(/\r?\n/);
    const sectionLines = [];
    let inside = false;
    for (const line of lines) {
        if (/^##\s*\[/.test(line)) {
            if (inside)
                break;
            // Match [version] or [version-suffix] (e.g. [2.1.0-beta])
            if (line.includes(`[${version}]`))
                inside = true;
            continue;
        }
        if (inside)
            sectionLines.push(line);
    }
    return sectionLines.join('\n').trim();
}
/* ─── Minimal markdown-to-HTML (Keep a Changelog subset) ───────── */
function mdToHtml(md) {
    const lines = md.split(/\r?\n/);
    const out = [];
    let inList = false;
    const inline = (s) => s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
    const closeList = () => {
        if (inList) {
            out.push('</ul>');
            inList = false;
        }
    };
    for (const raw of lines) {
        const line = raw.trimEnd();
        if (!line) {
            closeList();
            out.push('');
            continue;
        }
        // horizontal rule — skip
        if (/^[-*_]{3,}\s*$/.test(line)) {
            closeList();
            continue;
        }
        // ### sub-heading → section label
        if (/^###\s+/.test(line)) {
            closeList();
            out.push(`<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`);
            continue;
        }
        // ## heading (shouldn't appear inside extracted section, but guard anyway)
        if (/^##\s+/.test(line)) {
            closeList();
            out.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`);
            continue;
        }
        // list item (- or *)
        if (/^[-*]\s+/.test(line)) {
            if (!inList) {
                out.push('<ul>');
                inList = true;
            }
            out.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`);
            continue;
        }
        closeList();
        out.push(`<p>${inline(line)}</p>`);
    }
    closeList();
    return out.join('\n');
}
/* ─── HTML shell ────────────────────────────────────────────────── */
function buildHtml(context, webview, version) {
    // vsce may lowercase the filename; try both variants
    const changelogPath = [
        path.join(context.extensionPath, 'CHANGELOG.md'),
        path.join(context.extensionPath, 'changelog.md'),
    ].find(p => fs.existsSync(p)) ?? path.join(context.extensionPath, 'CHANGELOG.md');
    const sectionMd = extractSection(changelogPath, version);
    const sectionHtml = sectionMd
        ? mdToHtml(sectionMd)
        : '<p>Nenhum registro de mudanças encontrado para esta versão.</p>';
    const logoUri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'images', 'logo.png')));
    return /* html */ `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${webview.cspSource};">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 2.5rem 3rem;
    max-width: 820px;
    margin: 0 auto;
    line-height: 1.6;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 1.5rem;
    margin-bottom: 2rem;
    border-bottom: 1px solid var(--vscode-panel-border, #444);
    flex-wrap: wrap;
    gap: .75rem;
  }
  .logo { height: 72px; width: auto; display: block; }
  .badge {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: .25rem .7rem;
    border-radius: 20px;
    font-size: .75rem;
    font-weight: 600;
  }
  h2 {
    font-size: .7rem;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: var(--vscode-textPreformat-foreground, #9cdcfe);
    margin: 1.75rem 0 .6rem;
  }
  h3 {
    font-size: .7rem;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: var(--vscode-textPreformat-foreground, #9cdcfe);
    margin: 1.75rem 0 .6rem;
  }
  ul {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: .5rem;
  }
  li {
    padding: .7rem 1rem;
    background: var(--vscode-sideBar-background, rgba(255,255,255,.04));
    border-radius: 6px;
    border-left: 3px solid var(--vscode-activityBarBadge-background, #007acc);
    font-size: .92rem;
    overflow-wrap: break-word;
    word-break: break-word;
    min-width: 0;
  }
  p { color: var(--vscode-descriptionForeground); font-size: .88rem; margin-top: .5rem; }
  strong { color: var(--vscode-foreground); }
  code {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: .85em;
    background: var(--vscode-textCodeBlock-background, rgba(255,255,255,.08));
    padding: .1em .35em;
    border-radius: 3px;
  }
  footer {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--vscode-panel-border, #444);
    color: var(--vscode-descriptionForeground);
    font-size: .8rem;
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: .5rem;
  }
</style>
</head>
<body>
<header>
  <img class="logo" src="${logoUri}" alt="PawnPro">
  <span class="badge">v${version}</span>
</header>

${sectionHtml}

<footer>
  <span>PawnPro v${version}</span>
  <span>Use <code>PawnPro: O que há de novo</code> para reabrir.</span>
</footer>
</body>
</html>`;
}
//# sourceMappingURL=whatsNew.js.map