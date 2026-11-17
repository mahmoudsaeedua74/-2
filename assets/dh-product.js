/* DUKKAN HDOOM — product page: gallery, quantity, Zid variant callback, add/buy now, sticky bar, notify-me. */
(function () {
  'use strict';
  var DH = window.DH;
  if (!DH) return;
  var L = window.DH_PDP_I18N || {};

  DH.ready(function () {
    var pdp = DH.$('[data-dh-pdp]');
    if (!pdp) return;
    var qty = DH.$('#product-quantity');
    var addBtn = DH.$('[data-dh-form-add]');
    var buyBtn = DH.$('[data-dh-buy-now]');
    var sticky = DH.$('[data-dh-stickybuy]');

    /* Gallery counter (mobile swipe) */
    var track = DH.$('[data-dh-gallery-track]');
    var idxEl = DH.$('[data-dh-gallery-index]');
    if (track && idxEl) {
      track.addEventListener('scroll', function () {
        var w = track.clientWidth || 1;
        idxEl.textContent = String(Math.round(Math.abs(track.scrollLeft) / w) + 1);
      }, { passive: true });
    }

    /* Quantity — mirrored into productObj, which Zid reads for form-based add to cart */
    function syncQty() {
      if (!qty) return;
      var max = parseInt(qty.max, 10) || 99;
      qty.value = String(DH.clamp(parseInt(qty.value, 10) || 1, 1, max));
      if (window.productObj && window.productObj.selected_product) window.productObj.selected_product.selected_quantity = Number(qty.value);
    }
    pdp.addEventListener('click', function (e) {
      var b = e.target.closest('[data-dh-qty]');
      if (!b || !qty) return;
      qty.value = String((parseInt(qty.value, 10) || 1) + parseInt(b.getAttribute('data-dh-qty'), 10));
      syncQty();
    });
    if (qty) qty.addEventListener('change', syncQty);

    function show(sel, on) { DH.$$(sel).forEach(function (el) { el.hidden = !on; }); }

    /* Platform callback after option selection (called by Zid's product.js) */
    var prevCb = window.productOptionsChanged;
    window.productOptionsChanged = function (sp) {
      if (typeof prevCb === 'function') { try { prevCb(sp); } catch (e) {} }
      // Selected value labels next to option names
      DH.$$('.product-options__group').forEach(function (g) {
        var lab = g.querySelector('.product-options__label');
        var act = g.querySelector('.product-options__item.active[value]');
        if (!lab) return;
        var span = lab.querySelector('[data-selected-option-value]');
        if (!act) { if (span) span.remove(); return; }
        if (!span) { span = document.createElement('span'); span.setAttribute('data-selected-option-value', ''); lab.appendChild(span); }
        span.textContent = ': ' + act.getAttribute('value');
      });
      var canPre = pdp.getAttribute('data-can-preorder') === 'true';
      if (!sp) {
        show('[data-in-stock]', false); show('[data-dh-buy-now]', false); show('[data-out-of-stock]', true);
        if (sticky) sticky.classList.add('is-disabled');
        return;
      }
      var idInput = DH.$('#product-id');
      if (idInput) idInput.value = sp.id;
      var nid = DH.$('[data-notify-id]');
      if (nid) nid.value = sp.id;
      var sale = sp.formatted_sale_price;
      var price = DH.$('[data-product-price]'), old = DH.$('[data-product-price-old]'), disc = DH.$('[data-product-discount]'), st = DH.$('[data-product-price-sticky]');
      if (price) price.textContent = sale || sp.formatted_price || '';
      if (st) st.textContent = sale || sp.formatted_price || '';
      if (old) { old.textContent = sale ? sp.formatted_price : ''; old.hidden = !sale; }
      if (disc) { disc.hidden = !(sale && sp.discount_percentage); disc.textContent = sp.discount_percentage ? '−' + sp.discount_percentage + '%' : ''; }
      var low = DH.$('[data-low-stock-badge]');
      if (low && L.lowEnabled) {
        var isLow = !sp.is_infinite && sp.quantity > 0 && sp.quantity < (L.lowThreshold || 5);
        low.hidden = !isLow;
        var lt = low.querySelector('[data-low-stock-text]');
        if (lt && isLow) lt.textContent = (L.onlyLeft || '%s').replace('%s', sp.quantity);
      }
      var ok = sp.in_stock || canPre || sp.can_be_preordered;
      show('[data-in-stock]', ok); show('[data-dh-buy-now]', ok); show('[data-out-of-stock]', !ok);
      if (sticky) sticky.classList.toggle('is-disabled', !ok);
      if (qty) { qty.max = String(sp.is_infinite ? 99 : Math.max(1, Math.min(99, sp.quantity || 1))); syncQty(); }
      // Variant media: jump the gallery to the variant's first image if it is already shown
      var media = sp.media || sp.images || [];
      var first = media[0] && media[0].image && (media[0].image.large || media[0].image.full_size);
      if (first && track) {
        var imgs = DH.$$('img', track);
        var key = first.split('?')[0].split('/').pop();
        var hit = imgs.findIndex(function (im) { return (im.currentSrc || im.src).indexOf(key) !== -1; });
        if (hit > 0) track.scrollTo({ left: (DH.isRTL() ? -1 : 1) * hit * track.clientWidth, behavior: DH.reduced() ? 'auto' : 'smooth' });
      }
    };

    /* Add to bag (form) */
    function busy(btn, on) { if (!btn) return; if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy'); }
    function add() {
      if (!addBtn || addBtn.disabled || addBtn.getAttribute('aria-busy') === 'true') return;
      syncQty();
      busy(addBtn, true);
      var img = track && track.querySelector('img');
      var name = DH.$('.dh-pdp__name');
      DH.cart.addForm(addBtn.getAttribute('data-dh-form-add'), { name: name && name.textContent.trim(), image: img && img.currentSrc })
        .catch(function (err) { DH.debug('pdp add failed', err); })
        .then(function () { busy(addBtn, false); });
    }
    if (addBtn) addBtn.addEventListener('click', add);
    if (buyBtn) buyBtn.addEventListener('click', function () {
      if (buyBtn.disabled || buyBtn.getAttribute('aria-busy') === 'true') return;
      syncQty();
      busy(buyBtn, true);
      DH.cart.buyNow(buyBtn.getAttribute('data-dh-buy-now')).catch(function () {}).then(function () { busy(buyBtn, false); });
    });

    /* Sticky mobile bar: visible while the main add button is off-screen */
    if (sticky && addBtn && window.IntersectionObserver) {
      var footer = DH.$('#dh-footer');
      var addVisible = true, footVisible = false;
      var upd = function () {
        var on = !addVisible && !footVisible;
        sticky.classList.toggle('is-on', on);
        sticky.setAttribute('aria-hidden', on ? 'false' : 'true');
        var sb = sticky.querySelector('[data-dh-sticky-add]');
        if (sb) sb.tabIndex = on ? 0 : -1;
      };
      new IntersectionObserver(function (en) { addVisible = en[0].isIntersecting || en[0].boundingClientRect.top > innerHeight; upd(); }).observe(addBtn);
      if (footer) new IntersectionObserver(function (en) { footVisible = en[0].isIntersecting; upd(); }).observe(footer);
      sticky.querySelector('[data-dh-sticky-add]').addEventListener('click', function () {
        if (sticky.classList.contains('is-disabled')) return;
        var opts = DH.$('.dh-pdp__options');
        var missing = opts && !DH.$('.product-options__item.active', opts) && DH.$('.product-options__item', opts);
        if (missing) { addBtn.scrollIntoView({ behavior: DH.reduced() ? 'auto' : 'smooth', block: 'center' }); return; }
        add();
      });
    }

    /* Notify me — same endpoint/payload as the Diriyah theme (POST /api/v1/products/{id}/stock-alerts) */
    var nf = DH.$('[data-dh-notify]');
    if (nf) {
      nf.querySelector('[data-notify-send]').addEventListener('click', function () {
        var btn = this;
        var email = nf.querySelector('[data-notify-email]').value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { DH.toast({ title: L.email, error: true }); return; }
        var base = nf.getAttribute('data-endpoint') || '/';
        if (base.slice(-1) !== '/') base += '/';
        var id = nf.querySelector('[data-notify-id]').value;
        busy(btn, true);
        fetch(base + 'api/v1/products/' + encodeURIComponent(id) + '/stock-alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customer_email: email, customer_phone_number: '', customer_name: nf.querySelector('[data-notify-name]').value.trim() })
        }).then(function (r) {
          return r.json().catch(function () { return null; }).then(function (d) {
            if (r.ok && (!d || d.status === 'success')) DH.toast({ title: L.sent });
            else DH.toast({ title: (d && d.data && d.data.message && String(d.data.message)) || L.failed, error: true });
          });
        }).catch(function () { DH.toast({ title: L.failed, error: true }); })
          .then(function () { busy(btn, false); });
      });
    }

    syncQty();
  });
})();
