/* Emplastrum Design – skripty webu (spojené moduly z web/src/assets/js; bez knihoven, bez závislostí). */
(() => {
'use strict';

/* ===== util.js ===== */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ===== nav.js ===== */
// Navigace: mobilní menu (otevření/zavření, Esc, návrat fokusu, zamčení pozadí)
// a megamenu „Povrchy“ na desktopu (hover s krátkým zpožděním, klik na šipku, klávesnice).
// Fotografie v menu jsou ve <template data-lazy> a vloží se do stránky až při prvním otevření.

const hydrate = (root) => $$('template[data-lazy]', root).forEach((t) => t.replaceWith(t.content.cloneNode(true)));

function initMobileMenu() {
  const toggle = $('.menu-toggle');
  const menu = $('#menu');
  if (!toggle || !menu) return;
  const label = $('span', toggle);
  const outside = ['#obsah', '.footer-cta', '.site-footer', '.contact-bar'].map((s) => $(s)).filter(Boolean);
  menu.inert = true;

  const set = (open, { focusToggle = true } = {}) => {
    toggle.setAttribute('aria-expanded', String(open));
    label.textContent = open ? 'Zavřít' : 'Menu';
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    menu.inert = !open;
    document.body.classList.toggle('menu-open', open);
    outside.forEach((el) => { el.inert = open; });
    if (open) { hydrate(menu); const first = $('a', menu); first && first.focus({ preventScroll: true }); }
    else if (focusToggle) toggle.focus({ preventScroll: true });
  };

  toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('is-open')) set(false); });
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false, { focusToggle: false }); });
  window.matchMedia('(min-width: 1040px)').addEventListener('change', (e) => { if (e.matches && menu.classList.contains('is-open')) set(false, { focusToggle: false }); });
}

function initMega() {
  const item = $('[data-mega]');
  const panel = $('#mega-povrchy');
  if (!item || !panel) return;
  const chev = $('.nav-chev', item);
  const hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)');
  let isOpen = false;
  let timer;

  const set = (open, { refocus = false } = {}) => {
    if (open === isOpen) return;
    isOpen = open;
    item.classList.toggle('is-open', open);
    chev.setAttribute('aria-expanded', String(open));
    panel.classList.toggle('is-open', open);
    panel.setAttribute('aria-hidden', String(!open));
    panel.inert = !open;
    if (open) hydrate(panel);
    else if (refocus) chev.focus({ preventScroll: true });
  };

  chev.addEventListener('click', () => set(!isOpen));
  const enter = () => { if (!hoverCapable.matches) return; clearTimeout(timer); timer = setTimeout(() => set(true), 110); };
  const leave = () => { if (!hoverCapable.matches) return; clearTimeout(timer); timer = setTimeout(() => set(false), 220); };
  item.addEventListener('mouseenter', enter);
  item.addEventListener('mouseleave', leave);
  panel.addEventListener('mouseenter', () => clearTimeout(timer));
  panel.addEventListener('mouseleave', leave);

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) set(false, { refocus: true }); });
  document.addEventListener('click', (e) => { if (isOpen && !item.contains(e.target) && !panel.contains(e.target)) set(false); });
  [item, panel].forEach((el) => el.addEventListener('focusout', (e) => {
    if (!isOpen) return;
    const to = e.relatedTarget;
    if (to && (item.contains(to) || panel.contains(to))) return;
    if (to === null && hoverCapable.matches && el.matches(':hover')) return;
    set(false);
  }));
  window.matchMedia('(min-width: 1040px)').addEventListener('change', (e) => { if (!e.matches) set(false); });
}

function initNav() {
  initMobileMenu();
  initMega();
}

/* ===== reveal.js ===== */
// Jemné zobrazení prvků při scrollu. Spustí se jednou, nic se neopakuje.

function initReveal() {
  const els = $$('[data-reveal]');
  clearTimeout(window.__rv);
  if (!els.length) return;
  if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
  els.forEach((e) => io.observe(e));
}

/* ===== slider.js ===== */
// Posuvník s fotografiemi: vodorovný pás s „přichytáváním“ (scroll-snap). Fotografie i text jsou vidět hned.
// Ovládání: šipky, prst / trackpad (nativní posun), klávesnice (← →). Dokud návštěvník nic neudělá,
// posuvník se sám po chvíli posune dál, aby bylo jasné, že se hýbe. Při omezeném pohybu se nehýbe sám.

const AUTO_MS = 5500;

function initSlider() {
  $$('[data-slider]').forEach(setup);
}

