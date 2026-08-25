// Kinetic thread field for the intro. It should feel like moving stage light:
// sparse, quick, and full of negative space instead of a heavy digital fabric.

(function () {
  const canvas = document.getElementById('wave-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d', { alpha: true });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const COLS = reduced ? 68 : 104;
  const ROWS = reduced ? 34 : 52;
  const COUNT = COLS * ROWS;
  const DPR_MAX = reduced ? 1.15 : 1.45;

  const U = new Float32Array(COUNT);
  const V = new Float32Array(COUNT);
  const R = new Float32Array(COUNT);
  const A = new Float32Array(COUNT);
  const SEED = new Float32Array(COUNT);
  const X = new Float32Array(COUNT);
  const Y = new Float32Array(COUNT);
  const Z = new Float32Array(COUNT);
  const L = new Float32Array(COUNT);
  const F = new Float32Array(COUNT);

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const i = row * COLS + col;
      const u = (col / (COLS - 1)) * 2 - 1;
      const v = (row / (ROWS - 1)) * 2 - 1;
      U[i] = u;
      V[i] = v;
      R[i] = Math.hypot(u, v);
      A[i] = Math.atan2(v, u);
      const n = Math.sin((i + 17) * 12.9898) * 43758.5453;
      SEED[i] = n - Math.floor(n);
    }
  }

  let dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
  let w = 1;
  let h = 1;
  let docked = false;
  let lastPaint = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothstep(edge0, edge1, value) {
    const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return x * x * (3 - 2 * x);
  }

  function heightField(u, v, r, a, t) {
    const diagonal = Math.sin(u * 4.2 + v * 1.4 - t * 1.65);
    const counter = Math.sin(u * -2.4 + v * 5.1 + t * 1.25);
    const ring = Math.sin(r * 15.5 - t * 2.2 + Math.sin(a * 3.0 + t * 0.42) * 0.7);
    const torsion = Math.sin(a * 5.0 + r * 6.6 + t * 0.9);
    const fine = Math.sin((u + v) * 14.0 - t * 2.8) * Math.sin((u - v) * 8.5 + t * 1.15);

    return diagonal * 0.42 +
      counter * 0.28 +
      ring * 0.18 +
      torsion * 0.16 +
      fine * 0.09;
  }

  function project(t) {
    const cx = w * 0.5;
    const cy = h * 0.56;
    const sx = w * 0.74;
    const sy = h * 0.48;
    const depth = h * 0.13;
    const rot = Math.sin(t * 0.24) * 0.075;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const i = row * COLS + col;
        const u = U[i];
        const v = V[i];
        const r = R[i];
        const a = A[i];

        const mask = smoothstep(1.28, 0.18, r);
        const edgeLift = smoothstep(0.64, 1.2, r) * 0.05 * Math.sin(a * 3.0 - t * 0.82);
        const z = heightField(u, v, r, a, t) * mask + edgeLift;

        const swirl = 0.082 * Math.sin(r * 5.8 - t * 1.05) + 0.035 * Math.sin(a * 4.0 + t * 1.2);
        const cu = u * Math.cos(swirl) - v * Math.sin(swirl);
        const cv = u * Math.sin(swirl) + v * Math.cos(swirl);
        const rx = cu * cos - cv * sin;
        const ry = cu * sin + cv * cos;

        const perspective = 1 + ry * 0.1 - z * 0.03;
        X[i] = cx + (rx * sx) / perspective;
        Y[i] = cy + (ry * sy - z * depth) / perspective;
        Z[i] = z;

        const eps = 0.018;
        const zx = heightField(u + eps, v, Math.hypot(u + eps, v), Math.atan2(v, u + eps), t) -
          heightField(u - eps, v, Math.hypot(u - eps, v), Math.atan2(v, u - eps), t);
        const zy = heightField(u, v + eps, Math.hypot(u, v + eps), Math.atan2(v + eps, u), t) -
          heightField(u, v - eps, Math.hypot(u, v - eps), Math.atan2(v - eps, u), t);
        const slope = Math.hypot(zx, zy);
        const ridge = Math.pow(clamp(1 - slope * 1.15, 0, 1), 2.15);
        const glint = Math.pow(clamp((z + 0.52) * 0.86, 0, 1), 3.1);
        const aperture = smoothstep(0.94, 0.12, Math.abs(v + Math.sin(u * 1.8 + t * 0.25) * 0.18));
        const streak = Math.pow(clamp(0.5 + 0.5 * Math.sin(u * 9.0 + v * 2.2 - t * 2.4), 0, 1), 5.5);
        F[i] = aperture * (0.28 + streak * 0.9);
        L[i] = mask * F[i] * (0.16 + ridge * 0.36 + glint * 0.9);
      }
    }
  }

  function backdrop(t) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#070604';
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.55;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.8);
    glow.addColorStop(0, 'rgba(132, 22, 31, 0.13)');
    glow.addColorStop(0.35, 'rgba(22, 15, 16, 0.18)');
    glow.addColorStop(0.76, 'rgba(7, 6, 4, 0.04)');
    glow.addColorStop(1, 'rgba(7, 6, 4, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    const vignette = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.24, cx, cy, Math.max(w, h) * 0.64);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  function drawSurface(t) {
    const alphaScale = docked ? 0.18 : 1;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.save();
    ctx.shadowColor = 'rgba(255, 244, 222, 0.28)';
    ctx.shadowBlur = 12;
    for (let row = 3; row < ROWS - 3; row += 6) {
      let peak = 0;
      for (let col = 0; col < COLS; col++) {
        peak = Math.max(peak, L[row * COLS + col]);
      }
      if (peak < 0.56) continue;

      ctx.beginPath();
      let drawing = false;
      for (let col = 0; col < COLS; col++) {
        const i = row * COLS + col;
        if (F[i] < 0.48 || L[i] < 0.22) {
          drawing = false;
          continue;
        }
        if (!drawing) ctx.moveTo(X[i], Y[i]);
        else ctx.lineTo(X[i], Y[i]);
        drawing = true;
      }
      ctx.strokeStyle = `rgba(255, 246, 226, ${(alphaScale * (peak - 0.38) * 0.2).toFixed(4)})`;
      ctx.lineWidth = 0.7 + peak * 1.1;
      ctx.stroke();
    }
    ctx.restore();

    for (let row = 0; row < ROWS; row += 4) {
      ctx.beginPath();
      let lit = 0;
      let drawing = false;
      for (let col = 0; col < COLS; col++) {
        const i = row * COLS + col;
        if (F[i] < 0.36 || L[i] < 0.1) {
          drawing = false;
          continue;
        }
        if (!drawing) ctx.moveTo(X[i], Y[i]);
        else ctx.lineTo(X[i], Y[i]);
        drawing = true;
        lit += L[i];
      }
      const avg = lit / COLS;
      const a = alphaScale * (0.004 + avg * 0.062);
      ctx.strokeStyle = `rgba(238, 229, 205, ${a.toFixed(4)})`;
      ctx.lineWidth = 0.24 + avg * 0.78;
      ctx.stroke();
    }

    for (let col = 0; col < COLS; col += 16) {
      ctx.beginPath();
      let lit = 0;
      let drawing = false;
      for (let row = 0; row < ROWS; row++) {
        const i = row * COLS + col;
        if (F[i] < 0.56 || L[i] < 0.16) {
          drawing = false;
          continue;
        }
        if (!drawing) ctx.moveTo(X[i], Y[i]);
        else ctx.lineTo(X[i], Y[i]);
        drawing = true;
        lit += L[i];
      }
      const avg = lit / ROWS;
      ctx.strokeStyle = `rgba(178, 34, 48, ${(alphaScale * avg * 0.06).toFixed(4)})`;
      ctx.lineWidth = 0.28;
      ctx.stroke();
    }

    for (let i = 0; i < COUNT; i += 3) {
      const edge = smoothstep(1.22, 0.4, R[i]);
      const shimmer = 0.62 + 0.38 * Math.sin(t * 3.2 + SEED[i] * 6.283 + Z[i] * 2.0);
      const spec = Math.pow(clamp(L[i], 0, 1), 2.0);
      const a = alphaScale * edge * F[i] * shimmer * (0.06 + spec * 0.88);
      if (a < 0.075 || (spec < 0.34 && SEED[i] < 0.86)) continue;

      const warm = 224 + 26 * spec;
      const size = 0.38 + spec * 1.45 + edge * 0.16;
      ctx.fillStyle = `rgba(${warm.toFixed(0)}, ${Math.min(244, warm + 8).toFixed(0)}, ${Math.min(255, warm + 20).toFixed(0)}, ${a.toFixed(3)})`;
      ctx.fillRect(X[i] - size * 0.5, Y[i] - size * 0.5, size, size);

      if (spec > 0.48 && SEED[i] > 0.78) {
        ctx.fillStyle = `rgba(255, 250, 232, ${(a * 1.4).toFixed(3)})`;
        ctx.fillRect(X[i] - 0.7, Y[i] - 0.7, 1.4, 1.4);
      }
    }

    ctx.restore();
  }

  function drawGestures(t) {
    if (docked) return;

    const alphaScale = 1;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    ctx.shadowBlur = 14;

    for (let g = 0; g < 6; g++) {
      const seed = g * 1.91;
      const y = h * (0.28 + g * 0.085) + Math.sin(t * 1.35 + seed) * h * 0.04;
      const amp = h * (0.045 + (g % 3) * 0.012);
      const start = w * (-0.06 + Math.sin(t * 0.58 + seed) * 0.05);
      const end = w * (1.02 + Math.cos(t * 0.5 + seed) * 0.04);
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.1 + seed);
      const isRed = g === 1 || g === 4;

      ctx.beginPath();
      ctx.moveTo(start, y);
      ctx.bezierCurveTo(
        w * 0.22,
        y - amp * (1.4 + pulse),
        w * 0.48,
        y + amp * (1.2 - pulse),
        w * 0.68,
        y - amp * 0.65
      );
      ctx.bezierCurveTo(
        w * 0.84,
        y - amp * 1.9,
        end,
        y + Math.sin(t + seed) * amp,
        end,
        y + Math.cos(t * 0.7 + seed) * amp
      );

      const opacity = alphaScale * (isRed ? 0.12 : 0.16) * (0.45 + pulse * 0.55);
      ctx.shadowColor = isRed ? 'rgba(178, 34, 48, 0.5)' : 'rgba(255, 246, 226, 0.38)';
      ctx.strokeStyle = isRed
        ? `rgba(178, 34, 48, ${opacity.toFixed(3)})`
        : `rgba(255, 246, 226, ${opacity.toFixed(3)})`;
      ctx.lineWidth = isRed ? 0.9 : 0.7;
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawShadow() {
    const cx = w * 0.5;
    const cy = h * 0.58;
    const shadow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.3);
    shadow.addColorStop(0, 'rgba(0, 0, 0, 0.22)');
    shadow.addColorStop(0.58, 'rgba(0, 0, 0, 0.08)');
    shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = shadow;
    ctx.fillRect(0, 0, w, h);
  }

  function frame(now) {
    if (!reduced && now - lastPaint < 16) {
      requestAnimationFrame(frame);
      return;
    }
    lastPaint = now;

    const t = (now / 1000) * (docked ? 0.32 : reduced ? 0.16 : 0.92);
    project(t);
    backdrop(t);
    drawSurface(t);
    drawGestures(t);
    drawShadow();
    requestAnimationFrame(frame);
  }

  new ResizeObserver(resize).observe(canvas);
  new MutationObserver(() => {
    docked = canvas.classList.contains('is-docked');
  }).observe(canvas, { attributes: true, attributeFilter: ['class'] });

  resize();
  requestAnimationFrame(frame);
})();
