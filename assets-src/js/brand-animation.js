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
}