function setup(root) {
  const track = $('.slider__track', root);
  const slides = $$('.slider__slide', root);
  const n = slides.length;
  if (!track || n < 2) return;
  const prev = $('[data-slider-prev]', root);
  const next = $('[data-slider-next]', root);
  const count = $('[data-slider-count]', root);
  const imgs = $$('img', track);
  const smooth = () => (reduceMotion() ? 'auto' : 'smooth');

  // všechny fotografie se načtou dopředu, ať se při posouvání neukáže prázdné místo
  const preload = () => imgs.forEach((img) => { if (img.loading === 'lazy') img.loading = 'eager'; });
  if ('IntersectionObserver' in window) {
    const po = new IntersectionObserver(([e]) => { if (e.isIntersecting) { preload(); po.disconnect(); } }, { rootMargin: '120% 0px' });
    po.observe(root);
  } else preload();

  const left = (i) => slides[i].offsetLeft - slides[0].offsetLeft; // poloha snímku při posunu
  const current = () => {
    const max = track.scrollWidth - track.clientWidth;
    if (track.scrollLeft >= max - 4) return n - 1;
    let best = 0, d = Infinity;
    slides.forEach((s, i) => { const k = Math.abs(left(i) - track.scrollLeft); if (k < d) { d = k; best = i; } });
    return best;
  };
  let shown = -1;
  const render = () => {
    const i = current();
    if (i === shown) return;
    shown = i;
    if (count) count.textContent = String(i + 1).padStart(2, '0');
    if (prev) prev.setAttribute('aria-disabled', String(i === 0));
    if (next) next.setAttribute('aria-disabled', String(i === n - 1));
  };
  const goTo = (i) => track.scrollTo({ left: left(Math.max(0, Math.min(n - 1, i))), behavior: smooth() });

  let ticking = false;
  track.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; render(); }); } }, { passive: true });
  window.addEventListener('resize', render);
  render();

  // --- ruční ovládání
  let auto = !reduceMotion();
  const stopAuto = () => { auto = false; };
  if (prev) prev.addEventListener('click', () => { stopAuto(); goTo(current() - 1); });
  if (next) next.addEventListener('click', () => { stopAuto(); goTo(current() + 1); });
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); stopAuto(); goTo(current() + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); stopAuto(); goTo(current() - 1); }
  });
  ['pointerdown', 'wheel', 'touchstart', 'focusin'].forEach((ev) => root.addEventListener(ev, stopAuto, { once: true, passive: true }));

  // --- samočinný posun, dokud posuvník nikdo nepřevezme
  let visible = false;
  let hovered = false;
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.6 }).observe(root);
  root.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hovered = true; });
  root.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hovered = false; });
  const timer = setInterval(() => {
    if (!auto) { clearInterval(timer); return; }
    if (!visible || hovered || document.hidden) return;
    const i = current();
    goTo(i >= n - 1 ? 0 : i + 1);
  }, AUTO_MS);
}

/* ===== ba.js ===== */
// Porovnání před/po: nativní <input type=range> (myš, dotyk i klávesnice) + clip-path.
// Pokud má slider atribut data-ba-auto, sám se po vstupu na obrazovku sám pohybuje sem a tam,
// aby návštěvník poznal, že jde uchopit. Po prvním dotyku/klávese se automatika navždy vypne.

// průběh automatického pohybu: [čas v ms, poloha v %] – mezi body plynule, na koncích krátká zastávka
const SWEEP = [[0, 50], [700, 50], [2500, 13], [3100, 13], [5400, 87], [6000, 87], [7700, 50], [8700, 50]];
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const at = (ms) => {
  const t = ms % SWEEP[SWEEP.length - 1][0];
  for (let i = 1; i < SWEEP.length; i++) {
    if (t <= SWEEP[i][0]) {
      const [t0, v0] = SWEEP[i - 1];
      const [t1, v1] = SWEEP[i];
      return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0));
    }
  }
  return 50;
};

function initBeforeAfter() {
  $$('[data-ba]').forEach((root) => {
    const range = $('.ba__range', root);
    const after = $('.ba__after', root);
    const handle = $('.ba__handle', root);
    const stage = $('.ba__stage', root);
    let w = stage.clientWidth;
    const render = () => {
      const v = Number(range.value);
      after.style.clipPath = `inset(0 0 0 ${v}%)`;
      handle.style.transform = `translateX(${Math.round((w * v) / 100)}px)`;
      range.setAttribute('aria-valuetext', `Hranice porovnání ve ${Math.round(v)} % šířky; vlevo je fotografie před úpravou, vpravo po úpravě`);
    };
    range.addEventListener('input', render);
    if ('ResizeObserver' in window) new ResizeObserver(() => { w = stage.clientWidth; render(); }).observe(stage);
    render();
    if (root.hasAttribute('data-ba-auto')) autoSweep(root, range, render);
  });
}

function autoSweep(root, range, render) {
  if (reduceMotion() || !('IntersectionObserver' in window)) return;
  let raf = 0;
  let elapsed = 0; // uplynulý čas animace (ms), aby se po pauze navázalo, kde skončila
  let last = 0;
  let visible = false;
  let hovered = false;
  let stopped = false;
  range.step = 'any';

  const frame = (now) => {
    elapsed += now - last;
    last = now;
    range.value = at(elapsed).toFixed(2);
    render();
    raf = requestAnimationFrame(frame);
  };
  const run = () => {
    cancelAnimationFrame(raf);
    if (stopped || !visible || hovered) { root.classList.remove('is-auto'); return; }
    root.classList.add('is-auto');
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    root.classList.remove('is-auto');
    range.step = '1';
    range.value = Math.round(range.value);
    render();
  };
  ['pointerdown', 'keydown', 'focusin', 'touchstart'].forEach((ev) => root.addEventListener(ev, stop, { once: true, passive: true }));
  root.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hovered = true; run(); } });
  root.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { hovered = false; run(); } });
  document.addEventListener('visibilitychange', () => { visible = visible && !document.hidden; run(); });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting && !document.hidden; run(); }, { threshold: 0.4 }).observe(root);
}

/* ===== video.js ===== */
// Videa: krátké smyčky se spustí jen v zorném poli (ztlumené, s pauzou);
// delší videa se načtou a přehrají až na kliknutí. Nic se nestahuje předem.

function initVideo() {
  const saveData = navigator.connection && navigator.connection.saveData;
  const startPaused = reduceMotion() || saveData;

  $$('[data-video-loop]').forEach((fig) => {
    const v = $('video', fig);
    const btn = $('.vid__toggle', fig);
    v.muted = true;
    let userPaused = !!startPaused;
    const title = v.getAttribute('aria-label') || '';
    const syncBtn = () => {
      btn.setAttribute('aria-pressed', String(userPaused));
      btn.setAttribute('aria-label', (userPaused ? 'Přehrát video: ' : 'Pozastavit video: ') + title);
    };
    const play = () => {
      if (!v.getAttribute('src')) { v.src = v.dataset.src; v.load(); }
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    };
    syncBtn();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting) { if (!userPaused) play(); } else v.pause();
      }, { rootMargin: '80px', threshold: 0.2 }).observe(fig);
    }
    btn.addEventListener('click', () => {
      userPaused = !userPaused;
      syncBtn();
      if (userPaused) v.pause(); else play();
    });
  });

  const demands = $$('[data-video-demand]');
  demands.forEach((fig) => {
    const v = $('video', fig);
    const btn = $('.vid__play', fig);
    btn.addEventListener('click', () => {
      demands.forEach((o) => { if (o !== fig) { const ov = $('video', o); ov && ov.pause(); } });
      if (!v.getAttribute('src')) { v.src = v.dataset.src; }
      v.controls = true;
      fig.classList.add('is-playing');
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
      v.focus({ preventScroll: true });
    });
  });
}

