/* DUKKAN HDOOM — listing pages: one GET for platform attribute filters + price, and the attribute-UUID rewrite
   (listing matches attributes[...] by display value; filter links can carry catalog UUIDs that return 0 rows). */
(function () {
  'use strict';
  var DH = window.DH;
  if (!DH) return;

  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function rewriteAttributeUuids() {
    var wrap = document.querySelector('.products-filters-container[data-filters]');
    if (!wrap) return false;
    var map = {};
    try {
      var deck = JSON.parse(wrap.getAttribute('data-filters') || '{}');
      var attrs = (deck.filters && deck.filters.attributes) || deck.attributes || [];
      attrs.forEach(function (a) { (a && a.data || []).forEach(function (row) { if (row && row.id && row.value != null && String(row.value)) map[String(row.id)] = String(row.value); }); });
    } catch (e) { return true; }
    var sp = new URLSearchParams(location.search);
    var out = new URLSearchParams();
    var changed = false;
    sp.forEach(function (v, k) {
      if (k.indexOf('attributes[') === 0 && UUID.test(v) && map[v] != null) { out.append(k, map[v]); changed = true; }
      else out.append(k, v);
    });
    if (changed) location.replace(location.pathname + '?' + out.toString());
    return true;
  }

  DH.ready(function () {
    var drawer = DH.$('[data-dh-drawer="filter"]');
    if (!drawer) return;

    if (!rewriteAttributeUuids()) {
      var mo = new MutationObserver(function () { if (rewriteAttributeUuids()) mo.disconnect(); });
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 10000);
    }

    function apply() {
      var params = new URLSearchParams();
      var add = function (form) {
        if (!form) return;
        new FormData(form).forEach(function (v, k) { if (v === '' || v == null || /^\d+$/.test(k)) return; params.append(k, v); });
      };
      add(document.getElementById('attribute_form'));
      add(DH.$('[data-dh-filter-form]', drawer));
      var cur = new URLSearchParams(location.search);
      ['sort_by', 'order', 'q', 'search'].forEach(function (k) { if (!params.get(k) && cur.get(k)) params.set(k, cur.get(k)); });
      // Zid applies a price window only when both ends are present.
      if (params.get('from_price') || params.get('to_price')) {
        if (!params.get('from_price')) params.set('from_price', '0');
        if (!params.get('to_price')) params.set('to_price', '1000000');
      }
      var q = params.toString();
      location.href = location.pathname + (q ? '?' + q : '');
    }

    var btn = DH.$('[data-dh-filter-apply]', drawer);
    if (btn) btn.addEventListener('click', function () { btn.setAttribute('aria-busy', 'true'); apply(); });
    var priceForm = DH.$('[data-dh-filter-form]', drawer);
    if (priceForm) priceForm.addEventListener('submit', function (e) { e.preventDefault(); apply(); });

    // Platform filter counts can render "undefined" before hydration.
    var tidy = function () { DH.$$('.filter-count', drawer).forEach(function (el) { if (/undefined/.test(el.textContent || '')) el.textContent = ''; }); };
    new MutationObserver(tidy).observe(drawer, { childList: true, subtree: true });
    tidy();
  });
})();
