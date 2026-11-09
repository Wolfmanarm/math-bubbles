// Screens, sign-in, daily challenges and the admin scores page.
(() => {
  "use strict";

  const Game = window.BubbleGame;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => Game.formatNumber(n);

  let me = null; // { name, isAdmin, progress: { [challengeId]: { highest, best, finishedAt } } }
  let challenges = []; // newest first, only ones dated today or earlier
  let current = null; // { kind: "free", a, b } | { kind: "challenge", challenge, index }

  // ---------- API ----------

  async function api(path, body) {
    const res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || "Something went wrong. Please try again.");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function loadChallenges() {
    const { challenges: all } = await api("/api/challenges");
    const today = localDate();
    challenges = all.filter((c) => c.date <= today);
  }

  // ---------- Dates ----------

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function localDate(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function parseDate(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  // "Today", "Yesterday" or e.g. "Mon, Nov 3".
  function dayLabel(dateStr) {
    if (dateStr === localDate()) return "Today";
    const y = new Date();
    y.setDate(y.getDate() - 1);
    if (dateStr === localDate(y)) return "Yesterday";
    return parseDate(dateStr).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  function longDate(dateStr) {
    return parseDate(dateStr).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function shortDay(ts) {
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // ---------- Progress helpers ----------

  function progressFor(challenge, user = me) {
    return (user.progress && user.progress[challenge.id]) || { highest: 0, best: {}, finishedAt: null };
  }

  function isFinished(challenge, user = me) {
    return !!progressFor(challenge, user).finishedAt;
  }

  function levelLabel(level) {
    return `${level.a} × ${fmt(level.b)}`;
  }

  function totalTime(best) {
    return Object.values(best || {}).reduce((s, t) => s + t, 0);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ---------- Views ----------

  function show(view) {
    document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
    $(`view-${view}`).classList.remove("hidden");
    $("win").classList.add("hidden");
    document.querySelectorAll(".confetti").forEach((c) => c.remove());
    if (view !== "game") Game.stop();
    if (view !== "explainer") unmountExplainer();
    window.scrollTo(0, 0);
  }

  function setUser(user) {
    me = user;
    $("user-bar").classList.toggle("hidden", !me);
    if (me) $("user-name").textContent = me.name;
  }

  async function goHome() {
    if (!me) return show("auth");
    if (me.isAdmin) return showAdmin();
    try {
      await loadChallenges();
    } catch (err) {
      if (err.status === 401) {
        setUser(null);
        return show("auth");
      }
    }
    renderHome();
    show("home");
  }

  document.querySelectorAll("[data-back]").forEach((btn) => btn.addEventListener("click", goHome));
  $("menu-btn").addEventListener("click", goHome);
  $("quit-btn").addEventListener("click", () => {
    if (current && current.kind === "challenge") openChallenge(current.challenge);
    else goHome();
  });

  // ---------- Sign in ----------

  let authAction = "login";
  $("auth-form").querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => (authAction = btn.dataset.action));
  });

  $("auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("auth-error").textContent = "";
    const name = $("auth-name").value.trim();
    const password = $("auth-pass").value;
    try {
      const user = await api(authAction === "register" ? "/api/register" : "/api/login", { name, password });
      $("auth-pass").value = "";
      setUser(user);
      goHome();
    } catch (err) {
      $("auth-error").textContent = err.message;
    }
  });

  $("logout-btn").addEventListener("click", async () => {
    try { await api("/api/logout", {}); } catch { /* signed out either way */ }
    setUser(null);
    show("auth");
    $("auth-name").focus();
  });

  // ---------- Home ----------

  function renderHome() {
    const today = localDate();
    const todays = challenges.filter((c) => c.date === today);
    const featured = todays[0] || challenges[0];

    // Big card for today's challenge (or the newest one if none is out today).
    const box = $("today");
    box.innerHTML = "";
    if (featured) {
      const p = progressFor(featured);
      const total = featured.levels.length;
      const done = isFinished(featured);
      const card = el("div", "today-card" + (done ? " finished" : ""));

      const tag = el("div", "today-tag");
      tag.textContent = featured.date === today
        ? `⭐ Today's challenge · ${longDate(featured.date)}`
        : `Newest challenge · ${longDate(featured.date)} — a new one is coming soon!`;
      card.appendChild(tag);

      const main = el("div", "today-main");
      main.appendChild(el("span", "today-emoji", featured.emoji));
      const text = el("div");
      text.append(el("h2", "today-title", featured.title), el("p", "today-desc", featured.description));
      main.appendChild(text);
      card.appendChild(main);

      card.appendChild(progressRow(p.highest, total, done));

      const btn = el("button", "primary today-btn",
        done ? "✓ Finished! Play again" : p.highest === 0 ? "Start today's challenge →" : `Keep going: level ${p.highest + 1} →`);
      btn.type = "button";
      btn.addEventListener("click", () => openChallenge(featured));
      card.appendChild(btn);
      box.appendChild(card);
    } else {
      box.appendChild(el("div", "today-card empty", "No challenges yet — check back soon!"));
    }

    renderExplainers($("explainer-list"));

    // Every challenge, newest first.
    const list = $("challenge-list");
    list.innerHTML = "";
    for (const c of challenges) {
      const p = progressFor(c);
      const total = c.levels.length;
      const done = isFinished(c);
      const item = el("button", "challenge-item" + (done ? " finished" : ""));
      item.type = "button";
      item.appendChild(el("span", "ci-emoji", c.emoji));
      const body = el("span", "ci-body");
      body.append(
        el("span", "ci-date", dayLabel(c.date)),
        el("span", "ci-title", c.title),
        el("span", "ci-sub", done ? `Finished on ${shortDay(p.finishedAt)}` : `${p.highest} of ${total} levels done`)
      );
      item.appendChild(body);
      let pill;
      if (done) pill = el("span", "ci-pill done", "✓ Finished");
      else if (c.date === today && p.highest === 0) pill = el("span", "ci-pill new", "New!");
      else if (p.highest > 0) pill = el("span", "ci-pill", `${p.highest}/${total}`);
      else pill = el("span", "ci-pill", "Start");
      item.appendChild(pill);
      item.setAttribute("aria-label", `${c.title}, ${dayLabel(c.date)}, ${done ? "finished" : `${p.highest} of ${total} levels done`}`);
      item.addEventListener("click", () => openChallenge(c));
      list.appendChild(item);
    }
  }

  function progressRow(doneCount, total, finished) {
    const row = el("div", "progress-row");
    const bar = el("div", "bar");
    const fill = el("div", "bar-fill");
    fill.style.width = `${Math.round((doneCount / total) * 100)}%`;
    bar.appendChild(fill);
    row.append(bar, el("span", "bar-text", finished ? `✓ All ${total} levels done` : `${doneCount} / ${total} levels`));
    return row;
  }

  // ---------- Explainers ("Learn") ----------

  let explainerCleanup = null;

  function explainerButton(ex, className) {
    const item = el("button", className);
    item.type = "button";
    item.appendChild(el("span", "ci-emoji", ex.emoji));
    const body = el("span", "ci-body");
    body.append(el("span", "ci-title", ex.title), el("span", "ci-sub", ex.description));
    item.appendChild(body);
    item.appendChild(el("span", "ci-go", "Watch ▶"));
    item.addEventListener("click", () => openExplainer(ex));
    return item;
  }

  function renderExplainers(container) {
    container.innerHTML = "";
    window.Explainers.list.forEach((ex) => container.appendChild(explainerButton(ex, "challenge-item explainer-item")));
  }

  function unmountExplainer() {
    if (explainerCleanup) explainerCleanup();
    explainerCleanup = null;
    $("explainer-root").innerHTML = "";
  }

  async function openExplainer(ex) {
    show("explainer");
    $("ex-emoji").textContent = ex.emoji;
    $("ex-title").textContent = ex.title;
    const root = $("explainer-root");
    root.innerHTML = "";
    root.appendChild(el("p", "hint", "Loading…"));
    try {
      const mount = await window.Explainers.load(ex.id);
      if ($("view-explainer").classList.contains("hidden")) return; // left while loading
      root.innerHTML = "";
      explainerCleanup = mount(root) || null;
    } catch (err) {
      root.innerHTML = "";
      root.appendChild(el("p", "error", err.message));
    }
  }

  $("menu-free").addEventListener("click", () => {
    show("setup");
    $("num-a").focus();
  });

  // ---------- Free play ----------

  $("problem-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const a = parseInt($("num-a").value, 10);
    const b = parseInt($("num-b").value, 10);
    const err = $("error");
    if (!Number.isInteger(a) || !Number.isInteger(b)) {
      err.textContent = "Please type two whole numbers.";
    } else if (a < 1 || a > 9999) {
      err.textContent = "The first number should be between 1 and 9999.";
    } else if (b < 1 || b > 40) {
      err.textContent = "The second number should be between 1 and 40.";
    } else {
      err.textContent = "";
      current = { kind: "free", a, b };
      play();
    }
  });

  // ---------- A challenge: lesson + levels ----------

  function openChallenge(c) {
    const p = progressFor(c);
    const done = isFinished(c);
    $("ch-emoji").textContent = c.emoji;
    $("ch-title").textContent = c.title;
    $("ch-date").textContent = c.date === localDate() ? "⭐ Today's challenge" : longDate(c.date);
    $("ch-desc").textContent = c.description;

    const banner = $("ch-finished");
    banner.classList.toggle("hidden", !done);
    if (done) {
      banner.textContent = `✓ Challenge finished on ${shortDay(p.finishedAt)}! You can replay any level to beat your best time.`;
    }

    // The lesson is open until the first level is beaten, then tucked away.
    const intro = $("ch-intro");
    intro.innerHTML = "";
    intro.classList.toggle("hidden", !c.intro.length);
    if (c.intro.length) {
      const details = el("details");
      details.open = p.highest === 0;
      details.appendChild(el("summary", null, "📖 How it works"));
      c.intro.forEach((para) => details.appendChild(el("p", null, para)));
      intro.appendChild(details);
    }

    const grid = $("level-grid");
    grid.innerHTML = "";
    c.levels.forEach((level, i) => {
      const btn = el("button", "level");
      btn.type = "button";
      const best = p.best[i];
      const locked = i > p.highest;
      if (i < p.highest) btn.classList.add("beaten");
      else if (i === p.highest) btn.classList.add("next");
      else btn.classList.add("locked");
      btn.disabled = locked;
      const label = levelLabel(level);
      btn.append(
        el("span", "level-index", `Level ${i + 1}`),
        el("span", "level-num" + (label.length > 9 ? " long" : ""), label),
        el("span", "level-sub", best !== undefined ? "⭐ " + Game.formatTime(best) : locked ? "🔒" : "Play!")
      );
      btn.setAttribute("aria-label", `Level ${i + 1}: ${level.a} times ${level.b}${locked ? ", locked" : ""}`);
      btn.addEventListener("click", () => {
        current = { kind: "challenge", challenge: c, index: i };
        play();
      });
      grid.appendChild(btn);
    });
    show("challenge");
  }

  // ---------- Playing ----------

  function play() {
    show("game");
    if (current.kind === "free") {
      Game.start(current.a, current.b, { onWin: onWin });
      return;
    }
    const { challenge, index } = current;
    const level = challenge.levels[index];
    const opts = { label: `Level ${index + 1}`, onWin };
    if (level.type === "train") Game.startTrain(level.a, level.b, { ...opts, helper: level.helper });
    else Game.start(level.a, level.b, opts);
  }

  function trainTip(level) {
    const { a, b } = level;
    const z = String(b).length - 1;
    const zeros = `${z} zero${z === 1 ? "" : "s"}`;
    if (level.helper) {
      return `${fmt(b)} is a 1 with ${zeros}. You moved the ${zeros} onto ${a} and got ${fmt(a * b)}. The 1 stayed behind, because × 1 doesn't change anything!`;
    }
    return `${fmt(b)} has ${zeros}, so ${a} × ${fmt(b)} is just ${a} with ${zeros} on the end: ${fmt(a * b)}!`;
  }

  async function onWin({ a, b, total, timeMs }) {
    const game = current;
    const isChallenge = game.kind === "challenge";
    const level = isChallenge ? game.challenge.levels[game.index] : null;
    const isLast = isChallenge && game.index === game.challenge.levels.length - 1;

    $("win-title").textContent = isChallenge ? `Level ${game.index + 1} beaten! 🎉` : "You did it! 🎉";
    $("win-equation").textContent = `${a} × ${fmt(b)} = ${fmt(total)}`;
    const tip = level ? level.tip || (level.type === "train" ? trainTip(level) : "") : "";
    $("win-tip").textContent = tip;
    $("win-tip").classList.toggle("hidden", !tip);
    $("win-time").textContent = `Time: ${Game.formatTime(timeMs)}`;
    $("next-btn").classList.toggle("hidden", !isChallenge || isLast);
    $("again-btn").textContent = isChallenge ? "Try again" : "Play again";
    $("win").classList.remove("hidden");
    Game.launchConfetti();

    try {
      if (isChallenge) {
        const prevBest = progressFor(game.challenge).best[game.index];
        const res = await api("/api/progress", { challengeId: game.challenge.id, level: game.index, timeMs });
        setUser(res);
        if (prevBest !== undefined && timeMs < prevBest) $("win-time").textContent += " — new best time!";
        if (res.justFinished) {
          $("win-title").textContent = "Challenge finished! 🏆";
          $("win-time").textContent += ` · You finished “${game.challenge.title}”!`;
          Game.launchConfetti();
        }
      } else {
        setUser(await api("/api/score", { a, b, timeMs }));
      }
    } catch (err) {
      $("win-time").textContent += ` (Couldn't save your score: ${err.message})`;
      if (err.status === 401) setUser(null);
    }
  }

  $("again-btn").addEventListener("click", () => {
    if (!current) return goHome();
    if (current.kind === "free") {
      show("setup");
      $("num-a").focus();
    } else {
      play();
    }
  });

  $("next-btn").addEventListener("click", () => {
    current = { ...current, index: current.index + 1 };
    play();
  });

  // ---------- Admin ----------

  async function showAdmin() {
    show("admin");
    const tbody = $("admin-table").querySelector("tbody");
    tbody.innerHTML = "";
    $("admin-summary").textContent = "Loading…";
    try {
      const { users, challenges: all } = await api("/api/admin/users");
      const today = localDate();
      const visible = all.filter((c) => c.date <= today);
      const todays = visible.find((c) => c.date === today) || visible[0];
      $("admin-today-col").textContent = todays
        ? `${todays.date === today ? "Today" : "Newest"}: ${todays.emoji} ${todays.title}`
        : "Today's challenge";

      const finishedCount = (u) => visible.filter((c) => isFinished(c, u)).length;
      const levelsDone = (u) => visible.reduce((s, c) => s + progressFor(c, u).highest, 0);
      users.sort((x, y) => finishedCount(y) - finishedCount(x) || levelsDone(y) - levelsDone(x) || x.name.localeCompare(y.name));

      $("admin-empty").classList.toggle("hidden", users.length > 0);
      $("admin-table").classList.toggle("hidden", users.length === 0);
      const todayDone = todays ? users.filter((u) => isFinished(todays, u)).length : 0;
      $("admin-summary").textContent =
        `${users.length} player${users.length === 1 ? "" : "s"} · ${visible.length} challenge${visible.length === 1 ? "" : "s"} published` +
        (todays ? ` · ${todayDone} finished ${todays.date === today ? "today's" : "the newest"} challenge` : "") +
        ". Click a player to see every challenge.";

      for (const u of users) {
        const row = el("tr", "player-row");
        row.tabIndex = 0;
        row.appendChild(el("td", "name", u.name));

        const finishedCell = el("td");
        const fin = finishedCount(u);
        finishedCell.appendChild(el("strong", null, `${fin} / ${visible.length}`));
        const emojis = visible.filter((c) => isFinished(c, u)).map((c) => c.emoji).join(" ");
        if (emojis) finishedCell.appendChild(el("span", "muted", ` ${emojis}`));
        row.appendChild(finishedCell);

        const todayCell = el("td");
        if (todays) {
          const p = progressFor(todays, u);
          if (isFinished(todays, u)) todayCell.appendChild(el("span", "ci-pill done", "✓ Finished"));
          else todayCell.appendChild(progressRow(p.highest, todays.levels.length, false));
        }
        row.appendChild(todayCell);

        const gamesCell = el("td", null, String(u.gamesPlayed));
        gamesCell.appendChild(el("span", "muted", ` (${u.freeGames} free play)`));
        row.appendChild(gamesCell);
        row.appendChild(el("td", null, u.gamesPlayed ? formatDate(u.lastSeen) : "Never"));

        const detail = el("tr", "detail-row hidden");
        const cell = el("td");
        cell.colSpan = 5;
        cell.appendChild(renderDetail(u, visible, all));
        detail.appendChild(cell);

        const toggle = () => detail.classList.toggle("hidden");
        row.addEventListener("click", toggle);
        row.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        });
        tbody.append(row, detail);
      }
    } catch (err) {
      $("admin-summary").textContent = err.message;
    }
  }

  function renderDetail(u, visible, all) {
    const wrap = el("div", "detail");

    const table = el("div", "detail-challenges");
    for (const c of visible) {
      const p = progressFor(c, u);
      const line = el("div", "detail-challenge");
      line.appendChild(el("span", "dc-title", `${c.emoji} ${c.title}`));
      line.appendChild(el("span", "dc-date muted", dayLabel(c.date)));
      if (isFinished(c, u)) {
        line.appendChild(el("span", "ci-pill done", `✓ Finished ${shortDay(p.finishedAt)}`));
      } else {
        line.appendChild(el("span", "ci-pill", `${p.highest} / ${c.levels.length} levels`));
      }
      line.appendChild(el("span", "muted", p.highest ? `best times total ${Game.formatTime(totalTime(p.best))}` : "not started"));
      table.appendChild(line);
    }
    wrap.appendChild(table);

    const recent = el("div", "detail-recent");
    recent.appendChild(el("strong", null, "Recent games: "));
    if (!u.recentGames.length) recent.appendChild(document.createTextNode("none yet"));
    for (const g of u.recentGames) {
      let text;
      if (g.mode === "challenge") {
        const c = all.find((x) => x.id === g.challengeId);
        text = `${c ? c.emoji : "🏆"} Level ${g.level + 1}: ${g.a}×${fmt(g.b)}`;
      } else {
        text = `🫧 ${g.a}×${g.b}`;
      }
      recent.appendChild(el("span", "chip", `${text} in ${Game.formatTime(g.timeMs)} · ${formatDate(g.at)}`));
      recent.appendChild(document.createTextNode(" "));
    }
    wrap.appendChild(recent);
    return wrap;
  }

  $("admin-refresh").addEventListener("click", showAdmin);
  renderExplainers($("admin-explainers"));

  // ---------- Start ----------

  (async () => {
    try {
      setUser(await api("/api/me"));
    } catch {
      setUser(null);
    }
    await goHome();
    if (!me) $("auth-name").focus();
  })();
})();
