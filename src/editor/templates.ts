import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig } from './configBridge.js';
import { msg } from './nls.js';

type TemplateKind = 'gamemode' | 'filterscript' | 'include';

type TemplateOption = {
  label: () => string;
  description: () => string;
  file: string;
  platform: 'omp' | 'samp';
  kind: TemplateKind;
};

const TEMPLATES: TemplateOption[] = [
  { label: msg.templates.labelGmOmp,  description: msg.templates.descGmOmp,  file: 'gamemode.omp.pwn',      platform: 'omp',  kind: 'gamemode'     },
  { label: msg.templates.labelGmSamp, description: msg.templates.descGmSamp, file: 'gamemode.samp.pwn',     platform: 'samp', kind: 'gamemode'     },
  { label: msg.templates.labelFsOmp,  description: msg.templates.descFsOmp,  file: 'filterscript.omp.pwn',  platform: 'omp',  kind: 'filterscript' },
  { label: msg.templates.labelFsSamp, description: msg.templates.descFsSamp, file: 'filterscript.samp.pwn', platform: 'samp', kind: 'filterscript' },
  { label: msg.templates.labelIncOmp, description: msg.templates.descIncOmp, file: 'include.omp.inc',       platform: 'omp',  kind: 'include'      },
];

function readTemplate(context: vscode.ExtensionContext, name: string): string {
  const file = path.join(context.extensionPath, 'templates', name);
  return fs.readFileSync(file, 'utf8');
}

function getPlatform(): string {
  try {
    return getConfig().getAll().analysis.sdk.platform;
  } catch {
    return 'none';
  }
}

export function registerTemplates(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('pawnpro.newScript', async (kind?: TemplateKind) => {
      const platform = getPlatform();
      const options = TEMPLATES.filter(t => platform === 'none' || platform === 'auto' || t.platform === platform);

      let chosen: TemplateOption | undefined;

      if (kind) {
        const filtered = options.filter(t => t.kind === kind);
        if (filtered.length === 1) {
          chosen = filtered[0];
        } else if (filtered.length > 1) {
          const pick = await vscode.window.showQuickPick(
            filtered.map(t => ({ label: t.label(), description: t.description(), _opt: t })),
            { placeHolder: msg.templates.selectVariant() },
          );
          chosen = pick?._opt;
        }
      } else {
        const pick = await vscode.window.showQuickPick(
          options.map(t => ({ label: t.label(), description: t.description(), _opt: t })),
          { placeHolder: msg.templates.selectType() },
        );
        chosen = pick?._opt;
      }

      if (!chosen) return;

      const content = readTemplate(context, chosen.file);
      const doc = await vscode.workspace.openTextDocument({ language: 'pawn', content });
      await vscode.window.showTextDocument(doc);
    }),
  );
}
