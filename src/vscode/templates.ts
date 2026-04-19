import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig } from './configBridge.js';

type TemplateKind = 'gamemode' | 'filterscript' | 'include';

type TemplateOption = {
  label: string;
  description: string;
  file: string;
  platform: 'omp' | 'samp';
  kind: TemplateKind;
};

const TEMPLATES: TemplateOption[] = [
  { label: 'Gamemode — open.mp',     description: '#include <open.mp>', file: 'gamemode.omp.pwn',      platform: 'omp',  kind: 'gamemode'     },
  { label: 'Gamemode — SA-MP',       description: '#include <a_samp>',  file: 'gamemode.samp.pwn',     platform: 'samp', kind: 'gamemode'     },
  { label: 'Filterscript — open.mp', description: '#include <open.mp>', file: 'filterscript.omp.pwn',  platform: 'omp',  kind: 'filterscript' },
  { label: 'Filterscript — SA-MP',   description: '#include <a_samp>',  file: 'filterscript.samp.pwn', platform: 'samp', kind: 'filterscript' },
  { label: 'Include — open.mp',      description: '.inc para open.mp',  file: 'include.omp.inc',       platform: 'omp',  kind: 'include'      },
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
      const options = TEMPLATES.filter(t => platform === 'none' || t.platform === platform);

      let chosen: TemplateOption | undefined;

      if (kind) {
        const filtered = options.filter(t => t.kind === kind);
        if (filtered.length === 1) {
          chosen = filtered[0];
        } else if (filtered.length > 1) {
          const pick = await vscode.window.showQuickPick(
            filtered.map(t => ({ label: t.label, description: t.description, _opt: t })),
            { placeHolder: 'Selecione a variante' },
          );
          chosen = pick?._opt;
        }
      } else {
        const pick = await vscode.window.showQuickPick(
          options.map(t => ({ label: t.label, description: t.description, _opt: t })),
          { placeHolder: 'Selecione o tipo de script' },
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
