"use strict";

// Keziah's Math Game server: serves the game from ./public, loads challenges
// from ./challenges, and stores accounts, sessions and scores in a JSON file.
// No dependencies needed.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const CHALLENGES_DIR = process.env.CHALLENGES_DIR || path.join(__dirname, "challenges");
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "db.json");

const ADMIN_NAME = "admin";
const ADMIN_PASSWORD = "admin";
const SESSION_DAYS = 30;
const MAX_GAMES_KEPT = 200;
const DB_VERSION = 2;

// `--check` only validates challenge files; it never opens the player data.
const CHECK_ONLY = require.main === module && process.argv.includes("--check");

// Limits shared with the game page.
const MAX_BUBBLE_VALUE = 9999;
const MAX_BUBBLES = 40;
const ZEROS_MULTIPLIERS = [10, 100, 1000, 10000, 100000, 1000000];

// ---------- Challenges ----------
//
// Each file in ./challenges is one challenge (see challenges/README.md).
// Files are re-read whenever they change, so a new challenge shows up
// without restarting the server.

let challengeCache = { key: "", list: [], errors: [] };

function validateLevel(level, where) {
  const type = level.type || "bubbles";
  const a = level.a;
  const b = level.b;
  if (!Number.isInteger(a) || a < 1 || a > MAX_BUBBLE_VALUE) {
    throw new Error(`${where}: "a" must be a whole number from 1 to ${MAX_BUBBLE_VALUE}`);
  }
  if (type === "bubbles") {
    if (!Number.isInteger(b) || b < 1 || b > MAX_BUBBLES) {
      throw new Error(`${where}: "b" must be a whole number from 1 to ${MAX_BUBBLES} for a bubbles level`);
    }
  } else if (type === "zeros") {
    if (!ZEROS_MULTIPLIERS.includes(b)) {
      throw new Error(`${where}: "b" must be one of ${ZEROS_MULTIPLIERS.join(", ")} for a zeros level`);
    }
  } else {
    throw new Error(`${where}: unknown level type "${type}" (use "bubbles" or "zeros")`);
  }
  const out = { type, a, b };
  if (typeof level.tip === "string" && level.tip.trim()) out.tip = level.tip.trim();
  return out;
}

function loadChallenges() {
  let files;
  try {
    files = fs.readdirSync(CHALLENGES_DIR).filter((f) => f.endsWith(".json")).sort();
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const key = files
    .map((f) => `${f}:${fs.statSync(path.join(CHALLENGES_DIR, f)).mtimeMs}`)
    .join("|");
  if (key === challengeCache.key) return challengeCache.list;

  const list = [];
  const errors = [];
  const ids = new Set();
  for (const file of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(CHALLENGES_DIR, file), "utf8"));
      if (typeof raw.id !== "string" || !/^[a-z0-9-]{1,60}$/.test(raw.id)) {
        throw new Error('"id" must use only lowercase letters, numbers and dashes');
      }
      if (ids.has(raw.id)) throw new Error(`another challenge already uses the id "${raw.id}"`);
      if (typeof raw.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
        throw new Error('"date" must look like 2026-11-04');
      }
      if (typeof raw.title !== "string" || !raw.title.trim()) throw new Error('"title" is missing');
      if (!Array.isArray(raw.levels) || raw.levels.length === 0) throw new Error('"levels" must be a non-empty list');
      ids.add(raw.id);
      list.push({
        id: raw.id,
        date: raw.date,
        title: raw.title.trim(),
        emoji: typeof raw.emoji === "string" ? raw.emoji : "⭐",
        description: typeof raw.description === "string" ? raw.description : "",
        intro: Array.isArray(raw.intro) ? raw.intro.filter((p) => typeof p === "string") : [],
        levels: raw.levels.map((l, i) => validateLevel(l, `level ${i + 1}`)),
      });
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
      console.error(`Skipping challenge file ${file}: ${err.message}`);
    }
  }
  // Newest first; same-day challenges in file order.
  list.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  challengeCache = { key, list, errors };
  return list;
}

// The latest date anywhere on Earth right now (UTC+14). Challenges dated
// later than this are scheduled for the future and kept hidden. The page
// hides anything dated after the player's own local date.
function latestDateOnEarth() {
  return new Date(Date.now() + 14 * 3600e3).toISOString().slice(0, 10);
}

function availableChallenges() {
  const max = latestDateOnEarth();
  return loadChallenges().filter((c) => c.date <= max);
}

// ---------- Storage ----------

function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    return { version: DB_VERSION, users: {}, sessions: {} };
  }
}

const db = CHECK_ONLY ? null : loadDb();

