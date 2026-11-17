// "Count the zeros": exponent rules with powers of ten.
//
// 10ⁿ is a 1 followed by n zeros, so:
//   multiplying adds the zeros:       10² × 10³ = 10²⁺³ = 10⁵
//   a power of a power repeats them:  (10²)³ = 10² × 10² × 10² = 10⁶
//   dividing takes zeros away:        10⁵ ÷ 10² = 10⁵⁻² = 10³
//   …but adding does NOT:             10² + 10² = 100 + 100 = 200
//
// Each power is drawn as tiles: a 1 and coloured 0s. The zeros fly together
// (or cancel out) so the player can see where every zero in the answer came
// from.
Explainers.define("powers-of-ten", (root) => {
  "use strict";

  const MAX_ZEROS = 12;
  const MAX_EXP = 6;
  const COLORS = ["#ff5d8f", "#3ab0d6", "#f4a261", "#8a63e8"];
  const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
  const sup = (n) => String(n).split("").map((d) => SUP[d]).join("");
  const fmt = (n) => n.toLocaleString("en-US");
  const pow10 = (e) => 10 ** e;

  // A problem: { op: "mul" | "div" | "add", exps: [..], power?: { e, times } }
  // A power (10ᵉ)ᵗ is a multiplication of `times` copies of 10ᵉ.
  const P = {
    mul: (...exps) => ({ op: "mul", exps }),
    div: (a, b) => ({ op: "div", exps: [a, b] }),
    add: (a, b) => ({ op: "add", exps: [a, b] }),
    pow: (e, times) => ({ op: "mul", exps: Array(times).fill(e), power: { e, times } }),
  };

  const PRESETS = [
    P.mul(2, 2), P.mul(2, 3), P.mul(1, 4), P.mul(3, 3), P.mul(1, 2, 3), P.mul(0, 3),
    P.pow(2, 3), P.pow(3, 2), P.div(5, 2), P.div(6, 3), P.div(4, 4), P.add(2, 2), P.add(2, 3),
  ];

  // Text version, e.g. "10² × 10³" or "(10²)³".
  function exprText(p) {
    if (p.power) return `(10${sup(p.power.e)})${sup(p.power.times)}`;
    const sign = { mul: " × ", div: " ÷ ", add: " + " }[p.op];
    return p.exps.map((e) => `10${sup(e)}`).join(sign);
  }

  function answerExp(p) {
    if (p.op === "mul") return p.exps.reduce((s, e) => s + e, 0);
    if (p.op === "div") return p.exps[0] - p.exps[1];
    return null;
  }

  function answerValue(p) {
    if (p.op === "add") return p.exps.reduce((s, e) => s + pow10(e), 0);
    return pow10(answerExp(p));
  }

  // ---------- DOM ----------

  root.innerHTML = `
    <div class="pz">
      <div class="sx-panel pz-story">
        <p class="sx-story-text"></p>
        <div class="sx-story-nav">
          <button type="button" class="small pz-back">← Back</button>
          <span class="sx-dots" aria-hidden="true"></span>
          <button type="button" class="small pz-replay">↻ Replay</button>
          <button type="button" class="primary pz-next">Next →</button>
        </div>
      </div>

      <div class="sx-panel pz-explore hidden">
        <div class="pz-ops" role="group" aria-label="Choose an operation">
          <button type="button" class="pz-op" data-op="mul">×</button>
          <button type="button" class="pz-op" data-op="div">÷</button>
          <button type="button" class="pz-op" data-op="pow">( )ⁿ</button>
          <button type="button" class="pz-op" data-op="add">+</button>
        </div>
        <div class="pz-editor"></div>
        <div class="pz-presets"></div>
        <div class="sx-tools">
          <button type="button" class="primary pz-go">▶ Show me</button>
          <button type="button" class="small pz-watch">▶ Watch the story again</button>
        </div>
      </div>

      <div class="pz-eq" aria-live="polite"></div>
      <div class="pz-board"></div>
      <p class="pz-say" aria-live="polite"></p>
    </div>`;

  const q = (sel) => root.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  const board = q(".pz-board");
  const eqEl = q(".pz-eq");
  const say = q(".pz-say");

  let run = 0;
  let destroyed = false;
  const flying = new Set();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 10 with a superscript, as elements.
  function powEl(e, color) {
    const span = el("span", "pz-pow");
    span.append("10");
    const s = el("sup", null, String(e));
    if (color) s.style.color = color;
    span.appendChild(s);
    return span;
  }

  function exprEl(p) {
    const wrap = el("span", "pz-expr");
    if (p.power) {
      wrap.append("(", powEl(p.power.e, COLORS[0]), ")");
      wrap.appendChild(el("sup", "pz-outer", String(p.power.times)));
      return wrap;
    }
    const sign = { mul: "×", div: "÷", add: "+" }[p.op];
    p.exps.forEach((e, i) => {
      if (i) wrap.appendChild(el("span", "pz-sign", sign));
      wrap.appendChild(powEl(e, COLORS[i % COLORS.length]));
    });
    return wrap;
  }

  // ---------- Tiles ----------

  function tile(digit, color) {
    const t = el("span", "pz-tile" + (digit === "0" && color ? " zero" : ""), digit);
    if (digit === "0" && color) t.style.backgroundColor = color;
    return t;
  }

  // One row: "10² = [1][0][0]"
  function powerRow(e, color, label) {
    const row = el("div", "pz-row");
    const lab = el("span", "pz-row-label");
    lab.appendChild(label || powEl(e, color));
    lab.append(" =");
    row.appendChild(lab);
    const tiles = el("span", "pz-tiles");
    tiles.appendChild(tile("1"));
    for (let i = 0; i < e; i++) tiles.appendChild(tile("0", color));
    row.appendChild(tiles);
    row.appendChild(el("span", "pz-row-note", e === 0 ? "no zeros!" : `${e} zero${e === 1 ? "" : "s"}`));
    return row;
  }

  // Size the tiles so the longest row fits in the tile column.
  function sizeTiles(longest) {
    const probe = board.querySelector(".pz-tiles");
    const width = probe ? probe.clientWidth : (board.clientWidth || 600) - 150;
    const n = Math.max(4, longest);
    let gap = 4;
    let size = (width - gap * (n - 1)) / n;
    if (size < 24) {
      gap = 2;
      size = (width - gap * (n - 1)) / n;
    }
    size = Math.max(12, Math.min(42, size));
    board.style.setProperty("--tile", `${size}px`);
    board.style.setProperty("--tgap", `${gap}px`);
  }

  // ---------- Showing a problem ----------

  function setEq(p, final) {
    eqEl.innerHTML = "";
    eqEl.appendChild(exprEl(p));
    eqEl.appendChild(el("span", "pz-sign", "="));
    if (!final) {
      eqEl.appendChild(el("span", "pz-q", "?"));
      return;
    }
    if (p.op === "add") {
      eqEl.appendChild(el("span", "pz-step", p.exps.map((e) => fmt(pow10(e))).join(" + ")));
      eqEl.appendChild(el("span", "pz-sign", "="));
      eqEl.appendChild(el("span", "pz-ans", fmt(answerValue(p))));
      return;
    }
    // 10^(2+3) or 10^(5−2)
    const working = el("span", "pz-pow");
    working.append("10");
    const parts = p.power ? `${p.power.e}×${p.power.times}` : p.exps.join(p.op === "mul" ? "+" : "−");
    working.appendChild(el("sup", null, parts));
    const n = answerExp(p);
    eqEl.append(working, el("span", "pz-sign", "="), powEl(n), el("span", "pz-sign", "="), el("span", "pz-ans", fmt(pow10(n))));
  }

  // Draw the starting picture: one row per power, and an empty answer row.
  function layout(p) {
    board.innerHTML = "";
    board.classList.toggle("adding", p.op === "add");
    board.classList.remove("aligned");

    const rows = p.exps.map((e, i) => {
      const color = p.power ? COLORS[0] : COLORS[i % COLORS.length];
      const row = powerRow(e, color);
      if (i > 0) row.insertBefore(el("span", "pz-row-sign", { mul: "×", div: "÷", add: "+" }[p.op]), row.firstChild);
      else row.insertBefore(el("span", "pz-row-sign", ""), row.firstChild);
      board.appendChild(row);
      return row;
    });

    board.appendChild(el("div", "pz-rule"));
    const answer = el("div", "pz-row pz-answer");
    answer.appendChild(el("span", "pz-row-sign", "="));
    const lab = el("span", "pz-row-label", "");
    answer.appendChild(lab);
    const tiles = el("span", "pz-tiles");
    tiles.appendChild(el("span", "pz-q small", "?"));
    answer.appendChild(tiles);
    answer.appendChild(el("span", "pz-row-note", ""));
    board.appendChild(answer);
    const longest = Math.max(
      1 + Math.max(...p.exps),
      p.op === "add" ? String(answerValue(p)).length : 1 + Math.max(0, answerExp(p) ?? 0),
      1 + (p.op === "div" ? p.exps[0] : 0)
    );
    sizeTiles(longest);
    return { rows, answer };
  }

  function stop() {
    run++;
    flying.forEach((c) => c.remove());
    flying.clear();
  }

  // Fly copies of `from` tiles onto `to` tiles, then show the real `to` tiles.
  async function fly(pairs, alive, ms = 600) {
    const stagger = 90;
    const clones = pairs.map(({ from, to }, i) => {
      const fr = from.getBoundingClientRect();
      const tr = to.getBoundingClientRect();
      const c = from.cloneNode(true);
      c.classList.add("pz-flying");
      // The copy lives on <body>, outside the board, so give it the tile size.
      c.style.setProperty("--tile", `${fr.width}px`);
      Object.assign(c.style, {
        left: `${fr.left}px`,
        top: `${fr.top}px`,
        width: `${fr.width}px`,
        height: `${fr.height}px`,
        transition: `transform ${ms}ms cubic-bezier(.5,0,.3,1) ${i * stagger}ms`,
      });
      document.body.appendChild(c);
      flying.add(c);
      return { c, to, dx: tr.left - fr.left, dy: tr.top - fr.top, scale: tr.width / fr.width };
    });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    clones.forEach(({ c, dx, dy, scale }) => (c.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`));
    await sleep(ms + pairs.length * stagger + 40);
    clones.forEach(({ c, to }) => {
      c.remove();
      flying.delete(c);
      if (alive()) to.classList.remove("waiting");
    });
  }

  async function show(p, { intro } = {}) {
    stop();
    const id = run;
    const alive = () => id === run && !destroyed;
    setEq(p, false);
    const { rows, answer } = layout(p);
    const answerTiles = answer.querySelector(".pz-tiles");
    const answerNote = answer.querySelector(".pz-row-note");

    // 1. What each power means.
    say.textContent = intro || (p.power
      ? `${exprText(p)} means ${p.exps.map((e) => `10${sup(e)}`).join(" × ")}. Each 10${sup(p.power.e)} is a 1 with ${p.power.e} zero${p.power.e === 1 ? "" : "s"}.`
      : `Each power of ten is a 1 followed by zeros. The little number tells you how many.`);
    await sleep(1600);
    if (!alive()) return;

    if (p.op === "add") return showAdding(p, rows, answer, alive);

    // 2. Count the zeros, numbering them as we go.
    say.textContent = p.op === "div" ? "Count the zeros on top, and the zeros we're dividing by…" : "Count all the zeros…";
    let count = 0;
    for (const [ri, row] of rows.entries()) {
      if (p.op === "div" && ri === 1) count = 0;
      for (const z of row.querySelectorAll(".pz-tile.zero")) {
        count += 1;
        z.appendChild(el("span", "pz-count", String(count)));
        await sleep(220);
        if (!alive()) return;
      }
      row.classList.add("counted");
    }
    const n = answerExp(p);
    say.textContent = p.op === "mul"
      ? p.power
        ? `${p.power.times} lots of ${p.power.e} zeros: ${p.exps.join(" + ")} = ${p.power.e} × ${p.power.times} = ${n} zeros.`
        : `${p.exps.join(" + ")} = ${n} zeros altogether.`
      : `${p.exps[0]} zeros on top, ${p.exps[1]} to take away.`;
    await sleep(1500);
    if (!alive()) return;

    // 3. Build the answer.
    answerTiles.innerHTML = "";
    const one = tile("1");
    answerTiles.appendChild(one);

    if (p.op === "mul") {
      say.textContent = `Put all ${n} zeros after a single 1…`;
      const pairs = [];
      rows.forEach((row, ri) => {
        row.querySelectorAll(".pz-tile.zero").forEach((z) => {
          const t = tile("0", p.power ? COLORS[0] : COLORS[ri % COLORS.length]);
          t.classList.add("waiting");
          answerTiles.appendChild(t);
          pairs.push({ from: z, to: t });
        });
      });
      await fly(pairs, alive);
      if (!alive()) return;
      rows.forEach((row) => row.classList.add("used"));
      answer.querySelector(".pz-row-label").appendChild(powEl(n));
      answerNote.textContent = `${n} zero${n === 1 ? "" : "s"}`;
      setEq(p, true);
      say.textContent = p.power
        ? `${exprText(p)} = 10${sup(n)} = ${fmt(pow10(n))}. For a power of a power, multiply the little numbers: ${p.power.e} × ${p.power.times} = ${n}.`
        : `${exprText(p)} = 10${sup(n)} = ${fmt(pow10(n))}. When you multiply powers of ten, just add the little numbers!`;
      answer.classList.add("done");
      return;
    }

    // Division: copy the top zeros down, then each zero below cancels one.
    const [top, bottom] = p.exps;
    say.textContent = `Start with the ${top} zeros from 10${sup(top)}…`;
    const topTiles = [];
    const pairs = [];
    rows[0].querySelectorAll(".pz-tile.zero").forEach((z) => {
      const t = tile("0", COLORS[0]);
      t.classList.add("waiting");
      answerTiles.appendChild(t);
      topTiles.push(t);
      pairs.push({ from: z, to: t });
    });
    await fly(pairs, alive);
    if (!alive()) return;
    say.textContent = `Dividing by 10${sup(bottom)} takes away ${bottom} zero${bottom === 1 ? "" : "s"}. Each one cancels a zero on top…`;
    await sleep(900);
    if (!alive()) return;
    const victims = topTiles.slice(topTiles.length - bottom);
    const bottomZeros = [...rows[1].querySelectorAll(".pz-tile.zero")];
    const cancelPairs = bottomZeros.map((z, i) => ({ from: z, to: victims[victims.length - 1 - i] }));
    await fly(cancelPairs, alive, 500);
    if (!alive()) return;
    victims.forEach((v) => v.classList.add("poof"));
    await sleep(650);
    if (!alive()) return;
    victims.forEach((v) => v.remove());
    rows.forEach((row) => row.classList.add("used"));
    answer.querySelector(".pz-row-label").appendChild(powEl(n));
    answerNote.textContent = n === 0 ? "no zeros left!" : `${n} zero${n === 1 ? "" : "s"} left`;
    setEq(p, true);
    say.textContent = n === 0
      ? `${exprText(p)} = 10⁰ = 1. All the zeros cancelled out: anything divided by itself is 1!`
      : `${exprText(p)} = 10${sup(n)} = ${fmt(pow10(n))}. When you divide powers of ten, subtract the little numbers: ${top} − ${bottom} = ${n}.`;
    answer.classList.add("done");
  }

  async function showAdding(p, rows, answer, alive) {
    say.textContent = "Careful! This is adding, not multiplying. Line the numbers up by place value…";
    board.classList.add("aligned");
    await sleep(1600);
    if (!alive()) return;
    const total = answerValue(p);
    const tiles = answer.querySelector(".pz-tiles");
    tiles.innerHTML = "";
    String(total).split("").forEach((d, i) => {
      const t = tile(d);
      t.classList.add("plain");
      t.style.animationDelay = `${i * 80}ms`;
      tiles.appendChild(t);
    });
    answer.querySelector(".pz-row-note").textContent = "";
    setEq(p, true);
    const mul = p.exps.reduce((s, e) => s + e, 0);
    say.textContent = `${p.exps.map((e) => fmt(pow10(e))).join(" + ")} = ${fmt(total)}. The zeros don't join up when you add! (Multiplying would give 10${sup(mul)} = ${fmt(pow10(mul))}.) Counting zeros is the trick for multiplying, not adding.`;
    answer.classList.add("done", "warn");
  }

  // The opening picture: what the little number means.
  function showMeaning() {
    stop();
    eqEl.innerHTML = "";
    eqEl.appendChild(el("span", "pz-step", "10ⁿ = 1 followed by n zeros"));
    board.innerHTML = "";
    board.classList.remove("adding", "aligned");
    [1, 2, 3, 6].forEach((e, i) => {
      const row = powerRow(e, COLORS[i % COLORS.length]);
      row.insertBefore(el("span", "pz-row-sign", ""), row.firstChild);
      row.querySelector(".pz-row-note").textContent = `${fmt(pow10(e))}`;
      board.appendChild(row);
    });
    sizeTiles(7);
    say.textContent = "10¹ = 10, 10² = 10 × 10 = 100, 10³ = 1,000 … The little number counts the zeros!";
  }

  // ---------- Story ----------

  const STORY = [
    { text: "Powers of ten are easy to spot: 10² means 10 × 10 = 100. The little number (the exponent) tells you how many zeros come after the 1.", meaning: true },
    { text: "What is 10² × 10²? That's 100 × 100. Instead of doing the multiplication, count the zeros: 2 + 2 = 4. So the answer is 1 with 4 zeros.", p: P.mul(2, 2) },
    { text: "It works for any powers of ten. 10² × 10³: 2 zeros and 3 zeros make 5 zeros. 10² × 10³ = 10⁵.", p: P.mul(2, 3) },
    { text: "Even three at once! 10¹ × 10² × 10³: 1 + 2 + 3 = 6 zeros.", p: P.mul(1, 2, 3) },
    { text: "A power of a power, like (10²)³, means 10² three times: 10² × 10² × 10². That's 2 + 2 + 2 = 6 zeros, which is the same as 2 × 3.", p: P.pow(2, 3) },
    { text: "Dividing takes zeros away. 10⁵ ÷ 10²: 5 zeros, take away 2, leaves 3. So 10⁵ ÷ 10² = 10³.", p: P.div(5, 2) },
    { text: "Careful! Adding is different. 10² + 10² is 100 + 100 = 200. The zeros don't join up, so the counting trick only works for multiplying and dividing.", p: P.add(2, 2) },
  ];

  const s = { mode: "story", step: 0, problem: P.mul(2, 3), editOp: "mul" };

  function showStep() {
    const step = STORY[s.step];
    q(".pz-story .sx-story-text").textContent = step.text;
    q(".pz-back").disabled = s.step === 0;
    q(".pz-next").textContent = s.step === STORY.length - 1 ? "Now you try! →" : "Next →";
    q(".pz-replay").classList.toggle("hidden", !!step.meaning);
    const dots = q(".pz-story .sx-dots");
    dots.innerHTML = "";
    STORY.forEach((_, i) => dots.appendChild(el("span", "sx-dot" + (i === s.step ? " on" : i < s.step ? " done" : ""))));
    if (step.meaning) showMeaning();
    else show(step.p);
  }

  q(".pz-next").addEventListener("click", () => {
    if (s.step === STORY.length - 1) return setMode("explore");
    s.step += 1;
    showStep();
  });
  q(".pz-back").addEventListener("click", () => {
    if (s.step === 0) return;
    s.step -= 1;
    showStep();
  });
  q(".pz-replay").addEventListener("click", showStep);
  q(".pz-watch").addEventListener("click", () => setMode("story"));

  // ---------- Explore ----------

  function totalZeros(p) {
    return p.op === "add" ? Math.max(...p.exps) : p.exps.reduce((a, b) => a + b, 0);
  }

  // Keep a problem within what fits on screen and makes sense.
  function normalise(p) {
    p.exps = p.exps.map((e) => Math.max(0, Math.min(MAX_EXP, e)));
    if (p.power) {
      p.power.times = Math.max(2, Math.min(4, p.power.times));
      while (p.power.e * p.power.times > MAX_ZEROS) p.power.e -= 1;
      p.exps = Array(p.power.times).fill(p.power.e);
    }
    if (p.op === "div" && p.exps[1] > p.exps[0]) p.exps[1] = p.exps[0];
    while (p.op === "mul" && !p.power && totalZeros(p) > MAX_ZEROS) {
      const i = p.exps.indexOf(Math.max(...p.exps));
      p.exps[i] -= 1;
    }
    return p;
  }

  function stepper(label, value, onChange, { min, max, color, removable, onRemove }) {
    const box = el("span", "pz-stepper");
    if (label) box.appendChild(label);
    const minus = el("button", "small", "−");
    minus.type = "button";
    minus.disabled = value <= min;
    minus.setAttribute("aria-label", "Smaller");
    minus.addEventListener("click", () => onChange(value - 1));
    const plus = el("button", "small", "+");
    plus.type = "button";
    plus.disabled = value >= max;
    plus.setAttribute("aria-label", "Bigger");
    plus.addEventListener("click", () => onChange(value + 1));
    const val = el("span", "pz-step-val", String(value));
    if (color) val.style.color = color;
    box.append(minus, val, plus);
    if (removable) {
      const x = el("button", "small pz-remove", "✕");
      x.type = "button";
      x.setAttribute("aria-label", "Remove this power");
      x.addEventListener("click", onRemove);
      box.appendChild(x);
    }
    return box;
  }

  function drawEditor() {
    const p = s.problem;
    const ed = q(".pz-editor");
    ed.innerHTML = "";
    root.querySelectorAll(".pz-op").forEach((b) => b.classList.toggle("on", b.dataset.op === (p.power ? "pow" : p.op)));

    const update = (fn) => {
      fn();
      normalise(p);
      drawEditor();
      showStatic();
    };

    if (p.power) {
      ed.append("(10");
      ed.appendChild(stepper(el("span", "pz-step-label", "power"), p.power.e, (v) => update(() => (p.power.e = v)), { min: 0, max: MAX_EXP, color: COLORS[0] }));
      ed.append(")");
      ed.appendChild(stepper(el("span", "pz-step-label", "times"), p.power.times, (v) => update(() => (p.power.times = v)), { min: 2, max: 4 }));
      return;
    }

    const sign = { mul: "×", div: "÷", add: "+" }[p.op];
    p.exps.forEach((e, i) => {
      if (i) ed.appendChild(el("span", "pz-sign", sign));
      const label = el("span", "pz-step-label", "10^");
      const used = totalZeros(p) - e;
      const max = p.op === "mul" ? Math.min(MAX_EXP, MAX_ZEROS - used) : p.op === "div" && i === 1 ? p.exps[0] : MAX_EXP;
      ed.appendChild(stepper(label, e, (v) => update(() => (p.exps[i] = v)), {
        min: 0,
        max,
        color: COLORS[i % COLORS.length],
        removable: p.op === "mul" && p.exps.length > 2,
        onRemove: () => update(() => p.exps.splice(i, 1)),
      }));
    });
    if (p.op === "mul" && p.exps.length < 4 && totalZeros(p) < MAX_ZEROS) {
      const more = el("button", "small pz-more", "+ another power");
      more.type = "button";
      more.addEventListener("click", () => update(() => p.exps.push(1)));
      ed.appendChild(more);
    }
  }

  function showStatic() {
    stop();
    setEq(s.problem, false);
    layout(s.problem);
    say.textContent = "Press ▶ Show me to count the zeros.";
  }

  root.querySelectorAll(".pz-op").forEach((btn) =>
    btn.addEventListener("click", () => {
      const op = btn.dataset.op;
      const [a, b] = s.problem.exps;
      if (op === "pow") s.problem = P.pow(Math.min(a ?? 2, 3), 3);
      else if (op === "div") s.problem = P.div(Math.max(a ?? 2, b ?? 1), Math.min(a ?? 2, b ?? 1));
      else s.problem = { op, exps: [a ?? 2, b ?? 2] };
      normalise(s.problem);
      drawEditor();
      showStatic();
    })
  );

  PRESETS.forEach((p) => {
    const chip = el("button", "small sx-preset", exprText(p));
    chip.type = "button";
    chip.addEventListener("click", () => {
      s.problem = JSON.parse(JSON.stringify(p));
      drawEditor();
      show(s.problem);
    });
    q(".pz-presets").appendChild(chip);
  });

  q(".pz-go").addEventListener("click", () => show(s.problem));

  // ---------- Modes ----------

  function setMode(mode) {
    s.mode = mode;
    q(".pz-story").classList.toggle("hidden", mode !== "story");
    q(".pz-explore").classList.toggle("hidden", mode !== "explore");
    if (mode === "story") {
      s.step = 0;
      showStep();
    } else {
      drawEditor();
      showStatic();
    }
  }

  setMode("story");

  return () => {
    destroyed = true;
    stop();
  };
});
