/* DUKKAN HDOOM — the single commerce layer.
   Cart payloads mirror Zid's official Growth theme:
     add     zid.cart.addProduct({ product_id: <product or variant id>, quantity })
     add     zid.cart.addProduct({ form_id: 'product-form' })            (product page form)
     update  zid.cart.updateProduct({ product_id: <cart LINE id>, quantity })
     remove  zid.cart.removeProduct({ product_id: <cart LINE id> })
   Product data for the rack modal: zid.products.get (only if it returns variants) → product page JSON
   (#dh-product-json, rendered by templates/product.jinja) → window.productObj. */
(function () {
  'use strict';
  var DH = window.DH;
  if (!DH) return;

  function zidReady(timeout) {
    return new Promise(function (resolve, reject) {
      var t0 = Date.now();
      (function poll() {
        if (window.zid && window.zid.cart && typeof window.zid.cart.addProduct === 'function') return resolve(window.zid);
        if (Date.now() - t0 > (timeout || 12000)) return reject(new Error('zid SDK unavailable'));
        setTimeout(poll, 60);
      })();
    });
  }

  /* ---------- Cart ---------- */
  var lastCart = null;

  function count(cart) {
    if (!cart) return 0;
    var n = cart.cart_items_quantity != null ? cart.cart_items_quantity : cart.products_count;
    return parseInt(n, 10) || 0;
  }

  function setBadges(n) {
    DH.$$('[data-cart-badge]').forEach(function (el) {
      var prev = el.textContent;
      el.textContent = n;
      el.hidden = !n;
      if (String(prev) !== String(n) && n) {
        el.classList.remove('is-bump');
        void el.offsetWidth;
        el.classList.add('is-bump');
      }
    });
    DH.$$('[data-dh-cart-count]').forEach(function (el) { el.textContent = n ? '(' + n + ')' : ''; });
  }

  function lineImage(item) {
    var cands = [];
    var imgs = item.images || (item.product && item.product.images) || [];
    if (imgs && imgs.length) {
      var i0 = imgs[0];
      if (typeof i0 === 'string') cands.push(i0);
      else if (i0) {
        if (i0.image) cands.push(i0.image.small, i0.image.thumbnail, i0.image.medium, i0.image.full_size);
        if (i0.thumbs) cands.push(i0.thumbs.small, i0.thumbs.thumbnail, i0.thumbs.medium);
        cands.push(i0.origin, i0.url, i0.src);
      }
    }
    cands.push(item.image, item.main_image && item.main_image.image && item.main_image.image.small, item.thumbnail);
    for (var k = 0; k < cands.length; k++) if (cands[k] && typeof cands[k] === 'string') return cands[k];
    return '';
  }

  function lineMeta(item) {
    var parts = [];
    var opts = item.options || item.attributes || [];
    if (Array.isArray(opts)) {
      opts.forEach(function (o) {
        if (!o) return;
        var v = o.value != null ? o.value : o.name;
        if (v && typeof v === 'object') v = v[DH.config.lang] || v.ar || v.en || '';
        if (v) parts.push(String(v));
      });
    }
    return parts.join(' · ');
  }

  DH.cart = {
    last: function () { return lastCart; },
    count: count,
    normalizeLines: function (cart) {
      return ((cart && cart.products) || []).map(function (item) {
        return {
          lineId: item.id,
          productId: (item.product && item.product.id) || item.product_id,
          name: item.name || (item.product && item.product.name) || '',
          url: item.url || item.html_url || (item.product && item.product.html_url) || '',
          image: lineImage(item),
          meta: lineMeta(item),
          qty: parseInt(item.quantity, 10) || 1,
          max: item.is_infinite ? 99 : (item.quantity_in_stock || item.available_quantity || item.max_quantity || 99),
          total: item.total_string || item.gross_total_string || item.price_string || '',
          raw: item
        };
      });
    },
    totals: function (cart) {
      return ((cart && cart.totals) || []).map(function (t, i, arr) {
        return { title: String(t.title || '').replace(/\s+/g, ' ').trim(), value: t.value_string || '', grand: t.code === 'total' || i === arr.length - 1 };
      });
    },
    get: function () {
      return zidReady().then(function (zid) { return zid.cart.get(); }).then(function (cart) {
        lastCart = cart || null;
        DH.debug('cart', cart);
        setBadges(count(cart));
        DH.emit('dh:cart', { cart: cart });
        return cart;
      });
    },
    add: function (productId, quantity, extra) {
      var payload = { product_id: productId, quantity: Math.max(1, parseInt(quantity, 10) || 1) };
      return zidReady().then(function (zid) {
        DH.emit('dh:cart-busy', { busy: true });
        return zid.cart.addProduct(payload, { showErrorNotification: true });
      }).then(function (res) {
        DH.debug('add', payload, res);
        if (res && res.cart_items_quantity != null) setBadges(parseInt(res.cart_items_quantity, 10) || 0);
        return DH.cart.get().then(function (cart) {
          DH.emit('dh:cart-added', { productId: productId, quantity: payload.quantity, cart: cart, response: res, extra: extra || {} });
          return cart;
        });
      }).finally(function () { DH.emit('dh:cart-busy', { busy: false }); });
    },
    addForm: function (formId, extra) {
      return zidReady().then(function (zid) {
        var opts = window.bundleCartPayload ? Object.assign({}, window.bundleCartPayload, { form_id: formId }) : { form_id: formId };
        return zid.cart.addProduct(opts, { showErrorNotification: true });
      }).then(function (res) {
        DH.debug('addForm', formId, res);
        return DH.cart.get().then(function (cart) {
          DH.emit('dh:cart-added', { form: formId, cart: cart, response: res, extra: extra || {} });
          return cart;
        });
      });
    },
    buyNow: function (formId) {
      return zidReady().then(function (zid) {
        var opts = window.bundleCartPayload ? Object.assign({}, window.bundleCartPayload, { form_id: formId }) : { form_id: formId };
        return zid.cart.buyNow(opts, { showErrorNotification: true });
      });
    },
    update: function (lineId, quantity) {
      return zidReady().then(function (zid) {
        return quantity > 0
          ? zid.cart.updateProduct({ product_id: lineId, quantity: quantity }, { showErrorNotification: true })
          : zid.cart.removeProduct({ product_id: lineId }, { showErrorNotification: true });
      }).then(function () { return DH.cart.get(); });
    },
    remove: function (lineId) {
      return zidReady().then(function (zid) {
        return zid.cart.removeProduct({ product_id: lineId }, { showErrorNotification: true });
      }).then(function () { return DH.cart.get(); });
    }
  };

  // Dynamic bundles report their selection payload here (same contract as Zid's Growth theme).
  window.addEventListener('vitrin:bundle-selections:updated', function (e) {
    var data = e && e.detail && e.detail.data;
    window.bundleCartPayload = data && data.cartPayload;
    DH.$$('[data-dh-form-add],[data-dh-buy-now]').forEach(function (b) { b.disabled = !(data && data.isSelectionsValid); });
  });

  // Keep badges in sync with platform-driven changes (cart page, kits, other widgets).
  window.addEventListener('zidcart:updated', function () {
    if (DH.cart._silent) return;
    DH.cart.get().catch(function () {});
  });

  /* ---------- Product data ---------- */
  var productCache = new Map();

  function toStr(v) {
    if (v == null) return '';
    if (typeof v === 'object') return v[DH.config.lang] || v.ar || v.en || v.name || v.value || '';
    return String(v);
  }

  function imgSet(list) {
    return (list || []).map(function (im) {
      if (!im) return null;
      if (typeof im === 'string') return { src: im, full: im, alt: '' };
      var i = im.image || im;
      var src = i.large || i.medium || i.full_size || i.origin || i.url || '';
      return src ? { src: src, full: i.full_size || src, alt: toStr(im.alt_text) } : null;
    }).filter(Boolean);
  }

  /* Normalised product shape used by the modal:
     { id, name, url, price, salePrice, images:[{src,full,alt}], options:[{name, values:[{value, swatch}]}],
       variants:[{id, attrs:[...], inStock, qty, price, salePrice}], inStock, needsPage, source } */
  function fromDhJson(j, url) {
    if (!j || !j.id) return null;
    // Template emits attrs as [{n: name, v: value, sw: swatch}] — derive option groups in attribute order.
    if (j.variants && j.variants.length && j.variants[0].attrs && typeof j.variants[0].attrs[0] === 'object') {
      var names = [], vals = {};
      j.variants.forEach(function (v) {
        (v.attrs || []).forEach(function (a, i) {
          var n = a.n || ('#' + (i + 1));
          if (names.indexOf(n) === -1) { names.push(n); vals[n] = []; }
          if (a.v && !vals[n].some(function (x) { return x.value === a.v; })) vals[n].push({ value: a.v, swatch: a.sw || null });
        });
      });
      j.options = names.map(function (n) { return { name: n, values: vals[n] }; });
      j.variants = j.variants.map(function (v) {
        var byName = {};
        (v.attrs || []).forEach(function (a, i) { byName[a.n || ('#' + (i + 1))] = a.v; });
        return Object.assign({}, v, { attrs: names.map(function (n) { return byName[n] != null ? byName[n] : ''; }) });
      });
    }
    return {
      id: String(j.id),
      selectedId: j.selected_id ? String(j.selected_id) : String(j.id),
      name: j.name || '',
      url: j.url || url || '',
      price: j.price || '',
      salePrice: j.sale_price || '',
      shortDescription: j.short_description || '',
      images: imgSet(j.images),
      options: (j.options || []).map(function (o) { return { name: o.name, values: (o.values || []).map(function (v) { return { value: String(v.value), swatch: v.swatch || null }; }) }; }),
      variants: (j.variants || []).map(function (v) {
        return { id: String(v.id), attrs: (v.attrs || []).map(String), inStock: !!v.in_stock, qty: v.qty, infinite: !!v.infinite, price: v.price || '', salePrice: v.sale_price || '' };
      }),
      inStock: j.in_stock !== false,
      infinite: !!j.infinite,
      qty: j.qty,
      needsPage: !!j.needs_page,
      source: 'page-json'
    };
  }

  function fromSdk(p, url) {
    if (!p || !p.id) return null;
    var variants = Array.isArray(p.variants) ? p.variants : [];
    var hasOpts = p.has_options || variants.length > 0;
    if (hasOpts && !variants.length) return null; // SDK payload without variants is not enough to pick a size
    if (variants.length && !variants.every(function (v) { return Array.isArray(v.attributes); })) return null;
    var optNames = [];
    var optValues = {};
    variants.forEach(function (v) {
      v.attributes.forEach(function (a, i) {
        var n = toStr(a.name) || ('Option ' + (i + 1));
        if (optNames.indexOf(n) === -1) { optNames.push(n); optValues[n] = []; }
        var val = toStr(a.value);
        if (val && !optValues[n].some(function (x) { return x.value === val; })) {
          optValues[n].push({ value: val, swatch: (String(a.type || '').toLowerCase() === 'color' && a.type_value) ? a.type_value : null });
        }
      });
    });
    return {
      id: String(p.id),
      selectedId: String((p.selected_product && p.selected_product.id) || p.id),
      name: toStr(p.name),
      url: p.html_url || url || '',
      price: p.formatted_price || '',
      salePrice: p.formatted_sale_price || '',
      shortDescription: toStr(p.short_description || p.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      images: imgSet(p.images),
      options: optNames.map(function (n) { return { name: n, values: optValues[n] }; }),
      variants: variants.map(function (v) {
        return {
          id: String(v.id),
          attrs: v.attributes.map(function (a) { return toStr(a.value); }),
          inStock: v.in_stock != null ? !!v.in_stock : (v.is_infinite || (v.quantity > 0)),
          qty: v.quantity, infinite: !!v.is_infinite,
          price: v.formatted_price || '', salePrice: v.formatted_sale_price || ''
        };
      }),
      inStock: p.in_stock != null ? !!p.in_stock : (p.is_infinite || p.quantity > 0),
      infinite: !!p.is_infinite,
      qty: p.quantity,
      needsPage: !!(p.has_fields || (p.custom_input_fields && p.custom_input_fields.length) || p.product_class === 'dynamic_bundle'),
      source: 'sdk'
    };
  }

  function fromHtml(html, url) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var node = doc.getElementById('dh-product-json');
    if (node) {
      try { return fromDhJson(JSON.parse(node.textContent), url); } catch (e) { DH.debug('dh-product-json parse failed', e); }
    }
    // Last resort: productObj that Zid themes expose on the product page.
    var m = html.match(/window\.productObj\s*=\s*(\{[\s\S]*?\});\s*(?:<\/script>|window\.)/);
    if (m) {
      try { var p = fromSdk(JSON.parse(m[1]), url); if (p) { p.source = 'productObj'; return p; } } catch (e) {}
    }
    return null;
  }

  DH.products = {
    load: function (id, url) {
      var key = String(id || url);
      if (productCache.has(key)) return productCache.get(key);
      var viaSdk = zidReady(4000).then(function (zid) {
        if (!id || !zid.products || typeof zid.products.get !== 'function') return null;
        return Promise.resolve(zid.products.get(id, { showErrorNotification: false })).then(function (res) {
          var p = res && (res.product || res.data || res);
          var norm = fromSdk(p, url);
          DH.debug('zid.products.get', id, norm ? 'usable' : 'not usable', res);
          return norm;
        }).catch(function (e) { DH.debug('zid.products.get failed', e); return null; });
      }).catch(function () { return null; });

      var promise = viaSdk.then(function (p) {
        if (p) return p;
        if (!url) throw new Error('no product url');
        return fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
          .then(function (html) {
            var p2 = fromHtml(html, url);
            if (!p2) throw new Error('product data not found');
            return p2;
          });
      }).then(function (p) {
        DH.debug('product source:', p.source, p);
        return p;
      });
      promise.catch(function () { productCache.delete(key); });
      productCache.set(key, promise);
      return promise;
    },
    /* Resolve a variant from selected values (array aligned with product.options). */
    match: function (product, selected) {
      if (!product.variants.length) return null;
      return product.variants.find(function (v) {
        return v.attrs.every(function (a, i) { return selected[i] == null || selected[i] === a; }) && v.attrs.length === selected.length;
      }) || null;
    },
    /* Is value `val` at option index `idx` purchasable given the other current selections? */
    available: function (product, selected, idx, val) {
      return product.variants.some(function (v) {
        if (v.attrs[idx] !== val || !v.inStock) return false;
        return v.attrs.every(function (a, i) { return i === idx || selected[i] == null || selected[i] === a; });
      });
    },
    _fromHtml: fromHtml,
    _fromSdk: fromSdk
  };

  /* ---------- Simple add buttons on cards: [data-dh-add="<productId>"] ---------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-dh-add]');
    if (!btn) return;
    e.preventDefault();
    if (btn.getAttribute('aria-busy') === 'true') return;
    if (btn.hasAttribute('data-dh-needs-options') && DH.modal) {
      DH.modal.open({ id: btn.getAttribute('data-dh-add'), url: btn.getAttribute('data-dh-url'), origin: btn.closest('[data-dh-card]') || btn });
      return;
    }
    btn.setAttribute('aria-busy', 'true');
    DH.cart.add(btn.getAttribute('data-dh-add'), 1, { name: btn.getAttribute('data-dh-name'), image: btn.getAttribute('data-dh-image') })
      .catch(function (err) { DH.debug('add failed', err); })
      .then(function () { btn.removeAttribute('aria-busy'); });
  });

  /* After any successful add: toast + optional drawer */
  document.addEventListener('dh:cart-added', function (e) {
    var d = e.detail || {};
    var extra = d.extra || {};
    if (extra.fromModal) return;
    if (DH.config.openDrawerOnAdd && DH.overlay && !(DH.modal && DH.modal.isOpen && DH.modal.isOpen())) {
      DH.overlay.open('cart');
    } else {
      DH.toast({
        title: DH.t('added'),
        sub: extra.name || '',
        img: extra.image || '',
        action: { label: DH.t('viewBag'), run: function () { DH.overlay.open('cart'); } }
      });
    }
  });

  DH.ready(function () {
    // Initial badge sync (template value is server-rendered; this catches cached pages).
    zidReady().then(function () { return DH.cart.get(); }).catch(function () {});
  });
})();
