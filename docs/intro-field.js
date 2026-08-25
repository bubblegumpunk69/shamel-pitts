(() => {
  const canvas = document.getElementById('intro-field');
  if (!canvas) return;

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;

  const DPR_MAX = 0.9;
  const FRAME_MS = 72;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const monument = document.querySelector('.intro__monument');

  const palettes = {
    night: {
      mode: 'night',
      dots: [
        [245, 240, 224],
        [174, 231, 202],
        [76, 58, 186],
        [236, 82, 86],
        [196, 220, 73],
      ],
      splitA: [236, 82, 86],
      splitB: [174, 231, 202],
      alpha: 0.72,
      orbitScale: 1,
      forceScale: 1,
      solarScale: 1,
      pulseScale: 1,
    },
    day: {
      mode: 'day',
      dots: [
        [34, 30, 25],
        [89, 81, 70],
        [32, 92, 82],
        [99, 68, 128],
        [151, 104, 37],
      ],
      splitA: [151, 104, 37],
      splitB: [32, 92, 82],
      alpha: 0.5,
      orbitScale: 0.08,
      forceScale: 0.42,
      solarScale: 0.12,
      pulseScale: 0.62,
    },
  };

  let width = 0;
  let height = 0;
  let dpr = 1;
  let dots = [];
  let lastFrame = 0;
  let scheduled = false;
  let burstFrames = 0;
  let pulses = [];
  let solar = 0;
  let visible = document.querySelector('.view[data-view="intro"]')?.classList.contains('is-active') ?? true;

  const pointer = {
    x: 0.5,
    y: 0.5,
    sx: 0.5,
    sy: 0.5,
    active: 0,
    target: 0,
    velocity: 0,
    lastX: 0.5,
    lastY: 0.5,
    lastT: 0,
  };

  function theme() {
    return document.documentElement.dataset.theme === 'day' ? palettes.day : palettes.night;
  }

  function rgba(rgb, alpha) {
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  }

  function random(seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width || window.innerWidth);
    height = Math.max(1, rect.height || window.innerHeight);
    dpr = Math.min(DPR_MAX, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildDots();
    burstFrames = 1;
    scheduleDraw();
  }

  function buildDots() {
    const count = Math.round(Math.min(2400, Math.max(1200, (width * height) / 430)));
    dots = Array.from({ length: count }, (_, i) => {
      const seed = i + 37;
      const lane = random(seed * 2.7);
      const centerBias = Math.pow(random(seed * 3.4), 0.78);
      const x = (lane * 0.96 + 0.02) * width;
      const y = (0.02 + centerBias * 0.9 + (random(seed * 4.1) - 0.5) * 0.035) * height;
      const depth = random(seed * 10.4);
      return {
        x,
        y,
        depth,
        size: 0.28 + depth * 0.84 + random(seed * 5.6) * 0.72,
        alpha: 0.1 + depth * 0.28 + random(seed * 6.2) * 0.48,
        color: Math.floor(random(seed * 7.9) * 5),
        phase: random(seed * 8.8) * Math.PI * 2,
        orbit: 0.6 + depth * 2.9 + random(seed * 9.5) * 2.4,
        orbitA: random(seed * 11.3) * Math.PI * 2,
        orbitB: random(seed * 12.7) * Math.PI * 2,
        orbitSpeed: 0.024 + depth * 0.032 + random(seed * 13.1) * 0.03,
      };
    });
  }

  function localPointer(point) {
    const rect = canvas.getBoundingClientRect();
    const x = (point.clientX - rect.left) / Math.max(1, rect.width);
    const y = (point.clientY - rect.top) / Math.max(1, rect.height);
    if (x < 0 || x > 1 || y < 0 || y > 1) return false;
    pointer.x = x;
    pointer.y = y;
    return true;
  }

  function onPointer(event) {
    const point = event.touches ? event.touches[0] : event;
    if (!point) return;
    const now = event.timeStamp || Date.now();
    if (!localPointer(point)) {
      clearPointer();
      return;
    }
    const dt = Math.max(16, now - pointer.lastT);
    const dx = pointer.x - pointer.lastX;
    const dy = pointer.y - pointer.lastY;
    const speed = Math.min(0.62, Math.sqrt(dx * dx + dy * dy) * 560 / dt);
    pointer.velocity += (speed - pointer.velocity) * 0.42;
    pointer.lastX = pointer.x;
    pointer.lastY = pointer.y;
    pointer.lastT = now;
    pointer.target = 1;
    burstFrames = 18;
    scheduleDraw();
  }

  function onPress(event) {
    const point = event.touches ? event.touches[0] : event;
    if (!point || prefersReduced.matches) return;
    if (!localPointer(point)) return;
    pulses.push({
      x: pointer.x,
      y: pointer.y,
      mode: theme().mode,
      born: event.timeStamp || Date.now(),
    });
    pulses = pulses.slice(-3);
    solar = Math.min(1, solar + (theme().mode === 'day' ? 0.16 : 0.34));
    pointer.target = 1;
    burstFrames = 20;
    scheduleDraw();
  }

  function clearPointer() {
    pointer.target = 0;
    pointer.velocity *= 0.2;
    burstFrames = 5;
    scheduleDraw();
  }

  function draw(now) {
    scheduled = false;
    if (!visible || document.hidden) return;

    if (now - lastFrame < FRAME_MS) {
      scheduleDraw();
      return;
    }

    lastFrame = now;
    pointer.sx += (pointer.x - pointer.sx) * 0.46;
    pointer.sy += (pointer.y - pointer.sy) * 0.46;
    pointer.active += (pointer.target - pointer.active) * 0.32;
    pointer.velocity *= 0.78;
    solar *= 0.92;
    if (monument) monument.style.setProperty('--solar', solar.toFixed(3));

    const p = theme();
    const t = now * 0.001;
    const energy = prefersReduced.matches ? 0 : pointer.active;
    const velocity = prefersReduced.matches ? 0 : pointer.velocity;
    const px = pointer.sx * width;
    const py = pointer.sy * height;
    const radius = Math.min(width, height) * (0.15 + velocity * 0.055);
    const radiusSq = radius * radius;
    const livePulses = pulses.map((pulse) => {
      const age = Math.max(0, (now - pulse.born) / 520);
      return {
        x: pulse.x * width,
        y: pulse.y * height,
        mode: pulse.mode,
        age,
        strength: Math.max(0, 1 - age),
        radius: Math.min(width, height) * (0.07 + age * 0.19),
      };
    }).filter((pulse) => pulse.strength > 0);
    pulses = pulses.slice(-3).filter((pulse) => (now - pulse.born) < 560);

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = p === palettes.day ? 'source-over' : 'lighter';

    dots.forEach((dot) => {
      const dx = dot.x - px;
      const dy = dot.y - py;
      const distSq = dx * dx + dy * dy;
      const proximity = Math.max(0, 1 - distSq / radiusSq);
      const force = proximity * energy * (0.36 + dot.depth * 0.54 + velocity * 0.24) * p.forceScale;
      const angle = Math.atan2(dy, dx);
      const recoil = Math.sin((1 - proximity) * Math.PI * 2 + t * 12 + dot.phase) * force;
      const scatter = force * (28 + dot.depth * 44 + velocity * 26);
      const tremor = Math.sin(t * 12 + dot.phase) * dot.orbit * 0.34 * force;
      const orbitX = Math.cos(t * dot.orbitSpeed + dot.orbitA) * dot.orbit * (0.35 + dot.depth * 0.9) * p.orbitScale;
      const orbitY = Math.sin(t * dot.orbitSpeed * 0.72 + dot.orbitB) * dot.orbit * (0.18 + dot.depth * 0.55) * p.orbitScale;
      const solarPull = solar * (0.2 + dot.depth * 0.5) * p.solarScale;
      let pulseLift = 0;
      let pulsePushX = 0;
      let pulsePushY = 0;
      livePulses.forEach((pulse) => {
        let pressure = 0;
        let pa = 0;
        if (pulse.mode === 'day') {
          const diagonal = dot.y + dot.x * 0.12;
          const sweep = pulse.y + (pulse.age - 0.18) * height * 0.48;
          const band = 1 - Math.min(1, Math.abs(diagonal - sweep) / (34 + dot.depth * 30));
          pressure = Math.max(0, band) * pulse.strength * p.pulseScale * (0.22 + dot.depth * 0.38);
          pa = -Math.PI / 2.8;
        } else {
          const pdx = dot.x - pulse.x;
          const pdy = dot.y - pulse.y;
          const pd = Math.sqrt(pdx * pdx + pdy * pdy);
          const band = 1 - Math.min(1, Math.abs(pd - pulse.radius) / (pulse.radius * 0.42 + 24));
          pressure = Math.max(0, band) * pulse.strength * p.pulseScale * (0.45 + dot.depth * 0.55);
          pa = Math.atan2(pdy, pdx);
        }
        if (pressure <= 0) return;
        const push = pressure * (pulse.mode === 'day' ? 4 + dot.depth * 8 : 10 + dot.depth * 18);
        pulsePushX += Math.cos(pa) * push;
        pulsePushY += Math.sin(pa) * push;
        pulseLift += pressure;
      });
      const x = dot.x + orbitX + Math.cos(angle) * scatter + tremor + pulsePushX;
      const y = dot.y + orbitY + Math.sin(angle) * scatter + tremor * 0.24 + recoil * 4 + pulsePushY;
      const topFade = Math.min(1, y / (height * 0.16));
      const bottomFade = Math.max(0, Math.min(1, (height * 0.9 - y) / (height * 0.18)));
      const edgeFade = topFade * bottomFade;
      const size = dot.size + force * (0.55 + dot.depth * 0.9) + pulseLift * 0.72 + solarPull * 0.38;
      const alpha = ((dot.alpha * p.alpha) + force * 0.34 + pulseLift * 0.38 + solarPull * 0.16) * edgeFade;
      if (alpha <= 0.01) return;
      ctx.fillStyle = rgba(p.dots[dot.color], Math.min(0.96, alpha));
      ctx.fillRect(x, y, size, size);

      if (p.mode === 'night' && velocity > 0.2 && force > 0.14 && dot.depth > 0.56) {
        const split = Math.min(0.72, velocity * force) * (0.9 + dot.depth * 1.1);
        ctx.fillStyle = rgba(p.splitA, Math.min(0.46, alpha * 0.56));
        ctx.fillRect(x - split, y, size, size);
        ctx.fillStyle = rgba(p.splitB, Math.min(0.42, alpha * 0.52));
        ctx.fillRect(x + split, y, size, size);
      }
    });

    if (burstFrames > 0) {
      burstFrames -= 1;
    }
    if (visible && !document.hidden && !prefersReduced.matches) scheduleDraw();
  }

  function scheduleDraw() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(draw);
  }

  function setRunning() {
    visible = document.querySelector('.view[data-view="intro"]')?.classList.contains('is-active') ?? true;
    if (visible) {
      burstFrames = 1;
      scheduleDraw();
    } else {
      ctx.clearRect(0, 0, width, height);
    }
  }

  const viewObserver = new MutationObserver(setRunning);
  document.querySelectorAll('.view').forEach((view) => {
    viewObserver.observe(view, { attributes: true, attributeFilter: ['class'] });
  });

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerdown', onPress, { passive: true });
  window.addEventListener('touchmove', onPointer, { passive: true });
  window.addEventListener('touchstart', onPress, { passive: true });
  window.addEventListener('pointerleave', clearPointer, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && visible) {
      burstFrames = 1;
      scheduleDraw();
    }
  });

  resize();
  setRunning();
})();
