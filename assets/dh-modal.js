/* DUKKAN HDOOM — immersive product sheet.
   Opens from the rack or any card with a shared-element (FLIP) flight, loads real product data through
   DH.products, lets the shopper pick real Zid variants + quantity, and adds the resolved variant id to the cart. */
(function () {
  'use strict';
  var DH = window.DH;
  if (!DH) return;

  DH.ready(function () {
    var root = DH.$('[data-dh-pm]');
    if (!root) return;
    var sheet = DH.$('[data-dh-pm-sheet]', root);
    var track = DH.$('[data-dh-pm-track]', root);
    var dots = DH.$('[data-dh-pm-dots]', root);
    var nameEl = DH.$('[data-dh-pm-name]', root);
    var priceEl = DH.$('[data-dh-pm-price]', root);
    var descEl = DH.$('[data-dh-pm-desc]', root);
    var stockEl = DH.$('[data-dh-pm-stock]', root);
    var optsEl = DH.$('[data-dh-pm-options]', root);
    var msgEl = DH.$('[data-dh-pm-msg]', root);
    var loadEl = DH.$('[data-dh-pm-loading]', root);
    var addBtn = DH.$('[data-dh-pm-add]', root);
    var addLabel = DH.$('[data-dh-pm-add-label]', root);
    var qtyInput = DH.$('[data-dh-pm-qty-input]', root);
    var grab = DH.$('[data-dh-pm-grab]', root);
    var media = DH.$('[data-dh-pm-media]', root);
    var scrollEl = DH.$('.dh-pm__scroll', root);
    var timerEl = DH.$('[data-dh-pm-timer]', root);
    var timerLabel = DH.$('[data-dh-pm-timer-label]', root);
    var timerD = DH.$('[data-dh-pm-d]', root);
    var timerH = DH.$('[data-dh-pm-h]', root);
    var timerM = DH.$('[data-dh-pm-m]', root);
    var timerS = DH.$('[data-dh-pm-s]', root);
    var timerId = 0;

    var state = null;   // { req, product, selected[], origin, returnFocus, release, seq }
    var seq = 0;
    var EASE = 'cubic-bezier(.16,1,.3,1)';
    var isDesktop = function () { return window.matchMedia('(min-width: 900px)').matches; };

    function t(k) { return DH.t(k); }

    /* ---------- Gallery ---------- */
    function slideHtml(src, alt, eager) {
      return '<figure class="dh-pm__slide"><img src="' + DH.esc(src) + '" alt="' + DH.esc(alt || '') + '" draggable="false"' + (eager ? '' : ' loading="lazy"') + ' decoding="async"></figure>';
    }
    function setGallery(images, name) {
      var first = track.querySelector('.dh-pm__slide img');
      var keepFirst = first && images.length && first.getAttribute('src');
      var html = images.map(function (im, i) {
        if (i === 0 && keepFirst) return null;
        return slideHtml(im.src, im.alt || (name + ' — ' + t('image') + ' ' + (i + 1)), i < 2);
      });
      if (keepFirst) {
        DH.$$('.dh-pm__slide', track).slice(1).forEach(function (s) { s.remove(); });
        track.insertAdjacentHTML('beforeend', html.slice(1).join(''));
      } else {
        track.innerHTML = html.join('');
      }
      renderDots();
    }
    function renderDots() {
      var count = track.children.length;
      dots.innerHTML = count > 1 ? Array.prototype.map.call(track.children, function (_, i) {
        return '<button type="button" aria-label="' + DH.esc(t('image') + ' ' + (i + 1) + ' ' + t('of') + ' ' + count) + '"' + (i === 0 ? ' aria-current="true"' : '') + ' data-dot="' + i + '"></button>';
      }).join('') : '';
      track.setAttribute('aria-label', count > 1 ? (count + ' ' + t('image')) : '');
    }
    track.addEventListener('scroll', function () {
      var w = track.clientWidth || 1;
      var i = Math.round(Math.abs(track.scrollLeft) / w);
      DH.$$('button', dots).forEach(function (b, k) { if (k === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    }, { passive: true });
    dots.addEventListener('click', function (e) {
      var b = e.target.closest('[data-dot]');
      if (!b) return;
      var i = +b.getAttribute('data-dot');
      var w = track.clientWidth;
      track.scrollTo({ left: (DH.isRTL() ? -1 : 1) * i * w, behavior: DH.reduced() ? 'auto' : 'smooth' });
    });

    /* ---------- Options ---------- */
    function renderOptions() {
      var p = state.product;
      optsEl.innerHTML = '';
      if (!p) return;
      p.options.forEach(function (opt, idx) {
        var group = document.createElement('div');
        group.className = 'dh-pm__opt';
        var isColor = opt.values.some(function (v) { return v.swatch; });
        var gid = 'dh-pm-opt-' + idx;
        group.innerHTML = '<p class="dh-pm__opt-label" id="' + gid + '">' + DH.esc(opt.name) + ': <span data-chosen></span></p>' +
          '<div class="dh-pm__chips' + (isColor ? ' is-swatches' : '') + '" role="radiogroup" aria-labelledby="' + gid + '">' +
          opt.values.map(function (v) {
            return '<button type="button" role="radio" aria-checked="false" class="dh-pm__chip' + (v.swatch ? ' dh-pm__swatch' : '') + '" data-idx="' + idx + '" data-val="' + DH.esc(v.value) + '"' +
              (v.swatch ? ' style="--sw:' + DH.esc(v.swatch) + '" aria-label="' + DH.esc(v.value) + '"' : '') + '>' + (v.swatch ? '' : DH.esc(v.value)) + '</button>';
          }).join('') + '</div>';
        optsEl.appendChild(group);
      });
      syncOptions();
    }

    function syncOptions() {
      var p = state.product;
      DH.$$('.dh-pm__opt', optsEl).forEach(function (group, idx) {
        var chosen = state.selected[idx];
        var lab = group.querySelector('[data-chosen]');
        if (lab) lab.textContent = chosen != null ? chosen : '';
        DH.$$('.dh-pm__chip', group).forEach(function (chip) {
          var val = chip.getAttribute('data-val');
          var on = chosen === val;
          var avail = DH.products.available(p, state.selected, idx, val);
          chip.setAttribute('aria-checked', on ? 'true' : 'false');
          chip.tabIndex = on || (chosen == null && chip === group.querySelector('.dh-pm__chip')) ? 0 : -1;
          chip.classList.toggle('is-out', !avail);
          chip.setAttribute('aria-disabled', avail ? 'false' : 'true');
          if (!avail) chip.title = t('soldOut'); else chip.removeAttribute('title');
        });
      });
      updateBuy();
    }

    optsEl.addEventListener('click', function (e) {
      var chip = e.target.closest('.dh-pm__chip');
      if (!chip || !state || !state.product) return;
      var idx = +chip.getAttribute('data-idx');
      var val = chip.getAttribute('data-val');
      if (chip.getAttribute('aria-disabled') === 'true') {
        // Allow switching to a value that is available with a different combination of the other options
        var p = state.product;
        var alt = p.variants.find(function (v) { return v.attrs[idx] === val && v.inStock; });
        if (!alt) return;
        state.selected = alt.attrs.slice();
      } else {
        state.selected[idx] = state.selected[idx] === val && state.product.options[idx].values.length > 1 ? null : val;
      }
      msgEl.textContent = '';
      syncOptions();
    });
    optsEl.addEventListener('keydown', function (e) {
      var chip = e.target.closest('.dh-pm__chip');
      if (!chip) return;
      var keys = DH.isRTL() ? { ArrowLeft: 1, ArrowRight: -1, ArrowDown: 1, ArrowUp: -1 } : { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      var chips = DH.$$('.dh-pm__chip', chip.parentElement);
      var i = (chips.indexOf(chip) + keys[e.key] + chips.length) % chips.length;
      chips[i].focus();
      chips[i].click();
    });

    function currentVariant() {
      var p = state.product;
      if (!p || !p.variants.length) return null;
      if (state.selected.some(function (v) { return v == null; })) return null;
      return DH.products.match(p, state.selected);
    }

    function setDesc(text) {
      if (!descEl) return;
      var s = (text || '').replace(/\s+/g, ' ').trim();
      if (!s) { descEl.textContent = ''; descEl.hidden = true; return; }
      descEl.textContent = s.length > 180 ? s.slice(0, 177) + '…' : s;
      descEl.hidden = false;
    }

    function parseEnd(raw) {
      if (!raw) return null;
      var s = String(raw).trim().replace(/-/g, '/');
      var m = s.match(/^(\d{4})\s*[\/.]\s*(\d{1,2})\s*[\/.]\s*(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2}))?/);
      if (!m) { var d = new Date(s); return isNaN(d.getTime()) ? null : d; }
      return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 23, m[5] ? +m[5] : 59, 59);
    }
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function stopTimer() { if (timerId) { clearInterval(timerId); timerId = 0; } }
    function tickTimer(end) {
      var left = end.getTime() - Date.now();
      if (left <= 0) {
        if (timerD) timerD.textContent = '00';
        if (timerH) timerH.textContent = '00';
        if (timerM) timerM.textContent = '00';
        if (timerS) timerS.textContent = '00';
        stopTimer();
        return;
      }
      var sec = Math.floor(left / 1000);
      var d = Math.floor(sec / 86400); sec -= d * 86400;
      var h = Math.floor(sec / 3600); sec -= h * 3600;
      var m = Math.floor(sec / 60); sec -= m * 60;
      if (timerD) timerD.textContent = pad2(Math.min(d, 99));
      if (timerH) timerH.textContent = pad2(h);
      if (timerM) timerM.textContent = pad2(m);
      if (timerS) timerS.textContent = pad2(sec);
    }
    function syncTimer() {
      if (!timerEl) return;
      stopTimer();
      var on = !!(DH.config && DH.config.modalCountdown);
      var end = on ? parseEnd(DH.config.countdownEnd) : null;
      if (!on || !end || end.getTime() <= Date.now()) {
        timerEl.hidden = true;
        return;
      }
      if (timerLabel) timerLabel.textContent = (DH.config.countdownLabel || '').trim();
      timerEl.hidden = false;
      tickTimer(end);
      timerId = setInterval(function () { tickTimer(end); }, 1000);
    }

    function updateBuy() {
      var p = state && state.product;
      addBtn.classList.remove('is-done');
      if (!p) { addBtn.disabled = true; return; }
      nameEl.href = p.url || state.req.url || '#';
      if (p.needsPage) {
        addBtn.disabled = false;
        addLabel.textContent = t('openProduct');
        msgEl.textContent = t('needsFields');
        return;
      }
      var v = currentVariant();
      var complete = !p.variants.length || !!v;
      var inStock = p.variants.length ? (v ? v.inStock : p.variants.some(function (x) { return x.inStock; })) : p.inStock;
      var price = v ? (v.salePrice || v.price) : (p.salePrice || p.price);
      var was = v ? (v.salePrice ? v.price : '') : (p.salePrice ? p.price : '');
      priceEl.innerHTML = DH.esc(price || state.req.price || '') + (was ? ' <del>' + DH.esc(was) + '</del>' : '');
      var q = v ? v.qty : p.qty, inf = v ? v.infinite : p.infinite;
      stockEl.textContent = '';
      stockEl.className = 'dh-pm__stock';
      if (complete && !inStock) { stockEl.textContent = t('soldOut'); stockEl.classList.add('is-out'); }
      else if (complete && !inf && typeof q === 'number' && q > 0 && q <= 5) { stockEl.textContent = t('lowStock').replace('%s', q); stockEl.classList.add('is-low'); }
      var max = (!inf && typeof q === 'number' && q > 0) ? q : 99;
      qtyInput.max = String(max);
      if (+qtyInput.value > max) qtyInput.value = String(max);
      if (complete && !inStock) { addBtn.disabled = true; addLabel.textContent = t('soldOut'); return; }
      if (p.variants.length && !p.variants.some(function (x) { return x.inStock; })) { addBtn.disabled = true; addLabel.textContent = t('soldOut'); return; }
      addBtn.disabled = false;
      addLabel.textContent = complete ? t('add') : t('chooseOptions');
    }

    /* ---------- Quantity ---------- */
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-dh-pm-qty]');
      if (!b) return;
      var v = (parseInt(qtyInput.value, 10) || 1) + parseInt(b.getAttribute('data-dh-pm-qty'), 10);
      qtyInput.value = String(DH.clamp(v, 1, parseInt(qtyInput.max, 10) || 99));
    });
    qtyInput.addEventListener('change', function () {
      qtyInput.value = String(DH.clamp(parseInt(qtyInput.value, 10) || 1, 1, parseInt(qtyInput.max, 10) || 99));
    });

    /* ---------- Add to cart ---------- */
    addBtn.addEventListener('click', function () {
      var p = state && state.product;
      if (!p || addBtn.getAttribute('aria-busy') === 'true') return;
      if (p.needsPage) { location.href = p.url || state.req.url; return; }
      var v = currentVariant();
      if (p.variants.length && !v) {
        var missing = state.selected.findIndex(function (x) { return x == null; });
        msgEl.textContent = t('chooseOptions');
        var g = DH.$$('.dh-pm__opt', optsEl)[missing];
        if (g) { g.classList.remove('is-shake'); void g.offsetWidth; g.classList.add('is-shake'); var c = g.querySelector('.dh-pm__chip:not(.is-out)'); if (c) c.focus(); }
        return;
      }
      var id = v ? v.id : p.selectedId || p.id;
      var qty = parseInt(qtyInput.value, 10) || 1;
      addBtn.setAttribute('aria-busy', 'true');
      msgEl.textContent = '';
      var img = track.querySelector('img');
      DH.cart.add(id, qty, { name: p.name, image: img && img.currentSrc, fromModal: true })
        .then(function () {
          addBtn.removeAttribute('aria-busy');
          addBtn.classList.add('is-done');
          addLabel.textContent = t('added');
          setTimeout(function () {
            close().then(function () {
              if (DH.config.openDrawerOnAdd) DH.overlay.open('cart');
              else DH.toast({ title: t('added'), sub: p.name, img: img && img.currentSrc, action: { label: t('viewBag'), run: function () { DH.overlay.open('cart'); } } });
            });
          }, 750);
        })
        .catch(function (err) {
          addBtn.removeAttribute('aria-busy');
          DH.debug('modal add failed', err);
          var m = err && err.responseData && err.responseData.message;
          msgEl.textContent = (m && (typeof m === 'string' ? m : m.description)) || t('addFailed');
        });
    });

    /* ---------- FLIP ---------- */
    function flight(fromEl, toEl, src, reverse) {
      if (DH.reduced() || !fromEl || !toEl || !fromEl.getBoundingClientRect || !src) return Promise.resolve();
      var a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
      if (!a.width || !b.width || a.bottom < 0 || a.top > innerHeight) return Promise.resolve();
      var clone = document.createElement('img');
      clone.src = src;
      clone.className = 'dh-pm__flight';
      var from = reverse ? b : a, to = reverse ? a : b;
      clone.style.cssText = 'left:' + to.left + 'px;top:' + to.top + 'px;width:' + to.width + 'px;height:' + to.height + 'px;object-fit:' + (fromEl.classList && fromEl.closest && fromEl.closest('.has-cutout') ? 'contain' : 'cover');
      document.body.appendChild(clone);
      var sx = from.width / to.width, sy = from.height / to.height;
      var dx = from.left - to.left, dy = from.top - to.top;
      var anim = clone.animate([
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')', opacity: 1 },
        { transform: 'none', opacity: 1, offset: 0.85 },
        { transform: 'none', opacity: reverse ? 0 : 1 }
      ], { duration: 640, easing: EASE, fill: 'forwards' });
      return anim.finished.catch(function () {}).then(function () {
        return new Promise(function (r) { requestAnimationFrame(function () { clone.remove(); r(); }); });
      });
    }

    /* ---------- Open / close ---------- */
    function open(req) {
      if (!req || (!req.id && !req.url)) return;
      if (state) close(true);
      var my = ++seq;
      state = { req: req, product: null, selected: [], returnFocus: req.returnFocus || document.activeElement };
      if (DH.overlay.get()) DH.overlay.close(true);

      // Preview content from the card/rack (instant), real data replaces it below.
      nameEl.textContent = req.name || '';
      nameEl.href = req.url || '#';
      priceEl.textContent = req.price || '';
      setDesc('');
      stockEl.textContent = '';
      msgEl.textContent = '';
      optsEl.innerHTML = '';
      qtyInput.value = '1';
      addBtn.disabled = true;
      addLabel.textContent = t('add');
      track.innerHTML = req.image ? slideHtml(req.image, req.name, true) : '';
      track.scrollLeft = 0;
      renderDots();
      loadEl.hidden = false;
      if (scrollEl) scrollEl.scrollTop = 0;
      syncTimer();

      root.removeAttribute('inert');
      root.classList.add('is-open');
      DH.lockScroll();
      state.release = DH.trapFocus(root);
      DH.emit('dh:modal-open', { id: req.id });

      var firstImg = track.querySelector('img');
      if (firstImg) firstImg.style.opacity = '0';
      var sheetAnim = DH.reduced()
        ? sheet.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 })
        : sheet.animate(isDesktop()
          ? [{ opacity: 0, transform: 'translateY(24px) scale(.98)' }, { opacity: 1, transform: 'none' }]
          : [{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 560, easing: EASE });
      root.classList.add('is-entering');
      var fl = flight(req.origin, firstImg, req.image || (req.origin && req.origin.currentSrc), false);
      Promise.all([fl, sheetAnim.finished.catch(function () {})]).then(function () {
        if (firstImg) firstImg.style.opacity = '';
        root.classList.remove('is-entering');
      });
      setTimeout(function () { try { (DH.$('.dh-pm__close', root) || root).focus({ preventScroll: true }); } catch (e) {} }, 80);

      DH.products.load(req.id, req.url).then(function (p) {
        if (my !== seq || !state) return;
        state.product = p;
        state.selected = p.options.map(function (o) { return o.values.length === 1 ? o.values[0].value : null; });
        nameEl.textContent = p.name || req.name || '';
        nameEl.href = p.url || req.url || '#';
        setDesc(p.shortDescription || p.description || '');
        if (p.images.length) setGallery(p.images, p.name);
        loadEl.hidden = true;
        renderOptions();
        if (!p.options.length) updateBuy();
      }).catch(function (err) {
        if (my !== seq || !state) return;
        DH.debug('product load failed', err);
        loadEl.hidden = true;
        msgEl.textContent = t('loadFailed');
        addBtn.disabled = false;
        addLabel.textContent = t('openProduct');
        state.product = { needsPage: true, url: req.url, options: [], variants: [], images: [] };
      });
    }

    function close(immediate) {
      if (!state) return Promise.resolve();
      stopTimer();
      var s = state;
      state = null;
      seq++;
      s.release && s.release();
      var done = function () {
        root.classList.remove('is-open');
        root.setAttribute('inert', '');
        sheet.style.transform = '';
        DH.unlockScroll();
        var rf = s.returnFocus;
        if (rf && rf.focus && document.contains(rf)) { try { rf.focus({ preventScroll: true }); } catch (e) {} }
        DH.emit('dh:modal-close', {});
      };
      if (immediate || DH.reduced()) { done(); return Promise.resolve(); }
      var img = track.querySelector('img');
      var back = s.req.origin && document.contains(s.req.origin) ? flight(s.req.origin, img, img && img.currentSrc, true) : Promise.resolve();
      if (img) img.style.opacity = '0';
      var cur = getComputedStyle(sheet).transform;
      var anim = sheet.animate(isDesktop()
        ? [{ opacity: 1, transform: cur === 'none' ? 'none' : cur }, { opacity: 0, transform: 'translateY(16px) scale(.985)' }]
        : [{ transform: cur === 'none' ? 'none' : cur }, { transform: 'translateY(100%)' }], { duration: 420, easing: 'cubic-bezier(.7,0,.84,0)', fill: 'forwards' });
      root.classList.add('is-leaving');
      return Promise.all([anim.finished.catch(function () {}), back]).then(function () {
        anim.cancel();
        if (img) img.style.opacity = '';
        root.classList.remove('is-leaving');
        done();
      });
    }

    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-dh-pm-close]')) { e.preventDefault(); close(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state) { e.preventDefault(); close(); }
    });

    /* ---------- Swipe down to close (mobile) ---------- */
    (function () {
      var sd = null;
      function down(e) {
        if (isDesktop() || !state) return;
        if (e.target.closest('.dh-pm__chip, button, a, input')) return;
        if (scrollEl && scrollEl.contains(e.target) && scrollEl.scrollTop > 0) return;
        sd = { id: e.pointerId, y0: e.clientY, x0: e.clientX, t0: performance.now(), dy: 0, on: false };
      }
      function move(e) {
        if (!sd || e.pointerId !== sd.id) return;
        var dy = e.clientY - sd.y0, dx = e.clientX - sd.x0;
        if (!sd.on) {
          if (dy > 10 && dy > Math.abs(dx) * 1.3) { sd.on = true; try { sheet.setPointerCapture(e.pointerId); } catch (er) {} }
          else if (Math.abs(dx) > 10 || dy < -10) { sd = null; return; }
          else return;
        }
        sd.dy = Math.max(0, dy);
        sheet.style.transform = 'translateY(' + sd.dy + 'px)';
      }
      function up(e) {
        if (!sd || (e && e.pointerId !== sd.id)) return;
        var s = sd; sd = null;
        if (!s.on) return;
        var v = s.dy / Math.max(1, performance.now() - s.t0);
        if (s.dy > 110 || v > 0.6) close();
        else sheet.animate([{ transform: 'translateY(' + s.dy + 'px)' }, { transform: 'none' }], { duration: 380, easing: EASE }).finished.then(function () { sheet.style.transform = ''; }, function () { sheet.style.transform = ''; });
        if (!(s.dy > 110 || v > 0.6)) sheet.style.transform = '';
      }
      [grab, media].forEach(function (el) { if (el) el.addEventListener('pointerdown', down); });
      if (scrollEl) scrollEl.addEventListener('pointerdown', down);
      sheet.addEventListener('pointermove', move);
      sheet.addEventListener('pointerup', up);
      sheet.addEventListener('pointercancel', up);
    })();

    /* ---------- Card quick-add triggers ---------- */
    document.addEventListener('click', function (e) {
      var q = e.target.closest('[data-dh-quick]');
      if (!q) return;
      e.preventDefault();
      e.stopPropagation();
      var card = q.closest('[data-dh-card]');
      var img = card && card.querySelector('.dh-card__img1');
      var name = card && card.querySelector('.dh-card__name');
      var price = card && card.querySelector('.dh-card__price');
      open({ id: q.getAttribute('data-id'), url: q.getAttribute('data-url'), name: name && name.textContent.trim(), price: price && price.firstChild ? price.textContent.trim().split('\n')[0] : '', image: img && img.currentSrc, origin: img, returnFocus: card && card.querySelector('.dh-card__name a') });
    }, true);

    DH.modal = { open: open, close: close, isOpen: function () { return !!state; } };
  });
})();
