/* DUKKAN HDOOM — motion: reveals, scroll-linked word fill, parallax, lookbook (native snap + optional GSAP pin).
   Never blocks content: everything is visible without JS and with reduced motion. */
(function () {
  'use strict';
  var DH = window.DH;
  if (!DH) return;
  var root = document.documentElement;
  var full = function () { return !DH.reduced() && DH.config.motion !== 'calm'; };

  /* ---------- Reveals ---------- */
  var REVEAL = '.dh-reveal:not(.is-in),.dh-mask:not(.is-in),.dh-split:not(.is-in)';
  var io = null;
  function reveal(el) { el.classList.add('is-in'); if (io) io.unobserve(el); }
  function scanReveals(ctx) {
    var els = DH.$$(REVEAL, ctx || document);
    if (DH.reduced() || !('IntersectionObserver' in window)) { els.forEach(reveal); return; }
    if (!io) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) reveal(e.target); });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    }
    els.forEach(function (el) {
      // The hero animates on load, not on intersection.
      if (el.closest('[data-dh-hero]')) return;
      io.observe(el);
    });
  }
  function introHero() {
    DH.$$('[data-dh-hero]').forEach(function (hero) {
      var go = function () { DH.$$('.dh-reveal,.dh-split,.dh-mask', hero).forEach(function (el) { el.classList.add('is-in'); }); hero.classList.add('is-ready'); };
      if (DH.reduced()) return go();
      // Wait (briefly) for the display font so the masked lines measure correctly.
      var done = false;
      var fire = function () { if (!done) { done = true; requestAnimationFrame(go); } };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fire);
      setTimeout(fire, 450);
    });
  }

  /* ---------- Scroll-linked: word fill + parallax ---------- */
  var active = new Set();
  var ticking = false;
  var vio = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) active.add(e.target); else active.delete(e.target); });
    queue();
  }, { rootMargin: '10% 0px 10% 0px' }) : null;

  function wordsUpdate(el, vh) {
    var r = el.getBoundingClientRect();
    var p = DH.clamp((vh * 0.88 - r.top) / (r.height + vh * 0.32), 0, 1);
    var words = el._dhWords || (el._dhWords = DH.$$('.dh-word', el));
    var lit = Math.round(p * words.length);
    if (lit === el._dhLit) return;
    el._dhLit = lit;
    for (var i = 0; i < words.length; i++) words[i].classList.toggle('is-lit', i < lit);
  }
  function parallaxUpdate(el, vh) {
    var host = el.parentElement || el;
    var r = host.getBoundingClientRect();
    var f = parseFloat(el.getAttribute('data-dh-parallax')) || 0.1;
    var off = (r.top + r.height / 2 - vh / 2) * -f;
    el.style.transform = 'translate3d(0,' + off.toFixed(1) + 'px,0) scale(' + (1 + f * 0.9).toFixed(3) + ')';
  }
  function frame() {
    ticking = false;
    var vh = window.innerHeight;
    active.forEach(function (el) {
      if (el.hasAttribute('data-dh-words')) wordsUpdate(el, vh);
      else parallaxUpdate(el, vh);
    });
  }
  function queue() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }

  function parallaxAllowed() { return full() && DH.finePointer && window.innerWidth >= 768; }
  function scanScroll(ctx) {
    DH.$$('[data-dh-words]', ctx || document).forEach(function (el) {
      if (DH.reduced() || !vio) { DH.$$('.dh-word', el).forEach(function (w) { w.classList.add('is-lit'); }); return; }
      el.classList.add('is-armed');
      vio.observe(el);
    });
    if (!parallaxAllowed() || !vio) return;
    DH.$$('[data-dh-parallax]', ctx || document).forEach(function (el) { el.classList.add('is-parallax'); vio.observe(el); });
  }
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue, { passive: true });

  /* ---------- In-page anchors (e.g. hero → #rack) ---------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').length < 2) return;
    var t = document.getElementById(a.getAttribute('href').slice(1));
    if (!t) return;
    e.preventDefault();
    t.scrollIntoView({ behavior: DH.reduced() ? 'auto' : 'smooth', block: 'start' });
    var focusTarget = t.closest('section') || t;
    if (!focusTarget.hasAttribute('tabindex')) focusTarget.setAttribute('tabindex', '-1');
    focusTarget.focus({ preventScroll: true });
  });

  /* ---------- Lazy GSAP (desktop, full motion only) ---------- */
  var gsapP = null;
  function loadScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  DH.gsap = function () {
    if (window.gsap && window.ScrollTrigger) return Promise.resolve(window.gsap);
    if (!gsapP) {
      var a = DH.config.assets || {};
      gsapP = (window.gsap ? Promise.resolve() : loadScript(a.gsap))
        .then(function () { return window.ScrollTrigger ? null : loadScript(a.scrollTrigger); })
        .then(function () { window.gsap.registerPlugin(window.ScrollTrigger); return window.gsap; });
    }
    return gsapP;
  };

  /* ---------- Lookbook ---------- */
  DH.register('lookbook', {
    init: function (el) {
      var track = DH.$('[data-look-track]', el);
      var bar = DH.$('[data-look-progress]', el);
      var pin = DH.$('[data-look-pin]', el);
      var st = null, tween = null, killed = false;
      if (!track) return {};

      function nativeProgress() {
        var max = track.scrollWidth - track.clientWidth;
        var p = max > 0 ? Math.abs(track.scrollLeft) / max : 0;
        if (bar) bar.style.transform = 'scaleX(' + p.toFixed(3) + ')';
      }
      track.addEventListener('scroll', nativeProgress, { passive: true });
      nativeProgress();

      // Hotspots open the product sheet; they are real links when JS or the modal is missing.
      function onHotspot(e) {
        var h = e.target.closest('[data-dh-hotspot]');
        if (!h || !DH.modal) return;
        e.preventDefault();
        DH.modal.open({ id: h.getAttribute('data-id'), url: h.getAttribute('data-url'), name: h.getAttribute('data-name'), price: h.getAttribute('data-price'), image: h.getAttribute('data-image'), returnFocus: h });
      }
      el.addEventListener('click', onHotspot);

      var mq = window.matchMedia('(min-width: 1024px)');
      /* Mobile / tablet: drag-to-swipe the track (same feel as the rack) */
      var drag = null, moved = false;
      function onPointerDown(e) {
        if (mq.matches || e.button) return;
        if (e.target.closest('[data-dh-hotspot]')) return;
        drag = { x: e.clientX, left: track.scrollLeft, id: e.pointerId };
        moved = false;
        try { track.setPointerCapture(e.pointerId); } catch (err) {}
        track.classList.add('is-dragging');
      }
      function onPointerMove(e) {
        if (!drag || e.pointerId !== drag.id) return;
        var dx = e.clientX - drag.x;
        if (Math.abs(dx) > 4) moved = true;
        track.scrollLeft = drag.left - dx;
      }
      function onPointerUp(e) {
        if (!drag || e.pointerId !== drag.id) return;
        track.classList.remove('is-dragging');
        drag = null;
      }
      function onClickCapture(e) {
        if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
      }
      track.addEventListener('pointerdown', onPointerDown);
      track.addEventListener('pointermove', onPointerMove);
      track.addEventListener('pointerup', onPointerUp);
      track.addEventListener('pointercancel', onPointerUp);
      track.addEventListener('click', onClickCapture, true);

      function setupPin() {
        if (killed || st || !mq.matches || !full() || DH.$$('[data-look-frame]', el).length < 2) return;
        DH.gsap().then(function (gsap) {
          if (killed || st || !mq.matches) return;
          el.classList.add('is-pinned');
          var rtl = DH.isRTL();
          var dist = function () { return Math.max(0, track.scrollWidth - track.clientWidth); };
          tween = gsap.to(track, {
            x: function () { return (rtl ? 1 : -1) * dist(); },
            ease: 'none',
            scrollTrigger: {
              trigger: pin,
              start: 'top top',
              end: function () { return '+=' + dist(); },
              pin: true,
              scrub: 0.6,
              invalidateOnRefresh: true,
              onUpdate: function (s) { if (bar) bar.style.transform = 'scaleX(' + s.progress.toFixed(3) + ')'; }
            }
          });
          st = tween.scrollTrigger;
        }).catch(function (err) { DH.debug('gsap unavailable, lookbook stays native', err); });
      }
      function teardownPin() {
        if (tween) { tween.scrollTrigger && tween.scrollTrigger.kill(); tween.kill(); tween = null; }
        st = null;
        el.classList.remove('is-pinned');
        track.style.transform = '';
      }
      function onMq() { if (mq.matches) setupPin(); else teardownPin(); }
      if (mq.addEventListener) mq.addEventListener('change', onMq); else mq.addListener(onMq);
      setupPin();

      return {
        destroy: function () {
          killed = true;
          teardownPin();
          track.removeEventListener('scroll', nativeProgress);
          track.removeEventListener('pointerdown', onPointerDown);
          track.removeEventListener('pointermove', onPointerMove);
          track.removeEventListener('pointerup', onPointerUp);
          track.removeEventListener('pointercancel', onPointerUp);
          track.removeEventListener('click', onClickCapture, true);
          el.removeEventListener('click', onHotspot);
          if (mq.removeEventListener) mq.removeEventListener('change', onMq); else mq.removeListener(onMq);
        }
      };
    }
  });

  /* ---------- Boot ---------- */
  DH.ready(function () {
    introHero();
    scanReveals();
    scanScroll();
    queue();
  });
  document.addEventListener('dh:dom-changed', function () { scanReveals(); scanScroll(); queue(); });
})();
