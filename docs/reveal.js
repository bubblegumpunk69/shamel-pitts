// Single quiet behavior: sections fade up once on first entry into viewport.
// Year stamp in footer auto-updates.

document.getElementById('year').textContent = new Date().getFullYear();

const io = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    }
  },
  { rootMargin: '0px 0px -10% 0px', threshold: 0.08 }
);

document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
