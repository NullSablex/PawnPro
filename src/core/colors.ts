/**
 * Cores literais do SA-MP/open.mp em código Pawn.
 *
 * Formato oficial (open.mp): `0xRRGGBBAA` — o alpha é o ÚLTIMO byte.
 * Confirmado pela doc de SetPlayerColor: vermelho = 0xFF0000FF.
 *
 * Também aceitamos `0xRRGGBB` (6 dígitos, sem alpha): tratado como opaco (A=FF).
 *
 * E o formato de cor embutida em texto do SA-MP, `{RRGGBB}` (chat, textdraws,
 * GameText): 6 dígitos hex entre chaves, sempre opaco e sem alpha.
 *
 * Este módulo é puro (sem `vscode`): só faz varredura de texto e conversão de
 * cor, para ser testável fora do editor. A camada editor/ liga isso ao
 * DocumentColorProvider.
 */

export interface RgbaColor {
  /** 0..1 */ red: number;
  /** 0..1 */ green: number;
  /** 0..1 */ blue: number;
  /** 0..1 */ alpha: number;
}

export interface ColorLiteral {
  /** Offset do início do literal (posição do `0`) no texto. */
  start: number;
  /** Offset do fim (exclusivo). Inclui o `+ N` quando presente (ver `alphaAdd`). */
  end: number;
  /** Nº de dígitos hex: 6 (RGB) ou 8 (RGBA). Guardado para reescrever no mesmo formato. */
  digits: 6 | 8;
  /** Cor resultante (já com o alpha ajustado quando há `alphaAdd`). */
  color: RgbaColor;
  /**
   * Idioma SA-MP de ajuste de alpha por aritmética: `0xRRGGBBAA + N` / `- N`.
   * Quando presente, `color` já reflete o alpha resultante (base ± N), e o valor
   * aqui é o operando N (com sinal) para reconstruir a forma `base±N` na edição.
   * A soma só é interpretada quando afeta apenas o byte de alpha (sem carry).
   */
  alphaAdd?: number;
  /**
   * Formato de cor embutida `{RRGGBB}` (SA-MP). Sempre 6 dígitos, opaco. Guardado
   * para reescrever no mesmo formato ao editar (senão viraria `0x...`).
   */
  braces?: boolean;
}

// `0x` seguido de exatamente 8 ou 6 dígitos hex, com fronteira de palavra depois
// para não casar 0xF97804FFAB (10 díg) como se fosse 8. Grupo 1: os hex.
// Grupos 2/3 (opcionais): operador +/- e um inteiro decimal — o idioma de ajuste
// de alpha `0x...00 + 20`. Só interpretado se a soma não estourar o byte de alpha.
const COLOR_RE = /\b0x([0-9A-Fa-f]{8}|[0-9A-Fa-f]{6})\b(?:\s*([+-])\s*(\d+))?/g;

// Cor embutida do SA-MP: `{RRGGBB}` — exatamente 6 dígitos hex entre chaves.
// Aparece dentro de strings de chat/textdraw (ex.: "{FF0000}Vermelho").
const BRACES_RE = /\{([0-9A-Fa-f]{6})\}/g;

function byteToUnit(b: number): number {
  return b / 255;
}

function unitToByte(u: number): number {
  // clamp + arredonda para o inteiro 0..255 mais próximo.
  return Math.max(0, Math.min(255, Math.round(u * 255)));
}

/** Decodifica os dígitos hex (6 ou 8) para RGBA normalizado. */
export function parseHexColor(hex: string): RgbaColor | null {
  if (hex.length !== 6 && hex.length !== 8) return null;
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  const red = n(0);
  const green = n(2);
  const blue = n(4);
  const alpha = hex.length === 8 ? n(6) : 255;
  if ([red, green, blue, alpha].some(Number.isNaN)) return null;
  return { red: byteToUnit(red), green: byteToUnit(green), blue: byteToUnit(blue), alpha: byteToUnit(alpha) };
}

