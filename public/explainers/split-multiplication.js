// "Split it up!": shows that a hard multiplication like 16 × 17 can be cut
// into easier ones, (16 × 10) + (16 × 3) + (16 × 4), using an area model.
//
// The multiplication is drawn as a rectangle of little squares: A across and
// B down. Cutting the rectangle into smaller rectangles doesn't change how
// many squares there are, so the small multiplications add up to the big one.
//
// It opens as a step-by-step story of 16 × 17, then the player can try any
// numbers: tap a ruler to cut, drag a ✂️ to move a cut, tap it to remove it.
Explainers.define("split-multiplication", (root) => {
  "use strict";

  const MAX = 50;
  const MAX_CUTS = 6;
  const RULER = 34; // px, thickness of the rulers
  const COLORS = ["#7bdff2", "#ffd166", "#ff8fab", "#b2f7a1", "#c3a6ff", "#ff9f6b", "#80ffdb", "#f7b2d9", "#a0c4ff"];
  const PRESETS = [
    { a: 16, b: 17, b_cuts: [10, 13] },
    { a: 23, b: 14, b_cuts: [10] },
    { a: 25, b: 12, b_cuts: [10] },
    { a: 18, b: 15, a_cuts: [10], b_cuts: [10] },
    { a: 9, b: 34, b_cuts: [10, 20, 30] },
  ];

  const fmt = (n) => n.toLocaleString("en-US");

  // ---------- State ----------

  let nextCutId = 1;
  const s = {
    a: 16,
    b: 17,
    cuts: { a: [], b: [] }, // [{ id, pos }], pos = squares from the start
    gap: 0, // px between the pieces
    labels: Infinity, // how many pieces show their sum
    highlight: -1, // piece picked out by the story (or hovered)
    sum: true, // show the total
    mode: "story", // "story" | "explore"
    steps: [],
    step: 0,
    autoplay: null,
  };

  // ---------- DOM ----------

  root.innerHTML = `
    <div class="sx">
      <div class="sx-panel sx-story">
        <p class="sx-story-text" aria-live="polite"></p>
        <div class="sx-story-nav">
          <button type="button" class="small sx-back">← Back</button>
          <span class="sx-dots" aria-hidden="true"></span>
          <button type="button" class="small sx-play">▶ Play</button>
          <button type="button" class="primary sx-next">Next →</button>
        </div>
      </div>

      <div class="sx-panel sx-explore hidden">
        <div class="sx-inputs">
          <input type="number" class="sx-a" min="1" max="${MAX}" inputmode="numeric" aria-label="Squares across">
          <span class="sx-times">×</span>
          <input type="number" class="sx-b" min="1" max="${MAX}" inputmode="numeric" aria-label="Squares down">
          <span class="sx-presets"></span>
        </div>
        <p class="sx-help">Tap a ruler to cut the rectangle. Drag a ✂️ to move a cut, or tap it to remove it.</p>
        <div class="sx-tools">
          <button type="button" class="small sx-tens-b"></button>
          <button type="button" class="small sx-tens-a"></button>
          <button type="button" class="small sx-clear">Remove cuts</button>
          <button type="button" class="small sx-watch">▶ Watch how it works</button>
        </div>
      </div>

      <div class="sx-eq" aria-live="polite"></div>

      <div class="sx-board">
        <div class="sx-corner" aria-hidden="true">×</div>
        <div class="sx-ruler sx-ruler-a" aria-label="Ruler across: tap to cut"><div class="sx-segs"></div><div class="sx-handles"></div></div>
        <div class="sx-ruler sx-ruler-b" aria-label="Ruler down: tap to cut"><div class="sx-segs"></div><div class="sx-handles"></div></div>
        <div class="sx-stage"></div>
      </div>
    </div>`;

  const q = (sel) => root.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  const board = q(".sx-board");
  const stage = q(".sx-stage");
  const rulers = { a: q(".sx-ruler-a"), b: q(".sx-ruler-b") };
  const eq = q(".sx-eq");
  const inputs = { a: q(".sx-a"), b: q(".sx-b") };

  PRESETS.forEach((p) => {
    const chip = el("button", "small sx-preset", `${p.a} × ${p.b}`);
    chip.type = "button";
    chip.addEventListener("click", () => {
      stopAutoplay();
      s.a = p.a;
      s.b = p.b;
      s.cuts = { a: (p.a_cuts || []).map(newCut), b: (p.b_cuts || []).map(newCut) };
      render();
    });
    q(".sx-presets").appendChild(chip);
  });

  // ---------- Geometry ----------

  function newCut(pos) {
    return { id: nextCutId++, pos };
  }

  function cutPositions(axis) {
    return s.cuts[axis].map((c) => c.pos).sort((x, y) => x - y);
  }

  // [{ start, len }] for the pieces along one side.
  function partsOf(axis) {
    const n = s[axis];
    const points = [0, ...cutPositions(axis), n];
    const parts = [];
    for (let i = 0; i < points.length - 1; i++) parts.push({ start: points[i], len: points[i + 1] - points[i] });
    return parts;
  }

  function blocks() {
    const pa = partsOf("a");
    const pb = partsOf("b");
    const out = [];
    pb.forEach((rowPart, j) => {
      pa.forEach((colPart, i) => {
        out.push({ i, j, x: colPart.len, y: rowPart.len, product: colPart.len * rowPart.len, colPart, rowPart });
      });
    });
    return out;
  }

  let cell = 20;

  function computeCell() {
    const width = Math.max(120, board.clientWidth - RULER - 6);
    const maxHeight = Math.max(200, Math.min(window.innerHeight * 0.45, 440));
    const gapsA = (partsOf("a").length - 1) * s.gap;
    const gapsB = (partsOf("b").length - 1) * s.gap;
    cell = Math.floor(Math.min((width - gapsA) / s.a, (maxHeight - gapsB) / s.b));
    cell = Math.max(3, Math.min(30, cell));
  }

  // Where a boundary k (0..n) sits along an axis, in px.
  function boundaryPos(axis, k) {
    const cuts = cutPositions(axis);
    const before = cuts.filter((c) => c < k).length;
    return k * cell + before * s.gap + (cuts.includes(k) ? s.gap / 2 : 0);
  }

  function partOffset(axis, index, start) {
    return start * cell + index * s.gap;
  }

  function sideLength(axis) {
    return s[axis] * cell + (partsOf(axis).length - 1) * s.gap;
  }

  // The boundary (1..n-1) nearest to a pointer position on a ruler.
  function nearestBoundary(axis, clientPos) {
    const r = rulers[axis].getBoundingClientRect();
    const rel = clientPos - (axis === "a" ? r.left : r.top);
    let best = 1;
    let bestDist = Infinity;
    for (let k = 1; k < s[axis]; k++) {
      const d = Math.abs(boundaryPos(axis, k) - rel);
      if (d < bestDist) {
        best = k;
        bestDist = d;
      }
    }
    return best;
  }

  // ---------- Drawing ----------

  const blockEls = new Map(); // "i-j" -> element
  const handleEls = { a: new Map(), b: new Map() }; // cut id -> element

  function render() {
    computeCell();
    const w = sideLength("a");
    const h = sideLength("b");
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
    rulers.a.style.width = `${w}px`;
    rulers.b.style.height = `${h}px`;
    board.style.setProperty("--cell", `${cell}px`);
    stage.classList.toggle("tiny", cell < 7);
    stage.classList.toggle("summed", s.sum && s.mode === "story" && s.step === s.steps.length - 1);

    const list = blocks();
    const seen = new Set();
    list.forEach((blk, index) => {
      const key = `${blk.i}-${blk.j}`;
      seen.add(key);
      let node = blockEls.get(key);
      if (!node) {
        node = el("div", "sx-block");
        node.appendChild(el("span", "sx-label"));
        node.addEventListener("pointerenter", () => setHover(node.dataset.index));
        node.addEventListener("pointerleave", () => setHover(-1));
        stage.appendChild(node);
        blockEls.set(key, node);
      }
      node.dataset.index = index;
      const left = partOffset("a", blk.i, blk.colPart.start);
      const top = partOffset("b", blk.j, blk.rowPart.start);
      const bw = blk.x * cell;
      const bh = blk.y * cell;
      Object.assign(node.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${bw}px`,
        height: `${bh}px`,
        backgroundColor: COLORS[index % COLORS.length],
      });
      node.classList.toggle("hl", s.highlight === index);
      node.classList.toggle("dim", s.highlight >= 0 && s.highlight !== index);
      drawLabel(node.firstChild, blk, index, bw, bh);
    });
    for (const [key, node] of blockEls) {
      if (!seen.has(key)) {
        node.remove();
        blockEls.delete(key);
      }
    }

    drawRuler("a");
    drawRuler("b");
    drawEquation(list);
    drawPanels();
  }

  function drawLabel(label, blk, index, bw, bh) {
    const show = index < s.labels;
    label.textContent = "";
    label.classList.toggle("hidden", !show);
    if (!show) return;
    const size = Math.max(10, Math.min(22, bw / 6, bh / 2.4));
    label.style.fontSize = `${size}px`;
    if (bw >= 64 && bh >= 40) {
      label.append(el("span", "sx-term", `${blk.x} × ${blk.y}`), el("span", "sx-prod", `= ${fmt(blk.product)}`));
    } else if (bw >= 22 && bh >= 14) {
      label.append(el("span", "sx-prod", fmt(blk.product)));
    }
  }

  function drawRuler(axis) {
    const ruler = rulers[axis];
    const segs = ruler.querySelector(".sx-segs");
    segs.innerHTML = "";
    partsOf(axis).forEach((part, index) => {
      const seg = el("div", "sx-seg");
      const offset = partOffset(axis, index, part.start);
      const len = part.len * cell;
      if (axis === "a") Object.assign(seg.style, { left: `${offset}px`, width: `${len}px` });
      else Object.assign(seg.style, { top: `${offset}px`, height: `${len}px` });
      if (len >= 16) seg.appendChild(el("span", "sx-seg-num", String(part.len)));
      segs.appendChild(seg);
    });

    const layer = ruler.querySelector(".sx-handles");
    const ids = new Set(s.cuts[axis].map((c) => c.id));
    for (const [id, node] of handleEls[axis]) {
      if (!ids.has(id)) {
        node.remove();
        handleEls[axis].delete(id);
      }
    }
    for (const cut of s.cuts[axis]) {
      let node = handleEls[axis].get(cut.id);
      if (!node) {
        node = el("button", "sx-handle", "✂️");
        node.type = "button";
        node.addEventListener("pointerdown", (e) => dragHandle(e, axis, cut));
        layer.appendChild(node);
        handleEls[axis].set(cut.id, node);
      }
      node.setAttribute("aria-label", `Cut at ${cut.pos}: tap to remove`);
      const pos = boundaryPos(axis, cut.pos);
      if (axis === "a") node.style.left = `${pos}px`;
      else node.style.top = `${pos}px`;
    }
  }

  // Chips that were already showing the same text last time don't pop in again.
  let prevChips = new Map();
  let nextChips = new Map();

  function chip(text, index, slot) {
    const c = el("span", "sx-chip", text);
    if (slot !== undefined) {
      nextChips.set(slot, text);
      if (prevChips.get(slot) !== text) c.classList.add("pop");
    }
    if (index !== undefined) {
      c.style.backgroundColor = COLORS[index % COLORS.length];
      c.addEventListener("pointerenter", () => setHover(index));
      c.addEventListener("pointerleave", () => setHover(-1));
    }
    return c;
  }

  function drawEquation(list) {
    nextChips = new Map();
    drawEquationLines(list);
    prevChips = nextChips;
  }

  function drawEquationLines(list) {
    eq.innerHTML = "";
    const total = s.a * s.b;
    const hasCuts = list.length > 1;

    const line1 = el("div", "sx-line");
    line1.appendChild(el("span", "sx-big", `${s.a} × ${s.b}`));
    line1.appendChild(el("span", "sx-eqsign", "="));
    if (!hasCuts) {
      line1.appendChild(el("span", "sx-big", "?"));
      eq.appendChild(line1);
      if (s.mode === "explore") eq.appendChild(el("p", "sx-help", "Cut the rectangle into easier pieces to work it out!"));
      return;
    }
    list.forEach((blk, index) => {
      if (index) line1.appendChild(el("span", "sx-plus", "+"));
      line1.appendChild(chip(`${blk.x} × ${blk.y}`, index, `t${index}`));
    });
    eq.appendChild(line1);

    if (s.labels > 0) {
      const line2 = el("div", "sx-line");
      line2.appendChild(el("span", "sx-eqsign", "="));
      list.forEach((blk, index) => {
        if (index) line2.appendChild(el("span", "sx-plus", "+"));
        line2.appendChild(index < s.labels ? chip(fmt(blk.product), index, `p${index}`) : chip("?", undefined, `p${index}`));
      });
      eq.appendChild(line2);
    }

    if (s.sum && s.labels >= list.length) {
      const line3 = el("div", "sx-line");
      const totalEl = el("span", "sx-total", fmt(total));
      nextChips.set("total", fmt(total));
      if (prevChips.get("total") !== fmt(total)) totalEl.classList.add("pop");
      line3.append(el("span", "sx-eqsign", "="), totalEl);
      eq.appendChild(line3);
    }
  }

  function setHover(index) {
    if (s.mode !== "explore") return;
    s.highlight = Number(index);
    blockEls.forEach((node) => {
      const i = Number(node.dataset.index);
      node.classList.toggle("hl", s.highlight === i);
      node.classList.toggle("dim", s.highlight >= 0 && s.highlight !== i);
    });
  }

  function drawPanels() {
    const story = s.mode === "story";
    q(".sx-story").classList.toggle("hidden", !story);
    q(".sx-explore").classList.toggle("hidden", story);
    board.classList.toggle("explore", !story);

    if (story) {
      const step = s.steps[s.step];
      q(".sx-story-text").textContent = step.text;
      q(".sx-back").disabled = s.step === 0;
      const last = s.step === s.steps.length - 1;
      q(".sx-next").textContent = last ? "Now you try! →" : "Next →";
      q(".sx-play").textContent = s.autoplay ? "⏸ Pause" : "▶ Play";
      q(".sx-play").classList.toggle("hidden", last);
      const dots = q(".sx-dots");
      dots.innerHTML = "";
      s.steps.forEach((_, i) => dots.appendChild(el("span", "sx-dot" + (i === s.step ? " on" : i < s.step ? " done" : ""))));
    } else {
      if (document.activeElement !== inputs.a) inputs.a.value = s.a;
      if (document.activeElement !== inputs.b) inputs.b.value = s.b;
      setTensButton("b", q(".sx-tens-b"));
      setTensButton("a", q(".sx-tens-a"));
    }
  }

  function tensCut(n) {
    if (n <= 10) return null;
    const tens = Math.floor(n / 10) * 10;
    return tens === n ? n - 10 : tens; // 40 → 30 + 10, 17 → 10 + 7
  }

  function setTensButton(axis, btn) {
    const cut = tensCut(s[axis]);
    btn.classList.toggle("hidden", cut === null);
    if (cut !== null) btn.textContent = `✂️ ${s[axis]} = ${cut} + ${s[axis] - cut}`;
  }

  // ---------- The story ----------

  function partLens(positions, n) {
    const pts = [0, ...positions, n];
    return pts.slice(1).map((p, i) => p - pts[i]);
  }

  // What to say about one piece, with a trick for doing it in your head.
  function pieceText(x, y, product) {
    const base = `${x} × ${y} = ${fmt(product)}.`;
    const tenTrick = (big, other) => {
      if (big === 10) return ` Times 10 is easy: just put a 0 on the end of ${other}!`;
      if (big % 10 === 0) return ` That's ${other} × ${big / 10}, then put a 0 on the end.`;
      return null;
    };
    const t = tenTrick(y, x) || tenTrick(x, y);
    if (t) return base + t;
    if (y <= 4 && x > 4) return `${base} That's just ${Array(y).fill(x).join(" + ")}.`;
    if (x <= 4 && y > 4) return `${base} That's just ${Array(x).fill(y).join(" + ")}.`;
    if (x > 10 && y < 10) return `${base} Tip: ${Math.floor(x / 10) * 10} × ${y} = ${Math.floor(x / 10) * 10 * y}, plus ${x % 10} × ${y} = ${(x % 10) * y}.`;
    if (y > 10 && x < 10) return `${base} Tip: ${x} × ${Math.floor(y / 10) * 10} = ${x * Math.floor(y / 10) * 10}, plus ${x} × ${y % 10} = ${x * (y % 10)}.`;
    return base;
  }

  function buildStory() {
    let ca = cutPositions("a");
    let cb = cutPositions("b");
    if (!ca.length && !cb.length) {
      // Nothing cut yet: use tens and ones on the longer side.
      const axis = tensCut(s.b) !== null ? "b" : tensCut(s.a) !== null ? "a" : s.b >= s.a ? "b" : "a";
      const n = s[axis];
      const cut = tensCut(n) ?? Math.max(1, Math.floor(n / 2));
      if (n > 1) (axis === "a" ? (ca = [cut]) : (cb = [cut]));
    }
    const pa = partLens(ca, s.a);
    const pb = partLens(cb, s.b);
    const products = [];
    pb.forEach((y) => pa.forEach((x) => products.push({ x, y, p: x * y })));
    const total = s.a * s.b;

    const steps = [];
    steps.push({
      text: `${s.a} × ${s.b} is the same as a rectangle ${s.a} squares across and ${s.b} squares down. The answer is how many little squares it has. That's a lot to count!`,
      ca: [], cb: [], gap: 0, labels: 0, sum: false,
    });
    if (cb.length) {
      steps.push({
        text: `Let's make it easier. ${s.b} is the same as ${pb.join(" + ")}, so let's cut the rectangle there. ✂️`,
        ca: [], cb, gap: 3, labels: 0, sum: false,
      });
    }
    if (ca.length) {
      steps.push({
        text: `${s.a} is the same as ${pa.join(" + ")}, so we can cut it that way too. ✂️`,
        ca, cb, gap: 3, labels: 0, sum: false,
      });
    }
    steps.push({
      text: `Now there are ${products.length} smaller rectangles. Cutting didn't add or lose any squares, so together they still make ${s.a} × ${s.b}. Let's pull them apart.`,
      ca, cb, gap: 14, labels: 0, sum: false,
    });
    products.forEach(({ x, y, p }, k) => {
      steps.push({ text: pieceText(x, y, p), ca, cb, gap: 14, labels: k + 1, highlight: k, sum: false });
    });
    steps.push({
      text: `Now push the pieces back together and add them up: ${products.map((r) => fmt(r.p)).join(" + ")} = ${fmt(total)}. So ${s.a} × ${s.b} = ${fmt(total)}! 🎉`,
      ca, cb, gap: 0, labels: Infinity, sum: true,
    });
    return steps;
  }

  function startStory() {
    stopAutoplay();
    s.mode = "story";
    s.steps = buildStory();
    s.step = 0;
    applyStep();
  }

  function applyStep() {
    const step = s.steps[s.step];
    // Story cuts get ids from their position so their ✂️ stays put between steps.
    s.cuts = {
      a: step.ca.map((pos) => ({ id: `a${pos}`, pos })),
      b: step.cb.map((pos) => ({ id: `b${pos}`, pos })),
    };
    s.gap = step.gap;
    s.labels = step.labels;
    s.highlight = step.highlight ?? -1;
    s.sum = step.sum;
    render();
  }

  function toExplore() {
    stopAutoplay();
    s.mode = "explore";
    // Keep the story's cuts, but as normal cuts the player can move.
    s.cuts = { a: cutPositions("a").map(newCut), b: cutPositions("b").map(newCut) };
    s.gap = 8;
    s.labels = Infinity;
    s.highlight = -1;
    s.sum = true;
    render();
  }

  function go(delta) {
    const next = s.step + delta;
    if (next >= s.steps.length) return toExplore();
    if (next < 0) return;
    s.step = next;
    applyStep();
  }

  function stopAutoplay() {
    clearInterval(s.autoplay);
    s.autoplay = null;
  }

  q(".sx-next").addEventListener("click", () => {
    stopAutoplay();
    go(1);
  });
  q(".sx-back").addEventListener("click", () => {
    stopAutoplay();
    go(-1);
  });
  q(".sx-play").addEventListener("click", () => {
    if (s.autoplay) {
      stopAutoplay();
      render();
      return;
    }
    s.autoplay = setInterval(() => {
      if (s.step >= s.steps.length - 2) stopAutoplay();
      go(1);
    }, 3200);
    render();
  });
  q(".sx-watch").addEventListener("click", startStory);

  // ---------- Exploring ----------

  function setNumber(axis, raw) {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 1) return;
    s[axis] = Math.min(MAX, n);
    s.cuts[axis] = s.cuts[axis].filter((c) => c.pos < s[axis]);
    render();
  }

  ["a", "b"].forEach((axis) => {
    inputs[axis].addEventListener("input", () => setNumber(axis, inputs[axis].value));
    inputs[axis].addEventListener("change", () => {
      inputs[axis].value = s[axis];
    });

    q(`.sx-tens-${axis}`).addEventListener("click", () => {
      const cut = tensCut(s[axis]);
      if (cut !== null) s.cuts[axis] = [newCut(cut)];
      render();
    });

    // Tap a ruler to add a cut there.
    rulers[axis].addEventListener("pointerdown", (e) => {
      if (s.mode !== "explore" || e.target.closest(".sx-handle")) return;
      if (s[axis] < 2 || s.cuts[axis].length >= MAX_CUTS) return;
      const k = nearestBoundary(axis, axis === "a" ? e.clientX : e.clientY);
      if (s.cuts[axis].some((c) => c.pos === k)) return;
      s.cuts[axis].push(newCut(k));
      render();
    });
  });

  q(".sx-clear").addEventListener("click", () => {
    s.cuts = { a: [], b: [] };
    render();
  });

  // Drag a ✂️ along its ruler to move the cut; tap it to remove it.
  function dragHandle(e, axis, cut) {
    if (s.mode !== "explore") return;
    e.preventDefault();
    e.stopPropagation();
    const node = e.currentTarget;
    node.setPointerCapture(e.pointerId);
    const start = axis === "a" ? e.clientX : e.clientY;
    let moved = false;
    board.classList.add("dragging");

    const onMove = (ev) => {
      const p = axis === "a" ? ev.clientX : ev.clientY;
      if (!moved && Math.abs(p - start) < 6) return;
      moved = true;
      const k = nearestBoundary(axis, p);
      if (k !== cut.pos && !s.cuts[axis].some((c) => c !== cut && c.pos === k)) {
        cut.pos = k;
        render();
      }
    };
    const onUp = () => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerup", onUp);
      node.removeEventListener("pointercancel", onUp);
      board.classList.remove("dragging");
      if (!moved) s.cuts[axis] = s.cuts[axis].filter((c) => c !== cut);
      render();
    };
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerup", onUp);
    node.addEventListener("pointercancel", onUp);
  }

  // ---------- Start ----------

  const onResize = () => render();
  window.addEventListener("resize", onResize);

  s.cuts.b = [newCut(10), newCut(13)];
  startStory();

  return () => {
    stopAutoplay();
    window.removeEventListener("resize", onResize);
  };
});
