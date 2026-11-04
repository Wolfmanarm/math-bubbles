// Bubble board: shows B bubbles worth A each and lets the player drag them
// together until one bubble holds A × B. Exposed as window.BubbleGame.
//
// With more than SECTION_SIZE bubbles, the bubbles start in sections of 10.
// Bubbles can only be merged inside their own section. Once every section is
// down to one big bubble, the sections open up and the big bubbles are merged.
(() => {
  "use strict";

  const SECTION_SIZE = 10;
  const SECTION_GAP = 6; // space around each section box, in px
  const SECTION_LABEL = 28; // height of the label strip at the top of a section

  const area = document.getElementById("play-area");
  const problemLabel = document.getElementById("problem-label");
  const progressEl = document.getElementById("progress");
  const timerEl = document.getElementById("timer");
  const historyEl = document.getElementById("history");
  const hintEl = document.getElementById("drag-hint");

  const COLORS = [
    ["#ff8fab", "#ff5d8f"],
    ["#7bdff2", "#3ab0d6"],
    ["#b2f7a1", "#5cc96b"],
    ["#ffd166", "#f4a261"],
    ["#c3a6ff", "#8a63e8"],
    ["#ff9f6b", "#f2664b"],
    ["#80ffdb", "#2ec4b6"],
  ];

  // state: {
  //   a, b, label, baseSize, startedAt, onWin, done,
  //   bubbles: [{ id, value, x, y, size, el, section }],  // section: index or null
  //   sections: [{ index, count, rect, el, labelEl, done }], // empty when b <= 10
  // }
  let state = null;
  let nextId = 1;
  let timerHandle = null;

  function start(a, b, { label, onWin } = {}) {
    stop();
    historyEl.innerHTML = "";
    problemLabel.textContent = `${label ? label + ": " : ""}${a} × ${b} = ?`;

    state = {
      a, b, label, onWin,
      bubbles: [],
      sections: [],
      startedAt: Date.now(),
      done: false,
    };

    // Fill in the text above the board first: it can wrap on small screens,
    // which moves the board down and changes how much room it has.
    const boxCount = b > SECTION_SIZE ? Math.ceil(b / SECTION_SIZE) : 0;
    hintEl.textContent = boxCount
      ? "Add up the bubbles inside each box first. When every box has one big bubble, add the big bubbles together!"
      : "Drag one bubble onto another to add them together.";
    progressEl.textContent = boxCount ? `${boxCount} boxes left to finish` : `${b} bubbles left`;
    timerEl.textContent = formatTime(0);
    fitArea();

    const areaRect = area.getBoundingClientRect();
    if (boxCount) {
      const count = boxCount;
      const rects = sectionRects(count, areaRect.width, areaRect.height);
      for (let i = 0; i < count; i++) {
        const n = Math.min(SECTION_SIZE, b - i * SECTION_SIZE);
        state.sections.push(makeSection(i, n, rects[i]));
      }
      // One bubble size for every section, small enough for the tightest one.
      state.baseSize = Math.min(
        ...state.sections.map((s) => baseSizeFor(innerRect(s.rect), s.count))
      );
      state.sections.forEach((s) => {
        placeBubbles(innerRect(s.rect), s.count, s.index);
        updateSection(s);
      });
    } else {
      const full = { x: 0, y: 0, w: areaRect.width, h: areaRect.height };
      state.baseSize = baseSizeFor(full, b);
      placeBubbles(full, b, null);
    }

    timerHandle = setInterval(updateTimer, 250);
    updateTimer();
    updateProgress();
    checkSectionsDone();
    checkWin();
  }

  function stop() {
    clearInterval(timerHandle);
    timerHandle = null;
    state = null;
    area.innerHTML = "";
  }

  function formatTime(ms) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function updateTimer() {
    if (!state) return;
    timerEl.textContent = formatTime(Date.now() - state.startedAt);
  }

  // Size the play area so all of it fits on screen at once. Touches inside it
  // move bubbles instead of scrolling the page, so nothing may hide below.
  function fitArea() {
    const top = area.getBoundingClientRect().top + window.scrollY;
    const available = window.innerHeight - top - 12;
    area.style.height = `${Math.round(Math.max(300, Math.min(620, available)))}px`;
    area.style.minHeight = "0";
  }

  // ---------- Sections ----------

  // Split the play area into a grid of `count` boxes, choosing the number of
  // columns that keeps the boxes as square (and therefore as roomy) as possible.
  function sectionRects(count, width, height) {
    let best = null;
    for (let cols = 1; cols <= count; cols++) {
      const rows = Math.ceil(count / cols);
      const w = width / cols;
      const h = height / rows;
      const score = Math.min(w, h);
      if (!best || score > best.score) best = { cols, w, h, score };
    }
    return Array.from({ length: count }, (_, i) => ({
      x: (i % best.cols) * best.w + SECTION_GAP,
      y: Math.floor(i / best.cols) * best.h + SECTION_GAP,
      w: best.w - SECTION_GAP * 2,
      h: best.h - SECTION_GAP * 2,
    }));
  }

  // The part of a section box that bubbles can move in (below the label).
  function innerRect(rect) {
    return { x: rect.x, y: rect.y + SECTION_LABEL, w: rect.w, h: Math.max(10, rect.h - SECTION_LABEL) };
  }

  function makeSection(index, count, rect) {
    const el = document.createElement("div");
    el.className = "section";
    const labelEl = document.createElement("div");
    labelEl.className = "section-label";
    el.appendChild(labelEl);
    area.appendChild(el);
    const section = { index, count, rect, el, labelEl, done: false };
    positionSection(section);
    return section;
  }

  function positionSection(section) {
    const s = section.el.style;
    s.left = `${section.rect.x}px`;
    s.top = `${section.rect.y}px`;
    s.width = `${section.rect.w}px`;
    s.height = `${section.rect.h}px`;
  }

  function updateSection(section) {
    const inside = state.bubbles.filter((b) => b.section === section.index);
    section.done = inside.length === 1;
    section.el.classList.toggle("done", section.done);
    section.labelEl.textContent = section.done
      ? `✓ ${section.count} × ${state.a} = ${inside[0].value}`
      : `Box ${section.index + 1}: ${inside.length} bubbles`;
  }

  function checkSectionsDone() {
    if (!state.sections.length || !state.sections.every((s) => s.done)) return;

    // Every box is down to one big bubble: open the boxes up.
    const sections = state.sections;
    state.sections = [];
    state.bubbles.forEach((b) => (b.section = null));
    sections.forEach((s) => {
      s.el.classList.add("opening");
      setTimeout(() => s.el.remove(), 600);
    });
    state.bubbles.forEach(styleBubble);
    hintEl.textContent = "Every box is done! Now add the big bubbles together.";

    if (state.bubbles.length > 1) {
      const rect = area.getBoundingClientRect();
      showFloatText("Now add the big bubbles!", rect.width / 2, rect.height / 2, "big");
    }
    updateProgress();
  }

  // ---------- Bubbles ----------

  function baseSizeFor(rect, count) {
    return Math.max(40, Math.min(96, Math.sqrt((rect.w * rect.h) / (count * 2.6))));
  }

  // Where a bubble is allowed to be: its section, or the whole play area.
  function boundsFor(bubble) {
    if (bubble.section !== null) {
      const section = state.sections.find((s) => s.index === bubble.section);
      if (section) return innerRect(section.rect);
    }
    const rect = area.getBoundingClientRect();
    return { x: 0, y: 0, w: rect.width, h: rect.height };
  }

  function placeBubbles(rect, count, section) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(count * (rect.w / rect.h))));
    const rows = Math.ceil(count / cols);
    const cellW = rect.w / cols;
    const cellH = rect.h / rows;
    const delayStart = state.bubbles.length;

    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const jitterX = (Math.random() - 0.5) * Math.max(0, cellW - state.baseSize) * 0.6;
      const jitterY = (Math.random() - 0.5) * Math.max(0, cellH - state.baseSize) * 0.6;
      addBubble(
        state.a,
        rect.x + cellW * (col + 0.5) + jitterX,
        rect.y + cellH * (row + 0.5) + jitterY,
        section,
        (delayStart + i) * 30
      );
    }
  }

  function sizeFor(bubble) {
    const bounds = boundsFor(bubble);
    const maxSize = bubble.section !== null
      ? Math.min(bounds.w, bounds.h) * 0.9
      : Math.min(bounds.w, bounds.h) * 0.42;
    const scaled = state.baseSize * Math.sqrt(bubble.value / state.a);
    return Math.max(Math.min(state.baseSize, maxSize), Math.min(maxSize, scaled));
  }

  function colorFor(value) {
    const idx = Math.abs(Math.round(value / state.a) - 1) % COLORS.length;
    return COLORS[idx];
  }

  function addBubble(value, x, y, section, delay = 0, extraClass = "") {
    const el = document.createElement("div");
    el.className = "bubble" + (extraClass ? " " + extraClass : "");
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `Bubble worth ${value}`);
    el.textContent = value;
    if (delay) el.style.animationDelay = `${delay}ms`;

    const bubble = { id: nextId++, value, x, y, section, el };
    state.bubbles.push(bubble);
    styleBubble(bubble);
    area.appendChild(el);

    el.addEventListener("pointerdown", (e) => startDrag(e, bubble));
    return bubble;
  }

  function styleBubble(bubble) {
    const size = sizeFor(bubble);
    bubble.size = size;
    clampBubble(bubble);
    const [light, dark] = colorFor(bubble.value);
    const s = bubble.el.style;
    s.width = s.height = `${size}px`;
    s.left = `${bubble.x - size / 2}px`;
    s.top = `${bubble.y - size / 2}px`;
    s.background = `radial-gradient(circle at 35% 30%, ${light}, ${dark})`;
    const digits = String(bubble.value).length;
    s.fontSize = `${Math.max(13, Math.min(size * 0.42, (size * 0.9) / (digits * 0.62)))}px`;
  }

  function clampBubble(bubble) {
    const b = boundsFor(bubble);
    const r = bubble.size / 2;
    bubble.x = Math.min(Math.max(b.x + r, bubble.x), Math.max(b.x + r, b.x + b.w - r));
    bubble.y = Math.min(Math.max(b.y + r, bubble.y), Math.max(b.y + r, b.y + b.h - r));
  }

  function moveBubble(bubble) {
    clampBubble(bubble);
    bubble.el.style.left = `${bubble.x - bubble.size / 2}px`;
    bubble.el.style.top = `${bubble.y - bubble.size / 2}px`;
  }

  // ---------- Dragging ----------

  function startDrag(e, bubble) {
    if (!state || state.done || state.bubbles.length <= 1) return;
    e.preventDefault();

    const el = bubble.el;
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
    el.style.animationDelay = "";

    const areaRect = area.getBoundingClientRect();
    const offsetX = e.clientX - areaRect.left - bubble.x;
    const offsetY = e.clientY - areaRect.top - bubble.y;
    let target = null;

    const onMove = (ev) => {
      if (!state) return;
      const r = area.getBoundingClientRect();
      bubble.x = ev.clientX - r.left - offsetX;
      bubble.y = ev.clientY - r.top - offsetY;
      moveBubble(bubble);

      const found = findTarget(bubble);
      if (found !== target) {
        if (target) target.el.classList.remove("target");
        target = found;
        if (target) target.el.classList.add("target");
      }
    };

    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.classList.remove("dragging");
      if (target && state) {
        target.el.classList.remove("target");
        mergeBubbles(bubble, target);
      }
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  }

  function findTarget(dragged) {
    let best = null;
    let bestDist = Infinity;
    for (const other of state.bubbles) {
      if (other === dragged || other.section !== dragged.section) continue;
      const dist = Math.hypot(other.x - dragged.x, other.y - dragged.y);
      const reach = ((other.size + dragged.size) / 2) * 0.75;
      if (dist < reach && dist < bestDist) {
        best = other;
        bestDist = dist;
      }
    }
    return best;
  }

  function mergeBubbles(dragged, target) {
    const sum = dragged.value + target.value;
    const { x, y, section } = target;

    state.bubbles = state.bubbles.filter((b) => b !== dragged && b !== target);
    dragged.el.remove();
    target.el.remove();

    const isFinal = state.bubbles.length === 0;
    const merged = addBubble(sum, x, y, section, 0, isFinal ? "merged final" : "merged");
    if (isFinal) merged.el.setAttribute("aria-label", `Final answer ${sum}`);

    const equation = `${dragged.value} + ${target.value} = ${sum}`;
    showFloatText(equation, merged.x, merged.y - merged.size / 2 - 10);

    const li = document.createElement("li");
    li.textContent = equation;
    historyEl.appendChild(li);

    if (section !== null) {
      const s = state.sections.find((sec) => sec.index === section);
      if (s) updateSection(s);
      checkSectionsDone();
    }
    updateProgress();
    checkWin();
  }

  function showFloatText(text, x, y, extraClass = "") {
    const el = document.createElement("div");
    el.className = "float-text" + (extraClass ? " " + extraClass : "");
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${Math.max(20, y)}px`;
    area.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
    setTimeout(() => el.remove(), 2500);
  }

  // ---------- Progress & win ----------

  function updateProgress() {
    const n = state.bubbles.length;
    if (state.sections.length) {
      const left = state.sections.filter((s) => !s.done).length;
      progressEl.textContent = `${left} box${left === 1 ? "" : "es"} left to finish`;
    } else {
      progressEl.textContent =
        n === 1 ? "One bubble left — that's your answer!" : `${n} bubbles left`;
    }
  }

  function checkWin() {
    if (!state || state.done || state.sections.length || state.bubbles.length !== 1) return;
    state.done = true;
    clearInterval(timerHandle);
    const timeMs = Date.now() - state.startedAt;
    updateTimer();
    const total = state.bubbles[0].value;
    problemLabel.textContent = `${state.label ? state.label + ": " : ""}${state.a} × ${state.b} = ${total}`;
    const { a, b, onWin } = state;
    const current = state;
    setTimeout(() => {
      if (state !== current) return; // player quit in the meantime
      if (onWin) onWin({ a, b, total, timeMs });
    }, 700);
  }

  function launchConfetti() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["#ff5d8f", "#3ab0d6", "#5cc96b", "#ffd166", "#8a63e8", "#f2664b"];
    for (let i = 0; i < 80; i++) {
      const c = document.createElement("div");
      c.className = "confetti";
      c.style.left = `${Math.random() * 100}vw`;
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = `${2 + Math.random() * 2}s`;
      c.style.animationDelay = `${Math.random() * 0.6}s`;
      document.body.appendChild(c);
      c.addEventListener("animationend", () => c.remove());
    }
  }

  // Keep sections and bubbles inside the play area when the window is resized.
  window.addEventListener("resize", () => {
    if (!state || state.kind === "zeros") return;
    fitArea();
    if (state.sections.length) {
      const rect = area.getBoundingClientRect();
      const rects = sectionRects(state.sections.length, rect.width, rect.height);
      state.sections.forEach((s, i) => {
        s.rect = rects[i];
        positionSection(s);
      });
    }
    state.bubbles.forEach(styleBubble);
  });

  // ---------- Zeros levels (×10, ×100 … ×1,000,000) ----------
  //
  // The player sees, e.g., 48 × 1,000 and a pool of 0 bubbles. They drag (or
  // tap) zeros onto the end of 48, then press Check. The right answer is the
  // number with as many zeros on the end as the multiplier has.

  const ZERO_POOL = 7;

  function startZeros(a, b, { label, onWin } = {}) {
    stop();
    historyEl.innerHTML = "";
    const needed = String(b).length - 1;
    problemLabel.textContent = `${label ? label + ": " : ""}${a} × ${formatNumber(b)} = ?`;
    hintEl.textContent = `Drag 0 bubbles onto the end of ${a} (or tap them), then press Check!`;
    progressEl.textContent = "Add the zeros";
    timerEl.textContent = formatTime(0);
    fitArea();

    state = { kind: "zeros", a, b, label, needed, onWin, startedAt: Date.now(), done: false, tries: 0 };

    const board = el("div", "zeros-board");

    const problem = el("div", "zeros-problem");
    problem.append(el("span", "zp-a", String(a)), el("span", "zp-op", "×"));
    const multiplier = el("span", "zp-b");
    formatNumber(b).split("").forEach((ch, i) => {
      multiplier.appendChild(el("span", ch === "0" ? "zp-zero" : ch === "," ? "zp-comma" : "zp-digit", ch));
    });
    problem.appendChild(multiplier);

    const answer = el("div", "zeros-answer");
    answer.setAttribute("aria-label", "Your answer");
    String(a).split("").forEach((d) => answer.appendChild(el("span", "digit-tile", d)));
    const slot = el("span", "drop-slot", "+0");
    slot.setAttribute("aria-hidden", "true");
    answer.appendChild(slot);

    const pool = el("div", "zeros-pool");
    for (let i = 0; i < ZERO_POOL; i++) {
      const z = el("button", "zero-bubble", "0");
      z.type = "button";
      z.setAttribute("aria-label", "Zero bubble: add to the end of the number");
      z.addEventListener("pointerdown", (e) => dragZero(e, z));
      z.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleZero(z);
        }
      });
      pool.appendChild(z);
    }

    const check = el("button", "primary zeros-check", "Check");
    check.type = "button";
    check.addEventListener("click", checkZeros);

    const msg = el("p", "zeros-msg");
    msg.setAttribute("role", "status");

    board.append(problem, answer, pool, check, msg);
    area.appendChild(board);
    Object.assign(state, { board, problem, answer, slot, pool, msg });
    sizeTiles();

    timerHandle = setInterval(updateTimer, 250);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatNumber(n) {
    return n.toLocaleString("en-US");
  }

  function attachedZeros() {
    return state.answer.querySelectorAll(".zero-bubble").length;
  }

  // Shrink the digit tiles when the answer gets long so it stays on one line.
  function sizeTiles() {
    const count = String(state.a).length + attachedZeros() + 1;
    const width = state.answer.clientWidth || area.clientWidth;
    const gap = 4;
    const size = Math.max(24, Math.min(56, (width - 22 - gap * (count - 1)) / count));
    state.answer.style.setProperty("--tile", `${size}px`);
  }

  function toggleZero(z) {
    if (!state || state.kind !== "zeros" || state.done) return;
    if (z.parentElement === state.answer) {
      state.pool.appendChild(z);
      z.setAttribute("aria-label", "Zero bubble: add to the end of the number");
    } else {
      state.answer.insertBefore(z, state.slot);
      z.setAttribute("aria-label", "Zero on the end: tap to take it off");
    }
    z.classList.remove("wrong");
    state.answer.classList.remove("shake");
    state.msg.textContent = "";
    state.msg.className = "zeros-msg";
    progressEl.textContent = `${attachedZeros()} zero${attachedZeros() === 1 ? "" : "s"} on the end`;
    sizeTiles();
  }

  function dragZero(e, z) {
    if (!state || state.kind !== "zeros" || state.done) return;
    e.preventDefault();
    z.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > 8) {
        moved = true;
        z.classList.add("dragging");
      }
      if (moved) z.style.transform = `translate(${dx}px, ${dy}px) scale(1.1)`;
      if (moved) state.answer.classList.toggle("over", overAnswer(ev));
    };

    const onUp = (ev) => {
      z.removeEventListener("pointermove", onMove);
      z.removeEventListener("pointerup", onUp);
      z.removeEventListener("pointercancel", onUp);
      z.classList.remove("dragging");
      z.style.transform = "";
      if (!state || state.kind !== "zeros") return;
      state.answer.classList.remove("over");
      const inAnswer = z.parentElement === state.answer;
      if (!moved) {
        toggleZero(z); // a tap adds or removes the zero
      } else if (!inAnswer && overAnswer(ev)) {
        toggleZero(z); // dropped onto the number
      } else if (inAnswer && !overAnswer(ev)) {
        toggleZero(z); // dragged off the number
      }
    };

    z.addEventListener("pointermove", onMove);
    z.addEventListener("pointerup", onUp);
    z.addEventListener("pointercancel", onUp);
  }

  function overAnswer(ev) {
    const r = state.answer.getBoundingClientRect();
    const pad = 30;
    return ev.clientX > r.left - pad && ev.clientX < r.right + pad && ev.clientY > r.top - pad && ev.clientY < r.bottom + pad;
  }

  function checkZeros() {
    if (!state || state.kind !== "zeros" || state.done) return;
    const have = attachedZeros();
    const { a, b, needed } = state;
    if (have === needed) {
      state.done = true;
      clearInterval(timerHandle);
      const timeMs = Date.now() - state.startedAt;
      updateTimer();
      const total = a * b;
      state.answer.classList.add("correct");
      state.problem.classList.add("solved");
      state.msg.className = "zeros-msg good";
      state.msg.textContent = `${a} × ${formatNumber(b)} = ${formatNumber(total)}`;
      problemLabel.textContent = `${state.label ? state.label + ": " : ""}${a} × ${formatNumber(b)} = ${formatNumber(total)}`;
      progressEl.textContent = "Correct!";
      const current = state;
      setTimeout(() => {
        if (state === current && current.onWin) current.onWin({ a, b, total, timeMs });
      }, 1100);
      return;
    }

    state.tries += 1;
    state.answer.classList.remove("shake");
    void state.answer.offsetWidth; // restart the shake animation
    state.answer.classList.add("shake");
    state.msg.className = "zeros-msg bad";
    const word = have < needed ? "Not enough zeros" : "Too many zeros";
    if (state.tries >= 2) {
      // Second miss: point at the zeros in the multiplier.
      state.problem.classList.add("show-zeros");
      state.msg.textContent = `${word}! Look: ${formatNumber(b)} has ${needed} zero${needed === 1 ? "" : "s"}.`;
    } else {
      state.msg.textContent = `${word}! Count the zeros in ${formatNumber(b)} and try again.`;
    }
  }

  window.BubbleGame = { start, startZeros, stop, formatTime, formatNumber, launchConfetti };
})();
