// Bubble board: shows B bubbles worth A each and lets the player drag them
// together until one bubble holds A × B. Exposed as window.BubbleGame.
(() => {
  "use strict";

  const area = document.getElementById("play-area");
  const problemLabel = document.getElementById("problem-label");
  const progressEl = document.getElementById("progress");
  const timerEl = document.getElementById("timer");
  const historyEl = document.getElementById("history");

  const COLORS = [
    ["#ff8fab", "#ff5d8f"],
    ["#7bdff2", "#3ab0d6"],
    ["#b2f7a1", "#5cc96b"],
    ["#ffd166", "#f4a261"],
    ["#c3a6ff", "#8a63e8"],
    ["#ff9f6b", "#f2664b"],
    ["#80ffdb", "#2ec4b6"],
  ];

  // { a, b, bubbles: [{ id, value, x, y, size, el }], baseSize, startedAt, onWin, done }
  let state = null;
  let nextId = 1;
  let timerHandle = null;

  function start(a, b, { label, onWin } = {}) {
    stop();
    area.innerHTML = "";
    historyEl.innerHTML = "";
    problemLabel.textContent = `${label ? label + ": " : ""}${a} × ${b} = ?`;

    const rect = area.getBoundingClientRect();
    const baseSize = Math.max(
      44,
      Math.min(96, Math.sqrt((rect.width * rect.height) / (b * 2.6)))
    );

    state = { a, b, label, bubbles: [], baseSize, startedAt: Date.now(), onWin, done: false };

    // Lay bubbles out on a loose grid with some jitter so they don't overlap.
    const cols = Math.max(1, Math.ceil(Math.sqrt(b * (rect.width / rect.height))));
    const rows = Math.ceil(b / cols);
    const cellW = rect.width / cols;
    const cellH = rect.height / rows;

    for (let i = 0; i < b; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const jitterX = (Math.random() - 0.5) * Math.max(0, cellW - baseSize) * 0.6;
      const jitterY = (Math.random() - 0.5) * Math.max(0, cellH - baseSize) * 0.6;
      addBubble(a, cellW * (col + 0.5) + jitterX, cellH * (row + 0.5) + jitterY, i * 30);
    }

    timerHandle = setInterval(updateTimer, 250);
    updateTimer();
    updateProgress();
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

  // ---------- Bubbles ----------

  function sizeFor(value) {
    const rect = area.getBoundingClientRect();
    const maxSize = Math.min(rect.width, rect.height) * 0.42;
    const scaled = state.baseSize * Math.sqrt(value / state.a);
    return Math.min(maxSize, Math.max(state.baseSize, scaled));
  }

  function colorFor(value) {
    const idx = Math.abs(Math.round(value / state.a) - 1) % COLORS.length;
    return COLORS[idx];
  }

  function addBubble(value, x, y, delay = 0, extraClass = "") {
    const el = document.createElement("div");
    el.className = "bubble" + (extraClass ? " " + extraClass : "");
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `Bubble worth ${value}`);
    el.textContent = value;
    if (delay) el.style.animationDelay = `${delay}ms`;

    const bubble = { id: nextId++, value, x, y, el };
    styleBubble(bubble);
    area.appendChild(el);
    state.bubbles.push(bubble);

    el.addEventListener("pointerdown", (e) => startDrag(e, bubble));
    return bubble;
  }

  function styleBubble(bubble) {
    const size = sizeFor(bubble.value);
    bubble.size = size;
    clampBubble(bubble);
    const [light, dark] = colorFor(bubble.value);
    const s = bubble.el.style;
    s.width = s.height = `${size}px`;
    s.left = `${bubble.x - size / 2}px`;
    s.top = `${bubble.y - size / 2}px`;
    s.background = `radial-gradient(circle at 35% 30%, ${light}, ${dark})`;
    const digits = String(bubble.value).length;
    s.fontSize = `${Math.max(14, Math.min(size * 0.42, (size * 0.9) / (digits * 0.62)))}px`;
  }

  function clampBubble(bubble) {
    const rect = area.getBoundingClientRect();
    const r = bubble.size / 2;
    bubble.x = Math.min(Math.max(r, bubble.x), Math.max(r, rect.width - r));
    bubble.y = Math.min(Math.max(r, bubble.y), Math.max(r, rect.height - r));
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
      if (other === dragged) continue;
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
    const { x, y } = target;

    state.bubbles = state.bubbles.filter((b) => b !== dragged && b !== target);
    dragged.el.remove();
    target.el.remove();

    const isFinal = state.bubbles.length === 0;
    const merged = addBubble(sum, x, y, 0, isFinal ? "merged final" : "merged");
    if (isFinal) merged.el.setAttribute("aria-label", `Final answer ${sum}`);

    const equation = `${dragged.value} + ${target.value} = ${sum}`;
    showFloatText(equation, merged.x, merged.y - merged.size / 2 - 10);

    const li = document.createElement("li");
    li.textContent = equation;
    historyEl.appendChild(li);

    updateProgress();
    checkWin();
  }

  function showFloatText(text, x, y) {
    const el = document.createElement("div");
    el.className = "float-text";
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${Math.max(20, y)}px`;
    area.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
    setTimeout(() => el.remove(), 2000);
  }

  // ---------- Progress & win ----------

  function updateProgress() {
    const n = state.bubbles.length;
    progressEl.textContent =
      n === 1 ? "One bubble left — that's your answer!" : `${n} bubbles left`;
  }

  function checkWin() {
    if (!state || state.done || state.bubbles.length !== 1) return;
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

  // Keep bubbles inside the play area when the window is resized.
  window.addEventListener("resize", () => {
    if (!state) return;
    state.bubbles.forEach(styleBubble);
  });

  window.BubbleGame = { start, stop, formatTime, launchConfetti };
})();
