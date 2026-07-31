/*
 * Shared dice tray: builds the dice and rolls them with a bounce-and-settle
 * animation. Used by 10,000 and Dice.
 *
 * The physics runs in tray units — the tray is 100x100 whatever its pixel
 * size — so nothing here needs to know how wide the screen is. Die size and
 * the landing slots are derived from how many dice are in play, so one die
 * fills more of the tray than six do. See games/ten-thousand/_README.md.
 *
 * Pair with css/dice.css, which styles .die/.pips/.pip and reads --die-size.
 */
window.DiceTray = (function () {
  const FACES = 6;
  const MAX_SIZE = 20;   // a lone die never grows past this, in tray units
  const SPAN = 84;       // width the dice share once there are enough of them
  const BOTTOM = 4;      // gap between the settled row and the tray floor
  const BOUNCE_MS = 1100;
  const SETTLE_MS = 700;
  const STAGGER = 45;    // per-die delay, so they land one after another
  const GRAVITY = 300;
  const TUMBLE_MS = 80;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function randomFace() {
    return 1 + Math.floor(Math.random() * FACES);
  }

  function create(el, opts) {
    const options = opts || {};
    const onPick = options.onPick;

    let nodes = [];
    let size = 14;
    let gap = 2;
    let rowY = 82;
    let anim = null;
    let raf = 0;
    let lastTs = 0;

    function metrics(count) {
      size = Math.min(MAX_SIZE, SPAN / count);
      gap = (100 - count * size) / (count + 1);
      rowY = 100 - size - BOTTOM;
      el.style.setProperty('--die-size', size + '%');
    }

    function slotX(i) {
      return gap + i * (size + gap);
    }

    function place(i, x, y, rot) {
      const node = nodes[i];
      node.style.left = x + '%';
      node.style.top = y + '%';
      node.style.transform = rot ? 'rotate(' + rot + 'deg)' : '';
    }

    function layout() {
      for (let i = 0; i < nodes.length; i++) place(i, slotX(i), rowY, 0);
    }

    function cancel() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      anim = null;
    }

    // Dice are buttons only when the game wants them tapped; Dice just shows
    // them, and a span keeps them out of the tab order.
    function setCount(count) {
      cancel();
      el.textContent = '';
      nodes = [];
      metrics(count);

      const frag = document.createDocumentFragment();
      for (let i = 0; i < count; i++) {
        const die = document.createElement(onPick ? 'button' : 'span');
        die.className = 'die';
        die.dataset.index = String(i);
        die.dataset.face = '1';
        if (onPick) {
          die.type = 'button';
          die.addEventListener('click', () => onPick(i));
        }
        const pips = document.createElement('span');
        pips.className = 'pips';
        for (let p = 0; p < 9; p++) {
          const pip = document.createElement('span');
          pip.className = 'pip';
          pips.append(pip);
        }
        die.append(pips);
        nodes.push(die);
        frag.append(die);
      }
      el.append(frag);
      layout();
    }

    function showFaces(faces) {
      for (let i = 0; i < nodes.length; i++) {
        if (faces[i]) nodes[i].dataset.face = String(faces[i]);
      }
    }

    /**
     * Animates `indices` to the faces given in `faces` (indexed by die, so a
     * caller can leave others untouched), then calls `done`.
     */
    function roll(indices, faces, done) {
      cancel();

      if (reduceMotion.matches) {
        showFaces(faces);
        layout();
        if (done) done();
        return;
      }

      const maxP = 100 - size;
      anim = {
        start: performance.now(),
        settling: false,
        settleStart: 0,
        tumbleAt: 0,
        maxP,
        faces,
        done,
        parts: indices.map(i => ({
          i,
          x: maxP * (0.08 + Math.random() * 0.84),
          y: maxP * (0.03 + Math.random() * 0.32),
          vx: (Math.random() * 2 - 1) * 95,
          vy: 25 + Math.random() * 55,
          rot: Math.random() * 360,
          vr: (Math.random() * 2 - 1) * 430,
          fromX: 0, fromY: 0, fromRot: 0, toRot: 0
        }))
      };

      // Seed the on-screen positions before the first frame, so the dice do
      // not flash at their landing slots for one tick.
      for (const p of anim.parts) place(p.i, p.x, p.y, p.rot);
      lastTs = 0;
      raf = requestAnimationFrame(step);
    }

    function step(now) {
      const elapsed = now - anim.start;
      const dt = lastTs ? Math.min(0.032, (now - lastTs) / 1000) : 0.016;
      lastTs = now;
      const maxP = anim.maxP;

      if (elapsed < BOUNCE_MS) {
        for (const p of anim.parts) {
          p.vy += GRAVITY * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx) * 0.84; }
          if (p.x > maxP) { p.x = maxP; p.vx = -Math.abs(p.vx) * 0.84; }
          if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) * 0.84; }
          if (p.y > maxP) { p.y = maxP; p.vy = -Math.abs(p.vy) * 0.68; p.vx *= 0.9; p.vr *= 0.8; }
          place(p.i, p.x, p.y, p.rot);
        }
        // Faces flicker while tumbling; the real one is revealed on landing.
        if (now - anim.tumbleAt > TUMBLE_MS) {
          anim.tumbleAt = now;
          for (const p of anim.parts) nodes[p.i].dataset.face = String(randomFace());
        }
        raf = requestAnimationFrame(step);
        return;
      }

      if (!anim.settling) {
        anim.settling = true;
        anim.settleStart = now;
        for (const p of anim.parts) {
          p.fromX = p.x;
          p.fromY = p.y;
          p.fromRot = p.rot;
          // Settle to the nearest whole turn so the die lands upright rather
          // than visibly unwinding.
          p.toRot = Math.round(p.rot / 360) * 360;
          nodes[p.i].dataset.face = String(anim.faces[p.i]);
        }
      }

      let done = true;
      for (let k = 0; k < anim.parts.length; k++) {
        const p = anim.parts[k];
        const raw = (now - anim.settleStart - k * STAGGER) / SETTLE_MS;
        const t = raw <= 0 ? 0 : raw >= 1 ? 1 : raw;
        if (t < 1) done = false;
        const e = easeInOut(t);
        place(
          p.i,
          p.fromX + (slotX(p.i) - p.fromX) * e,
          p.fromY + (rowY - p.fromY) * e,
          p.fromRot + (p.toRot - p.fromRot) * e
        );
      }

      if (!done) {
        raf = requestAnimationFrame(step);
        return;
      }

      const finish = anim.done;
      cancel();
      if (finish) finish();
    }

    return {
      setCount,
      layout,
      showFaces,
      roll,
      cancel,
      node: i => nodes[i],
      count: () => nodes.length,
      isRolling: () => Boolean(anim)
    };
  }

  return { create, randomFace, FACES };
})();
