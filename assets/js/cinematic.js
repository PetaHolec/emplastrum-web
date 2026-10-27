/* Emplastrum Design – cinematic vrstva (pohyb)
   Rozdělení nadpisů na slova, vstup kamerou do hera, procházka místnostmi, paralaxa karet a fotek,
   růst fotografie showroomu, stav hlavičky, světlo na kartách. Bez knihoven.
   Výkon: při scrollu se zapisuje jen transform / opacity přímo na konkrétní prvky (žádné dědičné
   CSS proměnné, které by přepočítávaly styly celých sekcí), hodnota se zapíše jen když se změní
   a počítá se jen to, co je právě na obrazovce. Při omezeném pohybu se nic z toho nespouští. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  // zápis stylu jen při změně hodnoty
  function put(el, prop, val) {
    if (!el) return;
    var c = el.__c || (el.__c = {});
    if (c[prop] === val) return;
    c[prop] = val;
    if (prop.charAt(0) === '-') el.style.setProperty(prop, val); else el.style[prop] = val;
  }

  // --- rozdělení textu na slova (jen prvky bez vnořených značek)
  function splitWords(el) {
    if (el.__split || el.children.length) return;
    var text = el.textContent.trim().replace(/\s+/g, ' ');
    if (!text) return;
    el.__split = true;
    el.setAttribute('aria-label', text);
    el.textContent = '';
    text.split(' ').forEach(function (word, i, all) {
      var w = document.createElement('span');
      w.className = 'w';
      w.setAttribute('aria-hidden', 'true');
      var inner = document.createElement('span');
      inner.className = 'w__i';
      inner.style.setProperty('--i', i);
      inner.textContent = word;
      w.appendChild(inner);
      el.appendChild(w);
      if (i < all.length - 1) el.appendChild(document.createTextNode(' '));
    });
  }

  function initSplit() {
    var hero = document.querySelector('.hero__title, .page-band h1');
    if (hero) splitWords(hero);
    if (reduce) return;
    each(document.querySelectorAll('.h2, .h-title'), function (el) {
      if (el === hero || el.closest('.hero, .page-band, .mega, .menu-overlay')) return;
      if (el.children.length) return;
      splitWords(el);
      el.setAttribute('data-split', '');
    });
    if (!('IntersectionObserver' in window)) {
      each(document.querySelectorAll('[data-split]'), function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.1 });
    each(document.querySelectorAll('[data-split]'), function (el) { io.observe(el); });
  }

  // --- ztmavení hera při vstupu kamerou
  function addBits() {
    var hero = document.querySelector('.hero');
    if (hero && !hero.querySelector('.hero__shade')) {
      var shade = document.createElement('span');
      shade.className = 'hero__shade';
      shade.setAttribute('aria-hidden', 'true');
      hero.appendChild(shade);
    }
  }

  // --- fotka showroomu se plynule objeví, až je načtená (žádné probliknutí šedé plochy)
  function initFadeIn() {
    each(document.querySelectorAll('.showroom-photo img'), function (im) {
      var done = function () { im.classList.add('is-loaded'); };
      if (im.complete && im.naturalWidth) done();
      else { im.addEventListener('load', done, { once: true }); im.addEventListener('error', done, { once: true }); }
    });
  }

  // --- virtuální prohlídka: dokud na ni návštěvník neklikne, nechytá kolečko myši ani posun
  //     prstem (stránka se přes ni normálně posouvá). Po odjetí myší / odscrollování se zase zamkne.
  function initTour() {
    each(document.querySelectorAll('[data-tour]'), function (box) {
      var btn = box.querySelector('[data-tour-on]');
      if (!btn) return;
      var lock = function () { box.classList.remove('is-active'); };
      btn.addEventListener('click', function () {
        box.classList.add('is-active');
        var f = box.querySelector('iframe');
        if (f) f.focus();
      });
      box.addEventListener('mouseleave', lock);
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (en) { if (!en[0].isIntersecting) lock(); }, { threshold: 0 }).observe(box);
      }
    });
  }

  // --- světlo sleduje kurzor na kartách
  function initSpot() {
    if (!window.matchMedia || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    each(document.querySelectorAll('.panel'), function (p) {
      var raf = 0, ex = 0, ey = 0;
      p.addEventListener('pointermove', function (e) {
        ex = e.clientX; ey = e.clientY;
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          var r = p.getBoundingClientRect();
          p.style.setProperty('--mx', (ex - r.left) + 'px');
          p.style.setProperty('--my', (ey - r.top) + 'px');
        });
      }, { passive: true });
    });
  }

  // --- vše, co se řídí scrollem
  function initScroll() {
    var header = document.querySelector('.site-header');
    var vh = window.innerHeight, vw = window.innerWidth;
    var ticking = false;

    // sledování viditelnosti: počítá se jen to, co je na obrazovce
    var visible = new Set();
    var vio = 'IntersectionObserver' in window ? new IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target); });
      req();
    }, { rootMargin: '15% 0px' }) : null;
    function watch(el) { if (!el) return; if (vio) vio.observe(el); else visible.add(el); }

    // hero: zastaví se a kamera „vejde“ dovnitř; obal přidá prostor pro scroll
    var hero = document.querySelector('.hero'), heroWrap = null, hero1 = {};
    if (hero && !reduce && hero.parentNode.tagName === 'MAIN') {
      heroWrap = document.createElement('div');
      heroWrap.className = 'hero-walk';
      hero.parentNode.insertBefore(heroWrap, hero);
      heroWrap.appendChild(hero);
      hero1 = {
        media: hero.querySelector('.hero__media'),
        main: hero.querySelector('.hero__main'),
        card: hero.querySelector('.hero-card'),
        shade: hero.querySelector('.hero__shade')
      };
      watch(heroWrap);
    }

    // procházka místnostmi: svislý scroll = posun pásu do strany
    var walk = document.querySelector('.walk');
    var track, rooms = [], dist = 0, lastHere = -1;
    if (walk && !reduce) {
      track = walk.querySelector('.walk__track');
      rooms = Array.prototype.map.call(track.children, function (el) {
        return { el: el, link: el.querySelector('.walk__link'), img: el.querySelector('img'), isRoom: el.classList.contains('walk__room'), left: 0, w: 0 };
      });
      walk.classList.add('is-pinned');
      watch(walk);
      // fotky pásu se začnou načítat s předstihem, ať se při posunu neukáže prázdné místo
      var eager = function () { each(walk.querySelectorAll('img[loading="lazy"]'), function (im) { im.loading = 'eager'; }); };
      if ('IntersectionObserver' in window) {
        var wio = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { eager(); wio.disconnect(); } }, { rootMargin: '100% 0px' });
        wio.observe(walk);
      } else eager();
    }

    // karty povrchů, fotka showroomu a fotky v obsahu
    var panels = [], showroom = document.querySelector('.showroom-photo'), dolly = [];
    if (!reduce) {
      each(document.querySelectorAll('.panel'), function (p) { var m = p.querySelector('.panel__media'); if (m) { panels.push({ el: p, media: m }); watch(p); } });
      if (showroom) watch(showroom);
      each(document.querySelectorAll('main .fig__media img, main .gallery__link img'), function (im) {
        if (im.closest('.hero, .walk')) return;
        im.classList.add('is-dolly');
        var box = im.closest('.fig__media, .gallery__link') || im.parentNode;
        box.__img = im;
        dolly.push(box);
        watch(box);
      });
    }

    // realizace: karty se skládají na sebe – překrytá karta se zmenší a ztmavne
    var stackCards = [], stackSec = document.querySelector('.stackx');
    if (stackSec && !reduce) {
      stackCards = Array.prototype.slice.call(stackSec.querySelectorAll('.stackx__card'));
      watch(stackSec);
    }

    function measure() {
      vh = window.innerHeight; vw = window.innerWidth;
      if (track) {
        dist = Math.max(0, track.scrollWidth - vw);
        walk.style.setProperty('--walk-h', (dist + vh) + 'px');
        // poloha místností v pásu (bez posunu) – při scrollu se už nic neměří
        rooms.forEach(function (r) { r.left = r.el.offsetLeft; r.w = r.el.offsetWidth; });
      }
    }

    function frame() {
      ticking = false;
      var y = window.pageYOffset;
      if (header) { var sc = y > 40; if (header.__sc !== sc) { header.__sc = sc; header.classList.toggle('is-scrolled', sc); } }
      if (reduce) return;

      if (heroWrap && visible.has(heroWrap)) {
        var span = heroWrap.offsetHeight - hero.offsetHeight || vh;
        var hp = clamp(-heroWrap.getBoundingClientRect().top / span, 0, 1);
        put(hero1.media, 'transform', 'translate3d(0,' + (hp * 40).toFixed(1) + 'px,0) scale(' + (1 + hp * 0.38).toFixed(4) + ')');
        put(hero1.main, 'opacity', (1 - hp * 1.25).toFixed(3));
        put(hero1.main, 'transform', 'translate3d(0,' + (hp * -40).toFixed(1) + 'px,0)');
        put(hero1.card, 'opacity', (1 - hp * 1.5).toFixed(3));
        put(hero1.card, 'transform', 'translate3d(0,' + (hp * -90).toFixed(1) + 'px,0)');
        put(hero1.shade, 'opacity', (hp * 0.6).toFixed(3));
      }

      if (track && visible.has(walk)) {
        var wr = walk.getBoundingClientRect();
        var wp = dist > 0 ? clamp(-wr.top / dist, 0, 1) : 0;
        var wx = -wp * dist;
        put(track, 'transform', 'translate3d(' + wx.toFixed(1) + 'px,0,0)');
        var cx = vw / 2, best = 0, bestD = 1e9;
        for (var k = 0; k < rooms.length; k++) {
          var r = rooms[k];
          var c = (r.left + wx + r.w / 2 - cx) / vw;
          var d = Math.min(Math.abs(c), 1);
          if (Math.abs(c) > 1.4) continue;
          put(r.el, 'transform', 'scale(' + (1 - d * 0.14).toFixed(3) + ')');
          if (r.link) put(r.link, '--dim', (d * 0.62).toFixed(2));
          if (r.img) put(r.img, 'transform', 'translate3d(' + (c * -60).toFixed(1) + 'px,0,0) scale(1.14)');
          if (r.isRoom && Math.abs(c) < bestD) { bestD = Math.abs(c); best = k; }
        }
        if (best !== lastHere) {
          lastHere = best;
          rooms.forEach(function (rm, i) { rm.el.classList.toggle('is-here', i === best); });
        }
      }

      if (stackCards.length && visible.has(stackSec)) {
        for (var s = 0; s < stackCards.length - 1; s++) {
          var cur = stackCards[s].getBoundingClientRect();
          var nxt = stackCards[s + 1].getBoundingClientRect();
          // 0 = další karta je ještě pod touto, 1 = další karta ji celou překryla
          var cov = clamp((cur.bottom - nxt.top) / (cur.height || 1), 0, 1);
          put(stackCards[s], 'transform', 'scale(' + (1 - cov * 0.06).toFixed(4) + ')');
          put(stackCards[s], '--dim', (cov * 0.5).toFixed(3));
        }
      }

      if (showroom && visible.has(showroom)) {
        var sr = showroom.getBoundingClientRect();
        var p = clamp((vh - sr.top) / (vh * 0.75), 0, 1);
        put(showroom, 'transform', 'scale(' + (0.94 + p * 0.06).toFixed(4) + ')');
      }

      for (var i = 0; i < panels.length; i++) {
        if (!visible.has(panels[i].el)) continue;
        var pr = panels[i].el.getBoundingClientRect();
        var mid = (pr.top + pr.height / 2 - vh / 2) / vh;
        put(panels[i].media, 'transform', 'translate3d(0,' + (mid * -46).toFixed(1) + 'px,0)');
      }

      for (var j = 0; j < dolly.length; j++) {
        var box = dolly[j];
        if (!visible.has(box)) continue;
        var ir = box.getBoundingClientRect();
        var t = clamp((ir.top + ir.height / 2 - vh / 2) / vh, -1, 1);
        put(box.__img, 'transform', 'translate3d(0,' + (t * -5).toFixed(2) + '%,0) scale(1.12)');
      }
    }
    function req() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }

    measure();
    window.addEventListener('scroll', req, { passive: true });
    var rt = 0;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { measure(); req(); }, 120); });
    window.addEventListener('load', function () { measure(); req(); });
    frame();
  }

  function run(fn) { try { fn(); } catch (e) { if (window.console) console.error(e); } }
  function init() {
    run(initSplit);
    run(addBits);
    run(initFadeIn);
    run(initTour);
    run(initSpot);
    run(initScroll);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
