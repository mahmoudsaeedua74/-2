/* DUKKAN HDOOM — core: utilities, module registry, overlays (drawers/search/modal), header, search, toast, account. */
(function () {
  'use strict';

  var root = document.documentElement;
  var cfg = window.DH_CONFIG || {};
  var DH = (window.DH = window.DH || {});
  DH.config = cfg;
  DH.i18n = cfg.i18n || {};
  DH.t = function (k, fb) { return DH.i18n[k] || fb || k; };
  DH.isRTL = function () { return (root.getAttribute('dir') || cfg.dir) === 'rtl'; };
  DH.debug = function () { if (cfg.debug && window.console) console.log.apply(console, ['[DH]'].concat([].slice.call(arguments))); };

  var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  DH.reduced = function () { return mqReduce.matches || cfg.motion === 'off'; };
  if (DH.reduced()) root.classList.add('dh-reduced');
  DH.finePointer = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)').matches : false;

  DH.$ = function (s, c) { return (c || document).querySelector(s); };
  DH.$$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  DH.clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  DH.lerp = function (a, b, t) { return a + (b - a) * t; };
  DH.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  DH.emit = function (name, detail) { document.dispatchEvent(new CustomEvent(name, { detail: detail })); };
  DH.ready = function (fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };

  /* ---------- Module registry (re-inits inside the Zid theme editor) ---------- */
  var registry = {};
  var live = new WeakMap();
  DH.register = function (name, mod) {
    registry[name] = mod;
    DH.ready(function () { DH.$$('[data-dh-module="' + name + '"]').forEach(mount); });
  };
  function mount(el) {
    var name = el.getAttribute('data-dh-module');
    var mod = registry[name];
    if (!mod || live.has(el)) return;
    try { live.set(el, mod.init(el) || {}); } catch (e) { console.error('[DH] init ' + name, e); }
  }
  function unmount(el) {
    var inst = live.get(el);
    if (!inst) return;
    try { if (typeof inst.destroy === 'function') inst.destroy(); } catch (e) { console.error('[DH] destroy', e); }
    live.delete(el);
  }
  DH.mountAll = function (ctx) {
    var c = ctx || document;
    if (c.nodeType === 1 && c.hasAttribute('data-dh-module')) mount(c);
    if (c.querySelectorAll) DH.$$('[data-dh-module]', c).forEach(mount);
  };
  DH.ready(function () {
    if (!window.MutationObserver) return;
    new MutationObserver(function (records) {
      records.forEach(function (r) {
        r.removedNodes.forEach(function (n) {
          if (n.nodeType !== 1) return;
          if (n.hasAttribute('data-dh-module')) unmount(n);
          DH.$$('[data-dh-module]', n).forEach(unmount);
        });
        r.addedNodes.forEach(function (n) { if (n.nodeType === 1) DH.mountAll(n); });
      });
      DH.emit('dh:dom-changed');
    }).observe(document.body, { childList: true, subtree: true });
  });

  /* ---------- Scroll lock ---------- */
  var lockCount = 0;
  DH.lockScroll = function () {
    if (lockCount++ === 0) {
      var sw = window.innerWidth - root.clientWidth;
      if (sw > 0) document.body.style.paddingInlineEnd = sw + 'px';
      root.classList.add('dh-locked');
    }
  };
  DH.unlockScroll = function () {
    if (lockCount === 0) return;
    if (--lockCount === 0) {
      root.classList.remove('dh-locked');
      document.body.style.paddingInlineEnd = '';
    }
  };

  /* ---------- Focus trap ---------- */
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  DH.trapFocus = function (container) {
    function onKey(e) {
      if (e.key !== 'Tab') return;
      var items = DH.$$(FOCUSABLE, container).filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
      if (!items.length) { e.preventDefault(); container.focus(); return; }
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    container.addEventListener('keydown', onKey);
    return function () { container.removeEventListener('keydown', onKey); };
  };

  /* ---------- Overlays: menu / search / cart drawers ---------- */
  var scrim = null;
  var current = null; // { name, el, trigger, release }
  DH.overlay = {
    get: function () { return current && current.name; },
    open: function (name, trigger) {
      var el = DH.$('[data-dh-drawer="' + name + '"]');
      if (!el) return false;
      if (current && current.name === name) return true;
      if (current) DH.overlay.close(true);
      scrim = scrim || DH.$('[data-dh-scrim]');
      el.removeAttribute('inert');
      el.classList.add('is-open');
      if (scrim) scrim.classList.add('is-open');
      DH.lockScroll();
      DH.$$('[data-dh-open="' + name + '"]').forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
      current = { name: name, el: el, trigger: trigger || document.activeElement, release: DH.trapFocus(el) };
      var focusTarget = el.querySelector('[data-dh-search-input]') || el.querySelector('[data-dh-close]') || el;
      setTimeout(function () { try { focusTarget.focus({ preventScroll: true }); } catch (e) {} }, 60);
      DH.emit('dh:overlay-open', { name: name });
      return true;
    },
    close: function (silent) {
      if (!current) return;
      var c = current;
      current = null;
      c.el.classList.remove('is-open');
      c.el.setAttribute('inert', '');
      if (scrim) scrim.classList.remove('is-open');
      c.release && c.release();
      DH.unlockScroll();
      DH.$$('[data-dh-open="' + c.name + '"]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
      if (!silent && c.trigger && c.trigger.focus) { try { c.trigger.focus({ preventScroll: true }); } catch (e) {} }
      DH.emit('dh:overlay-close', { name: c.name });
    }
  };

  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-dh-open]');
    if (opener) {
      var name = opener.getAttribute('data-dh-open');
      // The bag link stays a real link to /cart when the drawer is unavailable or on the cart page itself
      if (name === 'cart' && (document.body.getAttribute('data-template') === 'cart' || !DH.$('[data-dh-drawer="cart"]'))) return;
      e.preventDefault();
      if (DH.overlay.get() === name) DH.overlay.close();
      else DH.overlay.open(name, opener);
      return;
    }
    if (e.target.closest('[data-dh-close]') || e.target.closest('[data-dh-scrim]')) {
      if (current) { e.preventDefault(); DH.overlay.close(); }
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && current && !(DH.modal && DH.modal.isOpen && DH.modal.isOpen())) DH.overlay.close();
  });

  /* ---------- Header: scrolled / hide-on-scroll / overlay over hero ---------- */
  DH.ready(function () {
    var header = DH.$('[data-dh-header]');
    if (!header) return;
    var lastY = window.scrollY, ticking = false;
    var main = DH.$('#dh-main');
    var hero = main && (main.querySelector('[data-dh-hero]') || main.querySelector('.dh-hero'));
    var wantOverlay = header.classList.contains('is-overlay') || (document.body.classList.contains('dh-is-home') && !!hero);
    if (wantOverlay && hero) {
      header.classList.add('is-overlay');
      hero.classList.add('is-under-header');
      document.body.classList.add('dh-has-overlay-header');
    } else if (!hero) {
      header.classList.remove('is-overlay');
    }
    function update() {
      ticking = false;
      var y = window.scrollY || window.pageYOffset || 0;
      header.classList.toggle('is-scrolled', y > 24);
      if (cfg.hideHeaderOnScroll && !current) {
        var down = y > lastY + 4, up = y < lastY - 4;
        if (down && y > 240) header.classList.add('is-hidden');
        else if (up || y < 120) header.classList.remove('is-hidden');
      }
      lastY = y;
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    header.addEventListener('focusin', function () { header.classList.remove('is-hidden'); });
    update();
  });

  /* ---------- Toast ---------- */
  var toastTimer = null;
  DH.toast = function (opts) {
    var el = DH.$('[data-dh-toast]');
    if (!el) return;
    opts = opts || {};
    el.classList.toggle('is-error', !!opts.error);
    el.innerHTML =
      (opts.img ? '<img src="' + DH.esc(opts.img) + '" alt="">' : '') +
      '<p class="dh-toast__text">' + DH.esc(opts.title || '') + (opts.sub ? '<small>' + DH.esc(opts.sub) + '</small>' : '') + '</p>' +
      (opts.action ? '<button type="button" class="dh-btn dh-btn--sm dh-btn--ink" data-dh-toast-action>' + DH.esc(opts.action.label) + '</button>' : '');
    if (opts.action) {
      el.querySelector('[data-dh-toast-action]').addEventListener('click', function () { el.classList.remove('is-open'); opts.action.run(); }, { once: true });
    }
    requestAnimationFrame(function () { el.classList.add('is-open'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-open'); }, opts.duration || 4200);
  };

  /* ---------- Account (same flow as Zid's official Growth theme) ---------- */
  function normalizeRedirect(r) {
    try { var u = new URL(r, location.origin); return u.origin === location.origin ? u.pathname + u.search + u.hash : ''; } catch (e) { return ''; }
  }
  function profileUrl() { return normalizeRedirect((window.layoutConfig && window.layoutConfig.profileUrl) || '/account-profile') || '/account-profile'; }
  var pendingRedirect = null;
  if (typeof window.handleLoginAction !== 'function') {
    window.handleLoginAction = function (redirectTo, addToUrl) {
      if (redirectTo === undefined) redirectTo = '';
      if (addToUrl === undefined) addToUrl = true;
      var finalRedirect = addToUrl ? location.pathname + redirectTo : redirectTo;
      var target = (finalRedirect ? normalizeRedirect(finalRedirect) : '') || profileUrl();
      if (window.customerAuthState && window.customerAuthState.isAuthenticated) {
        location.href = redirectTo ? target : profileUrl();
        return;
      }
      pendingRedirect = target;
      if (window.auth_dialog && typeof window.auth_dialog.open === 'function') window.auth_dialog.open();
      else if (window.zid && window.zid.customer && window.zid.customer.login) window.zid.customer.login.open({ redirectTo: target });
      else location.href = '/auth/login?redirect_to=' + encodeURIComponent(target);
    };
  }
  function markAuthed() {
    window.customerAuthState = window.customerAuthState || {};
    window.customerAuthState.isAuthenticated = true;
    window.customerAuthState.isGuest = false;
  }
  window.addEventListener('vitrin:auth:success', function () {
    markAuthed();
    if (pendingRedirect) { var r = pendingRedirect; pendingRedirect = null; location.href = r; }
  });
  document.addEventListener('zid-customer-fetched', function (e) {
    var cu = e.detail && e.detail.customer;
    if (cu && cu.id) markAuthed();
  });
  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-dh-guest-checkout]');
    if (g) {
      e.preventDefault();
      if (current) DH.overlay.close(true);
      window.handleLoginAction('/checkout', false);
      return;
    }
    var b = e.target.closest('[data-dh-account]');
    if (!b) return;
    e.preventDefault();
    if (current) DH.overlay.close(true);
    window.handleLoginAction('', false);
  });

  /* ---------- Search (zid.products.list — same call as Zid's Growth theme) ---------- */
  DH.ready(function () {
    var input = DH.$('[data-dh-search-input]');
    var out = DH.$('[data-dh-search-results]');
    var hints = DH.$('[data-dh-search-hints]');
    if (!input || !out) return;
    var timer = null, seq = 0;
    function productsUrl(q) {
      var u = new URL((cfg.urls && cfg.urls.products) || '/products', location.origin);
      u.searchParams.set('q', q);
      return u.toString();
    }
    function render(list, q) {
      if (!list.length) {
        out.innerHTML = '<p class="dh-muted" style="grid-column:1/-1">' + DH.esc(DH.t('noResults')) + '</p>';
        return;
      }
      out.innerHTML = list.map(function (p) {
        var img = (p.main_image && p.main_image.image && (p.main_image.image.small || p.main_image.image.medium)) ||
          (p.images && p.images[0] && p.images[0].image && (p.images[0].image.small || p.images[0].image.medium)) || '';
        return '<a class="dh-search__result" href="' + DH.esc(p.html_url || ('/products/' + (p.slug || p.id))) + '">' +
          (img ? '<img src="' + DH.esc(img) + '" alt="" loading="lazy">' : '<span class="dh-search__noimg"></span>') +
          '<span>' + DH.esc(p.name) + '</span>' +
          '<span class="dh-num dh-muted">' + DH.esc(p.formatted_sale_price || p.formatted_price || '') + '</span></a>';
      }).join('') +
        '<a class="dh-link" style="grid-column:1/-1" href="' + DH.esc(productsUrl(q)) + '">' + DH.esc(DH.t('viewAll')) + ' →</a>';
    }
    function search(q) {
      var my = ++seq;
      if (!window.zid || !window.zid.products || typeof window.zid.products.list !== 'function') return;
      out.setAttribute('aria-busy', 'true');
      window.zid.products.list({ page_size: 8, q: q }, { showErrorNotification: false })
        .then(function (res) { if (my === seq) render((res && res.results) || [], q); })
        .catch(function () { if (my === seq) render([], q); })
        .then(function () { out.removeAttribute('aria-busy'); });
    }
    input.addEventListener('input', function () {
      var q = input.value.trim();
      clearTimeout(timer);
      if (hints) hints.hidden = q.length > 0;
      if (q.length < 2) { out.innerHTML = ''; seq++; return; }
      timer = setTimeout(function () { search(q); }, 280);
    });
  });

  /* ---------- Misc ---------- */
  DH.ready(function () {
    // Active nav link
    var path = location.pathname.replace(/\/$/, '');
    DH.$$('.dh-nav__link').forEach(function (a) {
      try { if (new URL(a.href).pathname.replace(/\/$/, '') === path && path) a.setAttribute('aria-current', 'page'); } catch (e) {}
    });
  });
})();