/* ===== lightbox.js ===== */
// Galerie: nativní <dialog>, klávesnice (← → Esc), swipe, popisky. Bez JS fungují odkazy na velké fotky.

const ICONS = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" aria-hidden="true"><path d="M15 4.5 7.5 12 15 19.5"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" aria-hidden="true"><path d="M9 4.5 16.5 12 9 19.5"/></svg>',
};

function initLightbox() {
  if (!$('[data-lightbox]') || typeof HTMLDialogElement === 'undefined') return;
  let dlg, srcAvif, img, cap, count, items = [], idx = 0, opener = null;

  const build = () => {
    dlg = document.createElement('dialog');
    dlg.className = 'lb';
    dlg.setAttribute('aria-label', 'Prohlížeč fotografií');
    dlg.innerHTML = `<div class="lb__inner">
      <div class="lb__bar"><span class="lb__count" aria-live="polite"></span><button class="lb__btn lb__close" type="button" aria-label="Zavřít prohlížeč">${ICONS.close}</button></div>
      <figure class="lb__fig"><picture><source type="image/avif"><img alt="" decoding="async"></picture></figure>
      <p class="lb__cap"></p>
      <button class="lb__btn lb__nav lb__prev" type="button" aria-label="Předchozí fotografie">${ICONS.prev}</button>
      <button class="lb__btn lb__nav lb__next" type="button" aria-label="Další fotografie">${ICONS.next}</button>
    </div>`;
    document.body.append(dlg);
    srcAvif = $('source', dlg); img = $('img', dlg); cap = $('.lb__cap', dlg); count = $('.lb__count', dlg);
    $('.lb__close', dlg).addEventListener('click', () => dlg.close());
    $('.lb__prev', dlg).addEventListener('click', () => go(-1));
    $('.lb__next', dlg).addEventListener('click', () => go(1));
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.classList.contains('lb__inner') || e.target.classList.contains('lb__fig')) dlg.close(); });
    dlg.addEventListener('close', () => { document.documentElement.classList.remove('lb-open'); (opener || {}).focus && opener.focus({ preventScroll: true }); });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'Home') { e.preventDefault(); show(0); }
      else if (e.key === 'End') { e.preventDefault(); show(items.length - 1); }
    });
    let sx = 0, sy = 0, tracking = false;
    const fig = $('.lb__fig', dlg);
    fig.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; sx = e.clientX; sy = e.clientY; tracking = true; });
    fig.addEventListener('pointerup', (e) => {
      if (!tracking) return; tracking = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
    });
    fig.addEventListener('pointercancel', () => { tracking = false; });
  };

  const preload = (i) => { const it = items[i]; if (it) { const im = new Image(); im.src = it.href; } };
  const show = (i) => {
    idx = (i + items.length) % items.length;
    const it = items[idx];
    img.classList.add('is-swapping');
    const apply = () => {
      srcAvif.srcset = it.avif || '';
      img.src = it.href; img.alt = it.alt || '';
      if (it.w) { img.width = it.w; img.height = it.h; }
      cap.textContent = it.caption || '';
      count.textContent = `${idx + 1} / ${items.length}`;
      requestAnimationFrame(() => img.classList.remove('is-swapping'));
    };
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? apply() : setTimeout(apply, 90);
    preload(idx + 1); preload(idx - 1);
    const nav = items.length > 1;
    $('.lb__prev', dlg).hidden = !nav; $('.lb__next', dlg).hidden = !nav;
  };
  const go = (d) => show(idx + d);

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-lightbox]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    if (!dlg) build();
    const group = a.dataset.group;
    const all = $$('[data-lightbox]').filter((el) => (!group || el.dataset.group === group) && !el.closest('[hidden]'));
    items = all.map((el) => ({ href: el.getAttribute('href'), avif: el.dataset.avif, w: Number(el.dataset.w), h: Number(el.dataset.h), caption: el.dataset.caption, alt: el.dataset.alt }));
    idx = Math.max(0, all.indexOf(a));
    opener = a;
    document.documentElement.classList.add('lb-open');
    dlg.showModal();
    show(idx);
    $('.lb__close', dlg).focus({ preventScroll: true });
  });
}

/* ===== filter.js ===== */
// Filtr galerie podle typu povrchu. Bez JS jsou vidět všechny fotografie.

function initFilter() {
  const bar = $('[data-filters]');
  if (!bar) return;
  const items = $$('.gallery__item');
  const buttons = $$('[data-filter]', bar);
  const status = $('[data-filter-status]');
  const apply = (cat) => {
    let n = 0;
    items.forEach((it) => {
      const show = cat === 'vse' || it.dataset.cat === cat;
      it.hidden = !show;
      if (show) n++;
    });
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === cat)));
    if (status) status.textContent = cat === 'vse' ? '' : `Zobrazeno fotografií: ${n}`;
  };
  buttons.forEach((b) => b.addEventListener('click', () => { apply(b.dataset.filter); history.replaceState(null, '', b.dataset.filter === 'vse' ? location.pathname + location.search : `#${b.dataset.filter}`); }));
  // odkaz typu realizace/#podlahy rovnou zapne filtr a odroluje ke galerii
  const fromHash = () => {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash && buttons.some((b) => b.dataset.filter === hash)) {
      apply(hash);
      const gallery = $('#galerie');
      if (gallery) gallery.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  fromHash();
  window.addEventListener('hashchange', fromHash);
}