function saveDb() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// Version 1 had a single built-in challenge (levels 1×1 … 30×30) stored as
// user.challenge = { highest, best: { "<n>": ms } }. It is now the "squares"
// challenge, where level n×n is level index n-1. Nothing is thrown away: a
// copy of the old file is kept next to the new one.
function migrateDb() {
  if ((db.version || 1) >= DB_VERSION) return;
  if (fs.existsSync(DATA_FILE)) {
    const backup = DATA_FILE.replace(/\.json$/, "") + `.backup-v${db.version || 1}.json`;
    fs.copyFileSync(DATA_FILE, backup);
    console.log(`Backed up data before upgrading it: ${backup}`);
  }
  for (const user of Object.values(db.users)) {
    user.challenges = user.challenges || {};
    const old = user.challenge;
    if (old && (old.highest > 0 || Object.keys(old.best || {}).length)) {
      const best = {};
      for (const [n, ms] of Object.entries(old.best || {})) best[Number(n) - 1] = ms;
      const lastLevelGame = (user.games || []).filter((g) => g.mode === "challenge" && g.a === old.highest).pop();
      user.challenges.squares = {
        highest: old.highest,
        best,
        finishedAt: old.highest >= 30 ? (lastLevelGame ? lastLevelGame.at : user.lastSeen) : null,
      };
    }
    delete user.challenge;
    for (const g of user.games || []) {
      if (g.mode === "challenge" && !g.challengeId) {
        g.challengeId = "squares";
        g.level = g.a - 1;
      }
    }
  }
  db.version = DB_VERSION;
  saveDb();
}

if (!CHECK_ONLY) migrateDb();

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function checkPassword(user, password) {
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(user.hash, "hex"));
}

function newUser(name, password, isAdmin = false) {
  return {
    name,
    ...hashPassword(password),
    isAdmin,
    createdAt: Date.now(),
    lastSeen: Date.now(),
    games: [], // { mode: "free" | "challenge", challengeId?, level?, a, b, timeMs, at }
    challenges: {}, // { [challengeId]: { highest, best: { [levelIndex]: ms }, finishedAt } }
  };
}

if (!CHECK_ONLY) {
  // Make sure the admin account exists.
  if (!db.users[ADMIN_NAME]) {
    db.users[ADMIN_NAME] = newUser(ADMIN_NAME, ADMIN_PASSWORD, true);
    saveDb();
  }

  // Drop expired sessions on startup.
  for (const [token, s] of Object.entries(db.sessions)) {
    if (s.expires < Date.now()) delete db.sessions[token];
  }
}

// ---------- HTTP helpers ----------

function send(res, status, body, headers = {}) {
  const data = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(data);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 10_000) {
        reject(new Error("Request too large"));
        req.destroy();
      } else {
        chunks.push(c);
      }
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function getCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

function currentUser(req) {
  const token = getCookie(req, "sid");
  const session = token && db.sessions[token];
  if (!session || session.expires < Date.now()) return null;
  return db.users[session.user] || null;
}

function startSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  db.sessions[token] = { user: user.name.toLowerCase(), expires: Date.now() + SESSION_DAYS * 864e5 };
  user.lastSeen = Date.now();
  saveDb();
  return `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`;
}

function publicUser(user) {
  return { name: user.name, isAdmin: !!user.isAdmin, progress: user.challenges || {} };
}

function validTime(ms) {
  return Number.isFinite(ms) && ms >= 0 && ms <= 864e5;
}

function recordGame(user, game) {
  user.games.push({ ...game, at: Date.now() });
  if (user.games.length > MAX_GAMES_KEPT) user.games.splice(0, user.games.length - MAX_GAMES_KEPT);
  user.lastSeen = Date.now();
}

// ---------- API ----------

const NAME_RE = /^[A-Za-z0-9 _-]{1,20}$/;