/** Varre o texto e devolve todos os literais de cor `0x...` encontrados. */
export function findColorLiterals(text: string): ColorLiteral[] {
  const out: ColorLiteral[] = [];
  COLOR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COLOR_RE.exec(text)) !== null) {
    const hex = m[1];
    const color = parseHexColor(hex);
    if (!color) continue;

    const digits: 6 | 8 = hex.length === 8 ? 8 : 6;
    const literalEnd = m.index + 2 + hex.length; // após `0x` + dígitos

    // Idioma `0x...AA + N`: ajusta o byte de alpha por aritmética. Só é
    // interpretado quando (a) o literal tem alpha explícito (8 díg) e (b) o
    // resultado cabe em 0..255 — isto é, a soma afeta apenas o byte de alpha,
    // sem carry/borrow para o byte azul. Fora disso, o resultado dependeria
    // dos outros canais e o swatch enganaria; então ignoramos a aritmética.
    const op = m[2];
    const num = m[3];
    if (op && num !== undefined && digits === 8) {
      const baseAlpha = Math.round(color.alpha * 255);
      const delta = op === '-' ? -parseInt(num, 10) : parseInt(num, 10);
      const resultAlpha = baseAlpha + delta;
      if (resultAlpha >= 0 && resultAlpha <= 255) {
        out.push({
          start: m.index,
          end: m.index + m[0].length,
          digits,
          color: { ...color, alpha: byteToUnit(resultAlpha) },
          alphaAdd: delta,
        });
        continue;
      }
    }

    // Sem aritmética interpretável: só o literal base (não consome o `± N`).
    out.push({ start: m.index, end: literalEnd, digits, color });
  }

  // Cores embutidas `{RRGGBB}` do SA-MP: 6 dígitos, sempre opaco.
  BRACES_RE.lastIndex = 0;
  let b: RegExpExecArray | null;
  while ((b = BRACES_RE.exec(text)) !== null) {
    const color = parseHexColor(b[1]);
    if (!color) continue;
    out.push({
      start: b.index,
      end: b.index + b[0].length,
      digits: 6,
      color,
      braces: true,
    });
  }

  return out;
}

/**
 * Formata uma cor de volta para literal Pawn.
 *
 * `preferDigits` mantém o formato original quando possível: um literal de 6
 * dígitos (RGB) que continua opaco após a edição volta como 6 dígitos; se o
 * usuário introduziu transparência, é promovido a 8 dígitos (RGBA) — senão o
 * alpha seria silenciosamente descartado.
 */
export function formatHexColor(color: RgbaColor, preferDigits: 6 | 8): string {
  const r = unitToByte(color.red);
  const g = unitToByte(color.green);
  const b = unitToByte(color.blue);
  const a = unitToByte(color.alpha);
  const hx = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');

  const rgb = `${hx(r)}${hx(g)}${hx(b)}`;
  if (preferDigits === 6 && a === 255) {
    return `0x${rgb}`;
  }
  return `0x${rgb}${hx(a)}`;
}

/**
 * Reescreve uma cor preservando o idioma `base±N` de ajuste de alpha.
 *
 * O literal base mantém o alpha original (`baseAlphaByte`) e o operando `N` é
 * recalculado para atingir o novo alpha escolhido no picker. Assim, editar a
 * cor de `0x9900CC00+20` não achata a expressão em `0x9900CC14` — mantém a
 * forma que o autor escreveu, só mudando o RGB e o N conforme necessário.
 *
 * Se o novo alpha não puder ser alcançado a partir da base sem sair de 0..255
 * (não deveria ocorrer, pois o picker entrega 0..255), cai no literal direto.
 */
export function formatAlphaAddColor(color: RgbaColor, baseAlphaByte: number): string {
  const r = unitToByte(color.red);
  const g = unitToByte(color.green);
  const b = unitToByte(color.blue);
  const newAlpha = unitToByte(color.alpha);
  const hx = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');
  const base = `0x${hx(r)}${hx(g)}${hx(b)}${hx(baseAlphaByte)}`;

  const n = newAlpha - baseAlphaByte;
  if (n === 0) return base;
  return n > 0 ? `${base}+${n}` : `${base}-${Math.abs(n)}`;
}

/**
 * Reescreve uma cor no formato `{RRGGBB}` do SA-MP. Esse formato não carrega
 * alpha; o canal é descartado (o texto do jogo não o usa).
 */
export function formatBracesColor(color: RgbaColor): string {
  const hx = (v: number) => unitToByte(v).toString(16).toUpperCase().padStart(2, '0');
  return `{${hx(color.red)}${hx(color.green)}${hx(color.blue)}}`;
}
