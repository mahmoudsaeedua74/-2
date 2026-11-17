/* DUKKAN HDOOM — The Rack: 2.5D drag rail with inertia, spring snapping and garment sway.
   Horizontal intent only: vertical swipes are left to the browser (touch-action: pan-y). */
(function () {
  'use strict';
  var DH = window.DH;
  if (!DH) return;

  var TAP_SLOP = 8;          // px before a press becomes a drag
  var SNAP_K = 170, SNAP_C = 26;
  var SWAY_K = 110, SWAY_C = 7.5;

  DH.register('rack', {
    init: function (section) {
      var stage = section.querySelector('[data-rack-stage]');
      var items = DH.$$('[data-rack-item]', section);
      var n = items.length;
      if (!stage || !n) return {};

      var hits = items.map(function (it) { return it.querySelector('.dh-rack__hit'); });
      var swings = items.map(function (it) { return it.querySelector('.dh-rack__swing'); });
      var railShine = section.querySelector('.dh-rack__rail span');
      var nameEl = section.querySelector('[data-rack-name]');
      var priceEl = section.querySelector('[data-rack-price]');
      var metaEl = nameEl && nameEl.parentElement;
      var curEl = section.querySelector('[data-rack-current]');
      var progEl = section.querySelector('[data-rack-progress]');
      var sizeGuide = section.querySelector('[data-rack-sizeguide]');
      var sizeOpen = section.querySelector('[data-rack-size-open]');
      var sizeRelease = null;
      var sizeHome = sizeGuide ? sizeGuide.parentNode : null;

      var reduced = DH.reduced();
      var dir = DH.isRTL() ? -1 : 1;
      var S = 240;
      var pos = 0, vel = 0, target = 0;
      var ang = new Float32Array(n), angV = new Float32Array(n);
      var screenVel = 0;
      var active = -1;
      var raf = 0, lastT = 0;
      var drag = null;            // { id, x0, y0, pos0, t0, decided, samples }
      var suppressClick = false;
      var interacted = false;
      var wheelTimer = 0;

      section.classList.add('is-live');

      function measure() {
        stage.style.removeProperty('--rack-h');
        stage.style.removeProperty('--rack-w');
        var w = items[0].getBoundingClientRect().width || 260;
        S = window.innerWidth < 768 ? w * 0.74 : w * 0.98;
      }

      function setActive(i) {
        if (i === active) return;
        var prev = active;
        active = i;
        items.forEach(function (it, k) {
          it.classList.toggle('is-active', k === i);
          if (hits[k]) hits[k].setAttribute('tabindex', k === i ? '0' : '-1');
        });
        var it = items[i];
        if (nameEl && it.dataset.name) nameEl.textContent = it.dataset.name;
        if (priceEl) priceEl.textContent = it.dataset.price || '';
        if (metaEl && prev !== -1) { metaEl.classList.remove('is-swap'); void metaEl.offsetWidth; metaEl.classList.add('is-swap'); }
        if (curEl) curEl.textContent = (i + 1 < 10 ? '0' : '') + (i + 1);
        if (progEl) progEl.style.setProperty('--p', ((i + 1) / n).toFixed(3));
      }

      function render() {
        for (var i = 0; i < n; i++) {
          var d = i - pos;
          var ad = Math.abs(d);
          var spread = ad <= 1 ? ad : 1 + (ad - 1) * 0.78;
          var x = (d < 0 ? -1 : 1) * spread * S * dir;
          var z = -Math.min(ad, 4) * 150;
          var ry = -(x > 0 ? 1 : -1) * Math.min(ad, 2) * 13;
          var sc = 1 - Math.min(ad, 3) * 0.085;
          var op = ad > 3.6 ? 0 : 1 - Math.min(ad, 3) * 0.24;
          var st = items[i].style;
          st.transform = 'translate3d(' + x.toFixed(1) + 'px,0,' + z.toFixed(1) + 'px) rotateY(' + ry.toFixed(2) + 'deg) scale(' + sc.toFixed(4) + ')';
          st.opacity = op.toFixed(3);
          st.zIndex = String(100 - Math.round(ad * 10));
          st.visibility = op <= 0 ? 'hidden' : '';
          if (swings[i]) swings[i].style.setProperty('--sway', ang[i].toFixed(2) + 'deg');
          items[i].style.setProperty('--sway', ang[i].toFixed(2) + 'deg');
        }
        if (railShine) railShine.style.setProperty('--rail-shine', (-pos * S * 0.25 * dir).toFixed(1) + 'px');
        setActive(DH.clamp(Math.round(pos), 0, n - 1));
      }

      function step(t) {
        raf = 0;
        var dt = lastT ? Math.min(0.034, (t - lastT) / 1000) : 0.016;
        lastT = t;
        var moving = false;

        if (!drag || drag.decided !== 'x') {
          var k = reduced ? 420 : SNAP_K, c = reduced ? 42 : SNAP_C;
          var a = (target - pos) * k - vel * c;
          vel += a * dt;
          var prevPos = pos;
          pos += vel * dt;
          screenVel = -((pos - prevPos) / dt) * S * dir;
          if (Math.abs(target - pos) < 0.0006 && Math.abs(vel) < 0.003) { pos = target; vel = 0; screenVel = 0; }
          else moving = true;
        }

        // Garment sway: each hanger lags behind the rail's screen velocity.
        if (!reduced) {
          for (var i = 0; i < n; i++) {
            var want = DH.clamp(screenVel * 0.011, -15, 15) * (1 - Math.min(Math.abs(i - pos), 2) * 0.25);
            var kk = SWAY_K * (1 + (i % 3) * 0.09);
            var acc = (want - ang[i]) * kk - angV[i] * SWAY_C;
            angV[i] += acc * dt;
            ang[i] += angV[i] * dt;
            if (Math.abs(ang[i]) > 0.02 || Math.abs(angV[i]) > 0.02) moving = true;
            else { ang[i] = 0; angV[i] = 0; }
          }
        }
        if (drag && drag.decided === 'x') { moving = true; screenVel *= 0.86; }

        render();
        if (moving) kick();
        else lastT = 0;
      }

      function kick() { if (!raf) raf = requestAnimationFrame(step); }

      function goTo(i, opts) {
        target = DH.clamp(i, 0, n - 1);
        interacted = true;
        kick();
        if (opts && opts.focus && hits[target]) {
          try { hits[target].focus({ preventScroll: true }); } catch (e) {}
        }
      }

      function open(i) {
        var it = items[i];
        if (!it || it.classList.contains('is-placeholder')) return;
        var img = it.querySelector('.dh-rack__garment img');
        if (DH.modal && DH.modal.open) {
          DH.modal.open({
            id: it.dataset.id,
            url: it.dataset.url,
            name: it.dataset.name,
            price: it.dataset.price,
            image: it.dataset.image || (img && img.currentSrc),
            origin: img || it,
            returnFocus: hits[i]
          });
        } else if (it.dataset.url) {
          location.href = it.dataset.url;
        }
      }

      /* ---------- Pointer ---------- */
      function onDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (drag) return;
        drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, pos0: pos, t0: performance.now(), decided: null, samples: [] };
        vel = 0;
      }
      function onMove(e) {
        if (!drag || e.pointerId !== drag.id) return;
        var dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
        if (!drag.decided) {
          if (Math.abs(dx) > TAP_SLOP && Math.abs(dx) > Math.abs(dy) * 1.15) {
            drag.decided = 'x';
            drag.x0 = e.clientX;  // start from here: no jump of the slop distance
            drag.pos0 = pos;
            dx = 0;
            try { stage.setPointerCapture(e.pointerId); } catch (err) {}
            stage.classList.add('is-dragging');
            interacted = true;
          } else if (Math.abs(dy) > TAP_SLOP) {
            drag = null;          // vertical intent → the page scrolls natively
            return;
          } else return;
        }
        e.preventDefault();
        var raw = drag.pos0 - (dx * dir) / S;
        if (raw < 0) raw = raw * 0.32;
        else if (raw > n - 1) raw = (n - 1) + (raw - (n - 1)) * 0.32;
        var now = performance.now();
        var prevPos = pos;
        pos = raw;
        drag.samples.push({ t: now, p: pos });
        while (drag.samples.length > 2 && now - drag.samples[0].t > 110) drag.samples.shift();
        var dtm = Math.max(1, now - (drag.lastT || now - 16));
        drag.lastT = now;
        screenVel = DH.lerp(screenVel, -((pos - prevPos) / (dtm / 1000)) * S * dir, 0.5);
        kick();
      }
      function onUp(e) {
        if (!drag || (e && e.pointerId !== drag.id)) return;
        var d = drag;
        drag = null;
        stage.classList.remove('is-dragging');
        if (d.decided !== 'x') return; // tap → handled by the click event
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 60);
        var s = d.samples, v = 0;
        if (s.length > 1) {
          var a = s[0], b = s[s.length - 1];
          var dt = (b.t - a.t) / 1000;
          if (dt > 0) v = (b.p - a.p) / dt;
        }
        if (performance.now() - (s.length ? s[s.length - 1].t : 0) > 90) v = 0; // finger held still
        vel = v;
        var projected = pos + v * 0.2;
        var base = Math.round(d.pos0);
        target = DH.clamp(Math.round(projected), Math.max(0, base - 4), Math.min(n - 1, base + 4));
        kick();
      }
      function onCancel(e) {
        if (!drag || (e && e.pointerId !== drag.id)) return;
        var decided = drag.decided;
        drag = null;
        stage.classList.remove('is-dragging');
        if (decided === 'x') { target = DH.clamp(Math.round(pos), 0, n - 1); kick(); }
      }

      function onClick(e) {
        var hit = e.target.closest('.dh-rack__hit');
        if (!hit) return;
        e.preventDefault();
        if (suppressClick) return;
        var i = hits.indexOf(hit);
        if (i < 0) return;
        if (i !== active) goTo(i);
        else open(i);
      }

      function onKey(e) {
        var next = dir === 1 ? 'ArrowRight' : 'ArrowLeft';
        var prev = dir === 1 ? 'ArrowLeft' : 'ArrowRight';
        if (e.key === next) { e.preventDefault(); goTo(active + 1, { focus: true }); }
        else if (e.key === prev) { e.preventDefault(); goTo(active - 1, { focus: true }); }
        else if (e.key === 'Home') { e.preventDefault(); goTo(0, { focus: true }); }
        else if (e.key === 'End') { e.preventDefault(); goTo(n - 1, { focus: true }); }
      }

      function onWheel(e) {
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 2) return; // vertical wheel scrolls the page
        e.preventDefault();
        interacted = true;
        pos = DH.clamp(pos + (e.deltaX * dir) / S, -0.3, n - 0.7);
        target = pos;
        screenVel = -e.deltaX * 18;
        kick();
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(function () { target = DH.clamp(Math.round(pos), 0, n - 1); kick(); }, 120);
      }

      stage.addEventListener('pointerdown', onDown);
      stage.addEventListener('pointermove', onMove, { passive: false });
      stage.addEventListener('pointerup', onUp);
      stage.addEventListener('pointercancel', onCancel);
      // Touch input is implicitly captured by the child under the finger; moving capture to the stage
      // fires a bubbling lostpointercapture from that child, which must not end the drag.
      stage.addEventListener('lostpointercapture', function (e) { if (e.target === stage) onCancel(e); });
      stage.addEventListener('click', onClick);
      stage.addEventListener('keydown', onKey);
      stage.addEventListener('wheel', onWheel, { passive: false });
      stage.addEventListener('dragstart', function (e) { e.preventDefault(); });
      /* Size guide lightbox — portaled to body so section overflow cannot clip it */
      function closeSize() {
        if (!sizeGuide || sizeGuide.hidden) return;
        sizeGuide.classList.remove('is-open');
        sizeGuide.hidden = true;
        if (sizeRelease) { sizeRelease(); sizeRelease = null; }
        DH.unlockScroll();
        if (sizeHome && sizeGuide.parentNode !== sizeHome) sizeHome.appendChild(sizeGuide);
        if (sizeOpen) try { sizeOpen.focus({ preventScroll: true }); } catch (e) {}
      }
      function openSize() {
        if (!sizeGuide) return;
        if (sizeGuide.parentNode !== document.body) document.body.appendChild(sizeGuide);
        sizeGuide.hidden = false;
        requestAnimationFrame(function () { sizeGuide.classList.add('is-open'); });
        DH.lockScroll();
        var panel = sizeGuide.querySelector('[data-rack-size-panel]');
        sizeRelease = DH.trapFocus(panel || sizeGuide);
        setTimeout(function () {
          var c = sizeGuide.querySelector('.dh-sizeguide__close');
          try { (c || panel || sizeGuide).focus({ preventScroll: true }); } catch (e) {}
        }, 40);
      }
      if (sizeOpen) sizeOpen.addEventListener('click', function (e) { e.preventDefault(); openSize(); });
      if (sizeGuide) {
        sizeGuide.addEventListener('click', function (e) {
          if (e.target === sizeGuide || e.target.closest('[data-rack-size-close]')) closeSize();
        });
        document.addEventListener('keydown', function (e) {
          if (e.key === 'Escape' && sizeGuide.classList.contains('is-open')) closeSize();
        });
      }

      var ro = window.ResizeObserver ? new ResizeObserver(function () { measure(); render(); }) : null;
      if (ro) ro.observe(stage); else window.addEventListener('resize', function () { measure(); render(); });

      // One gentle nudge the first time the rack enters the viewport, so people see it moves.
      var io = null;
      if (!reduced && window.IntersectionObserver && n > 1) {
        io = new IntersectionObserver(function (entries) {
          if (!entries[0].isIntersecting) return;
          io.disconnect(); io = null;
          setTimeout(function () {
            if (interacted || drag) return;
            vel = 2.4; target = 0; kick();
          }, 650);
        }, { threshold: 0.45 });
        io.observe(stage);
      }

      measure();
      render();

      return {
        destroy: function () {
          closeSize();
          if (raf) cancelAnimationFrame(raf);
          if (ro) ro.disconnect();
          if (io) io.disconnect();
          clearTimeout(wheelTimer);
          stage.removeEventListener('pointerdown', onDown);
          stage.removeEventListener('pointermove', onMove);
          stage.removeEventListener('pointerup', onUp);
          stage.removeEventListener('pointercancel', onCancel);
          stage.removeEventListener('lostpointercapture', onCancel);
          stage.removeEventListener('click', onClick);
          stage.removeEventListener('keydown', onKey);
          stage.removeEventListener('wheel', onWheel);
        },
        goTo: goTo
      };
    }
  });
})();
