(function () {
  const video = document.querySelector('.intro__motion');
  const canvases = [
    { element: document.getElementById('dancer-dots'), mirror: false },
    { element: document.getElementById('dancer-dots-mirror'), mirror: true },
  ].filter((panel) => panel.element);
  if (!video || !canvases.length) return;

  const sample = document.createElement('canvas');
  const sctx = sample.getContext('2d', { willReadFrequently: true });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SAMPLE_SIZE = reduced ? 112 : 124;
  const STEP = reduced ? 6 : 5;
  const DPR_MAX = 1;
  const LOOP_START = 4.2;
  const LOOP_END = 34;

  sample.width = SAMPLE_SIZE;
  sample.height = SAMPLE_SIZE;

  const PALETTES = {
    primary: {
      night: { mercury: '216, 226, 228', mineral: '42, 103, 158', rupture: '76, 52, 190' },
      day: { mercury: '31, 36, 38', mineral: '17, 82, 116', rupture: '62, 45, 142' },
    },
    mirror: {
      night: { mercury: '184, 134, 255', mineral: '62, 132, 246', rupture: '235, 241, 255' },
      day: { mercury: '91, 48, 160', mineral: '26, 86, 156', rupture: '36, 46, 72' },
    },
  };

  let hasCued = false;
  let lastFrame = 0;
  let active = null;
  let cxMemo = 0;
  let cyMemo = 0;
  let scaleMemo = 1;
  let timeMemo = 0;
  let toneMemo = PALETTES.primary.night;

  function cueDanceSection() {
    if (hasCued || !Number.isFinite(video.duration) || video.duration <= LOOP_START) return;
    hasCued = true;
    video.currentTime = LOOP_START;
  }

  video.addEventListener('loadedmetadata', cueDanceSection);
  video.addEventListener('timeupdate', () => {
    if (video.currentTime > LOOP_END && video.duration > LOOP_END) video.currentTime = LOOP_START;
  });

  function resizePanel(panel) {
    const ctx = panel.element.getContext('2d', { alpha: true });
    const rect = panel.element.getBoundingClientRect();
    panel.ctx = ctx;
    panel.w = Math.max(1, Math.floor(rect.width));
    panel.h = Math.max(1, Math.floor(rect.height));
    panel.dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
    panel.element.width = Math.floor(panel.w * panel.dpr);
    panel.element.height = Math.floor(panel.h * panel.dpr);
    ctx.setTransform(panel.dpr, 0, 0, panel.dpr, 0, 0);
    ctx.clearRect(0, 0, panel.w, panel.h);
  }

  function clearPanel(panel) {
    const { ctx, w, h } = panel;
    ctx.save();
    if (reduced) {
      ctx.clearRect(0, 0, w, h);
    } else {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function seeded(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  function toStageX(x, y, force) {
    const normalizedY = y / SAMPLE_SIZE - 0.5;
    const bend = Math.sin(normalizedY * 5.8 + force * 1.4) * Math.abs(normalizedY) * 18;
    const local = (x - SAMPLE_SIZE * 0.5) * scaleMemo;
    return cxMemo + (active.mirror ? -local : local) + (active.mirror ? -bend : bend);
  }

  function drawSegment(start, end, y, energy, rowPhase) {
    const ctx = active.ctx;
    const width = end - start;
    if (width < 7) return;

    const mid = (start + end) * 0.5;
    const pressure = clamp(energy, 0, 1);
    const shear = Math.sin(timeMemo * 0.9 + y * 0.11) * pressure * 10;
    const gap = Math.sin(mid * 0.21 + timeMemo * 2.2) > 0.74;
    if (gap && pressure < 0.36) return;

    let x1 = toStageX(start, y, timeMemo) + (active.mirror ? -shear : shear);
    let x2 = toStageX(end, y, timeMemo) - (active.mirror ? -shear * 0.35 : shear * 0.35);
    if (x1 > x2) [x1, x2] = [x2, x1];
    const yy = cyMemo + (y / SAMPLE_SIZE - 0.5) * SAMPLE_SIZE * scaleMemo +
      rowPhase * (reduced ? 0.8 : 2.8) + Math.sin(mid * 0.09 + timeMemo * 1.15) * pressure * 3.2;
    const lift = Math.sin((mid + y) * 0.045 + timeMemo) * pressure * 9;

    if (!reduced && pressure > 0.26) {
      ctx.save();
      ctx.shadowBlur = 3 + pressure * 5;
      ctx.shadowColor = `rgba(${toneMemo.mineral}, 0.2)`;
      ctx.strokeStyle = `rgba(${toneMemo.mineral}, ${(0.1 + pressure * 0.3).toFixed(3)})`;
      ctx.lineWidth = 2.4 + pressure * 4.6;
      ctx.beginPath();
      ctx.moveTo(x1 - 12 * pressure, yy);
      ctx.bezierCurveTo(x1 + width * scaleMemo * 0.28, yy - lift * 1.3, x2 - width * scaleMemo * 0.24, yy + lift, x2 + 16 * pressure, yy);
      ctx.stroke();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.moveTo(x1, yy);
    ctx.bezierCurveTo(x1 + width * scaleMemo * 0.32, yy - lift, x2 - width * scaleMemo * 0.26, yy + lift * 0.55, x2, yy);
    ctx.strokeStyle = `rgba(${toneMemo.mercury}, ${(0.2 + pressure * 0.76).toFixed(3)})`;
    ctx.lineWidth = 0.7 + pressure * (reduced ? 1.1 : 3.2);
    ctx.stroke();

    if (!reduced && pressure > 0.22) {
      ctx.beginPath();
      ctx.moveTo(x1 - 9 * pressure, yy + 2.8);
      ctx.bezierCurveTo(x1 + width * scaleMemo * 0.28, yy - lift * 0.38 + 2.8, x2 - width * scaleMemo * 0.22, yy + lift * 0.25 + 2.8, x2 - 12 * pressure, yy + 2.8);
      ctx.strokeStyle = `rgba(${toneMemo.mineral}, ${(0.16 + pressure * 0.42).toFixed(3)})`;
      ctx.lineWidth = 1.4 + pressure * 4.8;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x1 + 11 * pressure, yy - 2.2);
      ctx.bezierCurveTo(x1 + width * scaleMemo * 0.3, yy - lift * 0.74 - 2.2, x2 - width * scaleMemo * 0.2, yy + lift * 0.32 - 2.2, x2 + 8 * pressure, yy - 2.2);
      ctx.strokeStyle = `rgba(${toneMemo.mercury}, ${(0.035 + pressure * 0.12).toFixed(3)})`;
      ctx.lineWidth = 0.45 + pressure * 1.2;
      ctx.stroke();
    }

    if (!reduced && pressure > 0.58 && seeded(start, y) > 0.42) {
      ctx.fillStyle = `rgba(${toneMemo.mercury}, ${(pressure * 0.58).toFixed(3)})`;
      ctx.fillRect(x2 - 1, yy - 1, 2, 2);
    }

    if (!reduced && pressure > 0.62 && seeded(mid, y) > 0.9) {
      const slash = 18 + pressure * 42;
      ctx.beginPath();
      ctx.moveTo(x1 + width * scaleMemo * 0.36, yy - 4.2);
      ctx.lineTo(x1 + width * scaleMemo * 0.36 + slash, yy - 4.2 + Math.sin(timeMemo + mid) * 2.2);
      ctx.strokeStyle = seeded(mid, start) > 0.5
        ? `rgba(${toneMemo.rupture}, ${(0.32 + pressure * 0.4).toFixed(3)})`
        : `rgba(${toneMemo.mineral}, ${(0.28 + pressure * 0.34).toFixed(3)})`;
      ctx.lineWidth = 1.4 + pressure * 2.8;
      ctx.stroke();
    }
  }

  function renderLines(panel, image, now) {
    active = panel;
    toneMemo = PALETTES[panel.mirror ? 'mirror' : 'primary'][document.documentElement.dataset.theme === 'day' ? 'day' : 'night'];
    const { ctx, w, h } = panel;
    const scale = Math.min(w, h) / SAMPLE_SIZE * (window.innerWidth > 720 ? 1.22 : 1.04);
    const convergence = Math.sin(timeMemo * 0.38 + (panel.mirror ? 1.4 : 0)) * 0.025;
    cxMemo = w * (panel.mirror ? 0.32 - convergence : 0.68 + convergence);
    cyMemo = h * 0.5;
    scaleMemo = scale;
    timeMemo = now / 1000;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.88 + Math.sin(timeMemo * 0.72 + (panel.mirror ? 1.8 : 0)) * 0.12;
    ctx.shadowColor = `rgba(${toneMemo.mercury}, 0.14)`;
    ctx.shadowBlur = reduced ? 1 : 2;

    for (let y = 6; y < SAMPLE_SIZE - 6; y += STEP) {
      const rowPhase = Math.sin(y * 0.18 + timeMemo * 1.7);
      let start = -1;
      let energy = 0;
      let count = 0;

      for (let x = 6; x < SAMPLE_SIZE - 6; x += 3) {
        const p = (y * SAMPLE_SIZE + x) * 4;
        const r = image[p];
        const g = image[p + 1];
        const b = image[p + 2];
        const luminance = r * 0.6 + g * 0.26 + b * 0.14;
        const redBody = r - (g + b) * 0.18;
        const signal = Math.max(luminance, redBody * 1.32);
        const threshold = 6 + Math.sin(y * 0.22 + timeMemo * 2.1) * 3.5;

        if (signal > threshold && r > 4) {
          if (start < 0) start = x;
          energy += clamp((signal - threshold) / 58, 0, 1);
          count++;
          continue;
        }

        if (start >= 0 && count > 3) drawSegment(start, x - 2, y, energy / count, rowPhase);
        start = -1;
        energy = 0;
        count = 0;
      }

      if (start >= 0 && count > 3) drawSegment(start, SAMPLE_SIZE - 8, y, energy / count, rowPhase);
    }

    ctx.restore();
  }

  function draw(now) {
    if (!reduced && now - lastFrame < 50) {
      requestAnimationFrame(draw);
      return;
    }
    lastFrame = now;
    canvases.forEach(clearPanel);
    cueDanceSection();

    if (video.readyState >= 2 && !video.paused) {
      sctx.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      sctx.drawImage(video, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const image = sctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
      canvases.forEach((panel) => renderLines(panel, image, now + (panel.mirror ? 380 : 0)));
    }

    requestAnimationFrame(draw);
  }

  canvases.forEach((panel) => {
    new ResizeObserver(() => resizePanel(panel)).observe(panel.element);
    resizePanel(panel);
  });
  requestAnimationFrame(draw);
})();
