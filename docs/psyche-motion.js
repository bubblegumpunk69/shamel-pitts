(() => {
  const field = document.querySelector('.intro__psyche');
  if (!field) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, pulse: 0 };
  let raf = 0;

  function frame() {
    pointer.x += (pointer.tx - pointer.x) * 0.08;
    pointer.y += (pointer.ty - pointer.y) * 0.08;
    pointer.pulse *= 0.94;
    field.style.setProperty('--mx', pointer.x.toFixed(3));
    field.style.setProperty('--my', pointer.y.toFixed(3));
    field.style.setProperty('--pulse', pointer.pulse.toFixed(3));
    raf = requestAnimationFrame(frame);
  }

  function move(event) {
    if (reduced.matches) return;
    pointer.tx = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
    pointer.ty = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
  }

  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerdown', () => {
    if (!reduced.matches) pointer.pulse = 1;
  }, { passive: true });

  if (reduced.matches) {
    field.style.setProperty('--mx', '0');
    field.style.setProperty('--my', '0');
    field.style.setProperty('--pulse', '0');
    return;
  }

  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
})();