/* ===== form.js ===== */
// Poptávkový formulář: validace, chybové stavy, odeslání přes fetch.
// Potvrzení se zobrazí VÝHRADNĚ po úspěšné odpovědi serveru ({ ok: true }).

const MAX_FILES = 3;
const MAX_SIZE = 5 * 1024 * 1024;
const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const OK_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' kB');

function initForms() {
  $$('[data-form]').forEach(setupForm);
}

function setupForm(form) {
  const card = form.closest('[data-form-card]');
  const alertBox = $('[data-form-alert]', form);
  const success = $('[data-form-success]', card);
  const submitBtn = $('button[type=submit]', form);
  const label = $('[data-label]', submitBtn);
  const PHONE = form.dataset.phone || '';
  const MAILTO = form.dataset.mailto || '';
  const fileInput = $('[data-files]', form);
  const fileList = $('[data-file-list]', form);
  const more = $('[data-more]', form);
  let files = [];
  $('[data-ts]', form).value = String(Math.floor(Date.now() / 1000));

  // --- předvolby z adresy: ?typ=sterka
  const params = new URLSearchParams(location.search);
  const typ = params.get('typ');
  if (typ && form.elements.typ && [...form.elements.typ.options].some((o) => o.value === typ)) form.elements.typ.value = typ;
  if (typ === 'showroom' && !form.elements.zprava.value) form.elements.zprava.value = 'Chtěl(a) bych se domluvit na návštěvu showroomu. Vyhovuje mi: ';
  if (typ === 'workshop' && !form.elements.zprava.value) form.elements.zprava.value = 'Mám zájem o workshop aplikace stěrek. Preferovaný termín: ';

  // --- pravidla
  const rules = {
    jmeno: (v) => (v.trim().length < 2 ? 'Zadejte prosím své jméno.' : ''),
    telefon: (v) => {
      const s = v.trim();
      if (!s) return 'Zadejte telefonní číslo.';
      const digits = s.replace(/\D/g, '');
      return /^[+\d][\d\s().\-/]*$/.test(s) && digits.length >= 9 && digits.length <= 15 ? '' : 'Telefon zadejte včetně číslic, například +420 602 596 664.';
    },
    email: (v) => {
      const s = v.trim();
      if (!s) return 'Zadejte e-mailovou adresu.';
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? '' : 'E-mail zadejte ve tvaru jmeno@domena.cz.';
    },
    typ: (v) => (v ? '' : 'Vyberte typ realizace.'),
    zprava: (v) => (v.trim().length < 10 ? 'Napište nám prosím alespoň krátkou zprávu (aspoň 10 znaků).' : ''),
    plocha: (v) => (v.trim() && !/^\d{1,5}([.,]\d{1,2})?$/.test(v.trim()) ? 'Plochu zadejte číslem, například 25 nebo 12,5.' : ''),
    fotky: () => {
      if (files.length > MAX_FILES) return `Nahrajte nejvýše ${MAX_FILES} fotografie.`;
      const big = files.find((f) => f.size > MAX_SIZE);
      if (big) return `Soubor „${big.name}“ je větší než 5 MB.`;
      const bad = files.find((f) => !(OK_TYPES.includes(f.type) || OK_EXT.test(f.name)));
      if (bad) return `Soubor „${bad.name}“ není podporovaný obrázek (JPG, PNG, WebP nebo HEIC).`;
      return '';
    },
  };
  const fieldEl = (name) => $(`[data-field="${name}"]`, form);
  const control = (name) => (name === 'fotky' ? fileInput : form.elements[name]);

  function setError(name, msg) {
    const f = fieldEl(name);
    if (!f) return;
    const err = $('[data-error]', f);
    f.classList.toggle('field--error', !!msg);
    if (err) err.textContent = msg;
    const c = control(name);
    if (c && c.setAttribute) { if (msg) c.setAttribute('aria-invalid', 'true'); else c.removeAttribute('aria-invalid'); }
  }
  const validateField = (name) => {
    const rule = rules[name];
    if (!rule) return '';
    const c = control(name);
    const msg = rule(c && c.value !== undefined ? c.value : '');
    setError(name, msg);
    return msg;
  };

  const touched = new Set();
  form.addEventListener('blur', (e) => {
    const name = e.target.name;
    if (rules[name]) { touched.add(name); validateField(name); }
  }, true);
  form.addEventListener('input', (e) => {
    const name = e.target.name;
    if (rules[name] && (touched.has(name) || fieldEl(name)?.classList.contains('field--error'))) validateField(name);
  });

  // --- fotografie
  const renderFiles = () => {
    fileList.innerHTML = '';
    files.forEach((f, i) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = `${f.name} (${fmtSize(f.size)})`;
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Odebrat';
      b.setAttribute('aria-label', `Odebrat soubor ${f.name}`);
      b.addEventListener('click', () => { files.splice(i, 1); syncFiles(); validateField('fotky'); });
      li.append(span, b);
      fileList.append(li);
    });
  };
  const syncFiles = () => {
    try { const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f)); fileInput.files = dt.files; } catch (e) { /* starší prohlížeč */ }
    renderFiles();
  };
  fileInput.addEventListener('change', () => {
    files = files.concat(Array.from(fileInput.files));
    syncFiles();
    touched.add('fotky');
    validateField('fotky');
  });

  // --- souhrn chyb
  const showSummary = (items) => {
    alertBox.innerHTML = '';
    const strong = document.createElement('strong');
    strong.textContent = items.length === 1 ? 'Formulář obsahuje jednu chybu:' : `Formulář obsahuje chyby (${items.length}):`;
    const ul = document.createElement('ul');
    items.forEach(({ name, msg }) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${control(name)?.id || ''}`;
      a.textContent = msg;
      a.addEventListener('click', (e) => { e.preventDefault(); focusField(name); });
      li.append(a);
      ul.append(li);
    });
    alertBox.append(strong, ul);
    alertBox.hidden = false;
  };
  // Záložní cesta: zpráva se předvyplní do e-mailového klienta. Nejde o odeslání přes web,
  // proto se po kliknutí nikde nezobrazuje potvrzení – odešle ji až uživatel ve své poště.
  const mailtoHref = () => {
    const val = (n) => (form.elements[n] ? String(form.elements[n].value).trim() : '');
    const sel = form.elements.typ;
    const typLabel = sel && sel.selectedIndex > 0 ? sel.options[sel.selectedIndex].text : '';
    const lines = [
      `Jméno: ${val('jmeno')}`,
      `Telefon: ${val('telefon')}`,
      `E-mail: ${val('email')}`,
      `Typ realizace: ${typLabel || '-'}`,
      `Lokalita: ${val('lokalita') || '-'}`,
      `Přibližná plocha: ${val('plocha') ? val('plocha') + ' m²' : '-'}`,
      '',
      val('zprava'),
    ];
    return `mailto:${MAILTO}?subject=${encodeURIComponent('Poptávka z webu' + (typLabel ? ': ' + typLabel : ''))}&body=${encodeURIComponent(lines.join('\n').slice(0, 1800))}`;
  };
  const showMessage = (text) => {
    alertBox.innerHTML = '';
    const strong = document.createElement('strong');
    strong.textContent = 'Zprávu se nepodařilo odeslat.';
    const p = document.createElement('p');
    p.textContent = text;
    alertBox.append(strong, p);
    if (MAILTO) {
      const wrap = document.createElement('p');
      wrap.className = 'alert__mail';
      const a = document.createElement('a');
      a.className = 'btn btn--ghost';
      a.href = mailtoHref();
      a.textContent = 'Odeslat e-mailem';
      wrap.append(a);
      const note = document.createElement('span');
      note.className = 'small';
      note.style.display = 'block';
      note.style.marginTop = '8px';
      note.textContent = 'Otevře se váš e-mailový program s předvyplněnou zprávou. Fotografie případně připojte ručně.';
      wrap.append(note);
      alertBox.append(wrap);
    }
    alertBox.hidden = false;
  };
  const focusField = (name) => {
    const c = control(name);
    if (!c) return;
    if (['lokalita', 'plocha', 'fotky'].includes(name) && more) more.open = true;
    c.focus();
  };

  const validateAll = () => {
    const out = [];
    for (const name of Object.keys(rules)) {
      touched.add(name);
      const msg = validateField(name);
      if (msg) out.push({ name, msg });
    }
    return out;
  };

  const setBusy = (busy) => {
    form.setAttribute('aria-busy', String(busy));
    submitBtn.disabled = busy;
    label.textContent = busy ? 'Odesílám…' : 'Odeslat poptávku';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.hidden = true;
    const errors = validateAll();
    if (errors.length) {
      showSummary(errors);
      alertBox.focus({ preventScroll: false });
      return;
    }
    setBusy(true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' }, signal: ctrl.signal, credentials: 'same-origin' });
      let data = null;
      try { data = await res.json(); } catch (_) { /* odpověď není JSON */ }
      if (res.ok && data && data.ok === true) {
        card.classList.add('is-sent');
        success.focus();
        success.scrollIntoView({ block: 'center', behavior: 'auto' });
      } else if (data && data.errors && typeof data.errors === 'object') {
        const items = Object.entries(data.errors).map(([name, msg]) => ({ name, msg }));
        items.forEach(({ name, msg }) => setError(name, msg));
        showSummary(items);
        alertBox.focus();
      } else if (res.status === 429) {
        showMessage(`Odeslali jste příliš mnoho zpráv za krátkou dobu. Zkuste to prosím za chvíli, nebo nám zavolejte na ${PHONE}.`);
        alertBox.focus();
      } else {
        showMessage(`Server zprávu nepřijal. Zkuste to prosím znovu, případně nám zavolejte na ${PHONE}.`);
        alertBox.focus();
      }
    } catch (err) {
      showMessage(`Spojení se serverem se nezdařilo, zpráva neodešla. Zkontrolujte připojení a zkuste to znovu, případně nám zavolejte na ${PHONE}.`);
      alertBox.focus();
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  });

  const reset = $('[data-form-reset]', card);
  if (reset) reset.addEventListener('click', () => {
    form.reset();
    files = [];
    syncFiles();
    touched.clear();
    ['jmeno', 'telefon', 'email', 'typ', 'zprava', 'plocha', 'fotky'].forEach((n) => setError(n, ''));
    applyContactType();
    alertBox.hidden = true;
    card.classList.remove('is-sent');
    $('[data-ts]', form).value = String(Math.floor(Date.now() / 1000));
    form.elements.jmeno.focus();
  });
}

/* ===== map.js ===== */
// Mapa: třetí strana se kontaktuje až po výslovném kliknutí.

function initMap() {
  $$('[data-map]').forEach((box) => {
    const btn = box.querySelector('[data-map-load]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const f = document.createElement('iframe');
      f.src = box.dataset.src;
      f.title = 'Mapa: Emplastrum Design, 24. dubna 347, Želešice';
      f.loading = 'lazy';
      f.referrerPolicy = 'no-referrer';
      box.replaceChildren(f);
    });
  });
}

/* ===== workshop.js ===== */
// Schová termíny workshopu, které už proběhly (stránka je statická).

function initWorkshop() {
  const list = $$('[data-date]');
  if (!list.length) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let left = 0;
  list.forEach((li) => {
    const d = new Date(li.dataset.date + 'T00:00:00');
    if (d < today) li.hidden = true; else left++;
  });
  const none = $('[data-no-dates]');
  if (none) none.hidden = left > 0;
}

/* ===== viz.js ===== */
// Animované schéma „jak povrch vzniká“ (řez skladbou). Web Animations API, bez knihoven.
// Animuje se jen transform a opacity. Pohyb lze kdykoli pozastavit, kroky lze přeskakovat.
// Bez JS (nebo při omezeném pohybu) je vidět hotová skladba a seznam kroků.

const W = 160;                 // šířka schématu (jednotky viewBoxu)
const OFF_L = -14;             // nástroj mimo schéma vlevo
const OFF_R = 174;             // … a vpravo
const SLAB = 52;               // horní hrana podkladu

const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (amt >= 0 ? (255 - c) * amt : c * amt)));
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
};

function initViz() {
  $$('[data-viz]').forEach(setupViz);
}

function setupViz(root) {
  const svg = $('.viz-svg', root);
  const playBtn = $('.viz__play', root);
  const playText = $('.viz__play-text', playBtn);
  const holdEl = $('[data-hold]', svg);
  const swatchColors = (root.dataset.swatchColors || '').split(',');
  const pick = Number(root.dataset.pick || 0);
  const reduce = reduceMotion() || (navigator.connection && navigator.connection.saveData);

  const steps = $$('.viz-step', root).map((el) => ({
    el,
    kind: el.dataset.kind,
    dur: Number(el.dataset.dur),
    tool: el.dataset.toolName || '',
    layers: el.dataset.layers ? el.dataset.layers.split(',') : [],
    tops: el.dataset.tops ? el.dataset.tops.split(',').map(Number) : [],
    bar: $('.viz-step__bar', el),
  }));
  const layerEls = $$('[data-layer]', svg);
  const toolEls = $$('[data-tool]', svg);
  const L = (k) => $(`[data-layer="${k}"]`, svg);
  const T = (k) => $(`[data-tool="${k}"]`, svg);
  const eraser = $('[data-eraser]', svg);
  const crack = $('[data-crack]', svg);
  const patch = $('[data-patch]', svg);
  const scan = $('[data-scan]', svg);
  const marks = $$('[data-mark]', svg);
  const swatchG = $('[data-swatches]', svg);
  const swatches = $$('[data-swatch]', svg);
  const pickEl = $('[data-pick]', svg);
  const shine = $('[data-shine]', svg);
  const check = $('[data-check]', svg);

  // barva vybrané stěrky (vzorek z palety) – druhá vrstva je o něco světlejší
  const base = swatchColors[pick] || '#b0583a';
  root.style.setProperty('--ster', base);
  root.style.setProperty('--ster2', shade(base, 0.1));

  let live = [];          // všechny vytvořené animace (kvůli zrušení / pozastavení)
  let pausedByUs = new Set();
  let token = 0;          // zneplatní běžící sekvenci při přeskoku
  let current = 0;
  let playing = false;
  let paused = false;
  let finished = false;
  let startedOnce = false;
  let resumeOnVisible = false;

  const track = (a) => { live.push(a); return a; };
  const anim = (el, frames, opts) => track(el.animate(frames, { fill: 'both', ...opts }));

  // ------------------------------------------------------------------ stavy
  function resetState() {
    live.forEach((a) => a.cancel());
    live = [];
    pausedByUs.clear();
    layerEls.forEach((l) => { l.style.transform = 'scaleX(0)'; });
    if (eraser) eraser.style.transform = 'scaleX(0)';
    if (crack) crack.style.opacity = 1;
    if (patch) patch.style.opacity = 0;
    marks.forEach((m) => { m.style.opacity = 0; });
    if (scan) scan.style.opacity = 0;
    toolEls.forEach((t) => { t.style.transform = `translate(${OFF_L}px, ${SLAB}px)`; t.style.opacity = 0; t.classList.remove('is-working'); });
    if (swatchG) swatchG.style.opacity = 0;
    swatches.forEach((s) => { s.style.opacity = 1; });
    if (pickEl) { pickEl.style.transform = 'translateX(0)'; pickEl.style.opacity = 1; }
    if (shine) shine.style.opacity = 0;
    if (check) check.style.opacity = 0;
  }

  function applyDone(s, isLast) {
    switch (s.kind) {
      case 'swatch':
        if (swatchG) swatchG.style.opacity = 1;
        swatches.forEach((e, i) => { e.style.opacity = i === pick ? 1 : 0.3; });
        if (pickEl) pickEl.style.transform = `translateX(${pick * 12}px)`;
        break;
      case 'scan': marks.forEach((m) => { m.style.opacity = 1; }); break;
      case 'grind':
        if (eraser) eraser.style.transform = 'scaleX(1)';
        if (crack) { crack.style.opacity = 0; patch.style.opacity = 1; }
        break;
      case 'patch':
        if (crack) { crack.style.opacity = 0; patch.style.opacity = 1; }
        break;
      case 'roll': case 'trowel': case 'pour': case 'lacquer':
        s.layers.forEach((k) => { const el = L(k); if (el) el.style.transform = 'none'; });
        break;
      default: break;
    }
    if (isLast && check) check.style.opacity = 1;
  }

  function stateThrough(i, inclusive) {
    resetState();
    const upto = inclusive ? i : i - 1;
    for (let k = 0; k <= upto; k++) applyDone(steps[k], k === steps.length - 1);
  }

  function setActive(i) {
    current = i;
    steps.forEach((s, k) => {
      const on = k === i;
      s.el.classList.toggle('is-active', on);
      const b = $('.viz-step__btn', s.el);
      if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
  }

  // ------------------------------------------------------------------ stavební kameny
  const pass = (tool, { from, to, y, dur, delay = 0, first = true }) =>
    anim(tool, [{ transform: `translate(${from}px, ${y}px)` }, { transform: `translate(${to}px, ${y}px)` }], { duration: dur, delay, easing: 'linear', fill: first ? 'both' : 'forwards' });

  // vrstva se odhaluje přesně tak, jak se po ní pohybuje nástroj
  const revealWith = (layer, { from, to, dur, delay = 0, origin = 'left' }) => {
    const span = Math.abs(to - from);
    const e0 = Math.abs((origin === 'right' ? W : 0) - from) / span;
    const e1 = Math.abs((origin === 'right' ? 0 : W) - from) / span;
    return anim(layer, [
      { transform: 'scaleX(0)', offset: 0 },
      { transform: 'scaleX(0)', offset: Math.min(e0, 0.98) },
      { transform: 'scaleX(1)', offset: Math.min(e1, 1) },
      { transform: 'scaleX(1)', offset: 1 },
    ], { duration: dur, delay, easing: 'linear' });
  };
  const show = (t) => { t.style.opacity = 1; };

  function buildStep(i) {
    const s = steps[i];
    const d = s.dur;
    const isLast = i === steps.length - 1;
    switch (s.kind) {
      case 'swatch': {
        if (swatchG) {
          swatchG.style.opacity = 0;
          anim(swatchG, [{ opacity: 0, transform: 'translate(9px, 4px)' }, { opacity: 1, transform: 'translate(9px, 9px)' }], { duration: 700, easing: 'ease-out' });
          const x = pick * 12;
          anim(pickEl, [
            { transform: 'translateX(0px)', offset: 0 }, { transform: 'translateX(12px)', offset: 0.28 }, { transform: 'translateX(12px)', offset: 0.4 },
            { transform: `translateX(${x}px)`, offset: 0.85 }, { transform: `translateX(${x}px)`, offset: 1 },
          ], { duration: d * 0.5, delay: 800, easing: 'ease-in-out' });
          swatches.forEach((e, k) => anim(e, [{ opacity: 1 }, { opacity: k === pick ? 1 : 0.3 }], { duration: 600, delay: 800 + d * 0.5 + 100 }));
        }
        break;
      }
      case 'scan': {
        scan.style.opacity = 1;
        const dur = d * 0.82;
        anim(scan, [{ transform: 'translateX(-2px)' }, { transform: 'translateX(162px)' }], { duration: dur, easing: 'linear' });
        anim(scan, [{ opacity: 0, offset: 0 }, { opacity: 1, offset: 0.06 }, { opacity: 1, offset: 0.94 }, { opacity: 0, offset: 1 }], { duration: dur, easing: 'linear' });
        [30, 78, 124].forEach((x, k) => anim(marks[k], [{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: dur * ((x + 2) / 164) }));
        if (isLast) check && anim(check, [{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: dur });
        break;
      }
      case 'grind': {
        const g = T(s.tool); show(g);
        const dur = d * 0.9;
        g.classList.add('is-working');
        const a = pass(g, { from: OFF_L, to: OFF_R, y: SLAB, dur });
        a.finished.then(() => g.classList.remove('is-working')).catch(() => {});
        revealWith(eraser, { from: OFF_L, to: OFF_R, dur, origin: 'left' });
        if (crack) {
          const tc = (88 - OFF_L) / (OFF_R - OFF_L);
          anim(crack, [{ opacity: 1, offset: 0 }, { opacity: 1, offset: tc - 0.01 }, { opacity: 0, offset: tc + 0.05 }, { opacity: 0, offset: 1 }], { duration: dur, easing: 'linear' });
          anim(patch, [{ opacity: 0, offset: 0 }, { opacity: 0, offset: tc + 0.02 }, { opacity: 1, offset: tc + 0.08 }, { opacity: 1, offset: 1 }], { duration: dur, easing: 'linear' });
        }
        break;
      }
      case 'patch': {
        const t = T(s.tool); show(t);
        anim(t, [
          { transform: `translate(60px, ${SLAB}px)`, offset: 0 }, { transform: `translate(104px, ${SLAB}px)`, offset: 0.38 },
          { transform: `translate(72px, ${SLAB}px)`, offset: 0.7 }, { transform: `translate(96px, ${SLAB}px)`, offset: 1 },
        ], { duration: d * 0.8, easing: 'ease-in-out' });
        anim(t, [{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.9 }, { opacity: 0, offset: 1 }], { duration: d * 0.8, easing: 'linear' });
        if (crack) {
          anim(crack, [{ opacity: 1, offset: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0, offset: 0.5 }, { opacity: 0, offset: 1 }], { duration: d * 0.8, easing: 'linear' });
          anim(patch, [{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.25 }, { opacity: 1, offset: 0.55 }, { opacity: 1, offset: 1 }], { duration: d * 0.8, easing: 'linear' });
        }
        break;
      }
      case 'roll': {
        const t = T(s.tool); show(t);
        const dur = d * 0.9;
        pass(t, { from: OFF_L, to: OFF_R, y: s.tops[0], dur });
        s.layers.forEach((k) => revealWith(L(k), { from: OFF_L, to: OFF_R, dur, origin: 'left' }));
        break;
      }
      case 'trowel': {
        const t = T(s.tool); show(t);
        const half = d * 0.46;
        pass(t, { from: OFF_L, to: OFF_R, y: s.tops[0], dur: half });
        revealWith(L(s.layers[0]), { from: OFF_L, to: OFF_R, dur: half, origin: 'left' });
        const delay = d * 0.54;
        pass(t, { from: OFF_R, to: OFF_L, y: s.tops[1], dur: half, delay, first: false });
        revealWith(L(s.layers[1]), { from: OFF_R, to: OFF_L, dur: half, delay, origin: 'right' });
        break;
      }
      case 'pour': {
        // penetrace válečkem → vrstva stěrkou (tažená zpět) → případný posyp
        const roller = T('roller'); const sq = T(s.tool); show(roller); show(sq);
        const pen = d * 0.3; const pour = d * 0.42;
        pass(roller, { from: OFF_L, to: OFF_R, y: s.tops[0], dur: pen });
        revealWith(L(s.layers[0]), { from: OFF_L, to: OFF_R, dur: pen, origin: 'left' });
        const dl = d * 0.36;
        pass(sq, { from: OFF_R, to: OFF_L, y: s.tops[1], dur: pour, delay: dl, first: false });
        revealWith(L(s.layers[1]), { from: OFF_R, to: OFF_L, dur: pour, delay: dl, origin: 'right' });
        if (s.layers[2]) {
          const grit = L(s.layers[2]);
          grit.style.transform = 'none';
          anim(grit, [{ opacity: 0 }, { opacity: 1 }], { duration: d * 0.18, delay: d * 0.8 });
        }
        break;
      }
      case 'lacquer': {
        const t = T(s.tool); show(t);
        const dur = d * 0.6;
        pass(t, { from: OFF_L, to: OFF_R, y: s.tops[0], dur });
        revealWith(L(s.layers[0]), { from: OFF_L, to: OFF_R, dur, origin: 'left' });
        if (shine) {
          shine.style.opacity = 1;
          anim(shine, [{ transform: 'translateX(0px)', opacity: 0, offset: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.85 }, { transform: 'translateX(206px)', opacity: 0, offset: 1 }], { duration: d * 0.3, delay: d * 0.66, easing: 'ease-in-out' });
        }
        if (isLast && check) anim(check, [{ opacity: 0, transform: 'translate(146px, 12px) scale(0.6)' }, { opacity: 1, transform: 'translate(146px, 12px) scale(1)' }], { duration: 520, delay: d * 0.8, easing: 'ease-out' });
        break;
      }
      case 'final': {
        if (shine) { shine.style.opacity = 1; anim(shine, [{ transform: 'translateX(0px)', opacity: 0, offset: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.85 }, { transform: 'translateX(206px)', opacity: 0, offset: 1 }], { duration: d * 0.55, delay: d * 0.1, easing: 'ease-in-out' }); }
        if (check) anim(check, [{ opacity: 0, transform: 'translate(146px, 12px) scale(0.6)' }, { opacity: 1, transform: 'translate(146px, 12px) scale(1)' }], { duration: 520, delay: d * 0.4, easing: 'ease-out' });
        break;
      }
      default: break;
    }
    // ukazatel průběhu aktuálního kroku
    anim(s.bar, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: d, easing: 'linear' });
  }

  async function runStep(i, tk) {
    setActive(i);
    const before = live.length;
    buildStep(i);
    const mine = live.slice(before);
    await Promise.all(mine.map((a) => a.finished.catch(() => {})));
    return tk === token;
  }

  async function playFrom(i) {
    const tk = ++token;
    playing = true; paused = false; finished = false;
    root.classList.remove('is-paused');
    updateBtn();
    stateThrough(i, false);
    for (let k = i; k < steps.length; k++) {
      if (!(await runStep(k, tk))) return;
      if (k < steps.length - 1) {
        const hold = track(holdEl.animate([{ opacity: 0 }, { opacity: 0 }], { duration: 650 }));
        await hold.finished.catch(() => {});
        if (tk !== token) return;
      }
    }
    if (tk === token) { playing = false; finished = true; updateBtn(); }
  }

  // ------------------------------------------------------------------ ovládání
  function updateBtn() {
    const state = finished ? 'done' : paused || !playing ? 'paused' : 'playing';
    playBtn.dataset.state = state;
    const label = state === 'playing' ? 'Pozastavit' : state === 'done' ? 'Přehrát znovu' : 'Pokračovat';
    playText.textContent = label;
    playBtn.setAttribute('aria-label', state === 'playing' ? 'Pozastavit animaci' : state === 'done' ? 'Přehrát animaci znovu' : 'Pokračovat v animaci');
  }
  function pauseAll() {
    paused = true;
    root.classList.add('is-paused');
    live.forEach((a) => { if (a.playState === 'running') { a.pause(); pausedByUs.add(a); } });
    updateBtn();
  }
  function resumeAll() {
    paused = false;
    root.classList.remove('is-paused');
    pausedByUs.forEach((a) => { if (a.playState === 'paused') a.play(); });
    pausedByUs.clear();
    updateBtn();
  }
  function go(i) {
    if (reduce) { showStatic(i); return; }
    playFrom(i);
  }
  function showStatic(i) {
    token++;
    stateThrough(i, true);
    toolEls.forEach((t) => { t.style.opacity = 0; });
    setActive(i);
  }

  steps.forEach((s, i) => $('.viz-step__btn', s.el).addEventListener('click', () => go(i)));
  playBtn.addEventListener('click', () => {
    if (finished) { startedOnce = true; go(0); return; }
    if (!playing && !paused) { go(current); return; }
    if (paused) resumeAll(); else pauseAll();
  });

  root.classList.add('is-enhanced');
  if (reduce) {
    root.classList.add('viz--static');
    playBtn.hidden = true;
    showStatic(steps.length - 1);
    return;
  }

  // vzhled před prvním přehráním = hotová skladba; přehrání se spustí, když je schéma vidět
  setActive(steps.length - 1);
  stateThrough(steps.length - 1, true);
  toolEls.forEach((t) => { t.style.opacity = 0; });
  updateBtn();
  if (!('IntersectionObserver' in window)) return;
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) {
      if (!startedOnce) { startedOnce = true; go(0); }
      else if (resumeOnVisible && paused) { resumeOnVisible = false; resumeAll(); }
    } else if (playing && !paused) {
      resumeOnVisible = true;
      pauseAll();
    }
  }, { threshold: 0.4 }).observe($('.viz__stage', root));
}

/* ===== main.js ===== */
// Každý modul běží samostatně: chyba v jednom nesmí shodit ostatní.
[initNav, initReveal, initSlider, initBeforeAfter, initVideo, initLightbox, initFilter, initForms, initMap, initWorkshop, initViz].forEach((fn) => {
  try { fn(); } catch (e) { console.error('[web]', fn.name, e); }
});

})();
