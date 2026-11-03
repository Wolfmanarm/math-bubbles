// Screens, sign-in, challenge mode and the admin scores page.
(() => {
  "use strict";

  const CHALLENGE_LEVELS = 30;
  const Game = window.BubbleGame;
  const $ = (id) => document.getElementById(id);

  let me = null; // { name, isAdmin, challenge: { highest, best } }
  let current = null; // { mode: "free" | "challenge", a, b }

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

  // ---------- Views ----------

  function show(view) {
    document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
    $(`view-${view}`).classList.remove("hidden");
    $("win").classList.add("hidden");
    document.querySelectorAll(".confetti").forEach((c) => c.remove());
    if (view !== "game") Game.stop();
  }

  function setUser(user) {
    me = user;
    $("user-bar").classList.toggle("hidden", !me);
    if (me) $("user-name").textContent = me.name;
  }

  function goHome() {
    if (!me) return show("auth");
    if (me.isAdmin) return showAdmin();
    updateMenu();
    show("menu");
  }

  document.querySelectorAll("[data-back]").forEach((btn) => btn.addEventListener("click", goHome));
  $("menu-btn").addEventListener("click", goHome);
  $("quit-btn").addEventListener("click", () => {
    if (current && current.mode === "challenge") showChallenge();
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

  // ---------- Menu ----------

  function updateMenu() {
    const done = me.challenge.highest;
    $("menu-challenge-sub").textContent =
      done >= CHALLENGE_LEVELS
        ? "All 30 levels beaten! 🌟"
        : done === 0
          ? "1×1 all the way to 30×30"
          : `${done} of ${CHALLENGE_LEVELS} levels beaten`;
  }

  $("menu-free").addEventListener("click", () => {
    show("setup");
    $("num-a").focus();
  });
  $("menu-challenge").addEventListener("click", showChallenge);

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
      play("free", a, b);
    }
  });

  // ---------- Challenge ----------

  function showChallenge() {
    const grid = $("level-grid");
    grid.innerHTML = "";
    const unlocked = me.challenge.highest + 1;
    for (let n = 1; n <= CHALLENGE_LEVELS; n++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "level";
      const best = me.challenge.best[n];
      if (n <= me.challenge.highest) btn.classList.add("beaten");
      else if (n === unlocked) btn.classList.add("next");
      else btn.classList.add("locked");
      btn.disabled = n > unlocked;
      btn.innerHTML =
        `<span class="level-num">${n}×${n}</span>` +
        `<span class="level-sub">${best !== undefined ? "⭐ " + Game.formatTime(best) : n > unlocked ? "🔒" : "Play!"}</span>`;
      btn.setAttribute("aria-label", `Level ${n}: ${n} times ${n}${btn.disabled ? ", locked" : ""}`);
      btn.addEventListener("click", () => play("challenge", n, n));
      grid.appendChild(btn);
    }
    show("challenge");
  }

  // ---------- Playing ----------

  function play(mode, a, b) {
    current = { mode, a, b };
    show("game");
    Game.start(a, b, {
      label: mode === "challenge" ? `Level ${a}` : "",
      onWin: (result) => onWin(mode, result),
    });
  }

  async function onWin(mode, { a, b, total, timeMs }) {
    const isLastLevel = mode === "challenge" && a === CHALLENGE_LEVELS;
    $("win-title").textContent =
      isLastLevel ? "Challenge complete! 🏆" : mode === "challenge" ? `Level ${a} beaten! 🎉` : "You did it! 🎉";
    $("win-equation").textContent = `${a} × ${b} = ${total}`;
    $("win-time").textContent = `Time: ${Game.formatTime(timeMs)}`;
    $("next-btn").classList.toggle("hidden", mode !== "challenge" || isLastLevel);
    $("again-btn").textContent = mode === "challenge" ? "Try again" : "Play again";
    $("win").classList.remove("hidden");
    Game.launchConfetti();

    try {
      const prevBest = mode === "challenge" ? me.challenge.best[a] : undefined;
      setUser(await api("/api/score", { mode, a, b, timeMs }));
      if (mode === "challenge" && prevBest !== undefined && timeMs < prevBest) {
        $("win-time").textContent += " — new best time!";
      }
    } catch (err) {
      $("win-time").textContent += ` (Couldn't save your score: ${err.message})`;
      if (err.status === 401) setUser(null);
    }
  }

  $("again-btn").addEventListener("click", () => {
    if (!current) return goHome();
    if (current.mode === "free") {
      show("setup");
      $("num-a").focus();
    } else {
      play("challenge", current.a, current.b);
    }
  });

  $("next-btn").addEventListener("click", () => {
    const n = current.a + 1;
    play("challenge", n, n);
  });

  // ---------- Admin ----------

  async function showAdmin() {
    show("admin");
    const tbody = $("admin-table").querySelector("tbody");
    tbody.innerHTML = "";
    $("admin-summary").textContent = "Loading…";
    try {
      const { users, challengeLevels } = await api("/api/admin/users");
      users.sort(
        (x, y) =>
          y.challenge.highest - x.challenge.highest ||
          totalTime(x.challenge.best) - totalTime(y.challenge.best) ||
          x.name.localeCompare(y.name)
      );
      $("admin-empty").classList.toggle("hidden", users.length > 0);
      $("admin-table").classList.toggle("hidden", users.length === 0);
      const finished = users.filter((u) => u.challenge.highest >= challengeLevels).length;
      $("admin-summary").textContent =
        `${users.length} player${users.length === 1 ? "" : "s"}, ${finished} finished the challenge. Click a row to see recent games.`;

      for (const u of users) {
        const row = document.createElement("tr");
        row.className = "player-row";
        row.tabIndex = 0;
        const pct = Math.round((u.challenge.highest / challengeLevels) * 100);
        row.innerHTML = `
          <td class="name"></td>
          <td>
            <div class="level-bar" title="${u.challenge.highest} of ${challengeLevels}">
              <div style="width:${pct}%"></div>
            </div>
            <span class="level-text">${u.challenge.highest} / ${challengeLevels}</span>
          </td>
          <td>${u.challenge.highest ? Game.formatTime(totalTime(u.challenge.best)) : "—"}</td>
          <td>${u.gamesPlayed} <span class="muted">(${u.freeGames} free play)</span></td>
          <td>${u.gamesPlayed ? formatDate(u.lastSeen) : "Never"}</td>`;
        row.querySelector(".name").textContent = u.name;

        const detail = document.createElement("tr");
        detail.className = "detail-row hidden";
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.appendChild(renderDetail(u));
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

  function renderDetail(u) {
    const wrap = document.createElement("div");
    wrap.className = "detail";

    const levels = document.createElement("div");
    levels.className = "detail-levels";
    const beaten = Object.keys(u.challenge.best).map(Number).sort((a, b) => a - b);
    levels.innerHTML = beaten.length
      ? "<strong>Best challenge times:</strong> " +
        beaten.map((n) => `<span class="chip">${n}×${n} ${Game.formatTime(u.challenge.best[n])}</span>`).join(" ")
      : "<strong>Best challenge times:</strong> none yet";
    wrap.appendChild(levels);

    const recent = document.createElement("div");
    recent.className = "detail-recent";
    recent.innerHTML = u.recentGames.length
      ? "<strong>Recent games:</strong> " +
        u.recentGames
          .map(
            (g) =>
              `<span class="chip">${g.mode === "challenge" ? "🏆" : "🫧"} ${g.a}×${g.b} in ${Game.formatTime(g.timeMs)} · ${formatDate(g.at)}</span>`
          )
          .join(" ")
      : "<strong>Recent games:</strong> none yet";
    wrap.appendChild(recent);
    return wrap;
  }

  function totalTime(best) {
    return Object.values(best).reduce((s, t) => s + t, 0);
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  $("admin-refresh").addEventListener("click", showAdmin);

  // ---------- Start ----------

  (async () => {
    try {
      setUser(await api("/api/me"));
    } catch {
      setUser(null);
    }
    goHome();
    if (!me) $("auth-name").focus();
  })();
})();
