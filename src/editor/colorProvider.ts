import * as vscode from 'vscode';
import { findColorLiterals, formatHexColor, formatAlphaAddColor, type RgbaColor } from '../core/colors.js';

/**
 * Mostra um swatch de cor (com color picker nativo) sobre literais `0xRRGGBBAA`
 * / `0xRRGGBB` em código Pawn. O editor desenha o quadradinho e abre o seletor;
 * aqui só localizamos os literais e traduzimos cor ⇄ texto.
 */
class PawnColorProvider implements vscode.DocumentColorProvider {
  provideDocumentColors(
    document: vscode.TextDocument,
  ): vscode.ProviderResult<vscode.ColorInformation[]> {
    const text = document.getText();
    return findColorLiterals(text).map((lit) => {
      const range = new vscode.Range(
        document.positionAt(lit.start),
        document.positionAt(lit.end),
      );
      const c = lit.color;
      return new vscode.ColorInformation(
        range,
        new vscode.Color(c.red, c.green, c.blue, c.alpha),
      );
    });
  }

  provideColorPresentations(
    color: vscode.Color,
    context: { document: vscode.TextDocument; range: vscode.Range },
  ): vscode.ProviderResult<vscode.ColorPresentation[]> {
    const rgba: RgbaColor = {
      red: color.red,
      green: color.green,
      blue: color.blue,
      alpha: color.alpha,
    };
    const original = context.document.getText(context.range);

    // Idioma `0xRRGGBBAA ± N`: preserva a forma base±N, recalculando N para o
    // novo alpha em vez de achatar a expressão num literal só.
    const addMatch = /^0x[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})\s*[+-]\s*\d+$/.exec(original);
    if (addMatch) {
      const baseAlphaByte = parseInt(addMatch[1], 16);
      return [new vscode.ColorPresentation(formatAlphaAddColor(rgba, baseAlphaByte))];
    }

    // Literal simples: preserva 6 dígitos se o original tinha 6, senão 8.
    // O core promove a 8 se o alpha deixar de ser opaco.
    const preferDigits = /^0x[0-9A-Fa-f]{6}$/.test(original) ? 6 : 8;
    return [new vscode.ColorPresentation(formatHexColor(rgba, preferDigits))];
  }
}

export function registerColorProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerColorProvider(
      { scheme: 'file', language: 'pawn' },
      new PawnColorProvider(),
    ),
  );
}
