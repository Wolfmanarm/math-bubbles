"use strict";

// Keziah's Math Game server: serves the game from ./public and stores
// accounts, sessions and scores in a JSON file. No dependencies needed.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "db.json");

const ADMIN_NAME = "admin";
const ADMIN_PASSWORD = "admin";
const CHALLENGE_LEVELS = 30;
const SESSION_DAYS = 30;
const MAX_GAMES_KEPT = 200;

// ---------- Storage ----------

function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    return { users: {}, sessions: {} };
  }
}

const db = loadDb();

function saveDb() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

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
    games: [], // { mode, a, b, timeMs, at }
    challenge: { highest: 0, best: {} }, // best: { level: timeMs }
  };
}

// Make sure the admin account exists.
if (!db.users[ADMIN_NAME]) {
  db.users[ADMIN_NAME] = newUser(ADMIN_NAME, ADMIN_PASSWORD, true);
  saveDb();
}

// Drop expired sessions on startup.
for (const [token, s] of Object.entries(db.sessions)) {
  if (s.expires < Date.now()) delete db.sessions[token];
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

function startSession(res, user) {
  const token = crypto.randomBytes(32).toString("hex");
  db.sessions[token] = { user: user.name.toLowerCase(), expires: Date.now() + SESSION_DAYS * 864e5 };
  user.lastSeen = Date.now();
  saveDb();
  return `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`;
}

function publicUser(user) {
  return { name: user.name, isAdmin: !!user.isAdmin, challenge: user.challenge };
}

// ---------- API ----------

const NAME_RE = /^[A-Za-z0-9 _-]{1,20}$/;

async function handleApi(req, res, pathname) {
  const user = currentUser(req);

  if (req.method === "GET" && pathname === "/api/me") {
    if (!user) return send(res, 401, { error: "Not signed in" });
    return send(res, 200, publicUser(user));
  }

  if (req.method !== "POST" && pathname !== "/api/admin/users") {
    return send(res, 405, { error: "Method not allowed" });
  }

  if (pathname === "/api/register" || pathname === "/api/login") {
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
      return send(res, 200, publicUser(u), { "Set-Cookie": startSession(res, u) });
    }

    const u = db.users[key];
    if (!u || !checkPassword(u, password)) {
      return send(res, 401, { error: "Wrong name or password." });
    }
    return send(res, 200, publicUser(u), { "Set-Cookie": startSession(res, u) });
  }

  if (pathname === "/api/logout") {
    const token = getCookie(req, "sid");
    if (token && db.sessions[token]) {
      delete db.sessions[token];
      saveDb();
    }
    return send(res, 200, { ok: true }, { "Set-Cookie": "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
  }

  if (!user) return send(res, 401, { error: "Not signed in" });

  if (pathname === "/api/score") {
    const body = await readJson(req);
    const mode = body.mode === "challenge" ? "challenge" : "free";
    const a = Number(body.a);
    const b = Number(body.b);
    const timeMs = Math.round(Number(body.timeMs));

    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || a > 9999 || b < 1 || b > 40) {
      return send(res, 400, { error: "Bad problem" });
    }
    if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs > 864e5) {
      return send(res, 400, { error: "Bad time" });
    }
    if (mode === "challenge") {
      if (a !== b || a > CHALLENGE_LEVELS || a > user.challenge.highest + 1) {
        return send(res, 400, { error: "That level isn't unlocked yet" });
      }
      user.challenge.highest = Math.max(user.challenge.highest, a);
      const prev = user.challenge.best[a];
      if (prev === undefined || timeMs < prev) user.challenge.best[a] = timeMs;
    }

    user.games.push({ mode, a, b, timeMs, at: Date.now() });
    if (user.games.length > MAX_GAMES_KEPT) user.games.splice(0, user.games.length - MAX_GAMES_KEPT);
    user.lastSeen = Date.now();
    saveDb();
    return send(res, 200, publicUser(user));
  }

  if (pathname === "/api/admin/users" && req.method === "GET") {
    if (!user.isAdmin) return send(res, 403, { error: "Admins only" });
    const users = Object.values(db.users)
      .filter((u) => !u.isAdmin)
      .map((u) => ({
        name: u.name,
        createdAt: u.createdAt,
        lastSeen: u.lastSeen,
        challenge: u.challenge,
        gamesPlayed: u.games.length,
        freeGames: u.games.filter((g) => g.mode === "free").length,
        recentGames: u.games.slice(-20).reverse(),
      }));
    return send(res, 200, { users, challengeLevels: CHALLENGE_LEVELS });
  }

  return send(res, 404, { error: "Not found" });
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
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
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

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Keziah's Math Game running at http://localhost:${PORT}`);
  });
}

module.exports = server;
