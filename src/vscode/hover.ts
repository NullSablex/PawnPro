import * as vscode from 'vscode';
import { computeHover } from '../core/hover.js';
import { buildIncludePaths } from '../core/includes.js';
import { PawnProConfigManager } from '../core/config.js';
import { getWorkspaceRoot } from './configBridge.js';
import type { HoverData, HoverSection } from '../core/types.js';

function hoverDataToMarkdown(data: HoverData): vscode.MarkdownString {
  const md = new vscode.MarkdownString(undefined, true);
  md.isTrusted = true;
  md.supportHtml = false;
  md.supportThemeIcons = true;

  for (const section of data.sections) {
    switch (section.kind) {
      case 'text':
        md.appendMarkdown(section.content);
        break;
      case 'code':
        md.appendCodeblock(section.content, section.language);
        break;
      case 'link': {
        const enc = encodeURIComponent(JSON.stringify(section.args));
        md.appendMarkdown(`[${section.label}](command:${section.command}?${enc} "${section.label}")`);
        break;
      }
      case 'fileLink': {
        const uri = vscode.Uri.file(section.filePath);
        const args = [
          uri.toString(),
          { selection: { start: { line: section.line, character: 0 }, end: { line: section.line, character: 0 } } },
        ];
        const enc = encodeURIComponent(JSON.stringify(args));
        md.appendMarkdown(`[${section.label}](command:vscode.open?${enc} "${section.label}")`);
        break;
      }
    }
  }

  return md;
}

export function registerIncludeHover(
  context: vscode.ExtensionContext,
  config: PawnProConfigManager,
) {
  let cachedIncludePaths: string[] | null = null;

  const getIncludePaths = (): string[] => {
    if (cachedIncludePaths) return cachedIncludePaths;
    const cfg = config.getAll();
    const ws = getWorkspaceRoot();
    cachedIncludePaths = buildIncludePaths(cfg, ws);
    return cachedIncludePaths;
  };

  // Invalidate cache on config change
  config.onChange(() => { cachedIncludePaths = null; });

  const provider = vscode.languages.registerHoverProvider('pawn', {
    async provideHover(doc, pos) {
      const text = doc.getText();
      const lineText = doc.lineAt(pos.line).text;
      const ws = getWorkspaceRoot();
      const includePaths = getIncludePaths();

      const result = await computeHover({
        text,
        filePath: doc.fileName,
        line: pos.line,
        character: pos.character,
        lineText,
        workspaceRoot: ws,
        includePaths,
        extensionDir: context.extensionUri.fsPath,
      });

      if (!result) return undefined;
      return new vscode.Hover(hoverDataToMarkdown(result));
    },
  });

  context.subscriptions.push(provider);
}
