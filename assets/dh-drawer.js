/* DUKKAN HDOOM — cart views (drawer + cart page). Render from zid.cart.get(); quantity/remove use the cart LINE id.
   Coupons: zid.cart.applyCoupon({coupon_code}) / zid.cart.removeCoupons(). */
(function () {
  'use strict';
  var DH = window.DH;
  if (!DH) return;

  function icon(name) {
    var paths = { minus: '<path d="M5 12h14"/>', plus: '<path d="M12 5v14M5 12h14"/>' };
    return '<svg class="dh-ic" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' + paths[name] + '</svg>';
  }

  function CartView(root) {
    var $ = function (s) { return DH.$(s, root); };
    var linesEl = $('[data-dh-cart-lines]');
    var emptyEl = $('[data-dh-cart-empty]');
    var loadEl = $('[data-dh-cart-loading]');
    var fullEl = $('[data-dh-cart-full]');
    var footEl = $('[data-dh-cart-foot]');
    var totalsEl = $('[data-dh-cart-totals]');
    var countEl = $('[data-dh-cart-count]');
    var couponEl = $('[data-dh-coupon]');
    var loaded = false;

    function render(cart) {
      loaded = true;
      if (loadEl) loadEl.hidden = true;
      var lines = DH.cart.normalizeLines(cart);
      var empty = !lines.length;
      if (emptyEl) emptyEl.hidden = !empty;
      if (footEl) footEl.hidden = empty;
      if (fullEl) fullEl.hidden = empty;
      if (countEl) countEl.textContent = empty ? '' : '(' + DH.cart.count(cart) + ')';
      linesEl.innerHTML = lines.map(function (l) {
        var img = l.image ? '<img class="dh-line__img" src="' + DH.esc(l.image) + '" alt="" loading="lazy">' : '<span class="dh-line__img"></span>';
        var name = l.url ? '<a href="' + DH.esc(l.url) + '">' + DH.esc(l.name) + '</a>' : DH.esc(l.name);
        return '<div class="dh-line" data-line="' + DH.esc(l.lineId) + '" data-qty="' + l.qty + '">' + img +
          '<div class="dh-line__body"><p class="dh-line__name">' + name + '</p>' +
          (l.meta ? '<p class="dh-line__meta">' + DH.esc(l.meta) + '</p>' : '') +
          '<div class="dh-line__row">' +
            '<div class="dh-qty" role="group" aria-label="' + DH.esc(DH.t('qty')) + '">' +
              '<button type="button" data-q="-1" aria-label="' + DH.esc(DH.t('decrease')) + '">' + icon('minus') + '</button>' +
              '<output aria-live="polite">' + l.qty + '</output>' +
              '<button type="button" data-q="1" aria-label="' + DH.esc(DH.t('increase')) + '"' + (l.qty >= l.max ? ' disabled' : '') + '>' + icon('plus') + '</button>' +
            '</div>' +
            '<span class="dh-line__price">' + DH.esc(l.total) + '</span>' +
          '</div>' +
          '<button type="button" class="dh-remove" data-remove>' + DH.esc(DH.t('remove')) + '</button>' +
          '</div></div>';
      }).join('');
      if (totalsEl) {
        totalsEl.innerHTML = DH.cart.totals(cart).map(function (t) {
          return '<div class="dh-totals__row' + (t.grand ? ' is-grand' : '') + '"><dt>' + DH.esc(t.title) + '</dt><dd>' + DH.esc(t.value) + '</dd></div>';
        }).join('');
      }
      if (couponEl) renderCoupon(cart);
    }

    function renderCoupon(cart) {
      var code = cart && cart.coupon && cart.coupon.code;
      var applied = DH.$('[data-dh-coupon-applied]', couponEl);
      var form = DH.$('[data-dh-coupon-form]', couponEl);
      if (applied) { applied.hidden = !code; DH.$('[data-dh-coupon-code]', applied).textContent = code || ''; }
      if (form) form.hidden = !!code;
    }

    function refresh() {
      if (!loaded && loadEl) loadEl.hidden = false;
      return DH.cart.get().then(render).catch(function () {
        if (loadEl) loadEl.hidden = true;
        linesEl.innerHTML = '<p class="dh-muted">' + DH.esc(DH.t('loadFailed')) + '</p>';
      });
    }

    linesEl.addEventListener('click', function (e) {
      var row = e.target.closest('[data-line]');
      if (!row) return;
      var step = e.target.closest('[data-q]');
      var rm = e.target.closest('[data-remove]');
      if (!step && !rm) return;
      var lineId = row.getAttribute('data-line');
      var q = parseInt(row.getAttribute('data-qty'), 10) || 1;
      row.classList.add('is-busy');
      var p = rm ? DH.cart.remove(lineId) : DH.cart.update(lineId, q + parseInt(step.getAttribute('data-q'), 10));
      p.catch(function () { row.classList.remove('is-busy'); });
    });

    if (couponEl) {
      var form = DH.$('[data-dh-coupon-form]', couponEl);
      var input = DH.$('input', form);
      var msg = DH.$('[data-dh-coupon-msg]', couponEl);
      var btn = DH.$('button[type="submit"]', form);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var code = (input.value || '').trim();
        if (!code || !window.zid || !zid.cart || typeof zid.cart.applyCoupon !== 'function') return;
        btn.setAttribute('aria-busy', 'true');
        msg.textContent = '';
        zid.cart.applyCoupon({ coupon_code: code }, { showErrorNotification: false })
          .then(function () { input.value = ''; msg.textContent = DH.t('couponApplied'); return DH.cart.get(); })
          .catch(function (err) {
            var m = err && err.responseData && err.responseData.message;
            msg.textContent = (m && (typeof m === 'string' ? m : m.description)) || DH.t('couponFailed');
          })
          .then(function () { btn.removeAttribute('aria-busy'); });
      });
      couponEl.addEventListener('click', function (e) {
        if (!e.target.closest('[data-dh-coupon-remove]') || typeof zid.cart.removeCoupons !== 'function') return;
        msg.textContent = '';
        zid.cart.removeCoupons({ showErrorNotification: true }).then(function () { return DH.cart.get(); }).catch(function () {});
      });
    }

    return { root: root, render: render, refresh: refresh };
  }

  DH.ready(function () {
    var drawerEl = DH.$('[data-dh-drawer="cart"]');
    var pageEl = DH.$('[data-dh-cart-page]');
    var drawer = drawerEl ? CartView(drawerEl) : null;
    var page = pageEl ? CartView(pageEl) : null;

    if (drawer) document.addEventListener('dh:overlay-open', function (e) { if (e.detail.name === 'cart') drawer.refresh(); });
    document.addEventListener('dh:cart', function (e) {
      if (drawer && drawerEl.classList.contains('is-open')) drawer.render(e.detail.cart);
      if (page) page.render(e.detail.cart);
    });
    if (page) page.refresh();

    window.openCartDrawer = function () { DH.overlay.open('cart'); };
  });
})();
