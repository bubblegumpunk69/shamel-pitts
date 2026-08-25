// Hash-based panel router. All nav items live in one row; the active view is oxblood.

document.getElementById('year').textContent = new Date().getFullYear();

const THEME_KEY = 'shamel-pitts-theme';
const themeToggle = document.querySelector('.theme-toggle');

function preferredTheme() {
  let saved = null;
  try {
    saved = window.localStorage.getItem(THEME_KEY);
  } catch (_) {}
  if (saved === 'day' || saved === 'night') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night';
}

function setTheme(theme) {
  const next = theme === 'day' ? 'day' : 'night';
  document.documentElement.dataset.theme = next;
  try {
    window.localStorage.setItem(THEME_KEY, next);
  } catch (_) {}

  if (themeToggle) {
    const isDay = next === 'day';
    themeToggle.setAttribute('aria-pressed', String(isDay));
    themeToggle.setAttribute('aria-label', isDay ? 'Switch to night mode' : 'Switch to day mode');
  }
}

setTheme(preferredTheme());

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme === 'day' ? 'day' : 'night';
    setTheme(current === 'day' ? 'night' : 'day');
  });
}

// Items shown in the top nav row, in display order.
const CANONICAL = ['works', 'schedule', 'press', 'bio', 'contact', 'support'];
const MOBILE_OPTIONS = ['intro', ...CANONICAL];
const IDENTITY_VIEWS = ['tribe'];
// Sub-views (not in nav) that should still be routable.
const SUB_VIEWS = ['intro', 'red-series', 'black-trilogy', 'press-archive', 'supporters'];
const ALL_VIEWS = [...CANONICAL, ...IDENTITY_VIEWS, ...SUB_VIEWS];
// Sub-view → parent nav item it belongs under (for highlighting).
const PARENT_OF = {
  'red-series': 'works',
  'black-trilogy': 'works',
  'press-archive': 'press',
  'supporters': 'support',
};

const LABELS = {
  intro: 'Home',
  works: 'Works',
  tribe: 'Tribe',
  schedule: 'Schedule',
  press: 'Press',
  bio: 'Bio',
  support: 'Thanks',
  contact: 'Contact',
};
// First-visit default = intro (wave field). Hash-driven views override.
const DEFAULT_VIEW = 'intro';
const introMotion = document.querySelector('.intro__motion');
const INTRO_LOOP_START = 4.2;
const INTRO_LOOP_END = 34;

const views = document.querySelectorAll('.view');
const mainNav = document.querySelector('.nav__links');
const mobileNav = document.querySelector('.nav__select');
const identityLinks = document.querySelectorAll('.nav__identity [data-view-link]');

function renderNav(active) {
  const html = CANONICAL.map((n) => {
    const cls = n === active ? ' class="is-active"' : '';
    return `<a href="#${n}" data-view-link="${n}"${cls}>${LABELS[n]}</a>`;
  }).join('');
  mainNav.innerHTML = html;

  if (mobileNav) {
    mobileNav.innerHTML = MOBILE_OPTIONS.map((n) => {
      const selected = n === active ? ' selected' : '';
      return `<option value="${n}"${selected}>${LABELS[n]}</option>`;
    }).join('');
  }
}

function renderIdentity(active) {
  identityLinks.forEach((link) => {
    link.classList.toggle('is-active', link.dataset.viewLink === active);
  });
}

function syncIntroMotion(activeView) {
  if (!introMotion) return;

  if (activeView === 'intro') {
    if (introMotion.readyState >= 1 && introMotion.currentTime < INTRO_LOOP_START) {
      introMotion.currentTime = INTRO_LOOP_START;
    }
    introMotion.play().catch(() => {});
    return;
  }

  introMotion.pause();
}

function showView(name) {
  if (!ALL_VIEWS.includes(name)) name = DEFAULT_VIEW;
  const target = document.querySelector(`.view[data-view="${name}"]`);
  if (!target) return;

  views.forEach((v) => v.classList.toggle('is-active', v === target));

  target.classList.remove('is-entering');
  if (name !== 'intro') {
    void target.offsetWidth;
    target.classList.add('is-entering');
  }

  // For sub-views, highlight the parent nav item.
  const navActive = PARENT_OF[name] || name;
  renderNav(navActive);
  renderIdentity(navActive);

  syncIntroMotion(name);

  window.scrollTo({ top: 0, behavior: 'auto' });
}

function route() {
  const name = window.location.hash.replace('#', '') || DEFAULT_VIEW;
  showView(name);
}

window.addEventListener('hashchange', route);
if (mobileNav) {
  mobileNav.addEventListener('change', () => {
    window.location.hash = mobileNav.value;
  });
}
if (introMotion) {
  introMotion.addEventListener('loadedmetadata', () => syncIntroMotion(window.location.hash.replace('#', '') || DEFAULT_VIEW));
  introMotion.addEventListener('timeupdate', () => {
    if (introMotion.currentTime > INTRO_LOOP_END && introMotion.duration > INTRO_LOOP_END) {
      introMotion.currentTime = INTRO_LOOP_START;
    }
  });
}
route();
