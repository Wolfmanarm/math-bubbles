// "Hop the number line": adding and subtracting positive and negative numbers.
//
// Hopper the frog uses two rules:
//   + (add)       → face the positive way (right)
//   − (subtract)  → turn around (face left)
//   positive number → walk forwards that many hops
//   negative number → walk backwards that many hops
// So 3 − (−4) means: start at 3, turn around, walk backwards 4 → land on 7.
//
// Story mode walks through the four cases; explore mode has sliders; practice
// mode asks the player to drag a flag to where Hopper will land.
Explainers.define("number-line", (root) => {
  "use strict";

  const MINUS = "−";
  const num = (n) => (n < 0 ? `${MINUS}${-n}` : `${n}`);
  const operand = (n) => (n < 0 ? `(${num(n)})` : num(n));
  const eqText = (a, op, b) => `${num(a)} ${op === "+" ? "+" : MINUS} ${operand(b)}`;
  const solve = (a, op, b) => (op === "+" ? a + b : a - b);

  // ---------- DOM ----------

  root.innerHTML = `
    <div class="nl">
      <div class="sx-panel nl-story">
        <p class="sx-story-text"></p>
        <div class="sx-story-nav">
          <button type="button" class="small nl-back">← Back</button>
          <span class="sx-dots" aria-hidden="true"></span>
          <button type="button" class="small nl-replay">↻ Replay</button>
          <button type="button" class="primary nl-next">Next →</button>
        </div>
      </div>

      <div class="sx-panel nl-explore hidden">
        <div class="nl-sliders">
          <label class="nl-slider">Start at <strong class="nl-a-val"></strong>
            <input type="range" class="nl-a" min="-10" max="10" step="1">
          </label>
          <div class="nl-ops" role="group" aria-label="Add or subtract">
            <button type="button" class="nl-op" data-op="+">+</button>
            <button type="button" class="nl-op" data-op="-">${MINUS}</button>
          </div>
          <label class="nl-slider">Number <strong class="nl-b-val"></strong>
            <input type="range" class="nl-b" min="-10" max="10" step="1">
          </label>
        </div>
        <div class="sx-tools">
          <button type="button" class="primary nl-go">🐸 Hop!</button>
          <button type="button" class="small nl-to-practice">🎯 Practice</button>
          <button type="button" class="small nl-watch">▶ Watch the rules again</button>
        </div>
      </div>

      <div class="sx-panel nl-practice hidden">
        <p class="nl-question"></p>
        <p class="sx-help">Drag the 🚩 (or tap the number line) to where Hopper will land, then press Check.</p>
        <div class="sx-tools">
          <button type="button" class="small nl-nudge" data-d="-1" aria-label="Move flag left">◀</button>
          <button type="button" class="small nl-nudge" data-d="1" aria-label="Move flag right">▶</button>
          <button type="button" class="primary nl-check">Check</button>
          <button type="button" class="small nl-new">New question</button>
          <button type="button" class="small nl-to-explore">← Sliders</button>
          <span class="nl-score"></span>
        </div>
      </div>

      <div class="nl-eq" aria-live="polite"></div>

      <div class="nl-rules">
        <div class="nl-rule" data-rule="add"><span class="nl-rule-sym">+</span><span><strong>Add</strong>: face right →</span></div>
        <div class="nl-rule" data-rule="sub"><span class="nl-rule-sym">${MINUS}</span><span><strong>Subtract</strong>: turn around ←</span></div>
        <div class="nl-rule" data-rule="pos"><span class="nl-rule-sym">4</span><span><strong>Positive</strong> number: walk forwards</span></div>
        <div class="nl-rule" data-rule="neg"><span class="nl-rule-sym">${MINUS}4</span><span><strong>Negative</strong> number: walk backwards</span></div>
      </div>

      <div class="nl-stage">
        <div class="nl-track">
          <div class="nl-line"></div>
          <div class="nl-ticks"></div>
          <div class="nl-trail hidden"></div>
          <div class="nl-hops"></div>
          <div class="nl-flag hidden" aria-hidden="true">🚩</div>
          <div class="nl-frog">
            <div class="nl-badge hidden"></div>
            <div class="nl-hop">
              <svg class="nl-body" viewBox="0 0 44 38" width="44" height="38" aria-hidden="true">
                <ellipse cx="22" cy="24" rx="17" ry="12" fill="#5cc96b"/>
                <ellipse cx="11" cy="35" rx="6" ry="2.6" fill="#3fa451"/>
                <ellipse cx="31" cy="35" rx="6" ry="2.6" fill="#3fa451"/>
                <circle cx="30" cy="13" r="7" fill="#5cc96b"/>
                <circle cx="30" cy="13" r="4.2" fill="#fff"/>
                <circle cx="32" cy="13" r="2.2" fill="#2b2d42"/>
                <path d="M 25 27 Q 33 31 38 24" stroke="#2b2d42" stroke-width="1.6" fill="none" stroke-linecap="round"/>
                <circle cx="35" cy="21" r="1.6" fill="#ff8fab"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      <p class="nl-say" aria-live="polite"></p>
    </div>`;

  const q = (sel) => root.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  const track = q(".nl-track");
  const ticks = q(".nl-ticks");
  const frog = q(".nl-frog");
  const hop = q(".nl-hop");
  const badge = q(".nl-badge");
  const trail = q(".nl-trail");
  const hops = q(".nl-hops");
  const flag = q(".nl-flag");
  const say = q(".nl-say");
  const eq = q(".nl-eq");

  // ---------- State ----------

  const s = {
    mode: "story", // "story" | "explore" | "practice"
    step: 0,
    lo: -10,
    hi: 10,
    pos: 0,
    facing: 1, // 1 = right, -1 = left
    // explore
    a: 3,
    op: "-",
    b: -4,
    // practice
    problem: null,
    guess: 0,
    right: 0,
    asked: 0,
  };

  let run = 0; // bumps to cancel a running animation
  let destroyed = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Number line drawing ----------

  function spacing() {
    return track.clientWidth / (s.hi - s.lo + 1);
  }

  function xOf(v) {
    return (v - s.lo + 0.5) * spacing();
  }

  function setRange(values, fixed) {
    if (fixed) {
      [s.lo, s.hi] = fixed;
    } else {
      let lo = Math.min(0, ...values) - 2;
      let hi = Math.max(0, ...values) + 2;
      // Show at least 12 numbers so it always looks like a number line.
      while (hi - lo < 12) {
        lo -= 1;
        if (hi - lo < 12) hi += 1;
      }
      s.lo = lo;
      s.hi = hi;
    }
    drawTicks();
  }

  function drawTicks() {
    ticks.innerHTML = "";
    const gap = spacing();
    const every = gap >= 26 ? 1 : gap * 2 >= 26 ? 2 : 5;
    for (let v = s.lo; v <= s.hi; v++) {
      const t = el("div", "nl-tick" + (v === 0 ? " zero" : v < 0 ? " neg" : " pos"));
      t.style.left = `${xOf(v)}px`;
      if (v % every === 0 || v === 0) t.appendChild(el("span", "nl-num", num(v)));
      else t.classList.add("minor");
      ticks.appendChild(t);
    }
    placeFrog(false);
    if (!flag.classList.contains("hidden")) placeFlag();
  }

  function placeFrog(animate = true) {
    frog.classList.toggle("no-anim", !animate);
    frog.style.left = `${xOf(s.pos)}px`;
    frog.classList.toggle("face-left", s.facing < 0);
    if (!animate) void frog.offsetWidth;
  }

  function placeFlag() {
    flag.style.left = `${xOf(s.guess)}px`;
  }

  function clearTrail() {
    trail.classList.add("hidden");
    hops.innerHTML = "";
  }

  function drawTrail(from, to) {
    trail.classList.remove("hidden");
    const x1 = xOf(from);
    const x2 = xOf(to);
    trail.style.left = `${Math.min(x1, x2)}px`;
    trail.style.width = `${Math.abs(x2 - x1)}px`;
    trail.classList.toggle("right", to > from);
    trail.classList.toggle("left", to < from);
  }

  function setRules(op, b) {
    root.querySelectorAll(".nl-rule").forEach((r) => {
      const rule = r.dataset.rule;
      const on =
        op === null ? false : (rule === "add" && op === "+") || (rule === "sub" && op === "-") || (rule === "pos" && b > 0) || (rule === "neg" && b < 0);
      r.classList.toggle("on", on);
    });
  }

  function showEq(a, op, b, answer) {
    eq.innerHTML = "";
    if (a === null) return;
    eq.append(el("span", "nl-eq-main", `${eqText(a, op, b)} = `));
    eq.appendChild(el("span", answer === null ? "nl-eq-q" : "nl-eq-ans", answer === null ? "?" : num(answer)));
  }

  // ---------- The hop animation ----------

  // Walk Hopper through a − b or a + b, narrating each rule. Resolves to false
  // if something else started in the meantime.
  async function perform(a, op, b, { fixedRange } = {}) {
    const id = ++run;
    const alive = () => id === run && !destroyed;
    const result = solve(a, op, b);
    setRange([a, result], fixedRange);
    s.pos = a;
    s.facing = 1;
    placeFrog(false);
    clearTrail();
    badge.classList.add("hidden");
    setRules(null);
    showEq(a, op, b, null);

    say.textContent = `Start at ${num(a)}, facing right.`;
    frog.classList.add("pulse");
    await sleep(1000);
    frog.classList.remove("pulse");
    if (!alive()) return false;

    setRules(op, 0);
    if (op === "-") {
      say.textContent = `Subtract means turn around! Now Hopper faces left ←.`;
      s.facing = -1;
      frog.classList.add("turning");
      placeFrog();
      await sleep(350);
      frog.classList.remove("turning");
    } else {
      say.textContent = "Add means keep facing right →.";
    }
    await sleep(1000);
    if (!alive()) return false;

    setRules(op, b);
    const steps = Math.abs(b);
    if (b === 0) {
      say.textContent = "0 hops: Hopper stays put!";
    } else if (b > 0) {
      say.textContent = `${b} is positive, so walk forwards ${steps} hop${steps === 1 ? "" : "s"}.`;
      badge.textContent = "forwards";
    } else {
      say.textContent = `${num(b)} is negative, so walk backwards ${steps} hop${steps === 1 ? "" : "s"}!`;
      badge.textContent = "⏪ backwards";
    }
    badge.classList.toggle("hidden", b === 0);
    badge.classList.toggle("back", b < 0);
    await sleep(1100);
    if (!alive()) return false;

    const dir = s.facing * (b < 0 ? -1 : 1);
    for (let i = 1; i <= steps; i++) {
      const from = s.pos;
      s.pos += dir;
      hop.classList.remove("hopping");
      void hop.offsetWidth;
      hop.classList.add("hopping");
      placeFrog();
      drawTrail(a, s.pos);
      const mark = el("span", "nl-hop-num", String(i));
      mark.style.left = `${(xOf(from) + xOf(s.pos)) / 2}px`;
      hops.appendChild(mark);
      await sleep(420);
      if (!alive()) return false;
    }

    badge.classList.add("hidden");
    showEq(a, op, b, result);
    let tail = "";
    if (op === "-" && b < 0) tail = " Turning around and walking backwards means Hopper moved right!";
    else if (op === "+" && b < 0) tail = " Adding a negative moves left, just like subtracting.";
    say.textContent = `Hopper landed on ${num(result)}. So ${eqText(a, op, b)} = ${num(result)}.${tail}`;
    frog.classList.add("pulse");
    await sleep(600);
    frog.classList.remove("pulse");
    return alive();
  }

  // ---------- Story ----------

  function resetToZero() {
    run++;
    setRange([-6, 6]);
    s.pos = 0;
    s.facing = 1;
    placeFrog(false);
    clearTrail();
    badge.classList.add("hidden");
    setRules(null);
    showEq(null);
  }

  const STORY = [
    {
      text: "This is a number line. Numbers to the right of 0 are positive. Numbers to the left are negative. Meet Hopper the frog! 🐸",
      show: () => {
        resetToZero();
        say.textContent = "Hopper is standing on 0.";
      },
    },
    {
      text: "Hopper follows two rules. + means face right, and − means turn around. A positive number means walk forwards, and a negative number means walk backwards.",
      show: () => {
        resetToZero();
        root.querySelectorAll(".nl-rule").forEach((r) => r.classList.add("on"));
        say.textContent = "These four cards are all you need!";
      },
    },
    { text: "3 + 4: start at 3. Adding means face right. 4 is positive, so walk forwards 4 hops.", ex: [3, "+", 4] },
    { text: "3 + (−4): adding means face right… but −4 is negative, so walk backwards 4 hops.", ex: [3, "+", -4] },
    { text: "3 − 4: subtracting means turn around. 4 is positive, so walk forwards 4 hops. Hopper lands in the same place as 3 + (−4)!", ex: [3, "-", 4] },
    { text: "3 − (−4): turn around AND walk backwards. Two flips cancel out, so Hopper ends up moving right! Subtracting a negative is the same as adding.", ex: [3, "-", -4] },
    { text: "One more: −2 − 5. Start at −2, turn around, walk forwards 5 hops.", ex: [-2, "-", 5] },
  ];

  function showStep() {
    const step = STORY[s.step];
    q(".nl-story .sx-story-text").textContent = step.text;
    q(".nl-back").disabled = s.step === 0;
    q(".nl-next").textContent = s.step === STORY.length - 1 ? "Now you try! →" : "Next →";
    q(".nl-replay").classList.toggle("hidden", !step.ex);
    const dots = q(".nl-story .sx-dots");
    dots.innerHTML = "";
    STORY.forEach((_, i) => dots.appendChild(el("span", "sx-dot" + (i === s.step ? " on" : i < s.step ? " done" : ""))));
    if (step.ex) perform(...step.ex);
    else step.show();
  }

  q(".nl-next").addEventListener("click", () => {
    if (s.step === STORY.length - 1) return setMode("explore");
    s.step += 1;
    showStep();
  });
  q(".nl-back").addEventListener("click", () => {
    if (s.step === 0) return;
    s.step -= 1;
    showStep();
  });
  q(".nl-replay").addEventListener("click", showStep);
  q(".nl-watch").addEventListener("click", () => setMode("story"));

  // ---------- Explore (sliders) ----------

  const sliderA = q(".nl-a");
  const sliderB = q(".nl-b");

  function syncExplore() {
    sliderA.value = s.a;
    sliderB.value = s.b;
    q(".nl-a-val").textContent = num(s.a);
    q(".nl-b-val").textContent = num(s.b);
    root.querySelectorAll(".nl-op").forEach((b) => b.classList.toggle("on", b.dataset.op === s.op));
  }

  // Changing a slider puts Hopper back at the start, ready to hop.
  function resetExplore() {
    run++;
    syncExplore();
    setRange([s.a, solve(s.a, s.op, s.b)]);
    s.pos = s.a;
    s.facing = 1;
    placeFrog(false);
    clearTrail();
    badge.classList.add("hidden");
    setRules(s.op, s.b);
    showEq(s.a, s.op, s.b, null);
    say.textContent = "Where will Hopper land? Press Hop! to find out.";
  }

  sliderA.addEventListener("input", () => {
    s.a = Number(sliderA.value);
    resetExplore();
  });
  sliderB.addEventListener("input", () => {
    s.b = Number(sliderB.value);
    resetExplore();
  });
  root.querySelectorAll(".nl-op").forEach((btn) =>
    btn.addEventListener("click", () => {
      s.op = btn.dataset.op;
      resetExplore();
    })
  );
  q(".nl-go").addEventListener("click", () => perform(s.a, s.op, s.b));

  // ---------- Practice ----------

  const PRACTICE_RANGE = [-12, 12];
  const rand = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

  function newProblem() {
    run++;
    let a, op, b;
    do {
      a = rand(-6, 6);
      b = rand(-6, 6);
      op = Math.random() < 0.5 ? "+" : "-";
    } while (b === 0 || (s.problem && a === s.problem.a && b === s.problem.b && op === s.problem.op));
    s.problem = { a, op, b, checked: false };
    setRange([], PRACTICE_RANGE);
    s.pos = a;
    s.facing = 1;
    s.guess = a;
    placeFrog(false);
    clearTrail();
    badge.classList.add("hidden");
    setRules(null);
    flag.classList.remove("hidden");
    placeFlag();
    showEq(a, op, b, null);
    q(".nl-question").textContent = `Hopper starts on ${num(a)}. Where will ${eqText(a, op, b)} land?`;
    say.textContent = "";
    q(".nl-check").disabled = false;
    updateScore();
  }

  function updateScore() {
    q(".nl-score").textContent = s.asked ? `⭐ ${s.right} / ${s.asked}` : "";
  }

  function setGuess(v) {
    if (s.mode !== "practice" || !s.problem || s.problem.checked) return;
    s.guess = Math.max(s.lo, Math.min(s.hi, v));
    placeFlag();
  }

  function nearestValue(clientX) {
    const r = track.getBoundingClientRect();
    return Math.round((clientX - r.left) / spacing() - 0.5 + s.lo);
  }

  track.addEventListener("pointerdown", (e) => {
    if (s.mode !== "practice") return;
    e.preventDefault();
    track.setPointerCapture(e.pointerId);
    setGuess(nearestValue(e.clientX));
    const move = (ev) => setGuess(nearestValue(ev.clientX));
    const up = () => {
      track.removeEventListener("pointermove", move);
      track.removeEventListener("pointerup", up);
      track.removeEventListener("pointercancel", up);
    };
    track.addEventListener("pointermove", move);
    track.addEventListener("pointerup", up);
    track.addEventListener("pointercancel", up);
  });

  root.querySelectorAll(".nl-nudge").forEach((btn) => btn.addEventListener("click", () => setGuess(s.guess + Number(btn.dataset.d))));

  q(".nl-check").addEventListener("click", async () => {
    const p = s.problem;
    if (!p || p.checked) return;
    p.checked = true;
    q(".nl-check").disabled = true;
    s.asked += 1;
    const guess = s.guess;
    const finished = await perform(p.a, p.op, p.b, { fixedRange: PRACTICE_RANGE });
    if (!finished) return;
    const answer = solve(p.a, p.op, p.b);
    if (guess === answer) {
      s.right += 1;
      say.textContent = `✅ Yes! ${eqText(p.a, p.op, p.b)} = ${num(answer)}. You put the flag in the right place!`;
      flag.classList.add("correct");
    } else {
      say.textContent = `Not quite: your flag was on ${num(guess)}, but Hopper landed on ${num(answer)}. Watch the rules and try another!`;
      flag.classList.add("wrong");
    }
    updateScore();
  });

  q(".nl-new").addEventListener("click", () => {
    flag.classList.remove("correct", "wrong");
    newProblem();
  });
  q(".nl-to-practice").addEventListener("click", () => setMode("practice"));
  q(".nl-to-explore").addEventListener("click", () => setMode("explore"));

  // ---------- Modes ----------

  function setMode(mode) {
    s.mode = mode;
    q(".nl-story").classList.toggle("hidden", mode !== "story");
    q(".nl-explore").classList.toggle("hidden", mode !== "explore");
    q(".nl-practice").classList.toggle("hidden", mode !== "practice");
    track.classList.toggle("pickable", mode === "practice");
    flag.classList.add("hidden");
    flag.classList.remove("correct", "wrong");
    if (mode === "story") {
      s.step = 0;
      showStep();
    } else if (mode === "explore") {
      resetExplore();
    } else {
      newProblem();
    }
  }

  const onResize = () => drawTicks();
  window.addEventListener("resize", onResize);
  setMode("story");

  return () => {
    destroyed = true;
    run++;
    window.removeEventListener("resize", onResize);
  };
});