const routes = {
  "GET /api/me": (req, res, user) => send(res, 200, publicUser(user)),

  "GET /api/challenges": (req, res) => send(res, 200, { challenges: availableChallenges() }),

  // Free play result.
  "POST /api/score": async (req, res, user) => {
    const body = await readJson(req);
    const a = Number(body.a);
    const b = Number(body.b);
    const timeMs = Math.round(Number(body.timeMs));
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || a > MAX_BUBBLE_VALUE || b < 1 || b > MAX_BUBBLES) {
      return send(res, 400, { error: "Bad problem" });
    }
    if (!validTime(timeMs)) return send(res, 400, { error: "Bad time" });
    recordGame(user, { mode: "free", a, b, timeMs });
    saveDb();
    return send(res, 200, publicUser(user));
  },

  // A challenge level was beaten.
  "POST /api/progress": async (req, res, user) => {
    const body = await readJson(req);
    const challenge = availableChallenges().find((c) => c.id === body.challengeId);
    if (!challenge) return send(res, 404, { error: "That challenge doesn't exist" });
    const level = Number(body.level);
    const timeMs = Math.round(Number(body.timeMs));
    if (!Number.isInteger(level) || level < 0 || level >= challenge.levels.length) {
      return send(res, 400, { error: "Bad level" });
    }
    if (!validTime(timeMs)) return send(res, 400, { error: "Bad time" });

    const progress = (user.challenges[challenge.id] ||= { highest: 0, best: {}, finishedAt: null });
    if (level > progress.highest) return send(res, 400, { error: "That level isn't unlocked yet" });

    progress.highest = Math.max(progress.highest, level + 1);
    const prev = progress.best[level];
    if (prev === undefined || timeMs < prev) progress.best[level] = timeMs;
    const justFinished = !progress.finishedAt && progress.highest >= challenge.levels.length;
    if (justFinished) progress.finishedAt = Date.now();

    const { a, b } = challenge.levels[level];
    recordGame(user, { mode: "challenge", challengeId: challenge.id, level, a, b, timeMs });
    saveDb();
    return send(res, 200, { ...publicUser(user), justFinished });
  },

  "GET /api/admin/users": (req, res, user) => {
    if (!user.isAdmin) return send(res, 403, { error: "Admins only" });
    const users = Object.values(db.users)
      .filter((u) => !u.isAdmin)
      .map((u) => ({
        name: u.name,
        createdAt: u.createdAt,
        lastSeen: u.lastSeen,
        progress: u.challenges || {},
        gamesPlayed: u.games.length,
        freeGames: u.games.filter((g) => g.mode === "free").length,
        recentGames: u.games.slice(-20).reverse(),
      }));
    return send(res, 200, { users, challenges: availableChallenges() });
  },
};

async function handleApi(req, res, pathname) {
  if (pathname === "/api/register" || pathname === "/api/login") {
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
    const body = await readJson(req);
    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    const key = name.toLowerCase();

    if (pathname === "/api/register") {
      if (!NAME_RE.test(name)) {
        return send(res, 400, { error: "Names can be 1–20 letters, numbers, spaces, - or _." });
      }
      if (password.length < 3 || password.length > 100) {
        return send(res, 400, { error: "Passwords need at least 3 characters." });
      }
      if (db.users[key]) {
        return send(res, 409, { error: "That name is taken. Try signing in instead." });
      }
      const u = newUser(name, password);
      db.users[key] = u;
      return send(res, 200, publicUser(u), { "Set-Cookie": startSession(u) });
    }

    const u = db.users[key];
    if (!u || !checkPassword(u, password)) {
      return send(res, 401, { error: "Wrong name or password." });
    }
    return send(res, 200, publicUser(u), { "Set-Cookie": startSession(u) });
  }

  if (pathname === "/api/logout") {
    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
    const token = getCookie(req, "sid");
    if (token && db.sessions[token]) {
      delete db.sessions[token];
      saveDb();
    }
    return send(res, 200, { ok: true }, { "Set-Cookie": "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
  }

  const route = routes[`${req.method} ${pathname}`];
  if (!route) return send(res, 404, { error: "Not found" });
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: "Not signed in" });
  user.challenges ||= {};
  return route(req, res, user);
}

// ---------- Static files ----------

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed");
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 404, "Not found");
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, "Not found");
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(req.method === "HEAD" ? undefined : data);
  });
}

// ---------- Server ----------

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  try {
    if (pathname.startsWith("/api/")) return await handleApi(req, res, pathname);
    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 400, { error: err.message || "Something went wrong" });
  }
});

// `node server.js --check` (or `npm run check`): validate the challenge
// files and list what players will see, without starting the server.
function checkChallenges() {
  const list = loadChallenges();
  const today = new Date().toISOString().slice(0, 10);
  console.log(`${list.length} challenge(s) OK:`);
  for (const c of list) {
    const when = c.date > today ? "scheduled" : c.date === today ? "TODAY" : "published";
    console.log(`  ${c.date}  ${c.emoji} ${c.title}  [${c.id}, ${c.levels.length} levels, ${when}]`);
  }
  if (challengeCache.errors.length) {
    console.log(`\n${challengeCache.errors.length} problem(s) — these files are skipped until fixed:`);
    challengeCache.errors.forEach((e) => console.log(`  ✗ ${e}`));
    process.exitCode = 1;
  }
}

if (CHECK_ONLY) {
  checkChallenges();
} else if (require.main === module) {
  const count = loadChallenges().length;
  server.listen(PORT, () => {
    console.log(`Keziah's Math Game running at http://localhost:${PORT} (${count} challenges loaded)`);
  });
}

module.exports = server;
