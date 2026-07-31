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

  /*
   * The roll is a scripted timeline rather than a simulation. A die drops in,
   * bounces three times at falling heights, then hops along at a constant low
   * height until it reaches its slot. Free physics gave a mushier, slower
   * result and no way to say "exactly three bounces".
   *
   * Each hop is a parabola, so its duration scales with the square root of
   * its height the way a real bounce does — the low hops are quick patters
   * rather than slow floats.
   */
  const DROP_MS = 170;         // falling in from above the tray
  const HOP_MS = 250;          // a full-height hop; shorter ones scale by √apex
  const APEXES = [1, 0.52, 0.27];   // the three bounces, each lower
  const LOW_APEX = 0.085;      // then a constant low hop, repeated
  const LOW_HOPS = 3;
  const PEAK = 0.62;           // first apex, as a fraction of the drop height
  const STAGGER = 35;          // per-die delay, so they land one after another
  const TUMBLE_MS = 70;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function easeOut(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function hopPlan() {
    const apexes = APEXES.concat(new Array(LOW_HOPS).fill(LOW_APEX));
    return apexes.map(apex => ({ apex, dur: HOP_MS * Math.sqrt(apex) }));
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
      const hops = hopPlan();
      const hopTotal = hops.reduce((sum, h) => sum + h.dur, 0);
      // The real face appears once the big bounces are over, so the last
      // stretch of low hops reads as the die already showing its result.
      const revealAt = DROP_MS + hops.slice(0, APEXES.length)
        .reduce((sum, h) => sum + h.dur, 0);

      anim = {
        start: performance.now(),
        tumbleAt: 0,
        faces,
        done,
        revealAt,
        parts: indices.map(i => {
          const startX = maxP * (0.06 + Math.random() * 0.88);
          const startRot = Math.random() * 360;
          const spin = (Math.random() * 2 - 1) * 540;
          return {
            i,
            startX,
            // Above the tray, so the die drops in rather than appearing.
            startY: -size * 0.9,
            slotX: slotX(i),
            floor: rowY,
            peak: (rowY + size * 0.9) * PEAK,
            startRot,
            // Land on a whole turn, so the die finishes upright.
            endRot: Math.round((startRot + spin) / 360) * 360,
            hops,
            total: DROP_MS + hopTotal
          };
        })
      };

      for (const p of anim.parts) place(p.i, p.startX, p.startY, p.startRot);
      raf = requestAnimationFrame(step);
    }

    /** Where a die is `t` ms into its own timeline. */
    function poseAt(p, t) {
      const progress = Math.min(1, Math.max(0, t / p.total));
      const eased = easeOut(progress);
      const x = p.startX + (p.slotX - p.startX) * eased;
      const rot = p.startRot + (p.endRot - p.startRot) * eased;

      if (t <= DROP_MS) {
        // Accelerating fall, so it arrives rather than drifts down.
        const u = Math.max(0, t) / DROP_MS;
        return { x, rot, y: p.startY + (p.floor - p.startY) * u * u };
      }

      let left = t - DROP_MS;
      for (const hop of p.hops) {
        if (left < hop.dur) {
          const u = left / hop.dur;
          // Parabola: leaves and meets the floor, peaking at apex * peak.
          return { x, rot, y: p.floor - hop.apex * p.peak * 4 * u * (1 - u) };
        }
        left -= hop.dur;
      }
      return { x: p.slotX, rot: p.endRot, y: p.floor };
    }

    function step(now) {
      const elapsed = now - anim.start;

      let running = false;
      for (let k = 0; k < anim.parts.length; k++) {
        const p = anim.parts[k];
        const t = elapsed - k * STAGGER;
        if (t < p.total) running = true;
        const pose = poseAt(p, t);
        place(p.i, pose.x, pose.y, pose.rot);
        if (t >= anim.revealAt) nodes[p.i].dataset.face = String(anim.faces[p.i]);
      }

      // Faces flicker only while the die is still tumbling high.
      if (elapsed < anim.revealAt && now - anim.tumbleAt > TUMBLE_MS) {
        anim.tumbleAt = now;
        for (const p of anim.parts) {
          const t = elapsed - anim.parts.indexOf(p) * STAGGER;
          if (t < anim.revealAt) nodes[p.i].dataset.face = String(randomFace());
        }
      }

      if (running) {
        raf = requestAnimationFrame(step);
        return;
      }

      showFaces(anim.faces);
      layout();
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
