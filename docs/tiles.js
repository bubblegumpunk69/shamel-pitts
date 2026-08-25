// Ikeda-inflected atmospheric backdrop for the Works view.
// Vertical columns of small bone tiles descending at varied speeds,
// with sparse deep-indigo accents. Confined to the .series-choice rect.

(function () {
  const canvas = document.querySelector('.works-backdrop');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const BONE = [239, 234, 224];
  const WHITE = [255, 255, 255];
  const INDIGO = [55, 66, 128];
  const OXBLOOD = [178, 34, 48];

  let DPR = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  let columns = [];

  const COL_WIDTH = 22;
  const TILE_SIZES = [3, 4, 4, 5, 6, 6, 8, 10];

  function rebuild() {
    const rect = canvas.getBoundingClientRect();
    // Defensive clamp — never allocate an absurd canvas bitmap even if a
    // layout quirk momentarily reports a bogus size.
    const nextW = Math.max(1, Math.min(4000, Math.floor(rect.width)));
    const nextH = Math.max(1, Math.min(4000, Math.floor(rect.height)));

    // Guard: only touch canvas.width/height (which re-triggers layout and
    // can re-fire ResizeObserver) when the size actually changed.
    if (nextW === W && nextH === H) return;
    W = nextW;
    H = nextH;

    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    const n = Math.max(6, Math.floor(W / COL_WIDTH));
    columns = [];
    for (let i = 0; i < n; i++) {
      columns.push({
        x: (i + 0.5) * (W / n),
        speed: 0.15 + Math.random() * 0.55,
        nextSpawn: Math.random() * 220,
        tiles: [],
        pauseUntil: 0,
      });
    }
  }

  let resizeScheduled = false;
  new ResizeObserver(() => {
    if (resizeScheduled) return;
    resizeScheduled = true;
    requestAnimationFrame(() => {
      resizeScheduled = false;
      rebuild();
    });
  }).observe(canvas);
  rebuild();

  let tick = 0;
  let running = false;

  function spawnTile(col) {
    const size = TILE_SIZES[Math.floor(Math.random() * TILE_SIZES.length)];
    const roll = Math.random();
    // Rare accents: indigo a little more common than oxblood, both sparse
    // against the dominant bone field.
    const isOxblood = roll < 0.045;
    const isIndigo = !isOxblood && roll < 0.12;
    const isWhite = !isOxblood && !isIndigo && roll < 0.22;
    const isAccent = isOxblood || isIndigo;
    const isBar = Math.random() < 0.06;
    const color = isOxblood ? OXBLOOD : isIndigo ? INDIGO : isWhite ? WHITE : BONE;
    col.tiles.push({
      y: -size,
      size,
      w: isBar ? size * (2 + Math.random() * 4) : size,
      color,
      alpha: (isAccent ? 0.55 : isWhite ? 0.65 : 0.28) + Math.random() * 0.15,
      fadeStart: Math.random() < 0.35 ? H * (0.4 + Math.random() * 0.4) : Infinity,
    });
    col.nextSpawn = 40 + Math.random() * 340 / col.speed;
  }

  function frame() {
    if (!running) return;
    tick++;
    ctx.clearRect(0, 0, W, H);

    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];

      if (col.pauseUntil > tick) {
        // hold
      } else {
        if (Math.random() < 0.0008) col.pauseUntil = tick + 40 + Math.random() * 120;
        col.nextSpawn -= 1;
        if (col.nextSpawn <= 0 && col.tiles.length < 12) spawnTile(col);

        for (let t = col.tiles.length - 1; t >= 0; t--) {
          const tl = col.tiles[t];
          tl.y += col.speed;
          if (tl.y >= tl.fadeStart) {
            tl.alpha *= 0.985;
            if (tl.alpha < 0.01) col.tiles.splice(t, 1);
          } else if (tl.y > H + 8) {
            col.tiles.splice(t, 1);
          }
        }
      }

      for (const tl of col.tiles) {
        const [r, g, b] = tl.color;
        ctx.fillStyle = `rgba(${r},${g},${b},${tl.alpha.toFixed(3)})`;
        ctx.fillRect(col.x - tl.w / 2, tl.y, tl.w, tl.size);
      }
    }

    requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    ctx.clearRect(0, 0, W, H);
    for (const col of columns) col.tiles.length = 0;
  }

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const worksView = document.querySelector('.view[data-view="works"]');
  if (!worksView) {
    if (!REDUCED) start();
  } else {
    const mo = new MutationObserver(() => {
      if (worksView.classList.contains('is-active')) start();
      else stop();
    });
    mo.observe(worksView, { attributes: true, attributeFilter: ['class'] });
    if (worksView.classList.contains('is-active') && !REDUCED) start();
  }
})();
