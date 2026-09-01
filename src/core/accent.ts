import type { AccentColor } from './types.js';

/**
 * Paleta de cores de destaque das páginas da extensão.
 *
 * Fechada de propósito: o valor entra direto em CSS, e uma cor livre não teria
 * como garantir contraste do texto sobre ela nem legibilidade nos temas claro e
 * escuro. Cada entrada traz o tom normal, o de hover e a cor do texto que vai
 * por cima — os três verificados juntos.
 *
 * Não tem relação com o realce de sintaxe, que tem esquema próprio.
 */
export interface AccentPalette {
  /** Fundo de botões e preenchimento do estado ativo. */
  base: string;
  /** O mesmo tom, um passo mais escuro, para hover. */
  hover: string;
  /** Texto sobre `base` — escolhido pelo contraste, não pelo tema. */
  on: string;
}

/**
 * Tons médios: escuros o bastante para texto branco por cima (todos acima de
 * 4.5:1, o mínimo AA), claros o bastante para não sumirem num tema escuro. O
 * hover ESCURECE em vez de clarear — clarear reduziria o contraste com o texto
 * e três das seis cores reprovavam.
 */
export const ACCENTS: Record<Exclude<AccentColor, ''>, AccentPalette> = {
  blue:   { base: '#0e639c', hover: '#0b5484', on: '#ffffff' },
  purple: { base: '#68417a', hover: '#583767', on: '#ffffff' },
  green:  { base: '#2d7d46', hover: '#266a3b', on: '#ffffff' },
  amber:  { base: '#8a5a00', hover: '#754c00', on: '#ffffff' },
  pink:   { base: '#a63b6d', hover: '#8d325c', on: '#ffffff' },
  teal:   { base: '#00707a', hover: '#005f67', on: '#ffffff' },
};

/** Ordem de exibição na página de configurações. */
export const ACCENT_ORDER: Exclude<AccentColor, ''>[] = [
  'blue',
  'purple',
  'green',
  'amber',
  'pink',
  'teal',
];

/**
 * Bloco CSS que fixa a cor escolhida, para injetar no `<style>` de uma WebView.
 *
 * Devolve string vazia no modo automático: sem regra nenhuma, as páginas caem
 * nas variáveis do tema do editor, que é o comportamento original.
 */
export function accentCss(accent: AccentColor): string {
  const p = accent ? ACCENTS[accent] : undefined;
  // Sem cor escolhida as variáveis apontam para as do editor: é o modo
  // automático, e as páginas seguem o tema como sempre.
  const base = p ? p.base : 'var(--vscode-button-background, #007acc)';
  const hover = p ? p.hover : 'var(--vscode-button-hoverBackground, #0062a3)';
  const on = p ? p.on : 'var(--vscode-button-foreground, #fff)';
  // Variáveis PRÓPRIAS, não as do editor: o editor injeta as dele no atributo
  // style do <html>, e declaração inline vence qualquer seletor — redefinir
  // --vscode-* num :root não teria efeito nenhum.
  return `
  :root {
    --pp-accent: ${base};
    --pp-accent-hover: ${hover};
    --pp-accent-fg: ${on};
  }`;
}
