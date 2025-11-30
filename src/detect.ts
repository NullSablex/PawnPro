import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const localize = nls.loadMessageBundle(__filename);

function normalizeInputPath(p?: string): string | undefined {
  if (!p) return undefined;
  const unq = p.trim().replace(/^["']|["']$/g, '');
  if (!unq) return undefined;
  return unq.startsWith('~')
    ? path.join(process.env.HOME || process.env.USERPROFILE || '', unq.slice(1))
    : unq;
}

function existsExecutable(p: string): boolean {
  try {
    if (!fs.existsSync(p)) return false;
    if (fs.statSync(p).isDirectory()) return false;
    if (process.platform !== 'win32') fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch { return false; }
}

function scanPathFor(names: string[]): string | undefined {
  const envPath = process.env.PATH || '';
  const sep = process.platform === 'win32' ? ';' : ':';
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.BAT;.CMD').split(';')
    : [''];
  const dirs = envPath.split(sep).filter(Boolean);

  for (const d of dirs) {
    for (const n of names) {
      if (process.platform === 'win32') {
        for (const e of exts) {
          const p = path.join(d, n.toLowerCase().endsWith(e.toLowerCase()) ? n : n + e);
          if (existsExecutable(p)) return p;
        }
      } else {
        const p = path.join(d, n);
        if (existsExecutable(p)) return p;
      }
    }
  }
  return undefined;
}

function inPathTry(): string | undefined {
  const names = process.platform === 'win32'
    ? ['pawncc.exe', 'pawncc64.exe', 'pawncc', 'pawncc.bat']
    : ['pawncc'];
  return scanPathFor(names);
}

function workspaceCandidates(): string[] {
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!ws) return [];
  const names = process.platform === 'win32'
    ? ['pawncc.exe', 'pawncc64.exe', 'pawncc.bat']
    : ['pawncc'];
  const dirs = [
    path.join(ws, 'pawno'),
    path.join(ws, 'include'),
    path.join(ws, 'tools'),
    path.join(ws, 'bin')
  ];
  const out: string[] = [];
  for (const d of dirs) for (const n of names) out.push(path.join(d, n));
  return out;
}

function commonCandidates(): string[] {
  if (process.platform === 'win32') {
    return [
      'C:\\Program Files\\Pawn\\pawncc.exe',
      'C:\\Program Files (x86)\\Pawn\\pawncc.exe',
      'pawncc.exe',
      'pawncc64.exe',
      'pawncc.bat'
    ];
  }
  return [
    '/usr/local/bin/pawncc',
    '/usr/bin/pawncc',
    '/opt/pawn/pawncc',
    'pawncc'
  ];
}

export function detectPawncc(explicitPathRaw: string | undefined, autoDetect: boolean): string {
  // 0) VAR de ambiente opcional
  const envPath = normalizeInputPath(process.env.PAWNCC);
  if (envPath && existsExecutable(envPath)) return envPath;

  // 1) Caminho configurado (aceita diretório)
  const normalized = normalizeInputPath(explicitPathRaw);
  if (normalized && normalized.trim()) {
    let p = normalized;
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      const name = process.platform === 'win32' ? 'pawncc.exe' : 'pawncc';
      p = path.join(p, name);
    }
    if (existsExecutable(p)) return p;
    if (!autoDetect) {
      throw new Error(localize('detect.missing.explicit',
        'pawncc não encontrado em: {0}', normalized));
    }
  }

  // 2) PATH
  const fromPath = inPathTry();
  if (fromPath) return fromPath;

  // 3) Workspace candidatos
  for (const c of workspaceCandidates()) {
    if (existsExecutable(c)) return c;
  }

  // 4) Locais comuns
  for (const c of commonCandidates()) {
    if (existsExecutable(c)) return c;
  }

  throw new Error(localize('detect.missing',
    'Não foi possível detectar o executável pawncc. Configure "pawnpro.compiler.path".'));
}
