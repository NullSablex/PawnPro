// Animação do título "PawnPro" das WebViews — sequência fixa em loop com pausa:
// teclado → bloco → cair → (pausa) → repete. Compartilhada entre as páginas
// (Configurações e Biblioteca) para não duplicar CSS/JS.
//
// O CSS entra no <style> e o JS no <script> de cada WebView via interpolação.

/** Bloco de CSS das animações de marca. Injetar dentro de `<style>`. */
export function brandAnimationCss(): string {
  return /* css */ `
  /* Cada letra é um span; espaços preservam largura (inline-block colapsaria). */
  .brand.animate { position: relative; }
  .brand.animate .ch { display: inline-block; }
  .brand.animate .ch.sp { width: 0.35em; }

  /* Teclado: letras surgem uma a uma da esquerda para a direita. */
  .brand.fx-teclado .ch { opacity: 0; animation: fx-teclado .3s ease-out forwards; }
  @keyframes fx-teclado { from { opacity: 0; } to { opacity: 1; } }

  /* Cair: letras descem de cima e assentam. */
  .brand.fx-cair .ch { opacity: 0; animation: fx-cair .5s ease-out forwards; }
  @keyframes fx-cair {
    from { opacity: 0; transform: translateY(-0.6em); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Bloco: UMA barra desliza por cima do título inteiro, revelando-o. */
  .brand.fx-bloco .ch { opacity: 0; animation: fx-bloco-show .01s linear .55s forwards; }
  .brand.fx-bloco::after {
    content: ''; position: absolute; inset: 0;
    background: var(--vscode-focusBorder, #007acc);
    transform-origin: left;
    animation: fx-bloco-bar 1s ease-in-out forwards;
  }
  @keyframes fx-bloco-show { to { opacity: 1; } }
  @keyframes fx-bloco-bar {
    0%   { transform: scaleX(0); transform-origin: left; }
    45%  { transform: scaleX(1); transform-origin: left; }
    55%  { transform: scaleX(1); transform-origin: right; }
    100% { transform: scaleX(0); transform-origin: right; }
  }

  @media (prefers-reduced-motion: reduce) {
    .brand.animate .ch { animation: none !important; opacity: 1 !important; transform: none !important; }
    .brand.animate::after { display: none; }
  }`;
}

/**
 * JS (string) das animações de marca. Injetar dentro de `<script>`. Expõe
 * `applyBrandAnimation(on)`: divide o `#brand` em letras e roda a sequência em
 * loop. `on=false` desfaz e mostra o texto simples.
 */
export function brandAnimationJs(): string {
  return /* js */ `
let _brandTimer = null;
const BRAND_FX = ['fx-teclado', 'fx-bloco', 'fx-cair'];
const BRAND_PAUSE = 7000;   // pausa entre ciclos (ms)
const BRAND_PER_CH = 70;    // atraso por letra (ms) — teclado/cair

function applyBrandAnimation(on) {
  const el = document.getElementById('brand');
  if (!el) return;
  if (_brandTimer) { clearTimeout(_brandTimer); _brandTimer = null; }
  const text = (el.dataset.brandText || el.textContent || '').trim();
  el.dataset.brandText = text; // preserva o texto original entre re-renders

  el.className = el.className.replace(/\\bfx-\\S+/g, '').trim();
  if (!on) { el.classList.remove('animate'); el.textContent = text; return; }

  el.classList.add('animate');
  el.textContent = '';
  const chars = [];
  [...text].forEach(c => {
    const span = document.createElement('span');
    if (c === ' ') { span.className = 'ch sp'; }
    else { span.className = 'ch'; span.textContent = c; }
    el.appendChild(span);
    chars.push(span);
  });

  let fxIndex = 0;
  const runCycle = () => {
    const fx = BRAND_FX[fxIndex];
    el.classList.remove(...BRAND_FX);
    // Reinicia a animação: limpa delays, força reflow, aplica o efeito.
    chars.forEach(s => { s.style.animationDelay = ''; });
    void el.offsetWidth;
    el.classList.add(fx);

    let total;
    if (fx === 'fx-bloco') {
      // Barra única e uniforme: sem delay por letra; dura ~1s.
      total = 1100;
    } else {
      // Teclado/cair: cada letra entra escalonada.
      chars.forEach((s, i) => { s.style.animationDelay = (i * BRAND_PER_CH) + 'ms'; });
      total = chars.length * BRAND_PER_CH + 500;
    }
    fxIndex = (fxIndex + 1) % BRAND_FX.length;
    _brandTimer = setTimeout(runCycle, total + BRAND_PAUSE);
  };
  runCycle();
}`;
}
